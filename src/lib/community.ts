import { supabase } from './supabase';

export interface UserStats {
  rating: number | null;
  reviews: number;
  promoter_sales: number;
  cars_sold: number;
}

export interface PendingReview {
  sale_id: string;
  car_title: string;
  other_name: string | null;
  role: 'owner_to_promoter' | 'promoter_to_owner';
}

export interface Review {
  id: string;
  rating: number;
  comment: string | null;
  role: 'owner_to_promoter' | 'promoter_to_owner';
  created_at: string;
  reviewer: { full_name: string | null; avatar_url: string | null } | null;
}

export type ReportReason = 'scam' | 'misleading' | 'offensive' | 'spam' | 'not_owner' | 'sold' | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string; for: ('car' | 'user')[] }[] = [
  { value: 'scam', label: 'Scam or fraud', for: ['car', 'user'] },
  { value: 'misleading', label: 'Misleading information or photos', for: ['car'] },
  { value: 'not_owner', label: "Seller doesn't seem to own the car", for: ['car'] },
  { value: 'sold', label: 'Car is already sold', for: ['car'] },
  { value: 'offensive', label: 'Offensive or abusive behavior', for: ['car', 'user'] },
  { value: 'spam', label: 'Spam', for: ['car', 'user'] },
  { value: 'other', label: 'Something else', for: ['car', 'user'] },
];

const statsCache = new Map<string, Promise<UserStats>>();

export function fetchUserStats(userId: string): Promise<UserStats> {
  if (!statsCache.has(userId)) {
    statsCache.set(
      userId,
      Promise.resolve(supabase.rpc('user_public_stats', { p_user_id: userId })).then(({ data }) => {
        const d = (data ?? {}) as Partial<UserStats>;
        return {
          rating: d.rating == null ? null : Number(d.rating),
          reviews: Number(d.reviews ?? 0),
          promoter_sales: Number(d.promoter_sales ?? 0),
          cars_sold: Number(d.cars_sold ?? 0),
        };
      }),
    );
  }
  return statsCache.get(userId)!;
}

export async function fetchReviewsFor(userId: string, limit = 10): Promise<Review[]> {
  const { data } = await supabase
    .from('reviews')
    .select('id, rating, comment, role, created_at, reviewer:profiles!reviews_reviewer_id_fkey(full_name, avatar_url)')
    .eq('reviewee_id', userId)
    .eq('hidden', false)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as unknown as Review[];
}

export async function fetchPendingReviews(): Promise<PendingReview[]> {
  const { data } = await supabase.rpc('my_pending_reviews');
  return (data ?? []) as PendingReview[];
}

export async function submitReview(saleId: string, rating: number, comment: string) {
  const { error } = await supabase.rpc('submit_review', { p_sale_id: saleId, p_rating: rating, p_comment: comment || null });
  if (error) throw error;
}

export async function reportContent(targetType: 'car' | 'user', targetId: string, reason: ReportReason, details: string) {
  const { error } = await supabase.rpc('report_content', {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reason: reason,
    p_details: details || null,
  });
  if (error) throw error;
}

/** "Top Promoter": gold level, or 4.8+ average with at least 5 reviews. */
export function isTopPromoter(level: string | null | undefined, stats?: UserStats | null) {
  return level === 'gold' || Boolean(stats && stats.reviews >= 5 && (stats.rating ?? 0) >= 4.8);
}
