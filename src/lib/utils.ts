import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Car } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function formatPrice(value: number | null | undefined) {
  if (value == null) return '—';
  return usd.format(value);
}

export function formatMiles(value: number | null | undefined) {
  if (value == null) return '—';
  return `${new Intl.NumberFormat('en-US').format(value)} mi`;
}

/** MM/DD/YYYY */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
}

export function timeAgo(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  const units: [number, string][] = [
    [31536000, 'year'],
    [2592000, 'month'],
    [604800, 'week'],
    [86400, 'day'],
    [3600, 'hour'],
    [60, 'minute'],
  ];
  for (const [secs, label] of units) {
    const n = Math.floor(seconds / secs);
    if (n >= 1) return `${n} ${label}${n > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** /cars/2019-honda-civic-austin-tx-123 */
export function carSlug(car: Pick<Car, 'year' | 'make' | 'model' | 'city' | 'state' | 'public_id'>) {
  return slugify(
    [car.year, car.make, car.model, car.city ?? '', car.state ?? '', String(car.public_id)].join(' '),
  );
}

export function carPath(car: Pick<Car, 'year' | 'make' | 'model' | 'city' | 'state' | 'public_id'>) {
  return `/cars/${carSlug(car)}`;
}

/** Extracts the numeric public id from the end of a slug. */
export function publicIdFromSlug(slug: string): number | null {
  const match = slug.match(/-(\d+)$/) ?? slug.match(/^(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function carTitle(car: Pick<Car, 'year' | 'make' | 'model'>) {
  return `${car.year} ${car.make} ${car.model}`;
}

/** Distance in miles between two coordinates (haversine). */
export function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function commissionAmount(car: Pick<Car, 'commission_type' | 'commission_value' | 'price'>) {
  if (car.commission_type === 'percent') return Math.round((car.price * car.commission_value) / 100);
  return car.commission_value;
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
