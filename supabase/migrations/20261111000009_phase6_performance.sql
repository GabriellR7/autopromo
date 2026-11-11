-- =============================================================================
-- AutoPromo — Phase 6: database performance (Supabase advisor fixes)
--  * RLS: wrap auth.uid() / is_admin() in (select ...) so they run once per
--    query instead of once per row.
--  * Merge duplicate permissive policies.
--  * Index foreign keys used in joins/filters.
-- Same access rules as before — only faster.
-- =============================================================================

-- ---------------- profiles ----------------
drop policy "Users update their own profile" on public.profiles;
drop policy "Admins update any profile" on public.profiles;
create policy "Users update own profile; admins any"
  on public.profiles for update
  using ((select auth.uid()) = id or (select public.is_admin()))
  with check ((select auth.uid()) = id or (select public.is_admin()));

-- ---------------- cars ----------------
drop policy "Public sees live listings; owners see their own; admins see all" on public.cars;
create policy "Public sees live listings; owners see their own; admins see all"
  on public.cars for select
  using (status in ('active', 'pending_sale', 'sold') or owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy "Owners create their own listings" on public.cars;
create policy "Owners create their own listings"
  on public.cars for insert
  with check (
    owner_id = (select auth.uid())
    and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.suspended)
  );

drop policy "Owners update their own listings" on public.cars;
create policy "Owners update their own listings"
  on public.cars for update
  using (owner_id = (select auth.uid()) or (select public.is_admin()))
  with check (owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy "Owners delete their own listings" on public.cars;
create policy "Owners delete their own listings"
  on public.cars for delete
  using (owner_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------- car_private ----------------
drop policy "Owner manages private car data" on public.car_private;
create policy "Owner manages private car data"
  on public.car_private for all
  using (exists (select 1 from public.cars c where c.id = car_id and (c.owner_id = (select auth.uid()) or (select public.is_admin()))))
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid())));

-- ---------------- car_photos ----------------
drop policy "Owner inserts photos" on public.car_photos;
create policy "Owner inserts photos"
  on public.car_photos for insert
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid())));

drop policy "Owner updates photos" on public.car_photos;
create policy "Owner updates photos"
  on public.car_photos for update
  using (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid())));

drop policy "Owner or admin deletes photos" on public.car_photos;
create policy "Owner or admin deletes photos"
  on public.car_photos for delete
  using (exists (select 1 from public.cars c where c.id = car_id and (c.owner_id = (select auth.uid()) or (select public.is_admin()))));

-- ---------------- profile_contacts ----------------
drop policy "Users manage their own contact info" on public.profile_contacts;
create policy "Users manage their own contact info"
  on public.profile_contacts for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------- promotions & requests & clicks ----------------
drop policy "Promoter, car owner and admins see requests" on public.promotion_requests;
create policy "Promoter, car owner and admins see requests"
  on public.promotion_requests for select
  using (
    promoter_id = (select auth.uid())
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy "Promoter, car owner and admins see promotions" on public.promotions;
create policy "Promoter, car owner and admins see promotions"
  on public.promotions for select
  using (
    promoter_id = (select auth.uid())
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy "Promoter, car owner and admins see clicks" on public.referral_clicks;
create policy "Promoter, car owner and admins see clicks"
  on public.referral_clicks for select
  using (
    exists (select 1 from public.promotions p where p.id = promotion_id and p.promoter_id = (select auth.uid()))
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- ---------------- payouts ----------------
drop policy "Users read their own payout account" on public.payout_accounts;
create policy "Users read their own payout account"
  on public.payout_accounts for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------- chat ----------------
drop policy "Participants see their conversations" on public.conversations;
drop policy "Promoter sees conversations they referred" on public.conversations;
create policy "Participants, referring promoter and admins see conversations"
  on public.conversations for select
  using (
    (select auth.uid()) in (initiator_id, recipient_id)
    or exists (select 1 from public.promotions p where p.id = promotion_id and p.promoter_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy "Participants read messages" on public.messages;
create policy "Participants read messages"
  on public.messages for select
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id
       and ((select auth.uid()) in (c.initiator_id, c.recipient_id) or (select public.is_admin()))
  ));

drop policy "Participants send messages as themselves" on public.messages;
create policy "Participants send messages as themselves"
  on public.messages for insert
  with check (
    sender_id = (select auth.uid())
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id and (select auth.uid()) in (c.initiator_id, c.recipient_id))
    and not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.suspended)
  );

drop policy "Buyer, owner and admins see visits" on public.visits;
drop policy "Promoter sees visits for conversations they referred" on public.visits;
create policy "Buyer, owner, referring promoter and admins see visits"
  on public.visits for select
  using (
    (select auth.uid()) in (buyer_id, owner_id)
    or exists (select 1 from public.conversations c join public.promotions p on p.id = c.promotion_id
                where c.id = conversation_id and p.promoter_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- ---------------- money ----------------
drop policy "Owner, credited promoter and admins see sales" on public.sales;
create policy "Owner, credited promoter and admins see sales"
  on public.sales for select
  using (
    owner_id = (select auth.uid())
    or exists (select 1 from public.promotions p where p.car_id = sales.car_id and p.promoter_id = (select auth.uid()))
    or (select public.is_admin())
  );

drop policy "Owner, promoter and admins see commissions" on public.commissions;
create policy "Owner, promoter and admins see commissions"
  on public.commissions for select
  using ((select auth.uid()) in (owner_id, promoter_id) or (select public.is_admin()));

drop policy "Owner, promoter and admins see disputes" on public.disputes;
create policy "Owner, promoter and admins see disputes"
  on public.disputes for select
  using ((select auth.uid()) in (owner_id, promoter_id) or (select public.is_admin()));

-- ---------------- community ----------------
drop policy "Visible reviews are public" on public.reviews;
create policy "Visible reviews are public"
  on public.reviews for select
  using (not hidden or reviewer_id = (select auth.uid()) or (select public.is_admin()));

drop policy "Reporter and admins see reports" on public.reports;
create policy "Reporter and admins see reports"
  on public.reports for select
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------- foreign-key indexes ----------------
create index if not exists idx_commissions_car on public.commissions (car_id);
create index if not exists idx_commissions_promotion on public.commissions (promotion_id);
create index if not exists idx_disputes_car on public.disputes (car_id);
create index if not exists idx_disputes_owner on public.disputes (owner_id);
create index if not exists idx_disputes_promoter on public.disputes (promoter_id);
create index if not exists idx_disputes_promotion on public.disputes (promotion_id);
create index if not exists idx_messages_sender on public.messages (sender_id);
create index if not exists idx_referral_clicks_car on public.referral_clicks (car_id);
create index if not exists idx_referral_clicks_user on public.referral_clicks (user_id);
create index if not exists idx_reports_reporter on public.reports (reporter_id);
create index if not exists idx_reports_resolved_by on public.reports (resolved_by);
create index if not exists idx_reviews_reviewer on public.reviews (reviewer_id);
create index if not exists idx_sales_conversation on public.sales (conversation_id);
create index if not exists idx_sales_owner on public.sales (owner_id);
create index if not exists idx_sales_promotion on public.sales (promotion_id);
create index if not exists idx_visits_buyer on public.visits (buyer_id);
create index if not exists idx_visits_car on public.visits (car_id);
create index if not exists idx_visits_owner on public.visits (owner_id);
