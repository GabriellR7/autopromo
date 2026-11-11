import { supabase } from './supabase';

/**
 * Promoter referral tracking.
 * When a visitor lands on any page with ?ref=CODE we:
 *  1. store the code in a first-party cookie for 30 days (used in later phases
 *     to attribute conversations, visits and sales to the promoter), and
 *  2. record a click for the promoter's stats (de-duplicated server-side).
 */
const COOKIE_NAME = 'ap_ref';
const VISITOR_KEY = 'ap_vid';
const MAX_AGE_DAYS = 30;
const CODE_RE = /^[A-Za-z0-9]{6,16}$/;

function setCookie(name: string, value: string, days: number) {
  const maxAge = days * 24 * 60 * 60;
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${
    location.protocol === 'https:' ? '; Secure' : ''
  }`;
}

function getCookie(name: string) {
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=')[1] ?? '') || null : null;
}

/** Anonymous, random visitor id (no personal data) used to count unique visitors. */
export function getVisitorId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(VISITOR_KEY);
  } catch {
    /* storage blocked */
  }
  id ??= getCookie(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    try {
      localStorage.setItem(VISITOR_KEY, id);
    } catch {
      /* ignore */
    }
    setCookie(VISITOR_KEY, id, 365);
  }
  return id;
}

export function getReferralCode(): string | null {
  return getCookie(COOKIE_NAME);
}

const tracked = new Set<string>();

export async function captureReferralFromUrl(search: string) {
  const code = new URLSearchParams(search).get('ref');
  if (!code || !CODE_RE.test(code)) return null;
  setCookie(COOKIE_NAME, code, MAX_AGE_DAYS);

  if (tracked.has(code)) return code;
  tracked.add(code);
  const { data } = await supabase.rpc('record_referral_click', {
    p_code: code,
    p_visitor_id: getVisitorId(),
    p_referrer: document.referrer || null,
  });
  const name = (data as { promoter_name?: string } | null)?.promoter_name;
  if (name) {
    try {
      sessionStorage.setItem(`ap_ref_name_${code}`, name);
    } catch {
      /* ignore */
    }
  }
  return code;
}

/** First name of the promoter who referred this visitor (if known in this session). */
export function getReferrerName(): string | null {
  const code = getReferralCode();
  if (!code) return null;
  try {
    return sessionStorage.getItem(`ap_ref_name_${code}`);
  } catch {
    return null;
  }
}
