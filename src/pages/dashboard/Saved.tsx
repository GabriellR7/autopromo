import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Bell, BellOff, Heart, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { paramsFromFilters } from '@/lib/cars';
import {
  deleteSavedSearch, fetchSavedCars, fetchSavedSearches, setSearchAlerts, toggleSavedCar,
  type SavedCar, type SavedSearch,
} from '@/lib/saved';
import { cn, formatDate, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Card, EmptyState, Skeleton } from '@/components/ui/misc';
import { CarCard, CarCardSkeleton } from '@/components/cars/CarCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Saved() {
  useDocumentTitle('Saved');
  const { user } = useAuth();
  const [tab, setTab] = useState<'cars' | 'searches'>('cars');
  const [cars, setCars] = useState<SavedCar[] | null>(null);
  const [searches, setSearches] = useState<SavedSearch[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchSavedCars(user.id).then(setCars).catch((e: Error) => { setError(e.message); setCars([]); });
    fetchSavedSearches(user.id).then(setSearches).catch((e: Error) => { setError(e.message); setSearches([]); });
  }, [user]);

  async function unsave(carId: string) {
    if (!user) return;
    try {
      await toggleSavedCar(user.id, carId, false);
      setCars((list) => list?.filter((c) => c.car_id !== carId) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function toggleAlerts(s: SavedSearch) {
    try {
      await setSearchAlerts(s.id, !s.email_alerts);
      setSearches((list) => list?.map((x) => (x.id === s.id ? { ...x, email_alerts: !s.email_alerts } : x)) ?? null);
      toast.success(s.email_alerts ? 'Email alerts turned off' : "Email alerts on — we'll send new matches once a day");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function remove(s: SavedSearch) {
    try {
      await deleteSavedSearch(s.id);
      setSearches((list) => list?.filter((x) => x.id !== s.id) ?? null);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const visibleCars = cars?.filter((s) => s.car) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Saved</h1>
        <p className="text-muted-foreground">Cars you liked and searches we watch for you.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="flex gap-2">
        {([
          ['cars', `Saved cars${cars ? ` (${visibleCars.length})` : ''}`],
          ['searches', `Saved searches${searches ? ` (${searches.length})` : ''}`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn('rounded-full border px-4 py-1.5 text-sm font-medium', tab === key ? 'border-navy bg-navy text-white' : 'hover:bg-secondary')}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'cars' ? (
        cars === null ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CarCardSkeleton key={i} />)}</div>
        ) : visibleCars.length === 0 ? (
          <EmptyState
            icon={Heart}
            title="No saved cars yet"
            description="Tap the heart on any car to save it. We'll email you if the price drops."
            action={<Button asChild><Link to="/cars">Browse cars</Link></Button>}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleCars.map((s) => {
              const car = s.car!;
              const dropped = s.price_at_save != null && car.price < s.price_at_save;
              return (
                <div key={s.car_id} className="space-y-2">
                  <CarCard car={car} />
                  <div className="flex items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
                    <span>
                      Saved {formatDate(s.created_at)}
                      {dropped && <span className="ml-1 font-semibold text-success">· {formatPrice(s.price_at_save! - car.price)} cheaper since you saved</span>}
                      {car.status === 'sold' && <span className="ml-1 font-semibold">· Sold</span>}
                    </span>
                    <button onClick={() => unsave(s.car_id)} className="font-medium hover:text-destructive">Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : searches === null ? (
        <Skeleton className="h-40 w-full" />
      ) : searches.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No saved searches"
          description='Search for the car you want and tap "Save search". We will email you when a matching car is listed.'
          action={<Button asChild><Link to="/cars">Start a search</Link></Button>}
        />
      ) : (
        <Card className="divide-y">
          {searches.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link to={`/cars?${paramsFromFilters(s.filters).toString()}`} className="font-semibold hover:text-primary">{s.name}</Link>
                <p className="text-xs text-muted-foreground">
                  {s.email_alerts ? 'Email alerts on — new matches once a day' : 'Email alerts off'} · saved {formatDate(s.created_at)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggleAlerts(s)}>
                {s.email_alerts ? <><BellOff /> Turn off</> : <><Bell /> Turn on</>}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(s)} aria-label="Delete search" className="text-destructive hover:bg-destructive/10">
                <Trash2 />
              </Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
