import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, SearchX, SlidersHorizontal, X } from 'lucide-react';
import {
  PAGE_SIZE, SORT_OPTIONS, filtersFromParams, paramsFromFilters, searchCars, type CarFilters, type SortOption,
} from '@/lib/cars';
import { BODY_TYPES, FUEL_TYPES, POPULAR_MAKES, RADIUS_OPTIONS, TRANSMISSIONS } from '@/lib/constants';
import { lookupZip, type ZipLocation } from '@/lib/zip';
import type { CarWithPhotos } from '@/lib/types';
import { distanceMiles, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/misc';
import { CarCard, CarCardSkeleton } from '@/components/cars/CarCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 40 }, (_, i) => currentYear + 1 - i);
const MILEAGE_OPTIONS = [25000, 50000, 75000, 100000, 150000];

export default function Cars() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const seoTitle = `Used ${[filters.make, filters.model].filter(Boolean).join(' ') || ''} cars for sale${filters.zip ? ` near ${filters.zip}` : ' in Texas'}`.replace(/\s+/g, ' ');
  useDocumentTitle(
    seoTitle,
    `Browse ${filters.make ? `${filters.make} ` : ''}used cars sold directly by private owners${filters.zip ? ` near ${filters.zip}` : ''}. Filter by price, year, mileage and distance. No dealer markup.`,
  );

  const [cars, setCars] = useState<CarWithPhotos[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<ZipLocation | null>(null);
  const [zipFailed, setZipFailed] = useState<string | null>(null); // ZIP that failed lookup
  const [panelOpen, setPanelOpen] = useState(false);

  // Resolve ZIP → coordinates whenever it changes.
  useEffect(() => {
    let cancelled = false;
    if (!filters.zip) {
      setOrigin(null);
      return;
    }
    lookupZip(filters.zip).then((loc) => {
      if (cancelled) return;
      setOrigin(loc);
      if (!loc) setZipFailed(filters.zip!);
    });
    return () => {
      cancelled = true;
    };
  }, [filters.zip]);

  // Only trust the resolved location if it matches the ZIP currently in the URL.
  const activeOrigin = filters.zip && origin?.zip === filters.zip ? origin : null;
  const zipError = filters.zip && zipFailed === filters.zip ? `We couldn't find ZIP ${filters.zip}. Showing results without distance.` : null;
  const zipPending = Boolean(filters.zip) && !activeOrigin && !zipError;

  useEffect(() => {
    let cancelled = false;
    if (zipPending) return; // wait for the ZIP lookup before searching by distance
    setCars(null);
    setError(null);
    searchCars(filters, activeOrigin ? { lat: activeOrigin.lat, lng: activeOrigin.lng } : null)
      .then(({ cars, total }) => {
        if (cancelled) return;
        setCars(cars);
        setTotal(total);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
        setCars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, activeOrigin, zipPending]);

  function update(patch: Partial<CarFilters>, resetPage = true) {
    const next = { ...filters, ...patch, ...(resetPage ? { page: 1 } : {}) };
    setParams(paramsFromFilters(next));
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = filters.page ?? 1;
  const activeCount = [filters.make, filters.model, filters.yearMin, filters.yearMax, filters.priceMin, filters.priceMax,
    filters.mileageMax, filters.transmission, filters.fuel, filters.body, filters.zip].filter(Boolean).length;

  return (
    <div className="container py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Used cars for sale</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {cars === null ? 'Searching…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'car' : 'cars'} found`}
            {activeOrigin && filters.radius ? ` within ${filters.radius} mi of ${activeOrigin.city}, ${activeOrigin.state}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setPanelOpen(true)}>
            <SlidersHorizontal /> Filters{activeCount ? ` (${activeCount})` : ''}
          </Button>
          <Select
            value={filters.sort ?? 'newest'}
            onChange={(e) => update({ sort: e.target.value as SortOption })}
            className="w-48"
            aria-label="Sort by"
          >
            {SORT_OPTIONS.filter((o) => o.value !== 'distance' || filters.zip).map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        {/* Filters */}
        {panelOpen && <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setPanelOpen(false)} />}
        <aside
          className={cn(
            'fixed inset-y-0 right-0 z-50 w-[320px] max-w-[88vw] overflow-y-auto bg-background p-5 shadow-xl transition-transform lg:static lg:z-auto lg:w-auto lg:max-w-none lg:translate-x-0 lg:overflow-visible lg:p-0 lg:shadow-none',
            panelOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          <div className="mb-4 flex items-center justify-between lg:hidden">
            <h2 className="text-lg font-semibold">Filters</h2>
            <button onClick={() => setPanelOpen(false)} aria-label="Close filters" className="rounded-md p-1.5 hover:bg-secondary">
              <X className="size-5" />
            </button>
          </div>
          <FiltersForm
            key={params.toString()}
            filters={filters}
            onApply={(f) => {
              update(f);
              setPanelOpen(false);
            }}
            onClear={() => {
              setParams(new URLSearchParams());
              setPanelOpen(false);
            }}
          />
        </aside>

        {/* Results */}
        <section>
          {zipError && <Alert className="mb-4">{zipError}</Alert>}
          {error && <Alert variant="error" className="mb-4" title="Could not load cars">{error}</Alert>}
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {cars === null
              ? Array.from({ length: 6 }).map((_, i) => <CarCardSkeleton key={i} />)
              : cars.map((car) => (
                  <CarCard
                    key={car.id}
                    car={car}
                    distance={activeOrigin && car.lat != null && car.lng != null ? distanceMiles(activeOrigin.lat, activeOrigin.lng, car.lat, car.lng) : null}
                  />
                ))}
          </div>

          {cars?.length === 0 && !error && (
            <EmptyState
              icon={SearchX}
              title="No cars match your search"
              description="Try removing some filters or increasing the distance."
              action={<Button variant="outline" onClick={() => setParams(new URLSearchParams())}>Clear all filters</Button>}
            />
          )}

          {totalPages > 1 && cars && cars.length > 0 && (
            <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => update({ page: page - 1 }, false)} aria-label="Previous page">
                <ChevronLeft />
              </Button>
              <span className="px-3 text-sm text-muted-foreground">
                Page <strong className="text-foreground">{page}</strong> of {totalPages}
              </span>
              <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => update({ page: page + 1 }, false)} aria-label="Next page">
                <ChevronRight />
              </Button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

function FiltersForm({
  filters,
  onApply,
  onClear,
}: {
  filters: CarFilters;
  onApply: (f: Partial<CarFilters>) => void;
  onClear: () => void;
}) {
  const [f, setF] = useState(() => ({
    make: filters.make ?? '',
    model: filters.model ?? '',
    yearMin: filters.yearMin?.toString() ?? '',
    yearMax: filters.yearMax?.toString() ?? '',
    priceMin: filters.priceMin?.toString() ?? '',
    priceMax: filters.priceMax?.toString() ?? '',
    mileageMax: filters.mileageMax?.toString() ?? '',
    transmission: filters.transmission ?? '',
    fuel: filters.fuel ?? '',
    body: filters.body ?? '',
    zip: filters.zip ?? '',
    radius: (filters.radius ?? 50).toString(),
  }));
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = (v: string) => (v ? Number(v) : undefined);

  function submit(e: FormEvent) {
    e.preventDefault();
    const validZip = /^\d{5}$/.test(f.zip);
    onApply({
      make: f.make || undefined,
      model: f.model.trim() || undefined,
      yearMin: n(f.yearMin),
      yearMax: n(f.yearMax),
      priceMin: n(f.priceMin),
      priceMax: n(f.priceMax),
      mileageMax: n(f.mileageMax),
      transmission: (f.transmission || undefined) as CarFilters['transmission'],
      fuel: (f.fuel || undefined) as CarFilters['fuel'],
      body: (f.body || undefined) as CarFilters['body'],
      zip: validZip ? f.zip : undefined,
      radius: validZip ? Number(f.radius) : undefined,
      sort: validZip && !filters.zip ? 'distance' : filters.sort === 'distance' && !validZip ? 'newest' : filters.sort,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4 lg:sticky lg:top-24 lg:rounded-xl lg:border lg:bg-card lg:p-5">
      <div className="grid grid-cols-[1fr_96px] gap-2">
        <Field label="ZIP code" htmlFor="f-zip">
          <Input id="f-zip" inputMode="numeric" maxLength={5} placeholder="78701" value={f.zip}
            onChange={(e) => setF((s) => ({ ...s, zip: e.target.value.replace(/\D/g, '') }))} />
        </Field>
        <Field label="Distance" htmlFor="f-radius">
          <Select id="f-radius" value={f.radius} onChange={set('radius')}>
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} mi</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Make" htmlFor="f-make">
        <Select id="f-make" value={f.make} onChange={set('make')}>
          <option value="">Any make</option>
          {POPULAR_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </Field>
      <Field label="Model" htmlFor="f-model">
        <Input id="f-model" placeholder="Any model" value={f.model} onChange={set('model')} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Year from" htmlFor="f-ymin">
          <Select id="f-ymin" value={f.yearMin} onChange={set('yearMin')}>
            <option value="">Any</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
        <Field label="Year to" htmlFor="f-ymax">
          <Select id="f-ymax" value={f.yearMax} onChange={set('yearMax')}>
            <option value="">Any</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Min price" htmlFor="f-pmin">
          <Input id="f-pmin" inputMode="numeric" placeholder="$ Min" value={f.priceMin}
            onChange={(e) => setF((s) => ({ ...s, priceMin: e.target.value.replace(/\D/g, '') }))} />
        </Field>
        <Field label="Max price" htmlFor="f-pmax">
          <Input id="f-pmax" inputMode="numeric" placeholder="$ Max" value={f.priceMax}
            onChange={(e) => setF((s) => ({ ...s, priceMax: e.target.value.replace(/\D/g, '') }))} />
        </Field>
      </div>
      <Field label="Max mileage" htmlFor="f-miles">
        <Select id="f-miles" value={f.mileageMax} onChange={set('mileageMax')}>
          <option value="">Any mileage</option>
          {MILEAGE_OPTIONS.map((m) => <option key={m} value={m}>Under {m.toLocaleString('en-US')} mi</option>)}
        </Select>
      </Field>
      <Field label="Body type" htmlFor="f-body">
        <Select id="f-body" value={f.body} onChange={set('body')}>
          <option value="">Any body type</option>
          {BODY_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Transmission" htmlFor="f-trans">
        <Select id="f-trans" value={f.transmission} onChange={set('transmission')}>
          <option value="">Any</option>
          {TRANSMISSIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Fuel type" htmlFor="f-fuel">
        <Select id="f-fuel" value={f.fuel} onChange={set('fuel')}>
          <option value="">Any</option>
          {FUEL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <div className="flex gap-2 pt-1">
        <Button type="submit" className="flex-1">Apply filters</Button>
        <Button type="button" variant="ghost" onClick={onClear}>Clear</Button>
      </div>
    </form>
  );
}
