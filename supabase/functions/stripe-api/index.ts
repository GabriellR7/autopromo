// =============================================================================
// Edge Function: stripe-api  (called by the signed-in user from the site)
//
// Actions (POST JSON { action, ... }):
//   connect_onboard    → promoter: create/continue Stripe Express onboarding
//   connect_refresh    → promoter: re-sync payout status from Stripe
//   connect_dashboard  → promoter: one-time link to their Stripe Express dashboard
//   checkout           → owner: pay a pending commission { commission_id }
//
// Money flow (destination charge): the owner pays the referral fee with a card;
// Stripe sends it to the promoter's connected account and keeps the platform
// fee for AutoPromo automatically.
//
// Secrets: STRIPE_SECRET_KEY, SITE_URL
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY');
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Encodes nested objects the way Stripe expects: a[b][c]=value */
function encodeForm(data: Record<string, unknown>, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (typeof v === 'object' && v !== null) encodeForm(v as Record<string, unknown>, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof value === 'object') {
      encodeForm(value as Record<string, unknown>, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

async function stripe<T = Record<string, unknown>>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? encodeForm(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new HttpError(400, data?.error?.message ?? 'Stripe request failed.');
  return data as T;
}

async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new HttpError(401, 'Not signed in.');
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Session expired. Please sign in again.');
  return data.user;
}

async function syncAccount(userId: string, accountId: string) {
  const acct = await stripe<{ details_submitted: boolean; payouts_enabled: boolean }>('GET', `/accounts/${accountId}`);
  const row = { user_id: userId, stripe_account_id: accountId, details_submitted: acct.details_submitted, payouts_enabled: acct.payouts_enabled };
  await db.from('payout_accounts').upsert(row);
  return row;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!STRIPE_SECRET_KEY) throw new HttpError(503, 'Payments are not configured yet (STRIPE_SECRET_KEY missing).');
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as { action?: string; commission_id?: string };

    const { data: profile } = await db.from('profiles').select('id, full_name, is_promoter, suspended').eq('id', user.id).single();
    if (!profile || profile.suspended) throw new HttpError(403, 'Account not allowed.');

    const { data: payout } = await db.from('payout_accounts').select('*').eq('user_id', user.id).maybeSingle();

    switch (body.action) {
      case 'connect_onboard': {
        if (!profile.is_promoter) throw new HttpError(403, 'Only promoters can set up payouts.');
        let accountId = payout?.stripe_account_id as string | undefined;
        if (!accountId) {
          const acct = await stripe<{ id: string }>('POST', '/accounts', {
            type: 'express',
            country: 'US',
            email: user.email,
            business_type: 'individual',
            capabilities: { transfers: { requested: true } },
            business_profile: { product_description: 'Independent referral partner on AutoPromo', mcc: '7311' },
            metadata: { user_id: user.id },
          });
          accountId = acct.id;
          await db.from('payout_accounts').upsert({ user_id: user.id, stripe_account_id: accountId });
        }
        const link = await stripe<{ url: string }>('POST', '/account_links', {
          account: accountId,
          type: 'account_onboarding',
          refresh_url: `${SITE_URL}/dashboard/promoter/earnings?stripe=refresh`,
          return_url: `${SITE_URL}/dashboard/promoter/earnings?stripe=return`,
        });
        return json({ url: link.url });
      }

      case 'connect_refresh': {
        if (!payout?.stripe_account_id) return json({ payouts_enabled: false, details_submitted: false });
        return json(await syncAccount(user.id, payout.stripe_account_id));
      }

      case 'connect_dashboard': {
        if (!payout?.stripe_account_id) throw new HttpError(400, 'Set up payouts first.');
        const link = await stripe<{ url: string }>('POST', `/accounts/${payout.stripe_account_id}/login_links`);
        return json({ url: link.url });
      }

      case 'checkout': {
        if (!body.commission_id) throw new HttpError(400, 'Missing commission.');
        const { data: c } = await db
          .from('commissions')
          .select('id, owner_id, promoter_id, status, amount_cents, platform_fee_cents, car:cars(year, make, model)')
          .eq('id', body.commission_id)
          .single();
        if (!c || c.owner_id !== user.id) throw new HttpError(404, 'Commission not found.');
        if (c.status !== 'pending') throw new HttpError(400, 'This commission is already paid or cancelled.');

        const { data: dest } = await db.from('payout_accounts').select('stripe_account_id, payouts_enabled').eq('user_id', c.promoter_id).maybeSingle();
        if (!dest?.stripe_account_id || !dest.payouts_enabled) {
          throw new HttpError(409, 'The promoter has not finished setting up payouts yet. We will let you know when you can pay.');
        }

        const car = c.car as unknown as { year: number; make: string; model: string } | null;
        const title = car ? `${car.year} ${car.make} ${car.model}` : 'your car';
        const session = await stripe<{ id: string; url: string }>('POST', '/checkout/sessions', {
          mode: 'payment',
          customer_email: user.email,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: c.amount_cents,
              product_data: { name: `Referral fee — ${title}`, description: 'Paid to the promoter who referred your buyer, via AutoPromo.' },
            },
          }],
          payment_intent_data: {
            application_fee_amount: c.platform_fee_cents,
            transfer_data: { destination: dest.stripe_account_id },
            metadata: { commission_id: c.id },
            description: `AutoPromo referral fee — ${title}`,
          },
          metadata: { commission_id: c.id },
          success_url: `${SITE_URL}/dashboard/commissions?paid=1`,
          cancel_url: `${SITE_URL}/dashboard/commissions?cancelled=1`,
        });
        await db.from('commissions').update({ stripe_checkout_session_id: session.id }).eq('id', c.id);
        return json({ url: session.url });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, status);
  }
});
