import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { RouteError } from '@/components/layout/RouteError';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { GuestOnly, RequireAuth } from '@/components/auth/RequireAuth';
import { PageLoader } from '@/components/ui/misc';
import Home from '@/pages/Home';
import Cars from '@/pages/Cars';
import CarDetail from '@/pages/CarDetail';
import ReferralRedirect from '@/pages/ReferralRedirect';
import { Faq, HowItWorks, NotFound, Privacy, Terms } from '@/pages/StaticPages';
import Login from '@/pages/auth/Login';
import Signup from '@/pages/auth/Signup';
import Onboarding from '@/pages/auth/Onboarding';
import { AuthCallback, CheckEmail, ForgotPassword, ResetPassword } from '@/pages/auth/AuthMisc';

// Dashboard pages are split into a separate bundle (visitors don't download them).
const Overview = lazy(() => import('@/pages/dashboard/Overview'));
const MyListings = lazy(() => import('@/pages/dashboard/MyListings'));
const ListingWizard = lazy(() => import('@/pages/dashboard/ListingWizard'));
const OwnerPromoters = lazy(() => import('@/pages/dashboard/OwnerPromoters'));
const Messages = lazy(() => import('@/pages/dashboard/Messages'));
const Settings = lazy(() => import('@/pages/dashboard/Settings'));
const OwnerCommissions = lazy(() => import('@/pages/dashboard/OwnerCommissions'));
const Billing = lazy(() => import('@/pages/dashboard/Billing'));
const PromoterEarnings = lazy(() => import('@/pages/dashboard/promoter/PromoterEarnings'));
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'));
const AdminListings = lazy(() => import('@/pages/admin/AdminListings'));
const AdminUsers = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminUsers })));
const AdminDisputes = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminDisputes })));
const AdminReports = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminReports })));
const AdminCommissions = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminCommissions })));
const AdminSettings = lazy(() => import('@/pages/admin/AdminPages').then((m) => ({ default: m.AdminSettings })));
const PromoterDashboard = lazy(() => import('@/pages/dashboard/promoter/PromoterDashboard'));
const PromoterExplore = lazy(() => import('@/pages/dashboard/promoter/PromoterExplore'));

const s = (el: ReactNode) => <Suspense fallback={<PageLoader />}>{el}</Suspense>;

const router = createBrowserRouter([
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/cars', element: <Cars /> },
      { path: '/cars/:slug', element: <CarDetail /> },
      { path: '/r/:code', element: <ReferralRedirect /> },
      { path: '/how-it-works', element: <HowItWorks /> },
      { path: '/faq', element: <Faq /> },
      { path: '/terms', element: <Terms /> },
      { path: '/privacy', element: <Privacy /> },

      { path: '/login', element: <GuestOnly><Login /></GuestOnly> },
      { path: '/signup', element: <GuestOnly><Signup /></GuestOnly> },
      { path: '/check-email', element: <CheckEmail /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '/auth/callback', element: <AuthCallback /> },
      { path: '/onboarding', element: <RequireAuth skipOnboarding><Onboarding /></RequireAuth> },

      {
        path: '/dashboard',
        element: <RequireAuth><DashboardLayout /></RequireAuth>,
        children: [
          { index: true, element: s(<Overview />) },
          { path: 'listings', element: s(<MyListings />) },
          { path: 'listings/new', element: s(<ListingWizard key="new" />) },
          { path: 'listings/:id/edit', element: s(<ListingWizard key="edit" />) },
          { path: 'messages', element: s(<Messages />) },
          { path: 'messages/:id', element: s(<Messages />) },
          { path: 'settings', element: s(<Settings />) },
          { path: 'promoters', element: s(<OwnerPromoters />) },
          { path: 'promoter', element: s(<PromoterDashboard />) },
          { path: 'promoter/explore', element: s(<PromoterExplore />) },
          { path: 'promoter/earnings', element: s(<PromoterEarnings />) },
          { path: 'commissions', element: s(<OwnerCommissions />) },
          { path: 'billing', element: s(<Billing />) },
        ],
      },

      {
        path: '/admin',
        element: <RequireAuth requireAdmin>{s(<AdminLayout />)}</RequireAuth>,
        children: [
          { index: true, element: s(<AdminDashboard />) },
          { path: 'listings', element: s(<AdminListings />) },
          { path: 'users', element: s(<AdminUsers />) },
          { path: 'disputes', element: s(<AdminDisputes />) },
          { path: 'reports', element: s(<AdminReports />) },
          { path: 'commissions', element: s(<AdminCommissions />) },
          { path: 'settings', element: s(<AdminSettings />) },
        ],
      },

      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
