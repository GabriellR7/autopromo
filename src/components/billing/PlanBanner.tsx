import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, CreditCard } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { cents } from '@/lib/sales';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * Shows a reminder on seller pages when the free trial is ending (≤ 5 days),
 * a payment failed, or access has ended. Renders nothing otherwise.
 */
export function PlanBanner() {
  const { state, loading } = useSubscription();
  const { owner_subscription_price_cents } = usePlatformSettings();
  const price = `${cents(owner_subscription_price_cents)}/month`;
  if (loading) return null;

  let tone: 'warn' | 'error' = 'warn';
  let Icon = Clock;
  let title = '';
  let text = '';
  let cta = 'Subscribe';

  if (state.kind === 'trial' && state.daysLeft <= 5) {
    title = state.daysLeft <= 1 ? 'Your free trial ends today' : `${state.daysLeft} days left in your free trial`;
    text = `Subscribe for ${price} to keep your listings online after ${formatDate(state.endsAt)}. You won't be charged before then.`;
  } else if (state.kind === 'past_due') {
    tone = 'error';
    Icon = CreditCard;
    title = 'Your last payment failed';
    text = `Update your card by ${formatDate(state.graceUntil)} to keep your listings online.`;
    cta = 'Update card';
  } else if (state.kind === 'expired') {
    tone = 'error';
    Icon = AlertTriangle;
    title = 'Your listings are hidden';
    text = `Your plan has ended, so buyers can't see your cars. Subscribe for ${price} to put them back online right away.`;
  } else {
    return null;
  }

  return (
    <div
      role="status"
      className={
        tone === 'error'
          ? 'flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 sm:flex-row sm:items-center'
          : 'flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center'
      }
    >
      <Icon className={tone === 'error' ? 'size-5 shrink-0 text-destructive' : 'size-5 shrink-0 text-amber-700'} />
      <div className="flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        <p className="text-muted-foreground">{text}</p>
      </div>
      <Button asChild size="sm" variant={tone === 'error' ? 'destructive' : 'default'}>
        <Link to="/dashboard/billing">{cta}</Link>
      </Button>
    </div>
  );
}
