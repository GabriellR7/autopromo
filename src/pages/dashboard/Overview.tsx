import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BadgeDollarSign, Car, Eye, FileEdit, Plus, Rocket, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchMyListings } from '@/lib/listings';
import { fetchIncomingRequests } from '@/lib/promotions';
import { cents, fetchOwnerCommissions } from '@/lib/sales';
import type { CarWithPhotos } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ListingRow } from './MyListings';
import { PendingReviewsCard } from '@/components/community/Community';

export default function Overview() {
  useDocumentTitle('Dashboard');
  const { profile, user } = useAuth();
  const [cars, setCars] = useState<CarWithPhotos[] | null>(null);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [owed, setOwed] = useState(0);

  useEffect(() => {
    if (!user) return;
    fetchMyListings(user.id).then(setCars).catch(() => setCars([]));
    fetchIncomingRequests()
      .then((r) => setPendingRequests(r.filter((x) => x.status === 'pending' && x.car?.owner_id === user.id).length))
      .catch(() => undefined);
    fetchOwnerCommissions()
      .then((d) => setOwed(d.commissions.filter((c) => c.status === 'pending').reduce((sum, c) => sum + c.amount_cents, 0)))
      .catch(() => undefined);
  }, [user]);

  const firstName = profile?.full_name?.split(' ')[0];
  const active = cars?.filter((c) => c.status === 'active').length ?? 0;
  const drafts = cars?.filter((c) => c.status === 'draft').length ?? 0;
  const views = cars?.reduce((sum, c) => sum + c.views, 0) ?? 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hi{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p className="text-muted-foreground">Here's what's happening with your cars.</p>
        </div>
        <Button asChild>
          <Link to="/dashboard/listings/new"><Plus /> List a car</Link>
        </Button>
      </div>

      {owed > 0 && (
        <Card className="flex flex-col gap-4 border-amber-300 bg-amber-50 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 className="font-semibold">You have {cents(owed)} in referral fees to pay</h2>
            <p className="text-sm text-muted-foreground">A promoter brought you a buyer. Pay securely by card.</p>
          </div>
          <Button asChild><Link to="/dashboard/commissions">View commissions</Link></Button>
        </Card>
      )}

      {pendingRequests > 0 && (
        <Card className="flex flex-col gap-4 border-primary/30 bg-accent p-5 sm:flex-row sm:items-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
            <Users className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">{pendingRequests} promoter request{pendingRequests > 1 ? 's' : ''} waiting</h2>
            <p className="text-sm text-muted-foreground">Approve promoters so they can start sharing your cars.</p>
          </div>
          <Button asChild><Link to="/dashboard/promoters">Review</Link></Button>
        </Card>
      )}

      {profile?.active_mode === 'promoter' && (
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy text-white">
            <BadgeDollarSign className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">You're in promoter mode</h2>
            <p className="text-sm text-muted-foreground">Your links, clicks and earnings live in the promoter dashboard.</p>
          </div>
          <Button asChild variant="outline"><Link to="/dashboard/promoter">Open promoter dashboard</Link></Button>
        </Card>
      )}

      <PendingReviewsCard role="owner_to_promoter" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={Rocket} label="Active listings" value={cars ? active : null} />
        <Stat icon={FileEdit} label="Drafts" value={cars ? drafts : null} />
        <Stat icon={Eye} label="Total views" value={cars ? views : null} />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent listings</h2>
          {cars && cars.length > 0 && (
            <Link to="/dashboard/listings" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
              View all <ArrowRight className="size-4" />
            </Link>
          )}
        </div>
        {cars === null ? (
          <Skeleton className="h-24 w-full" />
        ) : cars.length === 0 ? (
          <Card className="flex flex-col items-center p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-accent">
              <Car className="size-7 text-primary" />
            </div>
            <h3 className="mt-4 font-semibold">List your first car</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              It takes about 5 minutes. Add photos, set your price and the referral fee, and you're live.
            </p>
            <Button asChild className="mt-5"><Link to="/dashboard/listings/new">Start listing</Link></Button>
          </Card>
        ) : (
          <Card className="divide-y">
            {cars.slice(0, 3).map((car) => <ListingRow key={car.id} car={car} compact />)}
          </Card>
        )}
      </section>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Car; label: string; value: number | null }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex size-11 items-center justify-center rounded-lg bg-accent text-primary">
        <Icon className="size-5" />
      </div>
      <div>
        {value === null ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-bold">{value.toLocaleString('en-US')}</p>}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
