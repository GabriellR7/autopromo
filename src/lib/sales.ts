import { supabase } from './supabase';
import type { CommissionType } from './types';

export type CommissionStatus = 'pending' | 'paid' | 'cancelled';
export type DisputeStatus = 'open' | 'resolved_promoter' | 'resolved_owner' | 'closed';

export interface AttributionBuyer {
  conversation_id: string;
  buyer_id: string;
  buyer_name: string | null;
  promotion_id: string | null;
  promoter_name: string | null;
  has_visit: boolean;
  last_message_at: string | null;
}

export interface AttributionPromoter {
  promotion_id: string;
  promoter_id: string;
  promoter_name: string | null;
  active: boolean;
  clicks: number;
  conversations: number;
}

export interface AttributionOptions {
  buyers: AttributionBuyer[];
  promoters: AttributionPromoter[];
  commission_type: CommissionType;
  commission_value: number;
  platform_fee_percent: number;
}

export interface OwnerCommission {
  id: string;
  status: CommissionStatus;
  amount_cents: number;
  paid_at: string | null;
  created_at: string;
  source: 'owner' | 'dispute';
  car_title: string;
  car_public_id: number;
  promoter_name: string | null;
  promoter_ready: boolean;
}

export interface Dispute {
  id: string;
  status: DisputeStatus;
  opened_by: 'system' | 'promoter';
  reason: string;
  evidence: { referred_conversations?: number; confirmed_visits?: number; clicks?: number };
  created_at: string;
  resolution_note: string | null;
  car_title: string;
  promoter_name: string | null;
}

export interface PromoterCommission {
  id: string;
  status: CommissionStatus;
  amount_cents: number;
  platform_fee_cents: number;
  promoter_amount_cents: number;
  source: 'owner' | 'dispute';
  paid_at: string | null;
  created_at: string;
  car_title: string;
  car_public_id: number;
  car_city: string | null;
  car_state: string | null;
  owner_name: string | null;
}

export interface UncreditedSale {
  sale_id: string;
  sold_at: string;
  car_title: string;
  dispute_status: DisputeStatus | null;
  dispute_opened_by: 'system' | 'promoter' | null;
}

export interface PayoutAccount {
  stripe_account_id: string | null;
  details_submitted: boolean;
  payouts_enabled: boolean;
}

export const cents = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: value % 100 ? 2 : 0 }).format(value / 100);

/** Same formula as the database (create_commission). Returns cents. */
export function estimateCommissionCents(type: CommissionType, value: number, salePrice: number) {
  return type === 'percent' ? Math.round(salePrice * value) : Math.round(value * 100);
}

export async function fetchAttributionOptions(carId: string): Promise<AttributionOptions> {
  const { data, error } = await supabase.rpc('sale_attribution_options', { p_car_id: carId });
  if (error) throw error;
  const o = data as AttributionOptions;
  return {
    ...o,
    commission_value: Number(o.commission_value),
    platform_fee_percent: Number(o.platform_fee_percent),
    promoters: o.promoters.map((p) => ({ ...p, clicks: Number(p.clicks), conversations: Number(p.conversations) })),
  };
}

export async function confirmSale(carId: string, salePrice: number, promotionId: string | null, conversationId: string | null) {
  const { data, error } = await supabase.rpc('confirm_sale', {
    p_car_id: carId,
    p_sale_price: salePrice,
    p_promotion_id: promotionId,
    p_conversation_id: conversationId,
  });
  if (error) throw error;
  return data as { sale_id: string; commission_id: string | null; disputes_opened: number };
}

export async function fetchOwnerCommissions(): Promise<{ commissions: OwnerCommission[]; disputes: Dispute[] }> {
  const { data, error } = await supabase.rpc('owner_commissions');
  if (error) throw error;
  return data as { commissions: OwnerCommission[]; disputes: Dispute[] };
}

export async function fetchMyEarnings(): Promise<{ commissions: PromoterCommission[]; uncredited_sales: UncreditedSale[] }> {
  const { data, error } = await supabase.rpc('my_earnings');
  if (error) throw error;
  return data as { commissions: PromoterCommission[]; uncredited_sales: UncreditedSale[] };
}

export async function openDispute(saleId: string, reason: string) {
  const { error } = await supabase.rpc('open_dispute', { p_sale_id: saleId, p_reason: reason });
  if (error) throw error;
}

export async function fetchPayoutAccount(userId: string): Promise<PayoutAccount | null> {
  const { data } = await supabase
    .from('payout_accounts')
    .select('stripe_account_id, details_submitted, payouts_enabled')
    .eq('user_id', userId)
    .maybeSingle();
  return (data as PayoutAccount | null) ?? null;
}

/** Calls the stripe-api Edge Function and surfaces its error message. */
export async function stripeAction<T = { url?: string }>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('stripe-api', { body: { action, ...extra } });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null);
      if (body?.error) message = body.error;
    }
    throw new Error(message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const DISPUTE_LABEL: Record<DisputeStatus, string> = {
  open: 'Under review',
  resolved_promoter: 'Resolved — promoter credited',
  resolved_owner: 'Resolved — no commission',
  closed: 'Closed',
};
