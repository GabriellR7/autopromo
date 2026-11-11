import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BadgeCheck, Ban, Check, Flag, Receipt, Scale, Search, Shield, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  adminCommissions, adminDisputes, adminReports, adminResolveDispute, adminResolveReport, adminSetCommissionStatus,
  adminUpdateUser, adminUsers, fetchSettings, saveSettings,
  type AdminCommission, type AdminDispute, type AdminReport, type AdminUser,
} from '@/lib/admin';
import { DISPUTE_LABEL, cents, estimateCommissionCents, type CommissionStatus, type DisputeStatus } from '@/lib/sales';
import { REPORT_REASONS } from '@/lib/community';
import { US_STATES } from '@/lib/constants';
import type { CommissionType, PlatformSettings, PromoterLevel } from '@/lib/types';
import { cn, formatDate, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Alert, Avatar, Badge, Card, Checkbox, EmptyState, Skeleton } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

function Pills<T extends string>({ options, value, onChange, label }: { options: T[]; value: T; onChange: (v: T) => void; label: (v: T) => string }) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto">
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)}
          className={cn('shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium', value === o ? 'border-navy bg-navy text-white' : 'hover:bg-secondary')}>
          {label(o)}
        </button>
      ))}
    </div>
  );
}

/* =============================== Users =============================== */
export function AdminUsers() {
  useDocumentTitle('Admin · Users');
  const { user: me } = useAuth();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setUsers(await adminUsers(query));
    } catch (e) {
      setError((e as Error).message);
      setUsers([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function update(u: AdminUser, patch: Parameters<typeof adminUpdateUser>[1], confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    try {
      await adminUpdateUser(u.id, patch);
      toast.success('User updated');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-muted-foreground">Verify promoters, suspend bad actors, manage admins.</p>
        </div>
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); setQuery(search); }} className="flex gap-2">
          <Input placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <Button type="submit" variant="outline" size="icon" aria-label="Search"><Search /></Button>
        </form>
      </div>
      {error && <Alert variant="error">{error}</Alert>}
      {users === null ? (
        <Skeleton className="h-40 w-full" />
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" />
      ) : (
        <Card className="divide-y">
          {users.map((u) => (
            <div key={u.id} className={cn('flex flex-wrap items-center gap-3 p-4', u.suspended && 'bg-destructive/5')}>
              <Avatar name={u.full_name ?? u.email} src={u.avatar_url} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {u.full_name ?? '—'}
                  {u.identity_verified && <BadgeCheck className="size-4 text-success" />}
                  {u.is_admin && <Badge variant="dark"><Shield />Admin</Badge>}
                  {u.suspended && <Badge variant="destructive">Suspended</Badge>}
                  {u.open_reports > 0 && <Badge variant="warning"><Flag />{u.open_reports}</Badge>}
                </p>
                <p className="truncate text-sm text-muted-foreground">{u.email}</p>
                <p className="text-xs text-muted-foreground">
                  {[u.is_owner && `${u.listings} listing(s)`, u.is_promoter && `promoter · ${u.promoter_level} · ${u.promotions} active`].filter(Boolean).join(' · ') || 'Buyer'}
                  {' · '}joined {formatDate(u.created_at)}{u.last_sign_in_at ? ` · last seen ${timeAgo(u.last_sign_in_at)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {u.is_promoter && (
                  <Select value={u.promoter_level} onChange={(e) => update(u, { promoter_level: e.target.value as PromoterLevel })} className="h-9 w-28" aria-label="Level">
                    <option value="bronze">Bronze</option>
                    <option value="silver">Silver</option>
                    <option value="gold">Gold</option>
                  </Select>
                )}
                <Button size="sm" variant="outline" onClick={() => update(u, { identity_verified: !u.identity_verified })}>
                  {u.identity_verified ? 'Unverify' : <><BadgeCheck /> Verify</>}
                </Button>
                {u.id !== me?.id && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => update(u, { is_admin: !u.is_admin }, u.is_admin ? `Remove admin from ${u.email}?` : `Make ${u.email} an admin? They will have full access.`)}>
                      {u.is_admin ? 'Remove admin' : 'Make admin'}
                    </Button>
                    <Button size="sm" variant="ghost" className={u.suspended ? '' : 'text-destructive hover:bg-destructive/10'}
                      onClick={() => update(u, { suspended: !u.suspended }, u.suspended ? undefined : `Suspend ${u.email}? Their listings will be paused and promotions stopped.`)}>
                      {u.suspended ? 'Unsuspend' : <><Ban /> Suspend</>}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* =============================== Disputes =============================== */
export function AdminDisputes() {
  useDocumentTitle('Admin · Disputes');
  const [status, setStatus] = useState<DisputeStatus | 'all'>('open');
  const [items, setItems] = useState<AdminDispute[] | null>(null);
  const [active, setActive] = useState<AdminDispute | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    try {
      setItems(await adminDisputes(status));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Disputes</h1>
        <p className="text-muted-foreground">A promoter believes they referred the buyer but wasn't credited. Check the evidence and decide.</p>
      </div>
      <Pills options={['open', 'resolved_promoter', 'resolved_owner', 'all'] as (DisputeStatus | 'all')[]} value={status} onChange={setStatus}
        label={(v) => (v === 'all' ? 'All' : v === 'open' ? 'Open' : DISPUTE_LABEL[v])} />
      {error && <Alert variant="error">{error}</Alert>}
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={Scale} title="No disputes" />
      ) : (
        <Card className="divide-y">
          {items.map((d) => (
            <div key={d.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  {d.car ? <Link to={`/cars/${d.car.public_id}`} target="_blank" className="hover:text-primary">{d.car.year} {d.car.make} {d.car.model}</Link> : 'Car'}
                  <span className="font-normal text-muted-foreground"> · owner {d.owner?.full_name ?? '—'} · promoter {d.promoter?.full_name ?? '—'}</span>
                </p>
                <Badge variant={d.status === 'open' ? 'warning' : 'secondary'}>{DISPUTE_LABEL[d.status]}</Badge>
              </div>
              <p>{d.reason}</p>
              <p className="text-xs text-muted-foreground">
                Opened by {d.opened_by} · {formatDate(d.created_at)} · evidence: {Object.entries(d.evidence).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') || 'none'}
                {d.sale && ` · sold for $${d.sale.sale_price.toLocaleString('en-US')}`}
              </p>
              {d.resolution_note && <p className="rounded-md bg-secondary/60 p-2 text-xs">Decision: {d.resolution_note}</p>}
              {d.status === 'open' && <Button size="sm" onClick={() => setActive(d)}>Decide</Button>}
            </div>
          ))}
        </Card>
      )}
      <DisputeDecision dispute={active} onClose={() => setActive(null)} onDone={load} />
    </div>
  );
}

function DisputeDecision({ dispute, onClose, onDone }: { dispute: AdminDispute | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<'promoter' | 'owner' | null>(null);
  const fee = dispute?.car && dispute.sale
    ? estimateCommissionCents(dispute.car.commission_type as CommissionType, Number(dispute.car.commission_value), dispute.sale.sale_price)
    : null;

  async function decide(decision: 'promoter' | 'owner') {
    if (!dispute) return;
    setSaving(decision);
    try {
      await adminResolveDispute(dispute.id, decision, note);
      toast.success(decision === 'promoter' ? 'Promoter credited — the owner will be asked to pay.' : 'Dispute closed with no commission.');
      setNote('');
      onDone();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={Boolean(dispute)} onClose={onClose} title="Resolve dispute"
      description="Look at the chat history and referral clicks before deciding. Both sides see your note.">
      <div className="space-y-4">
        {fee != null && <Alert>Crediting the promoter creates a commission of <strong>{cents(fee)}</strong> that the owner must pay.</Alert>}
        <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} placeholder="Explain the decision (required)." />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => decide('owner')} loading={saving === 'owner'} disabled={note.trim().length < 5 || Boolean(saving)}>Side with owner</Button>
          <Button onClick={() => decide('promoter')} loading={saving === 'promoter'} disabled={note.trim().length < 5 || Boolean(saving)}>Credit promoter</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* =============================== Reports =============================== */
export function AdminReports() {
  useDocumentTitle('Admin · Reports');
  const [status, setStatus] = useState<AdminReport['status']>('open');
  const [items, setItems] = useState<AdminReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    try {
      setItems(await adminReports(status));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function resolve(r: AdminReport, next: 'dismissed' | 'actioned') {
    const note = window.prompt(next === 'actioned' ? 'What action was taken? (optional)' : 'Why dismiss? (optional)') ?? undefined;
    try {
      await adminResolveReport(r.id, next, note);
      toast.success('Report updated');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const reasonLabel = (v: string) => REPORT_REASONS.find((r) => r.value === v)?.label ?? v;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Listings and users reported by the community. Remove listings in <Link to="/admin/listings" className="underline">Listings</Link> and suspend users in <Link to="/admin/users" className="underline">Users</Link>.</p>
      </div>
      <Pills options={['open', 'actioned', 'dismissed'] as AdminReport['status'][]} value={status} onChange={setStatus} label={(v) => v[0]!.toUpperCase() + v.slice(1)} />
      {error && <Alert variant="error">{error}</Alert>}
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={Flag} title="No reports" />
      ) : (
        <Card className="divide-y">
          {items.map((r) => (
            <div key={r.id} className="flex flex-wrap items-start gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-semibold">
                  <Badge variant="secondary" className="mr-2">{r.target_type === 'car' ? 'Listing' : 'User'}</Badge>
                  {r.target_type === 'car' && r.target_public_id
                    ? <Link to={`/cars/${r.target_public_id}`} target="_blank" className="hover:text-primary">{r.target_label}</Link>
                    : r.target_label}
                </p>
                <p><strong>{reasonLabel(r.reason)}</strong>{r.details ? ` — ${r.details}` : ''}</p>
                <p className="text-xs text-muted-foreground">By {r.reporter_name ?? '—'} ({r.reporter_email}) · {timeAgo(r.created_at)}</p>
                {r.admin_note && <p className="text-xs text-muted-foreground">Note: {r.admin_note}</p>}
              </div>
              {r.status === 'open' && (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resolve(r, 'actioned')}><Check /> Action taken</Button>
                  <Button size="sm" variant="outline" onClick={() => resolve(r, 'dismissed')}>Dismiss</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* =============================== Commissions =============================== */
export function AdminCommissions() {
  useDocumentTitle('Admin · Commissions');
  const [status, setStatus] = useState<CommissionStatus | 'all'>('all');
  const [items, setItems] = useState<AdminCommission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setItems(null);
    try {
      setItems(await adminCommissions(status));
    } catch (e) {
      setError((e as Error).message);
      setItems([]);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  async function setStatusFor(c: AdminCommission, next: CommissionStatus) {
    const msg = next === 'cancelled' ? 'Cancel this commission? The owner will no longer be asked to pay.' : 'Mark as paid outside Stripe (e.g. paid by check)?';
    if (!window.confirm(msg)) return;
    try {
      await adminSetCommissionStatus(c.id, next);
      toast.success('Commission updated');
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const totals = (items ?? []).reduce(
    (acc, c) => ({
      pending: acc.pending + (c.status === 'pending' ? c.amount_cents : 0),
      paid: acc.paid + (c.status === 'paid' ? c.amount_cents : 0),
      revenue: acc.revenue + (c.status === 'paid' ? c.platform_fee_cents : 0),
    }),
    { pending: 0, paid: 0, revenue: 0 },
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Commissions</h1>
        <p className="text-muted-foreground">Every referral fee on the platform. Payments are handled by Stripe.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Pending</p><p className="text-xl font-bold">{cents(totals.pending)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Paid</p><p className="text-xl font-bold">{cents(totals.paid)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Platform revenue</p><p className="text-xl font-bold text-success">{cents(totals.revenue)}</p></Card>
      </div>
      <Pills options={['all', 'pending', 'paid', 'cancelled'] as (CommissionStatus | 'all')[]} value={status} onChange={setStatus} label={(v) => v[0]!.toUpperCase() + v.slice(1)} />
      {error && <Alert variant="error">{error}</Alert>}
      {items === null ? (
        <Skeleton className="h-40 w-full" />
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} title="No commissions" />
      ) : (
        <Card className="divide-y">
          {items.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.car ? `${c.car.year} ${c.car.make} ${c.car.model}` : 'Car'}</p>
                <p className="text-muted-foreground">
                  {c.owner?.full_name ?? '—'} → {c.promoter?.full_name ?? '—'} · {formatDate(c.created_at)}{c.source === 'dispute' ? ' · from dispute' : ''}
                  {c.stripe_payment_intent_id ? ` · ${c.stripe_payment_intent_id}` : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold">{cents(c.amount_cents)}</p>
                <p className="text-xs text-muted-foreground">fee {cents(c.platform_fee_cents)}</p>
              </div>
              <Badge variant={c.status === 'paid' ? 'success' : c.status === 'pending' ? 'warning' : 'secondary'}>{c.status}</Badge>
              {c.status === 'pending' && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setStatusFor(c, 'paid')}>Mark paid</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStatusFor(c, 'cancelled')}>Cancel</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* =============================== Settings =============================== */
export function AdminSettings() {
  useDocumentTitle('Admin · Settings');
  const [s, setS] = useState<PlatformSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings().then((d) => setS({ ...d, platform_fee_percent: Number(d.platform_fee_percent), default_commission_value: Number(d.default_commission_value) }))
      .catch((e: Error) => setError(e.message));
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!s) return;
    if (s.enabled_states.length === 0) return setError('Enable at least one state.');
    setSaving(true);
    setError(null);
    try {
      await saveSettings({
        platform_fee_percent: s.platform_fee_percent,
        default_commission_type: s.default_commission_type,
        default_commission_value: s.default_commission_value,
        enabled_states: s.enabled_states,
        max_listings_per_user: s.max_listings_per_user,
        require_listing_approval: s.require_listing_approval,
      });
      toast.success('Settings saved');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!s) return error ? <Alert variant="error">{error}</Alert> : <Skeleton className="h-96 w-full" />;
  const toggleState = (code: string) =>
    setS({ ...s, enabled_states: s.enabled_states.includes(code) ? s.enabled_states.filter((c) => c !== code) : [...s.enabled_states, code].sort() });

  return (
    <form onSubmit={save} className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Platform settings</h1>
        <p className="text-muted-foreground">Changes apply immediately to new listings and sales.</p>
      </div>
      <Card className="grid gap-5 p-6 sm:grid-cols-2">
        <Field label="Platform fee (% of each commission)" htmlFor="fee">
          <Input id="fee" type="number" min={0} max={100} step="0.5" value={s.platform_fee_percent} onChange={(e) => setS({ ...s, platform_fee_percent: Number(e.target.value) })} />
        </Field>
        <Field label="Max open listings per user" htmlFor="max">
          <Input id="max" type="number" min={1} max={100} value={s.max_listings_per_user} onChange={(e) => setS({ ...s, max_listings_per_user: Number(e.target.value) })} />
        </Field>
        <Field label="Suggested referral fee type" htmlFor="ctype">
          <Select id="ctype" value={s.default_commission_type} onChange={(e) => setS({ ...s, default_commission_type: e.target.value as CommissionType })}>
            <option value="fixed">Fixed ($)</option>
            <option value="percent">Percentage (%)</option>
          </Select>
        </Field>
        <Field label="Suggested referral fee value" htmlFor="cval">
          <Input id="cval" type="number" min={0} step="0.5" value={s.default_commission_value} onChange={(e) => setS({ ...s, default_commission_value: Number(e.target.value) })} />
        </Field>
        <label className="flex items-start gap-2.5 rounded-lg border p-4 text-sm sm:col-span-2">
          <Checkbox checked={s.require_listing_approval} onChange={(e) => setS({ ...s, require_listing_approval: e.target.checked })} />
          <span>
            <strong>Require approval for new listings</strong>
            <span className="block text-muted-foreground">New listings wait in Admin → Listings until you approve them.</span>
          </span>
        </label>
      </Card>
      <Card className="space-y-3 p-6">
        <div>
          <h2 className="font-semibold">States where AutoPromo is live</h2>
          <p className="text-sm text-muted-foreground">Owners can only publish cars located in these states. Check with your lawyer before opening a new state.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {Object.entries(US_STATES).map(([code, name]) => (
            <label key={code} className={cn('flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm', s.enabled_states.includes(code) && 'border-primary bg-accent')}>
              <Checkbox checked={s.enabled_states.includes(code)} onChange={() => toggleState(code)} className="mt-0" />
              {name}
            </label>
          ))}
        </div>
      </Card>
      {error && <Alert variant="error">{error}</Alert>}
      <Button type="submit" loading={saving}>Save settings</Button>
    </form>
  );
}
