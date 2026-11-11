import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BadgeDollarSign, Car, ChevronDown, LayoutDashboard, LogOut, Menu, MessageSquare, Plus, Search, Settings, Shield, X } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useUnreadCount';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { Logo } from './Logo';
import { cn } from '@/lib/utils';
import type { ActiveMode } from '@/lib/types';

const NAV = [
  { to: '/cars', label: 'Browse cars' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/faq', label: 'FAQ' },
];

const MODE_LABEL: Record<ActiveMode, string> = { owner: 'Selling', promoter: 'Promoting', buyer: 'Buying' };

export function Header() {
  const { user, profile, signOut, setMode } = useAuth();
  const unread = useUnreadCount(user?.id);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function switchMode(mode: ActiveMode) {
    await setMode(mode);
    setMenuOpen(false);
    navigate(mode === 'buyer' ? '/cars' : mode === 'promoter' ? '/dashboard/promoter' : '/dashboard');
  }

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const sellCta = user ? '/dashboard/listings/new' : '/signup';

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link to="/" aria-label="AutoPromo home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn('rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground', isActive && 'text-foreground')
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link to={sellCta}>
              <Plus /> Sell your car
            </Link>
          </Button>
          {user && (
            <Link to="/dashboard/messages" className="relative flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground" aria-label="Messages">
              <MessageSquare className="size-5" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          )}
          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors hover:bg-secondary"
                aria-expanded={menuOpen}
              >
                <Avatar name={profile?.full_name ?? user.email} src={profile?.avatar_url} className="size-8 text-xs" />
                <span className="max-w-[120px] truncate">{profile?.full_name?.split(' ')[0] ?? 'Account'}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-64 overflow-hidden rounded-lg border bg-card p-1.5 shadow-lg animate-in fade-in-0 zoom-in-95">
                  <div className="px-3 py-2">
                    <p className="truncate text-sm font-semibold">{profile?.full_name ?? 'Your account'}</p>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <MenuLink to="/dashboard" icon={LayoutDashboard}>Dashboard</MenuLink>
                  <MenuLink to="/dashboard/listings" icon={Car}>My listings</MenuLink>
                  <MenuLink to="/dashboard/promoter" icon={BadgeDollarSign}>Promoter dashboard</MenuLink>
                  <MenuLink to="/dashboard/messages" icon={MessageSquare}>Messages{unread ? ` (${unread})` : ''}</MenuLink>
                  <MenuLink to="/dashboard/settings" icon={Settings}>Settings</MenuLink>
                  {profile?.is_admin && <MenuLink to="/admin" icon={Shield}>Admin</MenuLink>}
                  <div className="my-1.5 border-t" />
                  <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Mode: {profile ? MODE_LABEL[profile.active_mode] : '—'}
                  </p>
                  <ModeButton active={profile?.active_mode === 'owner'} onClick={() => switchMode('owner')} icon={Car}>Seller</ModeButton>
                  <ModeButton active={profile?.active_mode === 'promoter'} onClick={() => switchMode('promoter')} icon={BadgeDollarSign}>Promoter</ModeButton>
                  <ModeButton active={profile?.active_mode === 'buyer'} onClick={() => switchMode('buyer')} icon={Search}>Buyer</ModeButton>
                  <div className="my-1.5 border-t" />
                  <button onClick={handleSignOut} className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/5">
                    <LogOut className="size-4" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Button asChild variant="outline" size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="relative flex size-10 items-center justify-center rounded-md hover:bg-secondary md:hidden"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          {!mobileOpen && unread > 0 && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t bg-background md:hidden">
          <div className="container flex flex-col gap-1 py-4">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">{n.label}</Link>
            ))}
            <Link to={sellCta} className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">Sell your car</Link>
            <div className="my-2 border-t" />
            {user ? (
              <>
                <Link to="/dashboard" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">Dashboard</Link>
                <Link to="/dashboard/listings" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">My listings</Link>
                <Link to="/dashboard/promoter" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">Promoter dashboard</Link>
                <Link to="/dashboard/messages" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">Messages{unread ? ` (${unread})` : ''}</Link>
                <Link to="/dashboard/settings" className="rounded-md px-3 py-2.5 font-medium hover:bg-secondary">Settings</Link>
                <div className="flex gap-2 px-3 py-2">
                  {(['owner', 'promoter', 'buyer'] as ActiveMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className={cn('flex-1 rounded-md border px-2 py-1.5 text-xs font-semibold', profile?.active_mode === m ? 'border-primary bg-accent text-primary' : '')}
                    >
                      {m === 'owner' ? 'Seller' : m === 'promoter' ? 'Promoter' : 'Buyer'}
                    </button>
                  ))}
                </div>
                <button onClick={handleSignOut} className="rounded-md px-3 py-2.5 text-left font-medium text-destructive hover:bg-destructive/5">
                  Sign out
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Button asChild variant="outline"><Link to="/login">Sign in</Link></Button>
                <Button asChild><Link to="/signup">Get started</Link></Button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function MenuLink({ to, icon: Icon, children }: { to: string; icon: typeof Car; children: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-secondary">
      <Icon className="size-4 text-muted-foreground" />
      {children}
    </Link>
  );
}

function ModeButton({ active, onClick, icon: Icon, children }: { active?: boolean; onClick: () => void; icon: typeof Car; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-secondary', active && 'bg-accent font-semibold text-accent-foreground')}
    >
      <Icon className="size-4" />
      {children}
      {active && <span className="ml-auto size-2 rounded-full bg-primary" />}
    </button>
  );
}
