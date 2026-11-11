import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Check, Clock, MapPin, Search, SearchX, Send, XCircle, Zap } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { coverUrl, searchCars, PAGE_SIZE } from '@/lib/cars';
import { fetchMyRequests, requestPromotion, type MyRequest } from '@/lib/promotions';
import { lookupZip, type ZipLocation } from '@/lib/zip';
import { RADIUS_OPTIONS } from '@/lib/constants';
import type { CarWithPhotos } from '@/lib/types';
import { carPath, carTitle, commissionAmount, distanceMiles, formatMiles, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { CarImage } from '@/components/cars/CarImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import PromoterSetup from './PromoterSetup';

type SortKey = 'fee' | 'newest' | 'distance';

export default function PromoterExplore() {
  useDocumentTitle('Find cars to promote');
  const { user, profile } = useAuth();
  const [cars, setCars] = useState<CarWithPhotos[] | null>(null);
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [zip, setZip] = useState('');
  const [radius, setRadius] = useState('50');
  const [origin, setOrigin] = useState<ZipLocation | null>(null);
  const [minFee, setMinFee] = useState('');
  const [sort, setSort] = useState<SortKey>('fee');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<CarWithPhotos | null>(null);

  async function load(o: ZipLocation | null, p: number) {
    setCars(null);
    setError(null);
    try {
      const res = await searchCars(
        { radius: o ? Number(radius) : undefined, sort: o && sort === 'distance' ? 'distance' : 'newest', page: p },
        o ? { lat: o.lat, lng: o.lng } : null,
      );
      setCars(res.cars);
      setTotal(res.total);
    } catch (e) {
      setError((e as Error).message);
      setCars([]);
    }
  }

  useEffect(() => {
    if (!profile?.promoter_agreement_at || !user) return;
    load(null, 1);
    fetchMyRequests(user.id).then(setRequests).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.promoter_agreement_at, user]);

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    let o: ZipLocation | null = null;
    if (zip) {
      o = await lookupZip(zip);
      if (!o) return toast.error("We couldn't find that ZIP code.");
    }
    setOrigin(o);
    setPage(1);
    load(o, 1);
  }

  const statusByCar = useMemo(() => new Map(requests.map((r) => [r.car_id, r.status])), [requests]);

  const visible = useMemo(() => {
    const list = (cars ?? [])
      .filter((c) => c.owner_id !== user?.id)
      .map((c) => ({
        car: c,
        fee: commissionAmount(c),
        distance: origin && c.lat != null && c.lng != null ? distanceMiles(origin.lat, origin.lng, c.lat, c.lng) : null,
      }))
      .filter((x) => !minFee || x.fee >= Number(minFee));
    if (sort === 'fee') list.sort((a, b) => b.fee - a.fee);
    return list;
  }, [cars, user?.id, origin, minFee, sort]);

  if (!profile?.promoter_agreement_at) return <PromoterSetup />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <Link to="/dashboard/promoter" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Promoter dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Find cars to promote</h1>
        <p className="text-muted-foreground">Pick cars near you or your audience. You earn the fee shown when a buyer you refer purchases the car.</p>
      </div>

      <Card className="p-4">
        <form onSubmit={onSearch} className="grid gap-3 sm:grid-cols-[120px_110px_140px_170px_auto]">
          <Input placeholder="ZIP code" inputMode="numeric" maxLength={5} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))} aria-label="ZIP code" />
          <Select value={radius} onChange={(e) => setRadius(e.target.value)} aria-label="Radius">
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} mi</option>)}
          </Select>
          <Select value={minFee} onChange={(e) => setMinFee(e.target.value)} aria-label="Minimum fee">
            <option value="">Any fee</option>
            {[200, 300, 400, 500, 750].map((v) => <option key={v} value={v}>${v}+ fee</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
            <option value="fee">Highest fee</option>
            <option value="newest">Newest</option>
            {origin && <option value="distance">Closest</option>}
          </Select>
          <Button type="submit"><Search /> Search</Button>
        </form>
        {origin && <p className="mt-2 text-xs text-muted-foreground">Within {radius} mi of {origin.city}, {origin.state}</p>}
      </Card>

      {error && <Alert variant="error">{error}</Alert>}

      {cars === null ? (
        <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}</div>
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="No cars found" description="Try another ZIP code, a bigger radius or a lower minimum fee." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visible.map(({ car, fee, distance }) => {
            const status = statusByCar.get(car.id);
            return (
              <Card key={car.id} className="flex gap-4 p-4">
                <Link to={carPath(car)} target="_blank" className="shrink-0">
                  <CarImage src={coverUrl(car)} alt={carTitle(car)} className="h-28 w-36 rounded-lg" />
                </Link>
                <div className="flex min-w-0 flex-1 flex-col">
                  <Link to={carPath(car)} target="_blank" className="truncate font-semibold hover:text-primary">{carTitle(car)}</Link>
                  <p className="text-sm text-muted-foreground">{formatPrice(car.price)} · {formatMiles(car.mileage)}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5" />{car.city}, {car.state}{distance != null ? ` · ${Math.round(distance)} mi` : ''}
                  </p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">You earn</p>
                      <p className="text-lg font-bold text-success">{formatPrice(fee)}</p>
                    </div>
                    <RequestButton status={status} autoApprove={car.allow_any_verified_promoter && profile.identity_verified} onClick={() => setTarget(car)} />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(page - 1); load(origin, page - 1); }}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(page + 1); load(origin, page + 1); }}>Next</Button>
        </div>
      )}

      <RequestDialog
        car={target}
        autoApprove={Boolean(target?.allow_any_verified_promoter && profile.identity_verified)}
        onClose={() => setTarget(null)}
        onDone={() => user && fetchMyRequests(user.id).then(setRequests)}
      />
    </div>
  );
}

