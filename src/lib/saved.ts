import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { CAR_LIST_SELECT, type CarFilters } from './cars';
import type { CarWithPhotos } from './types';

/* -------------------------------------------------------------------------- */
/* Favorites — a small shared store so every heart on the page stays in sync  */
/* -------------------------------------------------------------------------- */

let savedIds: Set<string> | null = null;
let loadedFor: string | null = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function loadSavedIds(userId: string) {
  if (loadedFor === userId && savedIds) return;
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase.from('saved_cars').select('car_id').eq('user_id', userId);
    savedIds = new Set((data ?? []).map((r) => r.car_id as string));
    loadedFor = userId;
    loading = null;
    emit();
  })();
  return loading;
}

/** Ids of the cars the signed-in user saved (empty set when signed out). */
export function useSavedIds(userId: string | undefined) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (userId) loadSavedIds(userId);
    else if (savedIds) {
      savedIds = null;
      loadedFor = null;
      emit();
    }
    return () => {
      listeners.delete(l);
    };
  }, [userId]);
  return userId && loadedFor === userId && savedIds ? savedIds : new Set<string>();
}

export async function toggleSavedCar(userId: string, carId: string, save: boolean) {
  // optimistic update
  if (!savedIds || loadedFor !== userId) {
    savedIds = new Set();
    loadedFor = userId;
  }
  if (save) savedIds.add(carId);
  else savedIds.delete(carId);
  emit();
  const { error } = save
    ? await supabase.from('saved_cars').insert({ user_id: userId, car_id: carId })
    : await supabase.from('saved_cars').delete().eq('user_id', userId).eq('car_id', carId);
  if (error && !(save && error.code === '23505')) {
    if (save) savedIds.delete(carId);
    else savedIds.add(carId);
    emit();
    throw new Error(error.message);
  }
}

export interface SavedCar {
  car_id: string;
  price_at_save: number | null;
  created_at: string;
  car: CarWithPhotos | null;
}

export async function fetchSavedCars(userId: string): Promise<SavedCar[]> {
  const { data, error } = await supabase
    .from('saved_cars')
    .select(`car_id, price_at_save, created_at, car:cars(${CAR_LIST_SELECT})`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as unknown as SavedCar[]).map((s) => ({ ...s, price_at_save: s.price_at_save == null ? null : Number(s.price_at_save) }));
}

/* -------------------------------------------------------------------------- */
/* Saved searches                                                             */
/* -------------------------------------------------------------------------- */

export interface SavedSearch {
  id: string;
  name: string;
  filters: CarFilters;
  email_alerts: boolean;
  created_at: string;
}

const SEARCH_KEYS: (keyof CarFilters)[] = ['q', 'make', 'model', 'yearMin', 'yearMax', 'priceMin', 'priceMax', 'mileageMax', 'transmission', 'fuel', 'body', 'zip', 'radius'];

/** Only the filter fields (no sort/page) — what an alert should match. */
export function searchFiltersOnly(filters: CarFilters): CarFilters {
  const out: Record<string, unknown> = {};
  for (const k of SEARCH_KEYS) {
    const v = filters[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out as CarFilters;
}

/** Human name for a search, e.g. "Honda Civic · under $15,000 · near 78701". */
export function describeSearch(f: CarFilters) {
  const parts: string[] = [];
  const car = [f.make, f.model].filter(Boolean).join(' ') || f.q || 'Any car';
  parts.push(car);
  if (f.yearMin || f.yearMax) parts.push(f.yearMin && f.yearMax ? `${f.yearMin}–${f.yearMax}` : f.yearMin ? `${f.yearMin}+` : `up to ${f.yearMax}`);
  if (f.priceMax) parts.push(`under $${f.priceMax.toLocaleString('en-US')}`);
  else if (f.priceMin) parts.push(`over $${f.priceMin.toLocaleString('en-US')}`);
  if (f.mileageMax) parts.push(`< ${f.mileageMax.toLocaleString('en-US')} mi`);
  if (f.body) parts.push(f.body.toUpperCase() === 'SUV' ? 'SUV' : f.body);
  if (f.zip) parts.push(f.radius ? `within ${f.radius} mi of ${f.zip}` : `near ${f.zip}`);
  return parts.join(' · ').slice(0, 80);
}

export async function fetchSavedSearches(userId: string): Promise<SavedSearch[]> {
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, name, filters, email_alerts, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedSearch[];
}

export async function createSavedSearch(userId: string, filters: CarFilters, origin: { lat: number; lng: number } | null) {
  const f = searchFiltersOnly(filters);
  const { error } = await supabase.from('saved_searches').insert({
    user_id: userId,
    name: describeSearch(f),
    filters: f,
    origin_lat: f.zip && origin ? origin.lat : null,
    origin_lng: f.zip && origin ? origin.lng : null,
    email_alerts: true,
  });
  if (error) throw new Error(error.message);
}

export async function setSearchAlerts(id: string, on: boolean) {
  const { error } = await supabase.from('saved_searches').update({ email_alerts: on }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSavedSearch(id: string) {
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** True when the car's price dropped within the last 30 days. */
export function recentPriceDrop(car: { previous_price: number | null; price_dropped_at: string | null; price: number }) {
  if (!car.previous_price || !car.price_dropped_at) return null;
  if (Date.now() - new Date(car.price_dropped_at).getTime() > 30 * 86_400_000) return null;
  const prev = Number(car.previous_price);
  return prev > car.price ? prev : null;
}
