import { NavLink, Outlet } from 'react-router-dom';
import { BadgeDollarSign, Car, LayoutDashboard, MessageSquare, Plus, Search, Settings, Users, type LucideIcon } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

type Item = { to: string; label: string; icon: LucideIcon; end?: boolean; badge?: number };

const SELLER: Item[] = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/dashboard/listings', label: 'My listings', icon: Car, end: true },
  { to: '/dashboard/listings/new', label: 'New listing', icon: Plus },
  { to: '/dashboard/promoters', label: 'Promoters', icon: Users },
];

const PROMOTER: Item[] = [
  { to: '/dashboard/promoter', label: 'Promoter dashboard', icon: BadgeDollarSign, end: true },
  { to: '/dashboard/promoter/explore', label: 'Find cars', icon: Search },
];


export function DashboardLayout() {
  const { profile, user } = useAuth();
  const unread = useUnreadCount(user?.id);
  const COMMON: Item[] = [
    { to: '/dashboard/messages', label: 'Messages', icon: MessageSquare, badge: unread },
    { to: '/dashboard/settings', label: 'Settings', icon: Settings },
  ];
  const promoterFirst = profile?.active_mode === 'promoter';
  const groups: { title: string; items: Item[] }[] = promoterFirst
    ? [{ title: 'Promoter', items: PROMOTER }, { title: 'Selling', items: SELLER }, { title: 'Account', items: COMMON }]
    : [{ title: 'Selling', items: SELLER }, { title: 'Promoter', items: PROMOTER }, { title: 'Account', items: COMMON }];

  return (
    <div className="container grid gap-6 py-6 lg:grid-cols-[230px_1fr] lg:gap-8 lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <nav className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 lg:flex-col">
          {groups.map((g, gi) => (
            <div key={gi} className="flex gap-1 lg:flex-col">
              {g.title && (
                <p className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground first:pt-1.5 lg:block">
                  {g.title}
                </p>
              )}
              {g.items.map(({ to, label, icon: Icon, end, badge }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }: { isActive: boolean }) =>
                    cn(
                      'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
                      isActive && 'bg-navy text-white hover:bg-navy hover:text-white',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                  {badge ? <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span> : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
