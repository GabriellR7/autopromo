import { Link } from 'react-router-dom';
import { Logo } from './Logo';
import { LEGAL_DISCLAIMER } from '@/lib/constants';

export function Footer() {
  return (
    <footer className="mt-20 bg-navy text-slate-300">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo light />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-400">
            Sell your car faster with the help of local promoters — or earn referral commissions by sharing cars with
            your network.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Marketplace</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/cars" className="hover:text-white">Browse cars</Link></li>
            <li><Link to="/signup" className="hover:text-white">Sell your car</Link></li>
            <li><Link to="/how-it-works#promoters" className="hover:text-white">Earn as a Promoter</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white">Company</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><Link to="/how-it-works" className="hover:text-white">How it works</Link></li>
            <li><Link to="/faq" className="hover:text-white">FAQ</Link></li>
            <li><Link to="/terms" className="hover:text-white">Terms of Service</Link></li>
            <li><Link to="/privacy" className="hover:text-white">Privacy Policy</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="container flex flex-col gap-3 py-6 text-xs text-slate-400 md:flex-row md:items-start md:justify-between">
          <p className="max-w-3xl leading-relaxed">{LEGAL_DISCLAIMER}</p>
          <p className="shrink-0">© {new Date().getFullYear()} AutoPromo</p>
        </div>
      </div>
    </footer>
  );
}
