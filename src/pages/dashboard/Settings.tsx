import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { US_STATES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Alert, Avatar, Card } from '@/components/ui/misc';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Settings() {
  useDocumentTitle('Account settings');
  const { user, profile, updateProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [city, setCity] = useState(profile?.city ?? '');
  const [state, setState] = useState(profile?.state ?? '');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('profile_contacts')
      .select('phone')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => setPhone((data?.phone as string | null) ?? ''));
  }, [user]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (name.trim().length < 2) return setError('Enter your full name.');
    const cleanPhone = phone.trim();
    if (cleanPhone && !/^\+?[0-9 ()\-.]{7,20}$/.test(cleanPhone)) return setError('Enter a valid phone number, e.g. (512) 555-0100.');
    setError(null);
    setSaving(true);
    const { error: pErr } = await updateProfile({ full_name: name.trim(), city: city.trim() || null, state: state || null });
    const { error: cErr } = await supabase.from('profile_contacts').upsert({ user_id: user.id, phone: cleanPhone || null });
    setSaving(false);
    if (pErr || cErr) setError(pErr ?? cErr?.message ?? 'Could not save.');
    else toast.success('Settings saved');
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Account settings</h1>
        <p className="text-muted-foreground">Your public name and private contact details.</p>
      </div>
      <Card className="p-6">
        <form onSubmit={save} className="space-y-5">
          <div className="flex items-center gap-4">
            <Avatar name={name || user?.email} src={profile?.avatar_url} className="size-14 text-lg" />
            <div className="text-sm">
              <p className="font-medium">{user?.email}</p>
              <p className="text-muted-foreground">Your email is never shown publicly.</p>
            </div>
          </div>
          <Field label="Full name" htmlFor="s-name" hint="Shown on your listings and in messages.">
            <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="City" htmlFor="s-city">
              <Input id="s-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label="State" htmlFor="s-state">
              <Select id="s-state" value={state} onChange={(e) => setState(e.target.value)}>
                <option value="">—</option>
                {Object.entries(US_STATES).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Phone number" htmlFor="s-phone">
            <Input id="s-phone" type="tel" placeholder="(512) 555-0100" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5" /> Private. Only shared with the other person after a visit is confirmed.
            </p>
          </Field>
          {error && <Alert variant="error">{error}</Alert>}
          <Button type="submit" loading={saving}>Save changes</Button>
        </form>
      </Card>
    </div>
  );
}
