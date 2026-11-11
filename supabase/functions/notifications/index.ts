// =============================================================================
// Edge Function: notifications
// Sends e-mails for (1) unread chat messages, (2) visit reminders 24h / 1h
// before a confirmed visit, (3) new cars matching a saved search (daily digest)
// and (4) price drops on saved cars. Meant to be called every 10 minutes by pg_cron.
//
// Required secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  — from https://resend.com (free tier is enough to start)
//   EMAIL_FROM      — e.g. "AutoPromo <notifications@yourdomain.com>"
//   SITE_URL        — e.g. "https://autopromo.example"
//   CRON_SECRET     — any long random string; the cron job sends it in a header
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'AutoPromo <onboarding@resend.dev>';
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
const CRON_SECRET = Deno.env.get('CRON_SECRET');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

interface MessageNotice {
  recipient_email: string;
  recipient_name: string | null;
  sender_name: string | null;
  conversation_id: string;
  car_title: string;
  message_count: number;
  last_preview: string;
  message_ids: string[];
}

interface VisitReminder {
  visit_id: string;
  kind: '24h' | '1h';
  scheduled_at: string;
  conversation_id: string;
  car_title: string;
  car_city: string | null;
  car_state: string | null;
  buyer_email: string;
  buyer_name: string | null;
  owner_email: string;
  owner_name: string | null;
}

interface CarCardData {
  public_id: number;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  price: number;
  old_price?: number;
  mileage?: number;
  city: string | null;
  state: string | null;
  photo: string | null;
}

interface SearchAlert {
  search_id: string;
  search_name: string;
  recipient_email: string;
  recipient_name: string | null;
  cars: CarCardData[];
  total: number;
}

interface PriceDropAlert {
  recipient_email: string;
  recipient_name: string | null;
  cars: CarCardData[];
  car_ids: string[];
}

const usd = (n: number) => '$' + Math.round(Number(n)).toLocaleString('en-US');

const slug = (c: CarCardData) =>
  [c.year, c.make, c.model, c.city, c.state].filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + c.public_id;

