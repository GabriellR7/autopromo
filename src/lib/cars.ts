import { supabase } from './supabase';
import type { BodyType, CarDetail, CarWithPhotos, FuelType, Transmission } from './types';

export const CAR_LIST_SELECT = '*, car_photos(id, url, position)';

export interface CarFilters {
  q?: string;
  make?: string;
  model?: string;
  yearMin?: number;
  yearMax?: number;
  priceMin?: number;
  priceMax?: number;
  mileageMax?: number;
  transmission?: Transmission;
  fuel?: FuelType;
  body?: BodyType;
  zip?: string;
  radius?: number;
  sort?: SortOption;
  page?: number;
}

export type SortOption = 'newest' | 'price_asc' | 'price_desc' | 'mileage_asc' | 'year_desc' | 'distance';

export const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest listings' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'mileage_asc', label: 'Lowest mileage' },
  { value: 'year_desc', label: 'Newest year' },
  { value: 'distance', label: 'Closest first' },
];

export const PAGE_SIZE = 12;

/** Sorts a car's photos by position and returns the cover URL (or null). */
export function coverUrl(car: Pick<CarWithPhotos, 'car_photos'>) {
  const sorted = [...(car.car_photos ?? [])].sort((a, b) => a.position - b.position);
  return sorted[0]?.url ?? null;
}

export function sortedPhotos<T extends { position: number }>(photos: T[] | null | undefined) {
  return [...(photos ?? [])].sort((a, b) => a.position - b.position);
}

/** Escapes characters that have meaning inside PostgREST `or()` / ilike filters. */
function escapeLike(value: string) {
  return value.replace(/[%_,()\\]/g, ' ').trim();
}

export async function searchCars(
  filters: CarFilters,
  origin: { lat: number; lng: number } | null,
): Promise<{ cars: CarWithPhotos[]; total: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const useGeo = Boolean(origin && filters.radius);

  let query = supabase
    .rpc(
      'search_cars',
      {
        origin_lat: origin?.lat ?? null,
        origin_lng: origin?.lng ?? null,
        radius_miles: useGeo ? filters.radius! : null,
        sort_by_distance: filters.sort === 'distance' && Boolean(origin),
      },
      { count: 'exact' },
    )
    .select(CAR_LIST_SELECT);

  if (filters.make) query = query.ilike('make', escapeLike(filters.make));
  if (filters.model) query = query.ilike('model', `%${escapeLike(filters.model)}%`);
  if (filters.yearMin) query = query.gte('year', filters.yearMin);
  if (filters.yearMax) query = query.lte('year', filters.yearMax);
  if (filters.priceMin) query = query.gte('price', filters.priceMin);
  if (filters.priceMax) query = query.lte('price', filters.priceMax);
  if (filters.mileageMax) query = query.lte('mileage', filters.mileageMax);
  if (filters.transmission) query = query.eq('transmission', filters.transmission);
  if (filters.fuel) query = query.eq('fuel_type', filters.fuel);
  if (filters.body) query = query.eq('body_type', filters.body);
  if (filters.q) {
    const terms = escapeLike(filters.q).split(/\s+/).filter(Boolean).slice(0, 4);
    for (const term of terms) {
      if (/^\d{4}$/.test(term)) {
        query = query.eq('year', Number(term));
      } else {
        query = query.or(`make.ilike.%${term}%,model.ilike.%${term}%,trim_level.ilike.%${term}%`);
      }
    }
  }

  switch (filters.sort) {
    case 'price_asc':
      query = query.order('price', { ascending: true });
      break;
    case 'price_desc':
      query = query.order('price', { ascending: false });
      break;
    case 'mileage_asc':
      query = query.order('mileage', { ascending: true });
      break;
    case 'year_desc':
      query = query.order('year', { ascending: false });
      break;
    case 'distance':
      if (!origin) query = query.order('published_at', { ascending: false });
      // otherwise keep the function's distance ordering
      break;
    default:
      query = query.order('published_at', { ascending: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);
  if (error) throw error;
  return { cars: (data ?? []) as unknown as CarWithPhotos[], total: count ?? 0 };
}

export async function fetchFeaturedCars(limit = 8): Promise<CarWithPhotos[]> {
  const { data, error } = await supabase
    .from('cars')
    .select(CAR_LIST_SELECT)
    .eq('status', 'active')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CarWithPhotos[];
}

export async function fetchCarByPublicId(publicId: number): Promise<CarDetail | null> {
  const { data, error } = await supabase
    .from('cars')
    .select(`${CAR_LIST_SELECT}, owner:profiles!cars_owner_id_fkey(id, full_name, avatar_url, identity_verified, created_at)`)
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as CarDetail) ?? null;
}

export async function fetchSimilarCars(car: CarDetail, limit = 4): Promise<CarWithPhotos[]> {
  const { data } = await supabase
    .from('cars')
    .select(CAR_LIST_SELECT)
    .eq('status', 'active')
    .neq('id', car.id)
    .or(`body_type.eq.${car.body_type},make.eq.${car.make.replace(/[,()]/g, '')}`)
    .gte('price', Math.round(car.price * 0.6))
    .lte('price', Math.round(car.price * 1.4))
    .order('published_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as CarWithPhotos[];
}

export function filtersFromParams(params: URLSearchParams): CarFilters {
  const num = (k: string) => {
    const v = params.get(k);
    if (!v) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const str = (k: string) => params.get(k)?.trim() || undefined;
  return {
    q: str('q'),
    make: str('make'),
    model: str('model'),
    yearMin: num('yearMin'),
    yearMax: num('yearMax'),
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    mileageMax: num('mileageMax'),
    transmission: str('transmission') as Transmission | undefined,
    fuel: str('fuel') as FuelType | undefined,
    body: str('body') as BodyType | undefined,
    zip: str('zip'),
    radius: num('radius'),
    sort: (str('sort') as SortOption | undefined) ?? 'newest',
    page: num('page') ?? 1,
  };
}

export function paramsFromFilters(filters: CarFilters): URLSearchParams {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'sort' && value === 'newest') continue;
    if (key === 'page' && value === 1) continue;
    p.set(key, String(value));
  }
  return p;
}

/** Full VIN for a signed-in buyer (logged + rate limited by the database). */
export async function revealVin(carId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('reveal_car_vin', { p_car_id: carId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}
