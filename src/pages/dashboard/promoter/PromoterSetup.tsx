import { useState } from 'react';
import { BadgeDollarSign, CheckCircle2, Link2, MousePointerClick, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { PROMOTER_AGREEMENT } from '@/lib/promotions';
import { LEGAL_DISCLAIMER } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Alert, Card, Checkbox } from '@/components/ui/misc';

/** Shown the first time someone opens the promoter area. */
export default function PromoterSetup() {
  const { updateProfile } = useAuth();
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!agree) return setError('Please read and accept the Promoter Agreement.');
    setSaving(true);
    const { error } = await updateProfile({ is_promoter: true, active_mode: 'promoter', promoter_agreement_at: new Date().toISOString() });
    setSaving(false);
    if (error) setError(error);
    else toast.success("You're a promoter now! Find your first car to promote.");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="rounded-2xl bg-navy p-6 text-white sm:p-8">
        <BadgeDollarSign className="size-9 text-blue-400" />
        <h1 className="mt-4 text-2xl font-bold">Become an AutoPromo Promoter</h1>
        <p className="mt-2 text-slate-300">Earn a referral fee every time someone you send buys the car. No inventory, no upfront cost.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Link2, t: 'Get a personal link', d: 'One link per car you promote.' },
            { icon: Share2, t: 'Share it anywhere', d: 'Groups, stories, WhatsApp, flyers.' },
            { icon: MousePointerClick, t: 'Track every click', d: 'See who your link brought in.' },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t} className="rounded-xl bg-white/5 p-4">
              <Icon className="size-5 text-blue-300" />
              <p className="mt-2 text-sm font-semibold">{t}</p>
              <p className="text-xs text-slate-400">{d}</p>
            </div>
          ))}
        </div>
      </div>

      <Card className="p-6">
        <h2 className="font-semibold">Promoter Agreement</h2>
        <p className="mt-1 text-sm text-muted-foreground">{LEGAL_DISCLAIMER}</p>
        <ul className="mt-4 space-y-3">
          {PROMOTER_AGREEMENT.map((item) => (
            <li key={item} className="flex gap-2.5 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">Placeholder agreement — must be reviewed by a licensed U.S. attorney before launch.</p>
        <label className="mt-5 flex items-start gap-2.5 rounded-lg border p-4 text-sm">
          <Checkbox checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>I have read and agree to the Promoter Agreement and the Terms of Service.</span>
        </label>
        {error && <Alert variant="error" className="mt-4">{error}</Alert>}
        <Button size="lg" className="mt-5 w-full" onClick={accept} loading={saving} disabled={!agree}>
          Start promoting
        </Button>
      </Card>
    </div>
  );
}