/** One car row for e-mails (table layout so it works in every mail client). */
function carRow(c: CarCardData) {
  const url = `${SITE_URL}/cars/${slug(c)}`;
  const title = `${c.year} ${c.make} ${c.model}${c.trim_level ? ` ${c.trim_level}` : ''}`;
  const priceHtml = c.old_price
    ? `<span style="color:#16a34a;font-weight:700">${usd(c.price)}</span> <span style="color:#94a3b8;text-decoration:line-through">${usd(c.old_price)}</span>`
    : `<span style="font-weight:700;color:#0f1d3a">${usd(c.price)}</span>`;
  const meta = [c.mileage != null ? `${Number(c.mileage).toLocaleString('en-US')} mi` : null, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return `<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 12px"><tr>
    <td width="112" style="padding:0 12px 0 0;vertical-align:top"><a href="${url}">${c.photo ? `<img src="${escape(c.photo)}" width="112" height="84" style="display:block;border-radius:8px;object-fit:cover" alt="">` : `<div style="width:112px;height:84px;border-radius:8px;background:#e2e8f0"></div>`}</a></td>
    <td style="vertical-align:top"><a href="${url}" style="color:#0f172a;font-weight:600;text-decoration:none">${escape(title)}</a><div style="margin-top:4px">${priceHtml}</div><div style="margin-top:2px;font-size:13px;color:#64748b">${escape(meta)}</div></td>
  </tr></table>`;
}

const escape = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(title: string, body: string, ctaUrl: string, ctaLabel: string) {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Inter,Arial,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="font-weight:800;font-size:20px;color:#0f1d3a;margin-bottom:20px">Auto<span style="color:#3b82f6">Promo</span></div>
    <div style="background:#fff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      ${body}
      <a href="${ctaUrl}" style="display:inline-block;margin-top:20px;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${ctaLabel}</a>
    </div>
    <p style="font-size:12px;color:#64748b;margin-top:16px">AutoPromo is a listing and referral platform. We do not buy, sell or broker vehicles.</p>
  </div></body></html>`;
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }) + ' (Central Time)';
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!RESEND_API_KEY) {
    return Response.json({ skipped: true, reason: 'RESEND_API_KEY is not set' });
  }

  const result = { messages: 0, reminders: 0, search_alerts: 0, price_drops: 0, errors: [] as string[] };

  // 1) Unread messages
  const { data: notices, error: nErr } = await db.rpc('pending_message_notifications');
  if (nErr) result.errors.push(nErr.message);
  for (const n of (notices ?? []) as MessageNotice[]) {
    const url = `${SITE_URL}/dashboard/messages/${n.conversation_id}`;
    const count = Number(n.message_count);
    try {
      await sendEmail(
        n.recipient_email,
        `${n.sender_name ?? 'Someone'} sent you ${count > 1 ? `${count} messages` : 'a message'} about the ${n.car_title}`,
        layout(
          `New message about the ${escape(n.car_title)}`,
          `<p style="margin:0 0 8px">Hi ${escape(n.recipient_name?.split(' ')[0] ?? 'there')},</p>
           <p style="margin:0 0 12px"><strong>${escape(n.sender_name ?? 'Someone')}</strong> wrote:</p>
           <blockquote style="margin:0;padding:12px 14px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:6px">${escape(n.last_preview)}</blockquote>`,
          url,
          'Reply on AutoPromo',
        ),
      );
      await db.rpc('mark_messages_notified', { p_ids: n.message_ids });
      result.messages++;
    } catch (e) {
      result.errors.push(String(e));
    }
  }

  // 2) Visit reminders (to both buyer and owner)
  const { data: reminders, error: rErr } = await db.rpc('due_visit_reminders');
  if (rErr) result.errors.push(rErr.message);
  for (const r of (reminders ?? []) as VisitReminder[]) {
    const url = `${SITE_URL}/dashboard/messages/${r.conversation_id}`;
    const when = formatWhen(r.scheduled_at);
    const lead = r.kind === '1h' ? 'in about 1 hour' : 'tomorrow';
    const where = [r.car_city, r.car_state].filter(Boolean).join(', ');
    try {
      for (const [email, name, other] of [
        [r.buyer_email, r.buyer_name, r.owner_name],
        [r.owner_email, r.owner_name, r.buyer_name],
      ] as const) {
        await sendEmail(
          email,
          `Reminder: visit for the ${r.car_title} ${lead}`,
          layout(
            `Your visit is ${lead}`,
            `<p style="margin:0 0 8px">Hi ${escape(name?.split(' ')[0] ?? 'there')},</p>
             <p style="margin:0 0 8px">This is a reminder of your visit with <strong>${escape(other ?? 'the other party')}</strong> for the <strong>${escape(r.car_title)}</strong>${where ? ` in ${escape(where)}` : ''}.</p>
             <p style="margin:0 0 8px">🗓 <strong>${escape(when)}</strong></p>
             <p style="margin:0;color:#64748b;font-size:14px">Meet in a safe, public place and check that the title matches the seller's ID.</p>`,
            url,
            'Open conversation',
          ),
        );
      }
      await db.rpc('mark_visit_reminder', { p_visit_id: r.visit_id, p_kind: r.kind });
      result.reminders++;
    } catch (e) {
      result.errors.push(String(e));
    }
  }

  // 3) Saved-search digests (new matching cars, at most one e-mail per search per ~day)
  const { data: searchAlerts, error: sErr } = await db.rpc('pending_search_alerts');
  if (sErr) result.errors.push(sErr.message);
  const notifiedSearches: string[] = [];
  for (const a of (searchAlerts ?? []) as SearchAlert[]) {
    const total = Number(a.total);
    try {
      await sendEmail(
        a.recipient_email,
        `${total} new ${total === 1 ? 'car matches' : 'cars match'} "${a.search_name}"`,
        layout(
          `${total} new ${total === 1 ? 'match' : 'matches'} for your search`,
          `<p style="margin:0 0 4px">Hi ${escape(a.recipient_name?.split(' ')[0] ?? 'there')},</p>
           <p style="margin:0 0 16px;color:#475569">New listings for <strong>${escape(a.search_name)}</strong>:</p>
           ${a.cars.map(carRow).join('')}
           ${total > a.cars.length ? `<p style="margin:0;color:#64748b;font-size:14px">+ ${total - a.cars.length} more</p>` : ''}
           <p style="margin:16px 0 0;font-size:12px;color:#94a3b8">You can turn these alerts off in Saved → Saved searches.</p>`,
          `${SITE_URL}/dashboard/saved`,
          'See all matches',
        ),
      );
      notifiedSearches.push(a.search_id);
      result.search_alerts++;
    } catch (e) {
      result.errors.push(String(e));
    }
  }
  if (notifiedSearches.length) await db.rpc('mark_search_notified', { p_ids: notifiedSearches });

  // 4) Price drops on saved cars
  const startedAt = new Date().toISOString();
  const { data: drops, error: dErr } = await db.rpc('pending_price_drop_alerts');
  if (dErr) result.errors.push(dErr.message);
  const droppedCars = new Set<string>();
  for (const d of (drops ?? []) as PriceDropAlert[]) {
    const first = d.cars[0]!;
    const subject = d.cars.length === 1
      ? `Price drop: ${first.year} ${first.make} ${first.model} is now ${usd(first.price)}`
      : `${d.cars.length} cars you saved just dropped in price`;
    try {
      await sendEmail(
        d.recipient_email,
        subject,
        layout(
          d.cars.length === 1 ? 'A car you saved dropped in price' : 'Cars you saved dropped in price',
          `<p style="margin:0 0 16px">Hi ${escape(d.recipient_name?.split(' ')[0] ?? 'there')}, good news:</p>
           ${d.cars.map(carRow).join('')}
           <p style="margin:12px 0 0;font-size:12px;color:#94a3b8">You get this because you saved these cars. Remove them in Saved to stop alerts.</p>`,
          `${SITE_URL}/dashboard/saved`,
          'View saved cars',
        ),
      );
      result.price_drops++;
    } catch (e) {
      result.errors.push(String(e));
    }
    d.car_ids.forEach((id) => droppedCars.add(id));
  }
  if (droppedCars.size) await db.rpc('mark_price_drops_notified', { p_car_ids: [...droppedCars], p_before: startedAt });
  await db.rpc('close_stale_price_drops');

  return Response.json(result);
});
