import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CalendarClock, Check, CreditCard, Gift, ShieldCheck } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { openBillingPortal, startSubscription } from '@/lib/billing';
import { cents } from '@/lib/sales';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const PERKS = [
  'Up to 5 active listings at a time',
  'Unlimited promoters sharing your cars',
  'Chat with buyers and schedule visits',
  'Referral commission goes 100% to the promoter — no platform cut',
  'Cancel anytime, no contracts',
];

export default function Billing() {
  useDocumentTitle('Billing');
  const [params, setParams] = useSearchParams();
  const { state, loading, reload } = useSubscription();
  const settings = usePlatformSettings();
  const [busy, setBusy] = useState<'subscribe' | 'portal' | null>(null);
  const price = cents(settings.owner_subscription_price_cents);

  useEffect(() => {
    if (params.get('subscribed')) {
      toast.success("You're subscribed — thank you! Your listings stay online.");
      setTimeout(reload, 4000); // the Stripe webhook can take a few seconds
    }
    if (params.get('cancelled')) toast.info('Checkout cancelled. Nothing was charged.');
    if (params.get('subscribed') || params.get('cancelled')) setParams(new URLSearchParams(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(kind: 'subscribe' | 'portal') {
    setBusy(kind);
    try {
      await (kind === 'subscribe' ? startSubscription() : openBillingPortal());
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const subscribeButton = (label = `Subscribe — ${price}/month`) => (
    <Button size="lg" onClick={() => run('subscribe')} loading={busy === 'subscribe'}>
      <CreditCard /> {label}
    </Button>
  );
  const portalButton = (
    <Button variant="outline" onClick={() => run('portal')} loading={busy === 'portal'}>
      Manage billing
    </Button>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing</h1>
        <p className="text-muted-foreground">
          Selling on AutoPromo is free for {settings.owner_trial_days} days, then {price}/month per account.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="space-y-5 p-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-4 w-72" />
              <Skeleton className="h-10 w-56" />
            </div>
          ) : state.kind === 'not_started' ? (
            <>
              <div className="flex items-center gap-2">
                <Gift className="size-5 text-primary" />
                <h2 className="text-lg font-semibold">Your free trial hasn't started</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Your {settings.owner_trial_days}-day free trial starts when you publish your first listing. No card needed.
              </p>
              <Button asChild size="lg">
                <Link to="/dashboard/listings/new">List your car</Link>
              </Button>
            </>
          ) : state.kind === 'trial' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Free trial</h2>
                <Badge variant={state.daysLeft <= 5 ? 'warning' : 'success'}>
                  {state.daysLeft} {state.daysLeft === 1 ? 'day' : 'days'} left
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Your trial ends on <strong className="text-foreground">{formatDate(state.endsAt)}</strong>. Subscribe now to keep your
                listings online without interruption — you won't be charged until the trial ends.
              </p>
              {subscribeButton()}
            </>
          ) : state.kind === 'active' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Seller plan</h2>
                <Badge variant={state.canceling ? 'warning' : 'success'}>{state.canceling ? 'Ends soon' : 'Active'}</Badge>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarClock className="size-4" />
                {state.canceling
                  ? `Your plan is cancelled. Listings stay online until ${formatDate(state.renewsAt)}.`
                  : state.inTrial
                    ? `You're still in your free trial. First charge of ${price} on ${formatDate(state.renewsAt)}.`
                    : `Renews on ${formatDate(state.renewsAt)} for ${price}.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {portalButton}
                {state.canceling && subscribeButton('Resubscribe')}
              </div>
            </>
          ) : state.kind === 'past_due' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Seller plan</h2>
                <Badge variant="destructive">Payment failed</Badge>
              </div>
              <Alert variant="error">
                We couldn't charge your card. Update it by {formatDate(state.graceUntil)} to keep your listings online.
              </Alert>
              <Button size="lg" onClick={() => run('portal')} loading={busy === 'portal'}>
                <CreditCard /> Update card
              </Button>
            </>
          ) : state.kind === 'comped' ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Free access</h2>
                <Badge variant="success">Complimentary</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                The AutoPromo team gave you free access until <strong className="text-foreground">{formatDate(state.until)}</strong>.
              </p>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Plan ended</h2>
                <Badge variant="destructive">Listings hidden</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Buyers can't see your cars right now. Subscribe and they go back online immediately — nothing to re-upload.
              </p>
              <div className="flex flex-wrap gap-2">{subscribeButton()}</div>
            </>
          )}
        </Card>

        <Card className="space-y-4 p-6">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Seller plan</p>
            <p className="text-3xl font-bold">
              {price}
              <span className="text-base font-medium text-muted-foreground">/month</span>
            </p>
            <p className="text-sm text-primary">First {settings.owner_trial_days} days free</p>
          </div>
          <ul className="space-y-2 text-sm">
            {PERKS.map((p) => (
              <li key={p} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
                {p}
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-4" /> Payments are processed securely by Stripe.
          </p>
        </Card>
      </div>
    </div>
  );
}
