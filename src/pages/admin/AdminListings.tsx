import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BadgeCheck, Check, ExternalLink, Search, Trash2, X } from 'lucide-react';
import { adminCars, adminModerateCar, type AdminCar } from '@/lib/admin';
import { STATUS_LABELS } from '@/lib/constants';
import type { CarStatus } from '@/lib/types';
import { carPath, cn, formatDate, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, Badge, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { CarImage } from '@/components/cars/CarImage';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const FILTERS: (CarStatus | 'all')[] = ['pending_review', 'active', 'paused', 'draft', 'sold', 'all'];

export default function AdminListings() {
  useDocumentTitle('Admin · Listings');
  const [status, setStatus] = useState<CarStatus | 'all'>('pending_review');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [cars, setCars] = useState<AdminCar[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ car: AdminCar; action: 'reject' | 'remove' } | null>(null);

  async function load() {
    setCars(null);
    try {
      setCars(await adminCars(status, query));
    } catch (e) {
      setError((e as Error).message);
      setCars([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, query]);

  async function approve(car: AdminCar) {
    try {
      await adminModerateCar(car.id, 'approve');
      toast.success('Listing approved and live');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Listings</h1>
        <p className="text-muted-foreground">Approve new listings and remove anything that breaks the rules.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setStatus(f)}
              className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium', status === f ? 'border-navy bg-navy text-white' : 'hover:bg-secondary')}>
              {f === 'all' ? 'All' : STATUS_LABELS[f]}
            </button>
          ))}
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery(search); }} className="ml-auto flex gap-2">
          <Input placeholder="Make, model or city" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </form>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {cars === null ? (
        <Skeleton className="h-40 w-full" />
      ) : cars.length === 0 ? (
        <EmptyState icon={Check} title={status === 'pending_review' ? 'Nothing to review' : 'No listings'} description={status === 'pending_review' ? 'Turn on "Require approval" in Settings to review listings before they go live.' : undefined} />
      ) : (
        <Card className="divide-y">
          {cars.map((car) => {
            const cover = [...car.car_photos].sort((a, b) => a.position - b.position)[0]?.url;
            return (
              <div key={car.id} className="flex flex-wrap items-center gap-4 p-4">
                <CarImage src={cover} alt="" className="h-16 w-24 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={carPath(car)} target="_blank" className="font-semibold hover:text-primary">{car.year} {car.make} {car.model}</Link>
                    <Badge variant={car.status === 'pending_review' ? 'warning' : car.status === 'active' ? 'success' : 'secondary'}>{STATUS_LABELS[car.status]}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatPrice(car.price)} · {car.city ?? '—'}, {car.state ?? ''} · {car.car_photos.length} photos · created {formatDate(car.created_at)}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    Owner: {car.owner?.full_name ?? '—'} {car.owner?.identity_verified && <BadgeCheck className="size-3.5 text-success" />}
                  </p>
                  {car.moderation_note && <p className="mt-1 text-xs text-amber-800">Note: {car.moderation_note}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {car.status === 'pending_review' && (
                    <>
                      <Button size="sm" onClick={() => approve(car)}><Check /> Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => setNoteFor({ car, action: 'reject' })}><X /> Reject</Button>
                    </>
                  )}
                  {['active', 'pending_sale', 'pending_review'].includes(car.status) && (
                    <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => setNoteFor({ car, action: 'remove' })}>
                      <Trash2 /> Remove
                    </Button>
                  )}
                  <Button asChild size="icon" variant="ghost" aria-label="Open listing"><Link to={carPath(car)} target="_blank"><ExternalLink /></Link></Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <NoteDialog
        target={noteFor}
        onClose={() => setNoteFor(null)}
        onDone={() => {
          setNoteFor(null);
          load();
        }}
      />
    </div>
  );
}

function NoteDialog({ target, onClose, onDone }: { target: { car: AdminCar; action: 'reject' | 'remove' } | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!target) return;
    setSaving(true);
    try {
      await adminModerateCar(target.car.id, target.action, note);
      toast.success(target.action === 'reject' ? 'Listing sent back to the owner' : 'Listing removed');
      setNote('');
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={Boolean(target)} onClose={onClose} title={target?.action === 'reject' ? 'Reject listing' : 'Remove listing'}
      description="The owner sees this message on their listing.">
      <div className="space-y-4">
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))}
          placeholder={target?.action === 'reject' ? 'e.g. Please add real photos of the car and the mileage.' : 'e.g. Listing removed: seller could not prove ownership.'} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={target?.action === 'remove' ? 'destructive' : 'default'} onClick={submit} loading={saving}>Confirm</Button>
        </div>
      </div>
    </Dialog>
  );
}
