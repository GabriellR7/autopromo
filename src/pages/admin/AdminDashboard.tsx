import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeDollarSign, Car, Clock, CreditCard, DollarSign, Flag, MessageSquare, MousePointerClick, Scale, Users } from 'lucide-react';
import { adminStats, adminSubscriptionStats, type AdminStats, type SubscriptionStats } from '@/lib/admin';
import { cents } from '@/lib/sales';
import { formatPrice } from '@/lib/utils';
import { Alert, Card, Skeleton } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function AdminDashboard() {
  useDocumentTitle('Admin');
  const [s, setS] = useState<AdminStats | null>(null);
  const [plan, setPlan] = useState<SubscriptionStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    adminStats().then(setS).catch((e: Error) => setError(e.message));
    adminSubscriptionStats().then(setPlan).catch(() => setPlan(null));
  }, []);

  const tiles = s
    ? [
        { icon: Users, label: 'Users', value: s.users.toLocaleString('en-US'), hint: `+${s.users_7d} this week · ${s.promoters} promoters` },
        { icon: Car, label: 'Active listings', value: s.active_listings.toLocaleString('en-US'), hint: `${s.pending_review} waiting for review`, to: '/admin/listings' },
        { icon: BadgeDollarSign, label: 'Cars sold', value: s.sold.toLocaleString('en-US'), hint: `${formatPrice(Number(s.sales_volume))} in sales` },
        ...(plan
          ? [{ icon: CreditCard, label: 'Seller plans (MRR)', value: cents(Number(plan.mrr_cents)), hint: `${plan.paying} paying · ${plan.trialing} on free trial · ${plan.past_due} past due · ${plan.expired} expired` }]
          : []),
        ...(Number(s.platform_revenue_cents) > 0
          ? [{ icon: DollarSign, label: 'Commission fees', value: cents(Number(s.platform_revenue_cents)), hint: `${cents(Number(s.commissions_paid_cents))} in paid commissions`, to: '/admin/commissions' }]
          : [{ icon: DollarSign, label: 'Paid commissions', value: cents(Number(s.commissions_paid_cents)), hint: '100% goes to promoters', to: '/admin/commissions' }]),
        { icon: Clock, label: 'Commissions to collect', value: cents(Number(s.commissions_pending_cents)), hint: 'Owners still need to pay', to: '/admin/commissions' },
        { icon: Scale, label: 'Open disputes', value: String(s.open_disputes), hint: 'Need a decision', to: '/admin/disputes' },
        { icon: Flag, label: 'Open reports', value: String(s.open_reports), hint: 'Listings or users reported', to: '/admin/reports' },
        { icon: MessageSquare, label: 'Conversations', value: s.conversations.toLocaleString('en-US'), hint: 'Buyer, owner and promoter chats' },
        { icon: MousePointerClick, label: 'Referral clicks', value: s.clicks_7d.toLocaleString('en-US'), hint: 'Last 7 days' },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">How AutoPromo is doing right now.</p>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {s === null
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : tiles.map(({ icon: Icon, label, value, hint, to }) => {
              const inner = (
                <Card className="h-full p-5 transition-shadow hover:shadow-md">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="size-4" />{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
                </Card>
              );
              return to ? <Link key={label} to={to}>{inner}</Link> : <div key={label}>{inner}</div>;
            })}
      </div>
    </div>
  );
}
