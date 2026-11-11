import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Car, ExternalLink, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { deleteListing, fetchMyListings, friendlyDbError, setListingStatus } from '@/lib/listings';
import { coverUrl } from '@/lib/cars';
import { STATUS_LABELS } from '@/lib/constants';
import type { CarStatus, CarWithPhotos } from '@/lib/types';
import { carPath, carTitle, cn, formatMiles, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { SaleDialog } from '@/components/cars/SaleDialog';
import { Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { CarImage } from '@/components/cars/CarImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const STATUS_VARIANT: Record<CarStatus, 'secondary' | 'success' | 'warning' | 'dark' | 'outline'> = {
  draft: 'secondary',
  active: 'success',
  pending_sale: 'warning',
  sold: 'dark',
  paused: 'outline',
};

export default function MyListings() {
  useDocumentTitle('My listings');
  const { user } = useAuth();
  const [cars, setCars] = useState<CarWithPhotos[] | null>(null);
  const [filter, setFilter] = useState<CarStatus | 'all'>('all');

  async function load() {
    if (!user) return;
    try {
      setCars(await fetchMyListings(user.id));
    } catch (e) {
      toast.error((e as Error).message);
      setCars([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const visible = cars?.filter((c) => filter === 'all' || c.status === filter) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">My listings</h1>
          <p className="text-muted-foreground">Manage your cars, change their status or edit details.</p>
        </div>
        <Button asChild><Link to="/dashboard/listings/new"><Plus /> New listing</Link></Button>
      </div>

      {cars && cars.length > 0 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {(['all', 'active', 'draft', 'pending_sale', 'paused', 'sold'] as const).map((s) => {
            const count = s === 'all' ? cars.length : cars.filter((c) => c.status === s).length;
            return (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={cn(
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  filter === s ? 'border-navy bg-navy text-white' : 'hover:bg-secondary',
                )}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s]} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {cars === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : cars.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No listings yet"
          description="Create your first listing — it's free and takes about 5 minutes."
          action={<Button asChild><Link to="/dashboard/listings/new">List a car</Link></Button>}
        />
      ) : (
        <Card className="divide-y">
          {visible.map((car) => <ListingRow key={car.id} car={car} onChanged={load} />)}
          {visible.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No listings with this status.</p>}
        </Card>
      )}
    </div>
  );
}

export function ListingRow({ car, compact = false, onChanged }: { car: CarWithPhotos; compact?: boolean; onChanged?: () => void }) {
  const [busy, setBusy] = useState(false);
  const [soldOpen, setSoldOpen] = useState(false);
  const title = carTitle(car);

  async function changeStatus(status: CarStatus) {
    setBusy(true);
    try {
      await setListingStatus(car.id, status);
      toast.success(status === 'active' ? 'Listing is live!' : `Status changed to ${STATUS_LABELS[status]}`);
      setSoldOpen(false);
      onChanged?.();
    } catch (e) {
      toast.error(friendlyDbError((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deleteListing(car);
      toast.success('Listing deleted');
      onChanged?.();
    } catch (e) {
      toast.error(friendlyDbError((e as Error).message));
      setBusy(false);
    }
  }

  return (
    <div className={cn('p-4', busy && 'pointer-events-none opacity-60')}>
      <div className="flex flex-wrap items-center gap-4">
        <CarImage src={coverUrl(car)} alt={title} className="h-16 w-24 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-semibold">{title}</p>
            <Badge variant={STATUS_VARIANT[car.status]}>{STATUS_LABELS[car.status]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {car.price ? formatPrice(car.price) : 'No price yet'} · {formatMiles(car.mileage)}
            {car.city ? ` · ${car.city}, ${car.state}` : ''}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="size-3.5" /> {car.views.toLocaleString('en-US')} views · {car.car_photos.length} photos
          </p>
        </div>
        {!compact && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {car.status === 'sold' ? (
              <span className="flex-1 text-sm text-muted-foreground sm:flex-none">Sold{car.sold_price ? ` for ${formatPrice(car.sold_price)}` : ''}</span>
            ) : car.status === 'draft' ? (
              <Button size="sm" onClick={() => changeStatus('active')} className="flex-1 sm:flex-none">Publish</Button>
            ) : (
              <Select
                value={car.status}
                onChange={(e) => {
                  const next = e.target.value as CarStatus;
                  if (next === 'sold') setSoldOpen(true);
                  else changeStatus(next);
                }}
                className="h-9 flex-1 sm:w-40 sm:flex-none"
                aria-label="Listing status"
              >
                <option value="active">Active</option>
                <option value="pending_sale">Pending sale</option>
                <option value="paused">Paused</option>
                <option value="sold">Mark as sold…</option>
              </Select>
            )}
            <Button asChild size="icon" variant="ghost" aria-label="Edit listing">
              <Link to={`/dashboard/listings/${car.id}/edit`}><Pencil /></Link>
            </Button>
            <Button asChild size="icon" variant="ghost" aria-label="View listing">
              <Link to={carPath(car)} target="_blank"><ExternalLink /></Link>
            </Button>
            <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete listing" className="text-destructive hover:bg-destructive/10">
              <Trash2 />
            </Button>
          </div>
        )}
        {compact && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/dashboard/listings/${car.id}/edit`}>Edit</Link>
          </Button>
        )}
      </div>

      <SaleDialog car={car} open={soldOpen} onClose={() => setSoldOpen(false)} onDone={() => onChanged?.()} />
    </div>
  );
}
