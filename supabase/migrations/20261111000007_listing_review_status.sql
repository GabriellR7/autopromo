-- AutoPromo — Phase 5 (part 1): new listing status for admin moderation.
-- Kept in its own migration because a new enum value can't be used in the
-- same transaction that creates it.
alter type public.car_status add value if not exists 'pending_review' after 'draft';
