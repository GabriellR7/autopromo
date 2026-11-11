import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BadgeCheck, BadgeDollarSign, CalendarDays, Clock, ExternalLink, MessageSquare, MousePointerClick, Search, StopCircle, TrendingUp, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { endPromotion, fetchMyPromotions, fetchMyRequests, fetchPromotionFunnel, type MyPromotion, type MyRequest } from '@/lib/promotions';
import { startConversation } from '@/lib/chat';
import { carPath, commissionAmount, formatDate, formatPrice } from '@/lib/utils';
import { STATUS_LABELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { CarImage } from '@/components/cars/CarImage';
import { ShareButtons } from '@/components/promoter/PromoKit';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import PromoterSetup from './PromoterSetup';

const LEVEL_STYLE = {
  bronze: 'bg-amber-100 text-amber-800',
  silver: 'bg-slate-200 text-slate-700',
  gold: 'bg-yellow-100 text-yellow-800',
} as const;

export default function PromoterDashboard() {
  useDocumentTitle('Promoter dashboard');
  const { profile, user } = useAuth();
  const [promos, setPromos] = useState<MyPromotion[] | null>(null);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [funnel, setFunnel] = useState<Map<string, { conversations: number; visits: number }>>(new Map());
  const navigate = useNavigate();

  async function load() {
    if (!user) return;
    try {
      const [p, r, f] = await Promise.all([fetchMyPromotions(), fetchMyRequests(user.id), fetchPromotionFunnel()]);
      setPromos(p);
      setRequests(r);
      setFunnel(f);
    } catch (e) {
      setError((e as Error).message);
      setPromos([]);
    }
  }

  useEffect(() => {
    if (profile?.promoter_agreement_at) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.promoter_agreement_at, user]);

  if (!profile?.promoter_agreement_at) return <PromoterSetup />;

  const active = promos?.filter((p) => p.active) ?? [];
  const totals = (promos ?? []).reduce(
    (acc, p) => ({ clicks: acc.clicks + p.clicks, visitors: acc.visitors + p.unique_visitors, week: acc.week + p.clicks_7d }),
    { clicks: 0, visitors: 0, week: 0 },
  );
  const pending = requests.filter((r) => r.status === 'pending').length;
  const potential = active
    .filter((p) => p.car_status === 'active')
    .reduce((sum, p) => sum + commissionAmount({ commission_type: p.commission_type, commission_value: p.commission_value, price: p.price }), 0);

  async function messageOwner(p: MyPromotion) {
    try {
      const id = await startConversation(p.car_id);
      navigate(`/dashboard/messages/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function stop(p: MyPromotion) {
    if (!window.confirm(`Stop promoting the ${p.year} ${p.make} ${p.model}? Your link will stop working.`)) return;
    try {
      await endPromotion(p.promotion_id);
      toast.success('Promotion stopped');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Promoter dashboard</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${LEVEL_STYLE[profile.promoter_level]}`}>
              {profile.promoter_level}
            </span>
          </div>
          <p className="text-muted-foreground">Share your links, track your clicks and grow your earnings.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/dashboard/promoter/earnings">Earnings</Link></Button>
          <Button asChild><Link to="/dashboard/promoter/explore"><Search /> Find cars to promote</Link></Button>
        </div>
      </div>

      {!profile.identity_verified && (
        <Alert title="Get the Verified Promoter badge">
          Verified promoters are auto-approved on many listings. Set up payouts in <Link to="/dashboard/promoter/earnings" className="font-semibold underline">Earnings</Link> (Stripe
          verifies your identity) — the AutoPromo team then grants the Verified badge.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={MousePointerClick} label="Total clicks" value={promos ? totals.clicks : null} hint={promos ? `${totals.week} in the last 7 days` : undefined} />
        <Stat icon={Users} label="Unique visitors" value={promos ? totals.visitors : null} />
        <Stat icon={TrendingUp} label="Cars you promote" value={promos ? active.length : null} hint={pending ? `${pending} request${pending > 1 ? 's' : ''} pending` : undefined} />
        <Stat icon={BadgeDollarSign} label="Potential earnings" value={promos ? potential : null} money hint="If all your active cars sell" />
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Your links</h2>
        {promos === null ? (
          <Skeleton className="h-40 w-full" />
        ) : active.length === 0 ? (
          <EmptyState
            icon={BadgeDollarSign}
            title="You're not promoting any cars yet"
            description="Find cars near you, request to promote them and get your personal referral link."
            action={<Button asChild><Link to="/dashboard/promoter/explore">Find cars to promote</Link></Button>}
          />
        ) : (
          active.map((p) => (
            <Card key={p.promotion_id} className="overflow-hidden">
              <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                <CarImage src={p.cover_url} alt="" className="aspect-[4/3] w-full shrink-0 rounded-lg sm:w-40" />
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link to={carPath(p)} className="font-semibold hover:text-primary">
                        {p.year} {p.make} {p.model} {p.trim_level ?? ''}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {formatPrice(p.price)} · {p.city}, {p.state}
                        {p.car_status !== 'active' && <Badge variant="warning" className="ml-2">{STATUS_LABELS[p.car_status]}</Badge>}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">You earn</p>
                      <p className="font-bold text-success">
                        {formatPrice(commissionAmount({ commission_type: p.commission_type, commission_value: p.commission_value, price: p.price }))}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="flex items-center gap-1.5"><MousePointerClick className="size-4 text-primary" /><strong>{p.clicks}</strong> clicks</span>
                    <span className="flex items-center gap-1.5"><Users className="size-4 text-primary" /><strong>{p.unique_visitors}</strong> visitors</span>
                    <span className="flex items-center gap-1.5"><MessageSquare className="size-4 text-primary" /><strong>{funnel.get(p.promotion_id)?.conversations ?? 0}</strong> chats</span>
                    <span className="flex items-center gap-1.5"><CalendarDays className="size-4 text-primary" /><strong>{funnel.get(p.promotion_id)?.visits ?? 0}</strong> visits</span>
                    <span className="text-muted-foreground">{p.clicks_7d} clicks this week</span>
                  </div>
                  <ShareButtons promo={p} />
                  <div className="flex gap-3 text-xs">
                    <Link to={carPath(p)} target="_blank" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <ExternalLink className="size-3.5" /> View listing
                    </Link>
                    <button onClick={() => messageOwner(p)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                      <MessageSquare className="size-3.5" /> Message owner
                    </button>
                    <button onClick={() => stop(p)} className="flex items-center gap-1 text-muted-foreground hover:text-destructive">
                      <StopCircle className="size-3.5" /> Stop promoting
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </section>

      {requests.some((r) => r.status === 'pending' || r.status === 'rejected') && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Requests</h2>
          <RequestsList requests={requests.filter((r) => r.status === 'pending' || r.status === 'rejected')} />
        </section>
      )}
    </div>
  );
}

function RequestsList({ requests }: { requests: MyRequest[] }) {
  return (
    <Card className="divide-y">
      {requests.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 p-4 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {r.status === 'pending' ? <Clock className="size-4 shrink-0 text-amber-600" /> : <BadgeCheck className="size-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 truncate">
              {r.car ? (
                <Link to={carPath(r.car)} className="font-medium hover:text-primary">{r.car.year} {r.car.make} {r.car.model}</Link>
              ) : 'Listing no longer available'}
              <span className="text-muted-foreground"> · sent {formatDate(r.created_at)}</span>
            </span>
          </span>
          <Badge variant={r.status === 'pending' ? 'warning' : 'secondary'}>
            {r.status === 'pending' ? 'Waiting for owner' : 'Declined'}
          </Badge>
        </div>
      ))}
    </Card>
  );
}

function Stat({ icon: Icon, label, value, hint, money = false }: {
  icon: typeof Users;
  label: string;
  value: number | null;
  hint?: string;
  money?: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" />{label}</div>
      {value === null ? <Skeleton className="mt-2 h-8 w-16" /> : (
        <p className="mt-1 text-2xl font-bold">{money ? formatPrice(value) : value.toLocaleString('en-US')}</p>
      )}
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}
