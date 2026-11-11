import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { Footer } from './Footer';
import { captureReferralFromUrl } from '@/lib/referral';
import { supabaseConfigured } from '@/lib/supabase';

export function Layout() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    captureReferralFromUrl(search);
  }, [search]);

  return (
    <div className="flex min-h-screen flex-col">
      {!supabaseConfigured && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and add your project keys.
        </div>
      )}
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
