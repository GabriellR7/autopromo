import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Check, Heart, Lightbulb, MessageSquare, MousePointerClick, Eye, TrendingUp } from 'lucide-react';
import { fetchCarStats, fetchPriceInsight, pricePosition, type DayStat, type PriceInsight, type ScoreTip } from '@/lib/insights';
import { cn, formatPrice } from '@/lib/utils';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/misc';

/* -------------------------------------------------------------------------- */
/* Suggested price (wizard)                                                   */
/* -------------------------------------------------------------------------- */

export function PriceSuggestion({
  make, model, year, mileage, price, excludeId, onUse,
}: {
  make: string; model: string; year: number; mileage: number | null; price: number; excludeId?: string | null; onUse: (p: number) => void;
}) {
  const [insight, setInsight] = useState<PriceInsight | null | undefined>(undefined);

  useEffect(() => {
    if (!make || !year) {
      setInsight(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      fetchPriceInsight({ make, model, year, mileage, excludeId }).then((i) => !cancelled && setInsight(i));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [make, model, year, mileage, excludeId]);

  if (insight === undefined) return <Skeleton className="h-20 w-full" />;
  if (!insight) {
    return (
      <p className="flex gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Lightbulb className="size-4 shrink-0" />
        Not enough similar cars on AutoPromo yet to suggest a price. Check Kelley Blue Book (kbb.com) or Edmunds for a private-party value.
      </p>
    );
  }

  const pos = price > 0 ? pricePosition(price, insight) : null;
  const span = Math.max(1, insight.high - insight.low);
  const marker = price > 0 ? Math.min(100, Math.max(0, ((price - insight.low) / span) * 60 + 20)) : null;

  return (
    <div className="rounded-lg border bg-secondary/40 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="size-4 text-primary" /> Similar cars on AutoPromo</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Based on {insight.comparable_count} {insight.scope === 'model' ? `${make} ${model}` : make} listings and sales from the last 12 months.
      </p>
      <div className="relative mt-4 h-2 rounded-full bg-gradient-to-r from-sky-200 via-emerald-300 to-amber-200">
        <div className="absolute inset-y-0 left-[20%] right-[20%] rounded-full ring-2 ring-emerald-500/60" />
        {marker !== null && (
          <div className="absolute -top-1.5 size-5 -translate-x-1/2 rounded-full border-2 border-white bg-navy shadow" style={{ left: `${marker}%` }} />
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{formatPrice(insight.low)}</span>
        <span className="font-semibold text-foreground">Typical {formatPrice(insight.median)}</span>
        <span>{formatPrice(insight.high)}</span>
      </div>
      {pos && (
        <p className={cn('mt-3 text-sm', pos === 'fair' ? 'text-success' : 'text-amber-700')}>
          {pos === 'fair' && 'Your price is in the typical range. 👍'}
          {pos === 'low' && 'Your price is below similar cars — it should sell fast. Make sure you are not leaving money on the table.'}
          {pos === 'high' && 'Your price is above similar cars. Expect fewer contacts unless your car has low miles or extras — mention them in the description.'}
        </p>
      )}
      {(!price || pos === 'high' || pos === 'low') && (
        <button type="button" onClick={() => onUse(insight.median)} className="mt-2 text-sm font-semibold text-primary hover:underline">
          Use the typical price ({formatPrice(insight.median)})
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Listing score                                                              */
/* -------------------------------------------------------------------------- */

export function ScoreRing({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' }) {
  const color = score >= 80 ? 'text-success' : score >= 50 ? 'text-amber-500' : 'text-destructive';
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('relative shrink-0', size === 'sm' ? 'size-10' : 'size-16')} title={`Listing score ${score}/100`}>
      <svg viewBox="0 0 40 40" className="size-full -rotate-90">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-secondary" />
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round" stroke="currentColor"
          className={color} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <span className={cn('absolute inset-0 flex items-center justify-center font-bold', size === 'sm' ? 'text-xs' : 'text-base')}>{score}</span>
    </div>
  );
}

export function ListingScoreCard({ score, tips }: { score: number; tips: ScoreTip[] }) {
  const todo = tips.filter((t) => !t.done);
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-4">
        <ScoreRing score={score} />
        <div>
          <p className="font-semibold">Listing score: {score}/100</p>
          <p className="text-sm text-muted-foreground">
            {score >= 80 ? 'Great listing — buyers have what they need.' : 'Complete listings get more views and contacts.'}
          </p>
        </div>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {[...todo, ...tips.filter((t) => t.done)].map((t) => (
          <li key={t.label} className={cn('flex gap-2', t.done && 'text-muted-foreground')}>
            {t.done ? <Check className="mt-0.5 size-4 shrink-0 text-success" /> : <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" />}
            {t.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Per-car stats dialog                                                       */
/* -------------------------------------------------------------------------- */

const METRICS = [
  { key: 'views', label: 'Views', icon: Eye },
  { key: 'clicks', label: 'Promoter clicks', icon: MousePointerClick },
  { key: 'chats', label: 'New chats', icon: MessageSquare },
  { key: 'saves', label: 'Saves', icon: Heart },
] as const;

export function CarStatsDialog({ carId, title, open, onClose }: { carId: string; title: string; open: boolean; onClose: () => void }) {
  const [days, setDays] = useState<7 | 30>(30);
  const [stats, setStats] = useState<DayStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['key']>('views');

  useEffect(() => {
    if (!open) return;
    setStats(null);
    setError(null);
    fetchCarStats(carId, days).then(setStats).catch((e: Error) => setError(e.message));
  }, [open, carId, days]);

  const totals = useMemo(() => {
    const t = { views: 0, clicks: 0, chats: 0, saves: 0 };
    for (const d of stats ?? []) {
      t.views += d.views; t.clicks += d.clicks; t.chats += d.chats; t.saves += d.saves;
    }
    return t;
  }, [stats]);
  const max = Math.max(1, ...(stats ?? []).map((d) => d[metric]));

  return (
    <Dialog open={open} onClose={onClose} title={`Stats — ${title}`} description={`Last ${days} days`} className="max-w-2xl">
      <div className="mb-4 flex gap-2">
        {([7, 30] as const).map((d) => (
          <button key={d} onClick={() => setDays(d)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', d === days ? 'border-navy bg-navy text-white' : 'hover:bg-secondary')}>
            {d} days
          </button>
        ))}
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !stats ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METRICS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setMetric(key)}
                className={cn('rounded-lg border p-3 text-left transition-colors', metric === key ? 'border-primary bg-accent' : 'hover:bg-secondary')}
              >
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</p>
                <p className="mt-0.5 text-xl font-bold">{totals[key].toLocaleString('en-US')}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 flex h-40 items-end gap-[2px]" role="img" aria-label={`${METRICS.find((m) => m.key === metric)!.label} per day`}>
            {stats.map((d) => (
              <div key={d.day} className="group relative flex h-full flex-1 items-end">
                <div className="w-full rounded-t bg-primary/80 transition-colors group-hover:bg-primary" style={{ height: `${(d[metric] / max) * 100}%`, minHeight: d[metric] ? 3 : 0 }} />
                <span className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-navy px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                  {new Date(d.day + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}: {d[metric]}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>{new Date(stats[0]!.day + 'T12:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })}</span>
            <span>Today</span>
          </div>
          <p className="mt-4 flex gap-2 text-xs text-muted-foreground">
            <BarChart3 className="size-4 shrink-0" />
            {totals.views > 0 && totals.chats === 0
              ? 'People are looking but not writing. Try more photos, a clearer description or a slightly lower price.'
              : totals.views === 0
                ? 'Few views so far. Share your listing link and raise the referral fee so promoters pick it up.'
                : `${((totals.chats / Math.max(totals.views, 1)) * 100).toFixed(1)}% of viewers started a chat.`}
          </p>
        </>
      )}
    </Dialog>
  );
}
