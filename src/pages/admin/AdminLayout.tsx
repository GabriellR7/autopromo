import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Car, Flag, LayoutDashboard, Receipt, Scale, Settings, Shield, Users, type LucideIcon } from 'lucide-react';
import { adminStats, type AdminStats } from '@/lib/admin';
import { cn } from '@/lib/utils';

const LINKS: { to: string; label: string; icon: LucideIcon; end?: boolean; count?: keyof AdminStats }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/listings', label: 'Listings', icon: Car, count: 'pending_review' },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/disputes', label: 'Disputes', icon: Scale, count: 'open_disputes' },
  { to: '/admin/reports', label: 'Reports', icon: Flag, count: 'open_reports' },
  { to: '/admin/commissions', label: 'Commissions', icon: Receipt },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export function AdminLayout() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  useEffect(() => {
    adminStats().then(setStats).catch(() => undefined);
    const t = setInterval(() => adminStats().then(setStats).catch(() => undefined), 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="container grid gap-6 py-6 lg:grid-cols-[220px_1fr] lg:gap-8 lg:py-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <p className="mb-2 hidden items-center gap-2 px-1 text-sm font-semibold lg:flex"><Shield className="size-4 text-primary" />Admin</p>
        <nav className="scrollbar-none flex gap-1 overflow-x-auto rounded-xl border bg-card p-1.5 lg:flex-col">
          {LINKS.map(({ to, label, icon: Icon, end, count }) => {
            const n = count && stats ? Number(stats[count]) : 0;
            return (
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
                {n > 0 && <span className="ml-auto rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">{n}</span>}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
