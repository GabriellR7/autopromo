import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '@/components/ui/misc';

/**
 * Protects a route:
 *  - not signed in → /login (and comes back after login)
 *  - signed in but not onboarded → /onboarding
 *  - requireAdmin → only admins
 */
export function RequireAuth({
  children,
  skipOnboarding = false,
  requireAdmin = false,
}: {
  children: ReactNode;
  skipOnboarding?: boolean;
  requireAdmin?: boolean;
}) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();

  if (loading || (user && !profile)) return <PageLoader />;

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!skipOnboarding && profile && !profile.onboarded) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname + location.search }} />;
  }

  if (requireAdmin && !profile?.is_admin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

/** Sends signed-in users away from login/signup pages. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  if (user) {
    const from = (location.state as { from?: string } | null)?.from;
    if (profile && !profile.onboarded) return <Navigate to="/onboarding" replace state={{ from }} />;
    return <Navigate to={from ?? '/dashboard'} replace />;
  }
  return <>{children}</>;
}
