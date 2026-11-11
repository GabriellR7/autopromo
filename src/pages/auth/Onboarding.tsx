import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BadgeDollarSign, Car, Search, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Alert, Checkbox } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import type { ActiveMode } from '@/lib/types';

const OPTIONS: { mode: ActiveMode; icon: LucideIcon; title: string; text: string }[] = [
  { mode: 'owner', icon: Car, title: 'I want to sell my car', text: 'List your car (30 days free) and let local promoters help you find a buyer.' },
  { mode: 'promoter', icon: BadgeDollarSign, title: 'I want to earn as a Promoter', text: 'Share cars with your network and earn a referral commission when they sell.' },
  { mode: 'buyer', icon: Search, title: "I'm just looking", text: 'Browse cars near you, save favorites and contact sellers.' },
];

export default function Onboarding() {
  const { profile, updateProfile } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [choice, setChoice] = useState<ActiveMode | null>(null);
  const [terms, setTerms] = useState(Boolean(profile?.accepted_terms_at));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const needsTerms = !profile?.accepted_terms_at;

  async function finish() {
    if (!choice) return setError('Choose an option to continue.');
    if (needsTerms && !terms) return setError('Please accept the Terms of Service and Privacy Policy.');
    setError(null);
    setSaving(true);
    const { error } = await updateProfile({
      active_mode: choice,
      is_owner: choice === 'owner' || Boolean(profile?.is_owner),
      is_promoter: choice === 'promoter' || Boolean(profile?.is_promoter),
      onboarded: true,
      ...(needsTerms ? { accepted_terms_at: new Date().toISOString() } : {}),
    });
    setSaving(false);
    if (error) return setError(error);

    if (from && from !== '/onboarding') navigate(from, { replace: true });
    else if (choice === 'owner') navigate('/dashboard/listings/new', { replace: true });
    else if (choice === 'promoter') navigate('/dashboard', { replace: true });
    else navigate('/cars', { replace: true });
  }

  return (
    <div className="container max-w-3xl py-12 sm:py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold">
          Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}! 👋
        </h1>
        <p className="mt-2 text-muted-foreground">How do you want to use AutoPromo? You can switch anytime from the menu.</p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {OPTIONS.map(({ mode, icon: Icon, title, text }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setChoice(mode)}
            className={cn(
              'flex flex-col items-start rounded-xl border-2 bg-card p-5 text-left transition-all hover:border-primary/50',
              choice === mode ? 'border-primary shadow-md ring-4 ring-primary/10' : 'border-border',
            )}
          >
            <div className={cn('mb-4 flex size-11 items-center justify-center rounded-lg', choice === mode ? 'bg-primary text-white' : 'bg-accent text-primary')}>
              <Icon className="size-5" />
            </div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </button>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-md space-y-4">
        {needsTerms && (
          <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
            <Checkbox checked={terms} onChange={(e) => setTerms(e.target.checked)} />
            <span>
              I agree to the <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">Terms of Service</Link> and{' '}
              <Link to="/privacy" target="_blank" className="font-medium text-primary hover:underline">Privacy Policy</Link>.
            </span>
          </label>
        )}
        {error && <Alert variant="error">{error}</Alert>}
        <Button size="lg" className="w-full" onClick={finish} loading={saving} disabled={!choice}>
          Continue
        </Button>
      </div>
    </div>
  );
}
