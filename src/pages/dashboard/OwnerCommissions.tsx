import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckCircle2, Clock, CreditCard, Receipt, Scale } from 'lucide-react';
import { DISPUTE_LABEL, cents, fetchOwnerCommissions, stripeAction, type Dispute, type OwnerCommission } from '@/lib/sales';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function OwnerCommissions() {
  useDocumentTitle('Commissions');
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<{ commissions: OwnerCommission[]; disputes: Dispute[] } | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await fetchOwnerCommissions());
    } catch (e) {
      setError((e as Error).message);
      setData({ commissions: [], disputes: [] });
    }
  }

  useEffect(() => {
    load();
    if (params.get('paid')) {
      toast.success('Payment received — thank you! The promoter will be paid automatically.');
      // The webhook may take a few seconds; refresh again shortly.
      setTimeout(load, 4000);
    }
    if (params.get('cancelled')) toast.info('Payment cancelled. You can pay anytime.');
    if (params.get('paid') || params.get('cancelled')) setParams(new URLSearchParams(), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pay(c: OwnerCommission) {
    setPaying(c.id);
    try {
      const { url } = await stripeAction<{ url: string }>('checkout', { commission_id: c.id });
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setPaying(null);
    }
  }

  const pending = data?.commissions.filter((c) => c.status === 'pending') ?? [];
  const owed = pending.reduce((s, c) => s + c.amount_cents, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Commissions</h1>
        <p className="text-muted-foreground">Referral fees for promoters who brought you a buyer.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      {pending.length > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-4 border-primary/30 bg-accent p-5">
          <div>
            <p className="text-sm text-muted-foreground">You owe</p>
            <p className="text-2xl font-bold">{cents(owed)}</p>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Paying is quick and secure (card via Stripe). The full amount goes straight to the promoter — AutoPromo takes no cut.
          </p>
        </Card>
      )}

      <section className="space-y-3">
        {data === null ? (
          <Skeleton className="h-32 w-full" />
        ) : data.commissions.length === 0 ? (
          <EmptyState icon={Receipt} title="No commissions" description="When you sell a car to a buyer referred by a promoter, the referral fee shows up here." />
        ) : (
          <Card className="divide-y">
            {data.commissions.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/cars/${c.car_public_id}`} className="font-semibold hover:text-primary">{c.car_title}</Link>
                  <p className="text-sm text-muted-foreground">
                    Promoter: {c.promoter_name ?? '—'} · {formatDate(c.created_at)}
                    {c.source === 'dispute' && ' · after review'}
                  </p>
                </div>
                <p className="text-lg font-bold">{cents(c.amount_cents)}</p>
                {c.status === 'paid' ? (
                  <Badge variant="success"><CheckCircle2 />Paid {c.paid_at ? formatDate(c.paid_at) : ''}</Badge>
                ) : c.status === 'cancelled' ? (
                  <Badge variant="secondary">Cancelled</Badge>
                ) : c.promoter_ready ? (
                  <Button onClick={() => pay(c)} loading={paying === c.id}><CreditCard /> Pay now</Button>
                ) : (
                  <Badge variant="warning" title="The promoter must finish setting up payouts before you can pay."><Clock />Waiting for promoter payout setup</Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {data && data.disputes.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Scale className="size-5" />Reviews</h2>
          <p className="text-sm text-muted-foreground">
            Opened when a promoter who referred buyers wasn't credited. Our team reviews the chat history and decides within a few days.
          </p>
          <Card className="divide-y">
            {data.disputes.map((d) => (
              <div key={d.id} className="space-y-1 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{d.car_title} · {d.promoter_name ?? 'Promoter'}</p>
                  <Badge variant={d.status === 'open' ? 'warning' : 'secondary'}>{DISPUTE_LABEL[d.status]}</Badge>
                </div>
                <p className="text-muted-foreground">{d.reason}</p>
                <p className="text-xs text-muted-foreground">
                  {d.evidence.referred_conversations ?? 0} referred buyer chat(s) · {d.evidence.confirmed_visits ?? 0} confirmed visit(s) · opened {formatDate(d.created_at)}
                </p>
                {d.resolution_note && <p className="rounded-md bg-secondary/60 p-2 text-xs">Decision: {d.resolution_note}</p>}
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
