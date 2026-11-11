import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BadgeCheck, Check, Inbox, MessageSquare, MousePointerClick, UserMinus, Users, X } from 'lucide-react';
import { startConversation } from '@/lib/chat';
import { useAuth } from '@/context/AuthContext';
import {
  decideRequest, endPromotion, fetchIncomingRequests, fetchOwnerPromoters, type IncomingRequest, type OwnerPromoter,
} from '@/lib/promotions';
import { carPath, formatDate, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Avatar, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function OwnerPromoters() {
  useDocumentTitle('Promoters');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [requests, setRequests] = useState<IncomingRequest[] | null>(null);
  const [promoters, setPromoters] = useState<OwnerPromoter[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [r, p] = await Promise.all([fetchIncomingRequests(), fetchOwnerPromoters()]);
      // RLS also returns requests the user made as a promoter — keep only the ones for their cars.
      setRequests(r.filter((x) => x.car?.owner_id === user?.id));
      setPromoters(p);
    } catch (e) {
      setError((e as Error).message);
      setRequests([]);
    }
  }

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const pending = useMemo(() => requests?.filter((r) => r.status === 'pending') ?? [], [requests]);
  const active = promoters.filter((p) => p.active);
  const carNames = useMemo(() => {
    const m = new Map<string, IncomingRequest['car']>();
    requests?.forEach((r) => r.car && m.set(r.car.id, r.car));
    return m;
  }, [requests]);

  async function decide(r: IncomingRequest, approve: boolean) {
    setBusy(r.id);
    try {
      await decideRequest(r.id, approve);
      toast.success(approve ? `${r.promoter?.full_name ?? 'Promoter'} can now promote your car` : 'Request declined');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function message(p: OwnerPromoter) {
    try {
      const id = await startConversation(p.car_id, p.promoter_id);
      navigate(`/dashboard/messages/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(p: OwnerPromoter) {
    if (!window.confirm(`Remove ${p.promoter_name ?? 'this promoter'}? Their link will stop working.`)) return;
    setBusy(p.promotion_id);
    try {
      await endPromotion(p.promotion_id);
      toast.success('Promoter removed');
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Promoters</h1>
        <p className="text-muted-foreground">Approve who can share your cars and see how many people each promoter brings.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          Requests {pending.length > 0 && <Badge>{pending.length}</Badge>}
        </h2>
        {requests === null ? (
          <Skeleton className="h-28 w-full" />
        ) : pending.length === 0 ? (
          <EmptyState icon={Inbox} title="No pending requests" description="When a promoter asks to share one of your cars, it shows up here." />
        ) : (
          <Card className="divide-y">
            {pending.map((r) => (
              <div key={r.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <Avatar name={r.promoter?.full_name} src={r.promoter?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.promoter?.full_name ?? 'Promoter'}</p>
                    {r.promoter?.identity_verified && <Badge variant="success"><BadgeCheck />Verified</Badge>}
                    {r.promoter && <Badge variant="secondary" className="capitalize">{r.promoter.promoter_level}</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    wants to promote{' '}
                    {r.car ? <Link to={carPath(r.car)} className="font-medium text-foreground hover:text-primary">{r.car.year} {r.car.make} {r.car.model}</Link> : 'your car'}
                    {' · '}{timeAgo(r.created_at)}
                  </p>
                  {r.message && <p className="mt-2 rounded-md bg-secondary/60 p-3 text-sm">“{r.message}”</p>}
                  {r.promoter && <p className="mt-1 text-xs text-muted-foreground">Member since {formatDate(r.promoter.created_at)}</p>}
                </div>
                <div className="flex gap-2 sm:flex-col">
                  <Button size="sm" onClick={() => decide(r, true)} loading={busy === r.id}><Check /> Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => decide(r, false)} disabled={busy === r.id}><X /> Decline</Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Promoting your cars</h2>
        {requests === null ? (
          <Skeleton className="h-28 w-full" />
        ) : active.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No promoters yet"
            description="Tip: turn on “Allow any verified promoter” on your listing to get promoters faster."
            action={<Button asChild variant="outline"><Link to="/dashboard/listings">My listings</Link></Button>}
          />
        ) : (
          <Card className="divide-y">
            {active.map((p) => {
              const car = carNames.get(p.car_id);
              return (
                <div key={p.promotion_id} className="flex flex-wrap items-center gap-3 p-4">
                  <Avatar name={p.promoter_name} src={p.promoter_avatar} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold">
                      {p.promoter_name ?? 'Promoter'}
                      {p.promoter_verified && <BadgeCheck className="size-4 text-success" />}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {car ? `${car.year} ${car.make} ${car.model}` : 'Your car'} · since {formatDate(p.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="flex items-center gap-1"><MousePointerClick className="size-4 text-primary" /><strong>{p.clicks}</strong> clicks</span>
                    <span className="flex items-center gap-1"><Users className="size-4 text-primary" /><strong>{p.unique_visitors}</strong> visitors</span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => message(p)}><MessageSquare /> Message</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => remove(p)} disabled={busy === p.promotion_id}>
                    <UserMinus /> Remove
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
