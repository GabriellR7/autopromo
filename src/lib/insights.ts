import { supabase } from './supabase';
import { commissionAmount } from './utils';
import type { Car } from './types';

/* -------------------------------------------------------------------------- */
/* Suggested price                                                            */
/* -------------------------------------------------------------------------- */

export interface PriceInsight {
  comparable_count: number;
  low: number;
  median: number;
  high: number;
  scope: 'model' | 'make';
}

export async function fetchPriceInsight(args: { make: string; model: string; year: number; mileage: number | null; excludeId?: string | null }): Promise<PriceInsight | null> {
  const { data, error } = await supabase.rpc('price_insight', {
    p_make: args.make,
    p_model: args.model,
    p_year: args.year,
    p_mileage: args.mileage,
    p_exclude: args.excludeId ?? null,
  });
  if (error) return null;
  const row = (data as PriceInsight[] | null)?.[0];
  if (!row) return null;
  return { ...row, low: Number(row.low), median: Number(row.median), high: Number(row.high) };
}

/** Where a price sits compared with similar cars. */
export function pricePosition(price: number, i: PriceInsight): 'low' | 'fair' | 'high' {
  if (price < i.low * 0.97) return 'low';
  if (price > i.high * 1.03) return 'high';
  return 'fair';
}

/* -------------------------------------------------------------------------- */
/* Listing quality score                                                      */
/* -------------------------------------------------------------------------- */

export interface ScoreTip {
  done: boolean;
  label: string;
  points: number;
}

type ScoreInput = Pick<Car, 'description' | 'trim_level' | 'exterior_color' | 'commission_type' | 'commission_value' | 'price'> & {
  photoCount: number;
  hasVin: boolean;
};

export function listingScore(c: ScoreInput): { score: number; tips: ScoreTip[] } {
  const desc = (c.description ?? '').trim().length;
  const fee = c.price ? commissionAmount({ commission_type: c.commission_type, commission_value: Number(c.commission_value) || 0, price: c.price }) : 0;
  const tips: ScoreTip[] = [
    { done: c.photoCount >= 8, label: c.photoCount >= 8 ? `${c.photoCount} photos` : `Add ${8 - c.photoCount} more photo${8 - c.photoCount === 1 ? '' : 's'} (8+ get the most contacts) — interior, engine, tires, odometer`, points: c.photoCount >= 8 ? 35 : c.photoCount >= 4 ? 20 : c.photoCount > 0 ? 10 : 0 },
    { done: desc >= 200, label: desc >= 200 ? 'Detailed description' : 'Write a longer description: service history, owners, recent repairs, why you\'re selling', points: desc >= 200 ? 20 : desc >= 60 ? 10 : 0 },
    { done: c.hasVin, label: c.hasVin ? 'VIN added' : 'Add the VIN — buyers trust listings they can check', points: c.hasVin ? 15 : 0 },
    { done: fee >= 200, label: fee >= 200 ? 'Attractive referral fee' : 'Offer a referral fee of $200+ so more promoters share your car', points: fee >= 200 ? 15 : fee > 0 ? 7 : 0 },
    { done: Boolean(c.trim_level?.trim()), label: c.trim_level?.trim() ? 'Trim added' : 'Add the trim (e.g. EX, XLE, Sport)', points: c.trim_level?.trim() ? 8 : 0 },
    { done: Boolean(c.exterior_color?.trim()), label: c.exterior_color?.trim() ? 'Color added' : 'Add the exterior color', points: c.exterior_color?.trim() ? 7 : 0 },
  ];
  // max = 35 + 20 + 15 + 15 + 8 + 7 = 100
  return { score: Math.min(100, tips.reduce((s, t) => s + t.points, 0)), tips };
}

/* -------------------------------------------------------------------------- */
/* Owner stats                                                                */
/* -------------------------------------------------------------------------- */

export interface DayStat {
  day: string;
  views: number;
  clicks: number;
  chats: number;
  saves: number;
}

export async function fetchCarStats(carId: string, days = 30): Promise<DayStat[]> {
  const { data, error } = await supabase.rpc('owner_car_stats', { p_car_id: carId, p_days: days });
  if (error) throw new Error(error.message);
  return (data ?? []) as DayStat[];
}

export async function fetchMySaveCounts(): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('my_car_save_counts');
  return Object.fromEntries(((data ?? []) as { car_id: string; saves: number }[]).map((r) => [r.car_id, r.saves]));
}
