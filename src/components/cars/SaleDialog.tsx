import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, BadgeDollarSign, CalendarCheck, Loader2, MessageSquare, MousePointerClick } from 'lucide-react';
import {
  cents, confirmSale, estimateCommissionCents, fetchAttributionOptions, type AttributionOptions,
} from '@/lib/sales';
import type { CarWithPhotos } from '@/lib/types';
import { carTitle, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Alert } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';

const NONE = '__none__';

/**
 * "Mark as sold": the owner picks the buyer (from their conversations) and the
 * promoter who referred them. Choosing a buyer that came through a promoter
 * credits that promoter automatically.
 */
export function SaleDialog({ car, open, onClose, onDone }: {
  car: CarWithPhotos;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [options, setOptions] = useState<AttributionOptions | null>(null);
  const [price, setPrice] = useState(car.price ? String(car.price) : '');
  const [buyer, setBuyer] = useState<string>(NONE);
  const [promotion, setPromotion] = useState<string>(NONE);
  const [confirmNoPromoter, setConfirmNoPromoter] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    fetchAttributionOptions(car.id).then(setOptions).catch((e: Error) => setError(e.message));
  }, [open, car.id]);

  const selectedBuyer = options?.buyers.find((b) => b.conversation_id === buyer) ?? null;
  const lockedPromotion = selectedBuyer?.promotion_id ?? null;
  const effectivePromotion = lockedPromotion ?? (promotion === NONE ? null : promotion);
  const promoterName = options?.promoters.find((p) => p.promotion_id === effectivePromotion)?.promoter_name;
  const salePrice = Number(price) || 0;

  const fee = useMemo(() => {
    if (!options || !effectivePromotion || !salePrice) return null;
    const total = estimateCommissionCents(options.commission_type, options.commission_value, salePrice);
    return { total, platform: Math.round((total * options.platform_fee_percent) / 100) };
  }, [options, effectivePromotion, salePrice]);

  const promotersWithEvidence = (options?.promoters ?? []).filter((p) => p.conversations > 0 && p.promotion_id !== effectivePromotion);

  async function submit() {
    if (!salePrice) return setError('Enter the final sale price.');
    if (!effectivePromotion && options && options.promoters.length > 0 && !confirmNoPromoter) {
      return setError('Confirm that no promoter referred this buyer.');
    }
    setSaving(true);
    setError(null);
    try {
      const res = await confirmSale(car.id, salePrice, effectivePromotion, buyer === NONE ? null : buyer);
      toast.success(res.commission_id ? 'Sale recorded! You can pay the referral fee in Commissions.' : 'Sale recorded. Congratulations! 🎉');
      if (res.disputes_opened > 0) toast.info('A promoter who referred buyers was not credited — AutoPromo will review it.');
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Mark as sold" description={`${carTitle(car)} — this can't be undone.`} className="sm:max-w-xl">
      {!options && !error ? (
        <div className="flex justify-center py-10"><Loader2 className="size-6 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-5">
          <Field label="Final sale price" htmlFor="sale-price">
            <div className="relative max-w-[200px]">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>
              <Input id="sale-price" inputMode="numeric" className="pl-7" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))} />
            </div>
          </Field>

          {options && options.buyers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Who bought it?</p>
              <div className="space-y-2">
                {options.buyers.map((b) => (
                  <Choice key={b.conversation_id} selected={buyer === b.conversation_id} onClick={() => setBuyer(b.conversation_id)}>
                    <span className="font-medium">{b.buyer_name ?? 'Buyer'}</span>
                    <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MessageSquare className="size-3" />Chatted</span>
                      {b.has_visit && <span className="flex items-center gap-1"><CalendarCheck className="size-3" />Visited</span>}
                      {b.promoter_name && <span className="font-medium text-primary">Referred by {b.promoter_name}</span>}
                    </span>
                  </Choice>
                ))}
                <Choice selected={buyer === NONE} onClick={() => setBuyer(NONE)}>
                  <span className="font-medium">Someone else / outside AutoPromo</span>
                </Choice>
              </div>
            </div>
          )}

          {options && options.promoters.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Did a promoter refer this buyer?</p>
              {lockedPromotion ? (
                <Alert variant="info">This buyer arrived through <strong>{promoterName ?? 'a promoter'}</strong>'s link, so they'll be credited.</Alert>
              ) : (
                <div className="space-y-2">
                  {options.promoters.map((p) => (
                    <Choice key={p.promotion_id} selected={promotion === p.promotion_id} onClick={() => setPromotion(p.promotion_id)}>
                      <span className="font-medium">{p.promoter_name ?? 'Promoter'}</span>
                      <span className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><MousePointerClick className="size-3" />{p.clicks} clicks</span>
                        <span className="flex items-center gap-1"><MessageSquare className="size-3" />{p.conversations} buyers</span>
                      </span>
                    </Choice>
                  ))}
                  <Choice selected={promotion === NONE} onClick={() => setPromotion(NONE)}>
                    <span className="font-medium">No promoter referred this buyer</span>
                  </Choice>
                </div>
              )}
            </div>
          )}

          {fee && (
            <div className="flex items-start gap-3 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
              <BadgeDollarSign className="mt-0.5 size-4 shrink-0 text-success" />
              <p>
                You'll owe a referral fee of <strong>{cents(fee.total)}</strong> to {promoterName ?? 'the promoter'}, paid securely by card
                after confirming.
              </p>
            </div>
          )}

          {!effectivePromotion && options && options.promoters.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-lg border p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmNoPromoter} onChange={(e) => setConfirmNoPromoter(e.target.checked)} />
              <span>I confirm the buyer was not referred by any promoter.</span>
            </label>
          )}

          {!effectivePromotion && promotersWithEvidence.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="size-4 shrink-0" />
              <p>
                {promotersWithEvidence.map((p) => p.promoter_name ?? 'A promoter').join(', ')} referred buyers who chatted with you.
                Not crediting them opens an automatic review by AutoPromo.
              </p>
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Confirm sale</Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
        selected ? 'border-primary bg-accent ring-2 ring-primary/15' : 'hover:bg-secondary/60',
      )}
    >
      {children}
    </button>
  );
}
