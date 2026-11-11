// =============================================================================
// Edge Function: stripe-api  (called by the signed-in user from the site)
//
// Actions (POST JSON { action, ... }):
//   connect_onboard    → promoter: create/continue Stripe Express onboarding
//   connect_refresh    → promoter: re-sync payout status from Stripe
//   connect_dashboard  → promoter: one-time link to their Stripe Express dashboard
//   checkout           → owner: pay a pending commission { commission_id }
//   subscribe          → owner: start the $10/month plan (billing starts when
//                        the free trial ends)
//   billing_portal     → owner: manage card / cancel the plan
//
// Commission flow (destination charge): the owner pays the referral fee with a
// card and Stripe sends it to the promoter's connected account. AutoPromo keeps
// a platform fee only if platform_fee_percent > 0 (currently 0%).
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
            ...(c.platform_fee_cents > 0 ? { application_fee_amount: c.platform_fee_cents } : {}),
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

      case 'subscribe': {
        const { data: settings } = await db.from('platform_settings').select('owner_subscription_price_cents, owner_trial_days').eq('id', 1).single();
        const { data: sub } = await db.from('subscriptions').select('*').eq('user_id', user.id).maybeSingle();
        if (sub?.status === 'active' && sub.stripe_subscription_id && new Date(sub.access_until) > new Date()) {
          throw new HttpError(400, 'Your plan is already active.');
        }

        let customerId = sub?.stripe_customer_id as string | undefined;
        if (!customerId) {
          const customer = await stripe<{ id: string }>('POST', '/customers', {
            email: user.email,
            name: profile.full_name ?? undefined,
            metadata: { user_id: user.id },
          });
          customerId = customer.id;
          // Remember the customer so retries don't create duplicates (only if a plan row already exists,
          // so an abandoned checkout never uses up the free trial).
          if (sub) await db.from('subscriptions').update({ stripe_customer_id: customerId }).eq('user_id', user.id);
        }

        // Keep the free trial: Stripe only charges when it ends. Owners who never published yet
        // get the full trial here too.
        const trialSeconds = (settings?.owner_trial_days ?? 30) * 86400;
        const trialEnd = sub?.trial_ends_at
          ? Math.floor(new Date(sub.trial_ends_at).getTime() / 1000)
          : sub ? 0 : Math.floor(Date.now() / 1000) + trialSeconds;
        const keepTrial = trialEnd > Math.floor(Date.now() / 1000) + 48 * 3600; // Stripe needs ≥ 48h ahead

        const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
          mode: 'subscription',
          customer: customerId,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: settings?.owner_subscription_price_cents ?? 1000,
              recurring: { interval: 'month' },
              product_data: { name: 'AutoPromo Seller plan', description: 'Up to 5 active listings, promoters, chat and visit scheduling.' },
            },
          }],
          subscription_data: {
            metadata: { user_id: user.id },
            ...(keepTrial ? { trial_end: trialEnd } : {}),
          },
          metadata: { user_id: user.id },
          allow_promotion_codes: true,
          success_url: `${SITE_URL}/dashboard/billing?subscribed=1`,
          cancel_url: `${SITE_URL}/dashboard/billing?cancelled=1`,
        });
        return json({ url: session.url });
      }

      case 'billing_portal': {
        const { data: sub } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
        if (!sub?.stripe_customer_id) throw new HttpError(400, 'You don\'t have a plan yet.');
        const portal = await stripe<{ url: string }>('POST', '/billing_portal/sessions', {
          customer: sub.stripe_customer_id,
          return_url: `${SITE_URL}/dashboard/billing`,
        });
        return json({ url: portal.url });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return json({ error: e instanceof Error ? e.message : 'Unexpected error.' }, status);
  }
});
