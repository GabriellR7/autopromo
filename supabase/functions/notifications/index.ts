// =============================================================================
// Edge Function: notifications
// Sends e-mails for (1) unread chat messages and (2) visit reminders 24h / 1h
// before a confirmed visit. Meant to be called every 10 minutes by pg_cron.
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

  const result = { messages: 0, reminders: 0, errors: [] as string[] };

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

  return Response.json(result);
});
