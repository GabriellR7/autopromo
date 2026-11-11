import { supabase } from '@/lib/supabase';
import { stripeAction } from '@/lib/sales';

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled' | 'comped';

export interface Subscription {
  user_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  access_until: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** null = the owner never published, so the free trial hasn't started yet. */
export async function fetchMySubscription(userId: string): Promise<Subscription | null> {
  const { data, error } = await supabase.from('subscriptions').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data as Subscription | null) ?? null;
}

export type PlanState =
  | { kind: 'not_started' }
  | { kind: 'trial'; daysLeft: number; endsAt: string }
  | { kind: 'active'; renewsAt: string | null; canceling: boolean; inTrial: boolean }
  | { kind: 'past_due'; graceUntil: string }
  | { kind: 'comped'; until: string }
  | { kind: 'expired' };

const DAY = 86_400_000;

export function planState(sub: Subscription | null, now = new Date()): PlanState {
  if (!sub) return { kind: 'not_started' };
  const accessUntil = new Date(sub.access_until);
  const hasAccess = accessUntil > now;
  if (sub.status === 'comped') return hasAccess ? { kind: 'comped', until: sub.access_until } : { kind: 'expired' };
  if (!hasAccess) return { kind: 'expired' };
  if (sub.status === 'past_due') return { kind: 'past_due', graceUntil: sub.access_until };
  const inTrial = !!sub.trial_ends_at && new Date(sub.trial_ends_at) > now;
  if (sub.status === 'active') {
    // inTrial: subscribed with a card, first charge when the free trial ends.
    return { kind: 'active', renewsAt: sub.current_period_end ?? sub.access_until, canceling: sub.cancel_at_period_end, inTrial };
  }
  if (sub.status === 'trial') {
    return { kind: 'trial', daysLeft: Math.max(0, Math.ceil((accessUntil.getTime() - now.getTime()) / DAY)), endsAt: sub.access_until };
  }
  // canceled, but still inside the paid period / free trial
  return { kind: 'active', renewsAt: sub.access_until, canceling: true, inTrial };
}

export async function startSubscription() {
  const { url } = await stripeAction<{ url: string }>('subscribe');
  window.location.href = url;
}

export async function openBillingPortal() {
  const { url } = await stripeAction<{ url: string }>('billing_portal');
  window.location.href = url;
}
