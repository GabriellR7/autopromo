import { supabase } from './supabase';
import type { CarStatus, CommissionType, PromoterLevel } from './types';

export type PromotionRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface PromotionRequest {
  id: string;
  car_id: string;
  promoter_id: string;
  status: PromotionRequestStatus;
  message: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface MyPromotion {
  promotion_id: string;
  referral_code: string;
  active: boolean;
  created_at: string;
  car_id: string;
  public_id: number;
  year: number;
  make: string;
  model: string;
  trim_level: string | null;
  price: number;
  city: string | null;
  state: string | null;
  car_status: CarStatus;
  commission_type: CommissionType;
  commission_value: number;
  cover_url: string | null;
  clicks: number;
  unique_visitors: number;
  clicks_7d: number;
}

export interface OwnerPromoter {
  promotion_id: string;
  car_id: string;
  promoter_id: string;
  promoter_name: string | null;
  promoter_avatar: string | null;
  promoter_verified: boolean;
  promoter_level: PromoterLevel;
  active: boolean;
  created_at: string;
  clicks: number;
  unique_visitors: number;
}

export interface IncomingRequest extends PromotionRequest {
  promoter: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    identity_verified: boolean;
    promoter_level: PromoterLevel;
    created_at: string;
  } | null;
  car: { id: string; owner_id: string; public_id: number; year: number; make: string; model: string; city: string | null; state: string | null } | null;
}

const num = (v: unknown) => Number(v ?? 0);

export async function fetchMyPromotions(): Promise<MyPromotion[]> {
  const { data, error } = await supabase.rpc('my_promotions');
  if (error) throw error;
  return ((data ?? []) as MyPromotion[]).map((p) => ({
    ...p,
    commission_value: num(p.commission_value),
    clicks: num(p.clicks),
    unique_visitors: num(p.unique_visitors),
    clicks_7d: num(p.clicks_7d),
  }));
}

export interface MyRequest extends PromotionRequest {
  car: { public_id: number; year: number; make: string; model: string; city: string | null; state: string | null } | null;
}

export async function fetchPromotionFunnel(): Promise<Map<string, { conversations: number; visits: number }>> {
  const { data } = await supabase.rpc('promotion_funnel');
  const map = new Map<string, { conversations: number; visits: number }>();
  for (const row of (data ?? []) as { promotion_id: string; conversations: number; visits: number }[]) {
    map.set(row.promotion_id, { conversations: Number(row.conversations), visits: Number(row.visits) });
  }
  return map;
}

export async function fetchMyRequests(promoterId: string): Promise<MyRequest[]> {
  const { data, error } = await supabase
    .from('promotion_requests')
    .select('*, car:cars!promotion_requests_car_id_fkey(public_id, year, make, model, city, state)')
    .eq('promoter_id', promoterId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MyRequest[];
}

export async function requestPromotion(carId: string, message?: string): Promise<PromotionRequest> {
  const { data, error } = await supabase.rpc('request_promotion', { p_car_id: carId, p_message: message ?? null });
  if (error) throw error;
  return data as PromotionRequest;
}

export async function endPromotion(promotionId: string) {
  const { error } = await supabase.rpc('end_promotion', { p_promotion_id: promotionId });
  if (error) throw error;
}

/** Requests the owner has received for all of their cars. */
export async function fetchIncomingRequests(): Promise<IncomingRequest[]> {
  const { data, error } = await supabase
    .from('promotion_requests')
    .select(
      '*, promoter:profiles!promotion_requests_promoter_id_fkey(id, full_name, avatar_url, identity_verified, promoter_level, created_at), car:cars!promotion_requests_car_id_fkey(id, public_id, year, make, model, city, state, owner_id)',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as IncomingRequest[];
}

export async function decideRequest(requestId: string, approve: boolean) {
  const { error } = await supabase.rpc('decide_promotion_request', { p_request_id: requestId, p_approve: approve });
  if (error) throw error;
}

export async function fetchOwnerPromoters(): Promise<OwnerPromoter[]> {
  const { data, error } = await supabase.rpc('owner_promoters');
  if (error) throw error;
  return ((data ?? []) as OwnerPromoter[]).map((p) => ({ ...p, clicks: num(p.clicks), unique_visitors: num(p.unique_visitors) }));
}

export async function resolveReferral(code: string) {
  const { data, error } = await supabase.rpc('resolve_referral', { p_code: code });
  if (error || !data) return null;
  return data as { public_id: number; year: number; make: string; model: string; city: string | null; state: string | null };
}

/* ---------------- Links & sharing ---------------- */

export function shortLink(code: string) {
  return `${window.location.origin}/r/${code}`;
}

export function shareTargets(url: string, text: string) {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
    sms: `sms:?&body=${encodeURIComponent(`${text} ${url}`)}`,
    email: `mailto:?subject=${t}&body=${encodeURIComponent(`${text}\n\n${url}`)}`,
    x: `https://twitter.com/intent/tweet?text=${t}&url=${u}`,
  };
}

export const PROMOTER_AGREEMENT = [
  'I act as an independent referral partner, not as an employee, agent, broker or dealer of AutoPromo or of any car owner.',
  'I will not negotiate prices, sign documents, accept payments or deposits, or take possession of any vehicle on behalf of an owner.',
  'I will describe cars truthfully, using only the information and photos from the listing, and will not make promises about condition or warranties.',
  'I will not spam, buy fake traffic or use misleading ads. Fraudulent referrals cancel any commission.',
  'I understand I earn a referral fee only when a buyer I referred completes the purchase and the owner confirms the sale on AutoPromo.',
  'I am responsible for reporting my earnings and paying my own taxes.',
];
