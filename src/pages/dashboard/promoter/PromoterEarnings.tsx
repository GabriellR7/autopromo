import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, CheckCircle2, Clock, ExternalLink, Landmark, Scale, Wallet } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  DISPUTE_LABEL, cents, fetchMyEarnings, fetchPayoutAccount, openDispute, stripeAction,
  type PayoutAccount, type PromoterCommission, type UncreditedSale,
} from '@/lib/sales';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import PromoterSetup from './PromoterSetup';

export default function PromoterEarnings() {
  useDocumentTitle('Earnings');
  const { user, profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [payout, setPayout] = useState<PayoutAccount | null | undefined>(undefined);
  const [data, setData] = useState<{ commissions: PromoterCommission[]; uncredited_sales: UncreditedSale[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [disputeFor, setDisputeFor] = useState<UncreditedSale | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!user) return;
    try {
      const [p, e] = await Promise.all([fetchPayoutAccount(user.id), fetchMyEarnings()]);
      setPayout(p);
      setData(e);
    } catch (e) {
      setError((e as Error).message);
      setData({ commissions: [], uncredited_sales: [] });
    }
  }

  useEffect(() => {
    if (!profile?.promoter_agreement_at) return;
    const fromStripe = params.get('stripe');
    if (fromStripe) {
      // Back from Stripe onboarding: re-sync status, then reload.
      stripeAction('connect_refresh').catch(() => undefined).finally(load);
      setParams(new URLSearchParams(), { replace: true });
    } else {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.promoter_agreement_at, user]);

  if (!profile?.promoter_agreement_at) return <PromoterSetup />;

  async function go(action: 'connect_onboard' | 'connect_dashboard') {
    setBusy(action);
    try {
      const { url } = await stripeAction<{ url: string }>(action);
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  }

  const commissions = data?.commissions ?? [];
  const paid = commissions.filter((c) => c.status === 'paid').reduce((s, c) => s + c.promoter_amount_cents, 0);
  const pending = commissions.filter((c) => c.status === 'pending').reduce((s, c) => s + c.promoter_amount_cents, 0);

  return (
    <div className="space-y-8">
      <div>
        <Link to="/dashboard/promoter" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Promoter dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Earnings</h1>
        <p className="text-muted-foreground">Your referral fees and how you get paid.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="size-4" />Paid to you</p>
          {data ? <p className="mt-1 text-2xl font-bold text-success">{cents(paid)}</p> : <Skeleton className="mt-2 h-8 w-20" />}
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Clock className="size-4" />Waiting for owner payment</p>
          {data ? <p className="mt-1 text-2xl font-bold">{cents(pending)}</p> : <Skeleton className="mt-2 h-8 w-20" />}
        </Card>
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Banknote className="size-4" />Sales referred</p>
          {data ? <p className="mt-1 text-2xl font-bold">{commissions.filter((c) => c.status !== 'cancelled').length}</p> : <Skeleton className="mt-2 h-8 w-12" />}
        </Card>
      </div>

      {/* Payout setup */}
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-white"><Landmark className="size-5" /></div>
        <div className="flex-1">
          {payout === undefined ? (
            <Skeleton className="h-10 w-full" />
          ) : payout?.payouts_enabled ? (
            <>
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-success" />Payouts are active</p>
              <p className="text-sm text-muted-foreground">Commissions go straight to your bank account through Stripe.</p>
            </>
          ) : payout?.stripe_account_id ? (
            <>
              <p className="font-semibold">Finish your payout setup</p>
              <p className="text-sm text-muted-foreground">Stripe still needs some information before you can receive money.</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Set up payouts to get paid</p>
              <p className="text-sm text-muted-foreground">
                Takes ~5 minutes with Stripe: identity check, SSN last 4 and a U.S. bank account. Owners can only pay you after this.
              </p>
            </>
          )}
        </div>
        {payout !== undefined && (payout?.payouts_enabled ? (
          <Button variant="outline" onClick={() => go('connect_dashboard')} loading={busy === 'connect_dashboard'}><ExternalLink /> Stripe dashboard</Button>
        ) : (
          <Button onClick={() => go('connect_onboard')} loading={busy === 'connect_onboard'}>{payout?.stripe_account_id ? 'Continue setup' : 'Set up payouts'}</Button>
        ))}
      </Card>

      {/* Commissions */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Commissions</h2>
        {data === null ? (
          <Skeleton className="h-28 w-full" />
        ) : commissions.length === 0 ? (
          <EmptyState icon={Banknote} title="No commissions yet" description="When a buyer you referred buys a car and the owner confirms the sale, your fee appears here." />
        ) : (
          <Card className="divide-y">
            {commissions.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <Link to={`/cars/${c.car_public_id}`} className="font-semibold hover:text-primary">{c.car_title}</Link>
                  <p className="text-sm text-muted-foreground">
                    Owner: {c.owner_name ?? '—'} · sold {formatDate(c.created_at)} · fee {cents(c.amount_cents)}{c.platform_fee_cents > 0 ? ` − platform ${cents(c.platform_fee_cents)}` : ''}
                  </p>
                </div>
                <p className="text-lg font-bold text-success">{cents(c.promoter_amount_cents)}</p>
                {c.status === 'paid' ? (
                  <Badge variant="success"><CheckCircle2 />Paid {c.paid_at ? formatDate(c.paid_at) : ''}</Badge>
                ) : c.status === 'cancelled' ? (
                  <Badge variant="secondary">Cancelled</Badge>
                ) : (
                  <Badge variant="warning"><Clock />{payout?.payouts_enabled ? 'Waiting for owner' : 'Set up payouts'}</Badge>
                )}
              </div>
            ))}
          </Card>
        )}
      </section>

      {/* Sales without credit */}
      {data && data.uncredited_sales.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Scale className="size-5" />Sold without your credit</h2>
          <p className="text-sm text-muted-foreground">Cars you promoted that were sold without crediting you. If your buyer bought it, ask for a review within 30 days.</p>
          <Card className="divide-y">
            {data.uncredited_sales.map((s) => (
              <div key={s.sale_id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                <div>
                  <p className="font-semibold">{s.car_title}</p>
                  <p className="text-muted-foreground">Sold {formatDate(s.sold_at)}</p>
                </div>
                {s.dispute_status ? (
                  <Badge variant={s.dispute_status === 'open' ? 'warning' : 'secondary'}>
                    {DISPUTE_LABEL[s.dispute_status]}{s.dispute_opened_by === 'system' ? ' (automatic)' : ''}
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setDisputeFor(s)}>Ask for review</Button>
                )}
              </div>
            ))}
          </Card>
        </section>
      )}

      <DisputeDialog sale={disputeFor} onClose={() => setDisputeFor(null)} onDone={load} />
    </div>
  );
}

function DisputeDialog({ sale, onClose, onDone }: { sale: UncreditedSale | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!sale) return;
    setSaving(true);
    setError(null);
    try {
      await openDispute(sale.sale_id, reason);
      toast.success('Review requested. Our team will look at the referral history.');
      setReason('');
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(sale)} onClose={onClose} title="Ask for a review" description={sale ? `${sale.car_title} — tell us how you referred the buyer.` : undefined}>
      <div className="space-y-4">
        <Textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value.slice(0, 1000))}
          placeholder="e.g. The buyer, John, found the car through my Facebook post and chatted with the owner through my link on 11/10." />
        <p className="text-xs text-muted-foreground">We check your link clicks and the buyer chats attributed to you. False claims can lead to account suspension.</p>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving} disabled={reason.trim().length < 20}>Send</Button>
        </div>
      </div>
    </Dialog>
  );
}
