import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Award, Flag, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  REPORT_REASONS, fetchPendingReviews, fetchUserStats, reportContent, submitReview,
  type PendingReview, type ReportReason, type UserStats,
} from '@/lib/community';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert, Badge } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';

/* ---------------- Stars ---------------- */
export function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'lg' }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-400" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={cn(size === 'lg' ? 'size-6' : 'size-3.5', i < Math.round(value) ? 'fill-current' : 'text-slate-300')} />
      ))}
    </span>
  );
}

/* ---------------- Rating summary ---------------- */
export function useUserStats(userId: string | null | undefined) {
  const [stats, setStats] = useState<UserStats | null>(null);
  useEffect(() => {
    if (userId) fetchUserStats(userId).then(setStats).catch(() => undefined);
  }, [userId]);
  return stats;
}

export function RatingSummary({ userId, className }: { userId: string | null | undefined; className?: string }) {
  const stats = useUserStats(userId);
  if (!stats || stats.reviews === 0) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-muted-foreground', className)}>
      <Star className="size-3.5 fill-amber-400 text-amber-400" />
      <strong className="text-foreground">{stats.rating?.toFixed(1)}</strong> ({stats.reviews})
    </span>
  );
}

export function TopPromoterBadge() {
  return <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-white"><Award />Top Promoter</Badge>;
}

/* ---------------- Review dialog ---------------- */
export function ReviewDialog({ review, onClose, onDone }: { review: PendingReview | null; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRating(0);
    setComment('');
    setError(null);
  }, [review?.sale_id]);

  async function submit() {
    if (!review || !rating) return;
    setSaving(true);
    setError(null);
    try {
      await submitReview(review.sale_id, rating, comment.trim());
      toast.success('Thanks for your review!');
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const who = review?.role === 'owner_to_promoter' ? 'the promoter' : 'the owner';
  return (
    <Dialog
      open={Boolean(review)}
      onClose={onClose}
      title={`Rate ${review?.other_name ?? who}`}
      description={review ? `How was working with ${who} on the ${review.car_title}?` : undefined}
    >
      <div className="space-y-4">
        <div className="flex justify-center gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => setRating(n)} aria-label={`${n} stars`}>
              <Star className={cn('size-9 transition', n <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300')} />
            </button>
          ))}
        </div>
        <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value.slice(0, 1000))} placeholder="Share a few words (optional, shown publicly)." />
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Later</Button>
          <Button onClick={submit} loading={saving} disabled={!rating}>Submit review</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------------- Report button + dialog ---------------- */
export function ReportButton({ targetType, targetId, label, className }: {
  targetType: 'car' | 'user';
  targetId: string;
  label?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    if (!user) {
      navigate('/login', { state: { from: window.location.pathname } });
      return;
    }
    setOpen(true);
  }

  async function submit() {
    if (!reason) return setError('Choose a reason.');
    setSaving(true);
    setError(null);
    try {
      await reportContent(targetType, targetId, reason, details.trim());
      toast.success('Thanks — our team will review this report.');
      setOpen(false);
      setReason(null);
      setDetails('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button type="button" onClick={start} className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive', className)}>
        <Flag className="size-3.5" /> {label ?? (targetType === 'car' ? 'Report listing' : 'Report user')}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={targetType === 'car' ? 'Report this listing' : 'Report this user'} description="Reports are confidential.">
        <div className="space-y-3">
          {REPORT_REASONS.filter((r) => r.for.includes(targetType)).map((r) => (
            <label key={r.value} className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm', reason === r.value && 'border-primary bg-accent')}>
              <input type="radio" name="reason" className="accent-primary" checked={reason === r.value} onChange={() => setReason(r.value)} />
              {r.label}
            </label>
          ))}
          <Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value.slice(0, 1000))} placeholder="Anything else we should know? (optional)" />
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={submit} loading={saving} disabled={!reason}>Send report</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/* ---------------- Pending reviews prompt ---------------- */
export function PendingReviewsCard({ role }: { role?: PendingReview['role'] }) {
  const [items, setItems] = useState<PendingReview[]>([]);
  const [active, setActive] = useState<PendingReview | null>(null);
  const load = () => fetchPendingReviews().then((r) => setItems(role ? r.filter((x) => x.role === role) : r));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><Star className="size-4 fill-amber-400 text-amber-400" />Leave a review</p>
      <div className="mt-2 divide-y">
        {items.map((r) => (
          <div key={r.sale_id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0 truncate">{r.other_name ?? 'User'} · <span className="text-muted-foreground">{r.car_title}</span></span>
            <Button size="sm" variant="outline" onClick={() => setActive(r)}>Rate</Button>
          </div>
        ))}
      </div>
      <ReviewDialog review={active} onClose={() => setActive(null)} onDone={load} />
    </div>
  );
}
