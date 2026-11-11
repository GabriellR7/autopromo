import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, Info, Loader2, MapPin } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlatformSettings } from '@/hooks/usePlatformSettings';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  createListing, fetchMyListing, friendlyDbError, saveVin, updateListing, type CarInput,
} from '@/lib/listings';
import { lookupZip } from '@/lib/zip';
import { BODY_TYPES, FUEL_TYPES, LEGAL_DISCLAIMER, POPULAR_MAKES, STATUS_LABELS, TRANSMISSIONS, US_STATES, labelFor } from '@/lib/constants';
import type { BodyType, Car, CarPhoto, CommissionType, FuelType, Transmission } from '@/lib/types';
import { carPath, carTitle, cn, commissionAmount, formatMiles, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Alert, Card, Checkbox, PageLoader } from '@/components/ui/misc';
import { PhotoManager } from '@/components/cars/PhotoManager';

const STEPS = ['Vehicle', 'Photos', 'Price & fee', 'Location & details', 'Review'];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear + 2 - 1950 }, (_, i) => currentYear + 1 - i);

interface FormState {
  make: string;
  makeOther: string;
  model: string;
  year: string;
  trim_level: string;
  mileage: string;
  vin: string;
  exterior_color: string;
  transmission: Transmission;
  fuel_type: FuelType;
  body_type: BodyType;
  price: string;
  commission_type: CommissionType;
  commission_value: string;
  allow_any_verified_promoter: boolean;
  zip: string;
  city: string;
  state: string;
  lat: number | null;
  lng: number | null;
  description: string;
}

const EMPTY: FormState = {
  make: '', makeOther: '', model: '', year: '', trim_level: '', mileage: '', vin: '', exterior_color: '',
  transmission: 'automatic', fuel_type: 'gasoline', body_type: 'sedan', price: '', commission_type: 'fixed',
  commission_value: '', allow_any_verified_promoter: false, zip: '', city: '', state: '', lat: null, lng: null,
  description: '',
};

function formFromCar(car: Car, vin: string): FormState {
  const known = POPULAR_MAKES.includes(car.make);
  return {
    make: known ? car.make : 'other',
    makeOther: known ? '' : car.make,
    model: car.model,
    year: String(car.year),
    trim_level: car.trim_level ?? '',
    mileage: String(car.mileage),
    vin,
    exterior_color: car.exterior_color ?? '',
    transmission: car.transmission,
    fuel_type: car.fuel_type,
    body_type: car.body_type,
    price: car.price ? String(car.price) : '',
    commission_type: car.commission_type,
    commission_value: String(Number(car.commission_value)),
    allow_any_verified_promoter: car.allow_any_verified_promoter,
    zip: car.zip ?? '',
    city: car.city ?? '',
    state: car.state ?? '',
    lat: car.lat,
    lng: car.lng,
    description: car.description ?? '',
  };
}

