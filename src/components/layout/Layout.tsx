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

  useEffect(() => {
    // The app loaded fine, so allow one automatic reload again after future deploys.
    sessionStorage.removeItem('ap_chunk_reload');
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      {!supabaseConfigured && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and add your project keys.
        </div>
      )}
      <Header />
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
