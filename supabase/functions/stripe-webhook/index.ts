// =============================================================================
// Edge Function: stripe-webhook  (called by Stripe, not by the site)
//
// Events handled:
//   checkout.session.completed  → marks the commission as paid
//   account.updated             → updates the promoter's payout status
//
// Secrets: STRIPE_WEBHOOK_SECRET (platform endpoint) and, optionally,
// STRIPE_CONNECT_WEBHOOK_SECRET (endpoint for "connected accounts" events).
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const SECRETS = [Deno.env.get('STRIPE_WEBHOOK_SECRET'), Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET')].filter(Boolean) as string[];

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifies the Stripe-Signature header (t=...,v1=...) with a 5-minute tolerance. */
async function verify(payload: string, header: string | null) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  const signatures = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!t || !signatures.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
  for (const secret of SECRETS) {
    const expected = await hmacHex(secret, `${t}.${payload}`);
    if (signatures.some((s) => safeEqual(s, expected))) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!SECRETS.length) return new Response('Webhook secret not configured', { status: 503 });

  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('stripe-signature')))) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { object: Record<string, unknown> } };
  const obj = event.data.object;

  try {
    if (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') {
      const commissionId = (obj.metadata as Record<string, string> | undefined)?.commission_id;
      if (commissionId) {
        await db
          .from('commissions')
          .update({ status: 'paid', paid_at: new Date().toISOString(), stripe_payment_intent_id: obj.payment_intent as string })
          .eq('id', commissionId)
          .eq('status', 'pending');
      }
    }

    if (event.type === 'account.updated') {
      await db
        .from('payout_accounts')
        .update({ details_submitted: Boolean(obj.details_submitted), payouts_enabled: Boolean(obj.payouts_enabled) })
        .eq('stripe_account_id', obj.id as string);
    }
  } catch (e) {
    console.error('Webhook handling failed', e);
    return new Response('Handler error', { status: 500 }); // Stripe will retry
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