export default function ListingWizard() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  useDocumentTitle(isEdit ? 'Edit listing' : 'List your car');
  const navigate = useNavigate();
  const { user } = useAuth();
  const settings = usePlatformSettings();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [car, setCar] = useState<Car | null>(null);
  const [photos, setPhotos] = useState<CarPhoto[]>([]);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [zipLoading, setZipLoading] = useState(false);

  // Load existing listing (edit mode)
  useEffect(() => {
    if (!id) return;
    fetchMyListing(id)
      .then(({ car, vin, photos }) => {
        if (!car || car.owner_id !== user?.id) {
          toast.error('Listing not found.');
          navigate('/dashboard/listings', { replace: true });
          return;
        }
        setCar(car);
        setForm(formFromCar(car, vin));
        setPhotos(photos);
      })
      .catch((e: Error) => setServerError(e.message))
      .finally(() => setLoading(false));
  }, [id, user?.id, navigate]);

  // Default commission from platform settings (new listings only)
  useEffect(() => {
    if (!isEdit && !form.commission_value) {
      setForm((f) => ({
        ...f,
        commission_type: settings.default_commission_type,
        commission_value: String(settings.default_commission_value),
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, isEdit]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const bind = (key: keyof FormState) => ({
    value: form[key] as string,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as never),
  });

  const make = form.make === 'other' ? form.makeOther.trim() : form.make;
  const price = Number(form.price) || 0;
  const commission = useMemo(
    () => commissionAmount({ commission_type: form.commission_type, commission_value: Number(form.commission_value) || 0, price }),
    [form.commission_type, form.commission_value, price],
  );
  const stateEnabled = !form.state || settings.enabled_states.includes(form.state);

  /* ---------------- Validation per step ---------------- */
  function validate(s: number): boolean {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (s === 0) {
      if (!make) e[form.make === 'other' ? 'makeOther' : 'make'] = 'Select the make.';
      if (!form.model.trim()) e.model = 'Enter the model.';
      if (!form.year) e.year = 'Select the year.';
      if (form.mileage === '' || Number(form.mileage) < 0) e.mileage = 'Enter the mileage.';
      if (form.vin && !/^[A-HJ-NPR-Z0-9]{17}$/i.test(form.vin.trim())) e.vin = 'VIN must be 17 characters (no I, O or Q).';
    }
    if (s === 2) {
      if (price < 500) e.price = 'Enter a price of at least $500.';
      const cv = Number(form.commission_value);
      if (form.commission_value === '' || cv < 0) e.commission_value = 'Enter the referral fee.';
      else if (form.commission_type === 'percent' && cv > 20) e.commission_value = 'Maximum is 20%.';
      else if (form.commission_type === 'fixed' && price && cv >= price) e.commission_value = 'Fee must be less than the price.';
    }
    if (s === 3) {
      if (!/^\d{5}$/.test(form.zip) || form.lat == null) e.zip = 'Enter a valid ZIP code.';
      else if (!stateEnabled) e.zip = `AutoPromo isn't available in ${US_STATES[form.state] ?? form.state} yet.`;
      if (form.description.length > 5000) e.description = 'Maximum 5,000 characters.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function payload(s: number): CarInput {
    if (s === 0) {
      return {
        make,
        model: form.model.trim(),
        year: Number(form.year),
        trim_level: form.trim_level.trim() || null,
        mileage: Number(form.mileage),
        exterior_color: form.exterior_color.trim() || null,
        transmission: form.transmission,
        fuel_type: form.fuel_type,
        body_type: form.body_type,
      };
    }
    if (s === 2) {
      return {
        price,
        commission_type: form.commission_type,
        commission_value: Number(form.commission_value),
        allow_any_verified_promoter: form.allow_any_verified_promoter,
      };
    }
    if (s === 3) {
      return {
        zip: form.zip,
        city: form.city,
        state: form.state,
        lat: form.lat,
        lng: form.lng,
        description: form.description.trim() || null,
      };
    }
    return {};
  }

  /** Saves the current step. Returns the (possibly new) car or null on error. */
  async function saveStep(s: number): Promise<Car | null> {
    if (!user) return null;
    if (!validate(s)) return null;
    setServerError(null);
    setSaving(true);
    try {
      let saved = car;
      if (s === 0) {
        saved = car ? await updateListing(car.id, payload(0)) : await createListing(user.id, {
          ...payload(0),
          commission_type: settings.default_commission_type,
          commission_value: settings.default_commission_value,
        });
        await saveVin(saved.id, form.vin);
        if (!car && !isEdit) window.history.replaceState(null, '', `/dashboard/listings/${saved.id}/edit`);
      } else if (s === 2 || s === 3) {
        saved = await updateListing(car!.id, payload(s));
      }
      setCar(saved);
      return saved;
    } catch (e) {
      setServerError(friendlyDbError((e as Error).message));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    const saved = await saveStep(step);
    if (saved || step === 1) {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  async function goTo(target: number) {
    if (target === step) return;
    if (!car && target > 0) return; // need a draft first
    if (target > step) {
      const saved = await saveStep(step);
      if (!saved && step !== 1) return;
    }
    setStep(target);
  }

  async function lookup(zip: string) {
    set('zip', zip);
    if (!/^\d{5}$/.test(zip)) {
      setForm((f) => ({ ...f, city: '', state: '', lat: null, lng: null }));
      return;
    }
    setZipLoading(true);
    const loc = await lookupZip(zip);
    setZipLoading(false);
    if (!loc) {
      setErrors((e) => ({ ...e, zip: "We couldn't find that ZIP code." }));
      setForm((f) => ({ ...f, city: '', state: '', lat: null, lng: null }));
      return;
    }
    setForm((f) => ({ ...f, city: loc.city, state: loc.state, lat: loc.lat, lng: loc.lng }));
  }

  async function finish(publish: boolean) {
    if (!car) return;
    // Make sure every step is valid before publishing.
    for (const s of [0, 2, 3]) {
      if (!validate(s)) {
        setStep(s);
        return;
      }
    }
    setSaving(true);
    setServerError(null);
    try {
      const updated = await updateListing(car.id, {
        ...payload(0),
        ...payload(2),
        ...payload(3),
        ...(publish ? { status: 'active' as const } : {}),
      });
      await saveVin(car.id, form.vin);
      toast.success(publish ? 'Your car is live! 🎉' : 'Changes saved');
      navigate(publish ? carPath(updated) : '/dashboard/listings');
    } catch (e) {
      setServerError(friendlyDbError((e as Error).message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoader />;

  const isLive = car && car.status !== 'draft';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/dashboard/listings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> My listings
        </Link>
        <h1 className="mt-2 text-2xl font-bold">{isEdit || car ? 'Edit listing' : 'List your car'}</h1>
        {car && (
          <p className="text-sm text-muted-foreground">
            {carTitle(car)} · <span className="font-medium">{STATUS_LABELS[car.status]}</span>
          </p>
        )}
      </div>

      {/* Stepper */}
      <ol className="scrollbar-none flex gap-2 overflow-x-auto">
        {STEPS.map((label, i) => {
          const done = i < step;
          const clickable = Boolean(car) || i === 0;
          return (
            <li key={label} className="shrink-0">
              <button
                type="button"
                onClick={() => clickable && goTo(i)}
                disabled={!clickable || saving}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  i === step ? 'border-primary bg-accent text-primary' : 'text-muted-foreground',
                  clickable && i !== step && 'hover:bg-secondary',
                )}
              >
                <span className={cn('flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
                  i === step ? 'bg-primary text-white' : done ? 'bg-success text-white' : 'bg-secondary')}>
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          );
        })}
      </ol>

      {serverError && <Alert variant="error">{serverError}</Alert>}

      <Card className="p-5 sm:p-7">
        {/* STEP 0 — Vehicle */}
        {step === 0 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make *" htmlFor="make" error={errors.make}>
              <Select id="make" {...bind('make')}>
                <option value="">Select make</option>
                {POPULAR_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
                <option value="other">Other…</option>
              </Select>
            </Field>
            {form.make === 'other' ? (
              <Field label="Make name *" htmlFor="makeOther" error={errors.makeOther}>
                <Input id="makeOther" placeholder="e.g. Alfa Romeo" {...bind('makeOther')} />
              </Field>
            ) : (
              <Field label="Model *" htmlFor="model" error={errors.model}>
                <Input id="model" placeholder="e.g. Camry" {...bind('model')} />
              </Field>
            )}
            {form.make === 'other' && (
              <Field label="Model *" htmlFor="model2" error={errors.model}>
                <Input id="model2" {...bind('model')} />
              </Field>
            )}
            <Field label="Year *" htmlFor="year" error={errors.year}>
              <Select id="year" {...bind('year')}>
                <option value="">Select year</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </Select>
            </Field>
            <Field label="Trim" htmlFor="trim" hint="e.g. EX, XLT, Limited">
              <Input id="trim" {...bind('trim_level')} />
            </Field>
            <Field label="Mileage *" htmlFor="mileage" error={errors.mileage}>
              <div className="relative">
                <Input id="mileage" inputMode="numeric" value={form.mileage}
                  onChange={(e) => set('mileage', e.target.value.replace(/\D/g, '').slice(0, 7))} className="pr-10" />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">mi</span>
              </div>
            </Field>
            <Field label="VIN" htmlFor="vin" error={errors.vin} hint="Only the last 6 characters are shown publicly.">
              <Input id="vin" maxLength={17} className="font-mono uppercase" value={form.vin}
                onChange={(e) => set('vin', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
            </Field>
            <Field label="Exterior color" htmlFor="color">
              <Input id="color" placeholder="e.g. Silver" {...bind('exterior_color')} />
            </Field>
            <Field label="Body type" htmlFor="body">
              <Select id="body" {...bind('body_type')}>
                {BODY_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Transmission" htmlFor="transmission">
              <Select id="transmission" {...bind('transmission')}>
                {TRANSMISSIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
            <Field label="Fuel type" htmlFor="fuel">
              <Select id="fuel" {...bind('fuel_type')}>
                {FUEL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          </div>
        )}

        {/* STEP 1 — Photos */}
        {step === 1 && car && user && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Add photos</h2>
              <p className="text-sm text-muted-foreground">
                Listings with 8+ clear photos get far more interest. Include front, back, both sides, interior, dashboard
                (showing mileage) and any damage.
              </p>
            </div>
            <PhotoManager ownerId={user.id} carId={car.id} photos={photos} onChange={setPhotos} />
            {photos.length === 0 && (
              <Alert>You can continue without photos and add them later, but you'll need at least one before buyers take your listing seriously.</Alert>
            )}
          </div>
        )}

        {/* STEP 2 — Price & referral fee */}
        {step === 2 && (
          <div className="space-y-6">
            <Field label="Asking price *" htmlFor="price" error={errors.price}>
              <div className="relative max-w-xs">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>
                <Input id="price" inputMode="numeric" className="pl-7 text-lg font-semibold" value={form.price}
                  onChange={(e) => set('price', e.target.value.replace(/\D/g, '').slice(0, 7))} />
              </div>
            </Field>

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold">Promoter referral fee</h3>
                <p className="text-sm text-muted-foreground">
                  What you'll pay a promoter only if the buyer they referred buys your car. A higher fee attracts more
                  promoters.
                </p>
              </div>
              <div className="inline-flex rounded-lg border p-1">
                {(['fixed', 'percent'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set('commission_type', t)}
                    className={cn('rounded-md px-4 py-1.5 text-sm font-medium', form.commission_type === t ? 'bg-navy text-white' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {t === 'fixed' ? 'Fixed amount ($)' : 'Percentage (%)'}
                  </button>
                ))}
              </div>
              <Field label={form.commission_type === 'fixed' ? 'Fee amount' : 'Fee percentage'} htmlFor="commission" error={errors.commission_value}>
                <div className="relative max-w-xs">
                  {form.commission_type === 'fixed' && <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">$</span>}
                  <Input id="commission" inputMode="decimal" className={form.commission_type === 'fixed' ? 'pl-7' : 'pr-8'} value={form.commission_value}
                    onChange={(e) => set('commission_value', e.target.value.replace(/[^\d.]/g, '').slice(0, 8))} />
                  {form.commission_type === 'percent' && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>}
                </div>
              </Field>
              {price > 0 && commission > 0 && (
                <p className="flex items-center gap-2 text-sm">
                  <Info className="size-4 text-primary" />
                  A promoter would earn about <strong>{formatPrice(commission)}</strong> if they bring your buyer at {formatPrice(price)}.
                </p>
              )}
              <label className="flex items-start gap-2.5 rounded-lg border p-4 text-sm">
                <Checkbox checked={form.allow_any_verified_promoter} onChange={(e) => set('allow_any_verified_promoter', e.target.checked)} />
                <span>
                  <strong>Allow any verified promoter</strong>
                  <span className="block text-muted-foreground">Verified promoters can start sharing your car right away, without waiting for your approval.</span>
                </span>
              </label>
            </div>
          </div>
        )}

        {/* STEP 3 — Location & description */}
        {step === 3 && (
          <div className="space-y-5">
            <Field label="ZIP code where the car is located *" htmlFor="zip" error={errors.zip}
              hint="Only your city and ZIP are shown — never your street address.">
              <div className="flex max-w-md items-center gap-3">
                <Input id="zip" inputMode="numeric" maxLength={5} className="w-32" value={form.zip}
                  onChange={(e) => lookup(e.target.value.replace(/\D/g, ''))} />
                {zipLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {form.city && !zipLoading && (
                  <span className={cn('flex items-center gap-1 text-sm font-medium', stateEnabled ? 'text-success' : 'text-destructive')}>
                    <MapPin className="size-4" /> {form.city}, {form.state}
                  </span>
                )}
              </div>
            </Field>
            {!stateEnabled && (
              <Alert variant="error">
                We're currently live in {settings.enabled_states.map((s) => US_STATES[s] ?? s).join(', ')} only. You can save your
                listing as a draft and publish it once we open in {US_STATES[form.state] ?? form.state}.
              </Alert>
            )}
            <Field label="Description" htmlFor="description" error={errors.description}
              hint={`${form.description.length.toLocaleString('en-US')} / 5,000 · Mention condition, service history, title status, accidents and extras.`}>
              <Textarea id="description" rows={8} maxLength={5000} {...bind('description')}
                placeholder="One owner, clean title in hand, regular oil changes, new tires last year…" />
            </Field>
          </div>
        )}

        {/* STEP 4 — Review */}
        {step === 4 && car && (
          <div className="space-y-5">
            <div className="flex gap-4">
              {photos[0] ? (
                <img src={photos[0].url} alt="" className="h-24 w-32 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">No photos</div>
              )}
              <div>
                <h2 className="text-lg font-semibold">{form.year} {make} {form.model} {form.trim_level}</h2>
                <p className="text-2xl font-bold text-navy">{formatPrice(price)}</p>
                <p className="text-sm text-muted-foreground">{form.city}, {form.state} {form.zip}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border p-4 text-sm sm:grid-cols-3">
              <Item label="Mileage" value={formatMiles(Number(form.mileage))} />
              <Item label="Transmission" value={labelFor(TRANSMISSIONS, form.transmission)} />
              <Item label="Fuel" value={labelFor(FUEL_TYPES, form.fuel_type)} />
              <Item label="Body" value={labelFor(BODY_TYPES, form.body_type)} />
              <Item label="Color" value={form.exterior_color || '—'} />
              <Item label="VIN" value={form.vin ? `•••${form.vin.slice(-6)}` : 'Not provided'} />
              <Item label="Photos" value={String(photos.length)} />
              <Item label="Referral fee" value={form.commission_type === 'fixed' ? formatPrice(Number(form.commission_value)) : `${form.commission_value}% (~${formatPrice(commission)})`} />
              <Item label="Auto-approve promoters" value={form.allow_any_verified_promoter ? 'Yes' : 'No'} />
            </dl>
            {photos.length === 0 && <Alert>Tip: listings without photos rarely sell. Go back to step 2 to add some.</Alert>}
            <p className="rounded-lg bg-secondary/60 p-3 text-xs leading-relaxed text-muted-foreground">
              By publishing, you confirm you are the legal owner of this vehicle (or authorized to sell it) and that the
              information is accurate. {LEGAL_DISCLAIMER}
            </p>
          </div>
        )}
      </Card>

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || saving}>
          <ArrowLeft /> Back
        </Button>
        <div className="flex flex-wrap gap-2">
          {car && step < 4 && (
            <Button
              variant="outline"
              disabled={saving}
              onClick={async () => {
                const ok = step === 1 || (await saveStep(step));
                if (ok) {
                  toast.success(isLive ? 'Changes saved' : 'Draft saved');
                  navigate('/dashboard/listings');
                }
              }}
            >
              {isLive ? 'Save & exit' : 'Save draft & exit'}
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={next} loading={saving}>
              {step === 0 && !car ? 'Save & continue' : 'Continue'} <ArrowRight />
            </Button>
          ) : isLive ? (
            <Button onClick={() => finish(false)} loading={saving}>Save changes</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => finish(false)} disabled={saving}>Save as draft</Button>
              <Button onClick={() => finish(true)} loading={saving} disabled={!stateEnabled}>Publish listing</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
