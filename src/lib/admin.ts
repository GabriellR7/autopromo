import { supabase } from './supabase';
import type { CarStatus, PlatformSettings, PromoterLevel } from './types';
import type { CommissionStatus, DisputeStatus } from './sales';

export interface AdminStats {
  users: number;
  users_7d: number;
  promoters: number;
  active_listings: number;
  pending_review: number;
  sold: number;
  sales_volume: number;
  commissions_pending_cents: number;
  commissions_paid_cents: number;
  platform_revenue_cents: number;
  open_disputes: number;
  open_reports: number;
  conversations: number;
  clicks_7d: number;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_owner: boolean;
  is_promoter: boolean;
  is_admin: boolean;
  identity_verified: boolean;
  suspended: boolean;
  promoter_level: PromoterLevel;
  listings: number;
  promotions: number;
  open_reports: number;
}

export interface AdminCar {
  id: string;
  public_id: number;
  status: CarStatus;
  year: number;
  make: string;
  model: string;
  price: number | null;
  city: string | null;
  state: string | null;
  created_at: string;
  published_at: string | null;
  moderation_note: string | null;
  views: number;
  owner: { id: string; full_name: string | null; identity_verified: boolean } | null;
  car_photos: { url: string; position: number }[];
}

export interface AdminDispute {
  id: string;
  status: DisputeStatus;
  opened_by: 'system' | 'promoter';
  reason: string;
  evidence: Record<string, number>;
  resolution_note: string | null;
  created_at: string;
  sale: { sale_price: number; created_at: string } | null;
  car: { public_id: number; year: number; make: string; model: string; commission_type: string; commission_value: number } | null;
  owner: { full_name: string | null } | null;
  promoter: { full_name: string | null } | null;
}

export interface AdminReport {
  id: string;
  target_type: 'car' | 'user';
  target_id: string;
  target_label: string | null;
  target_public_id: number | null;
  reason: string;
  details: string | null;
  status: 'open' | 'dismissed' | 'actioned';
  admin_note: string | null;
  created_at: string;
  reporter_name: string | null;
  reporter_email: string;
}

export interface AdminCommission {
  id: string;
  status: CommissionStatus;
  amount_cents: number;
  platform_fee_cents: number;
  source: string;
  created_at: string;
  paid_at: string | null;
  stripe_payment_intent_id: string | null;
  car: { public_id: number; year: number; make: string; model: string } | null;
  owner: { full_name: string | null } | null;
  promoter: { full_name: string | null } | null;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export const adminStats = () => rpc<AdminStats>('admin_stats');

export interface SubscriptionStats {
  trialing: number;
  paying: number;
  past_due: number;
  expired: number;
  mrr_cents: number;
}
export const adminSubscriptionStats = () => rpc<SubscriptionStats>('admin_subscription_stats');
/** Gives an owner free access until the given date (ISO). */
export const adminCompSubscription = (userId: string, until: string) =>
  rpc<void>('admin_comp_subscription', { p_user_id: userId, p_until: until });
export const adminUsers = (search: string, offset = 0) =>
  rpc<AdminUser[]>('admin_list_users', { p_search: search || null, p_limit: 50, p_offset: offset });
export const adminUpdateUser = (
  userId: string,
  patch: { identity_verified?: boolean; suspended?: boolean; is_admin?: boolean; promoter_level?: PromoterLevel },
) =>
  rpc<void>('admin_update_user', {
    p_user_id: userId,
    p_identity_verified: patch.identity_verified ?? null,
    p_suspended: patch.suspended ?? null,
    p_is_admin: patch.is_admin ?? null,
    p_promoter_level: patch.promoter_level ?? null,
  });
export const adminModerateCar = (carId: string, action: 'approve' | 'reject' | 'remove', note?: string) =>
  rpc<void>('admin_moderate_car', { p_car_id: carId, p_action: action, p_note: note ?? null });
export const adminResolveDispute = (id: string, decision: 'promoter' | 'owner', note: string) =>
  rpc<void>('admin_resolve_dispute', { p_dispute_id: id, p_decision: decision, p_note: note });
export const adminReports = (status: AdminReport['status']) => rpc<AdminReport[]>('admin_reports', { p_status: status });
export const adminResolveReport = (id: string, status: 'dismissed' | 'actioned', note?: string) =>
  rpc<void>('admin_resolve_report', { p_report_id: id, p_status: status, p_note: note ?? null });
export const adminSetCommissionStatus = (id: string, status: CommissionStatus) =>
  rpc<void>('admin_set_commission_status', { p_commission_id: id, p_status: status });

export async function adminCars(status: CarStatus | 'all', search: string): Promise<AdminCar[]> {
  let q = supabase
    .from('cars')
    .select('id, public_id, status, year, make, model, price, city, state, created_at, published_at, moderation_note, views, owner:profiles!cars_owner_id_fkey(id, full_name, identity_verified), car_photos(url, position)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status !== 'all') q = q.eq('status', status);
  if (search.trim()) {
    const t = search.trim().replace(/[%,()]/g, ' ');
    q = q.or(`make.ilike.%${t}%,model.ilike.%${t}%,city.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AdminCar[];
}

export async function adminDisputes(status: DisputeStatus | 'all'): Promise<AdminDispute[]> {
  let q = supabase
    .from('disputes')
    .select('id, status, opened_by, reason, evidence, resolution_note, created_at, sale:sales(sale_price, created_at), car:cars(public_id, year, make, model, commission_type, commission_value), owner:profiles!disputes_owner_id_fkey(full_name), promoter:profiles!disputes_promoter_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(100);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AdminDispute[];
}

export async function adminCommissions(status: CommissionStatus | 'all'): Promise<AdminCommission[]> {
  let q = supabase
    .from('commissions')
    .select('id, status, amount_cents, platform_fee_cents, source, created_at, paid_at, stripe_payment_intent_id, car:cars(public_id, year, make, model), owner:profiles!commissions_owner_id_fkey(full_name), promoter:profiles!commissions_promoter_id_fkey(full_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as AdminCommission[];
}

export async function fetchSettings(): Promise<PlatformSettings> {
  const { data, error } = await supabase.from('platform_settings').select('*').eq('id', 1).single();
  if (error) throw error;
  return data as PlatformSettings;
}

export async function saveSettings(patch: Partial<Omit<PlatformSettings, 'id'>>) {
  const { error } = await supabase.from('platform_settings').update(patch).eq('id', 1);
  if (error) throw error;
}