function RequestButton({ status, autoApprove, onClick }: { status?: string; autoApprove: boolean; onClick: () => void }) {
  if (status === 'approved') return <Button asChild size="sm" variant="secondary"><Link to="/dashboard/promoter"><Check /> Promoting</Link></Button>;
  if (status === 'pending') return <Badge variant="warning"><Clock />Pending approval</Badge>;
  if (status === 'rejected') return <Badge variant="secondary"><XCircle />Declined</Badge>;
  return (
    <Button size="sm" onClick={onClick}>
      {autoApprove ? <Zap /> : <Send />} {autoApprove ? 'Start promoting' : 'Request to promote'}
    </Button>
  );
}

function RequestDialog({ car, autoApprove, onClose, onDone }: {
  car: CarWithPhotos | null;
  autoApprove: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!car) return;
    setSending(true);
    try {
      const req = await requestPromotion(car.id, message);
      toast.success(req.status === 'approved' ? 'Approved! Your link is ready in the dashboard.' : 'Request sent to the owner.');
      setMessage('');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={Boolean(car)}
      onClose={onClose}
      title={autoApprove ? 'Start promoting this car' : 'Request to promote'}
      description={car ? `${carTitle(car)} · you earn ${formatPrice(commissionAmount(car))} if your buyer purchases it` : undefined}
    >
      <div className="space-y-4">
        {autoApprove ? (
          <Alert variant="success">This owner auto-approves verified promoters. You'll get your link right away.</Alert>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">Tell the owner how you'll find buyers (optional, but it helps get approved).</p>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, 500))}
              rows={4}
              placeholder="e.g. I run a 25k-member car group in Austin and have 2 people looking for this model."
            />
            <p className="text-right text-xs text-muted-foreground">{message.length}/500</p>
          </>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={send} loading={sending}>{autoApprove ? 'Get my link' : 'Send request'}</Button>
        </div>
      </div>
    </Dialog>
  );
}
