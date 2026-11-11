import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Calculator, Copy, ExternalLink, FileSearch, ShieldAlert, ShieldCheck } from 'lucide-react';
import { revealVin } from '@/lib/cars';
import { cn, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/* -------------------------------------------------------------------------- */
/* Payment estimator                                                          */
/* -------------------------------------------------------------------------- */

export const DEFAULT_APR = 9.9; // typical used-car APR for good credit
export const DEFAULT_TERM = 60;

/** Standard amortized monthly payment. */
export function monthlyPayment(principal: number, aprPercent: number, months: number) {
  if (principal <= 0 || months <= 0) return 0;
  const r = aprPercent / 100 / 12;
  if (r === 0) return principal / months;
  return (principal * r) / (1 - Math.pow(1 + r, -months));
}

/** "est. $289/mo" with 10% down, default APR and term. */
export function estimatedMonthly(price: number) {
  return Math.round(monthlyPayment(price * 0.9, DEFAULT_APR, DEFAULT_TERM));
}

const TERMS = [36, 48, 60, 72];

export function PaymentEstimator({ price }: { price: number }) {
  const [down, setDown] = useState(Math.round((price * 0.1) / 100) * 100);
  const [apr, setApr] = useState(DEFAULT_APR);
  const [term, setTerm] = useState(DEFAULT_TERM);

  const monthly = useMemo(() => monthlyPayment(Math.max(0, price - down), apr, term), [price, down, apr, term]);
  const totalInterest = Math.max(0, monthly * term - Math.max(0, price - down));

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Calculator className="size-5 text-primary" /> Payment estimate</h2>
      <p className="mt-3 text-3xl font-extrabold text-navy">
        {formatPrice(Math.round(monthly))}<span className="text-base font-medium text-muted-foreground">/mo</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {formatPrice(Math.max(0, price - down))} financed · {formatPrice(Math.round(totalInterest))} total interest
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Down payment</span>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <input
              type="number"
              min={0}
              max={price}
              step={100}
              value={down}
              onChange={(e) => setDown(Math.min(price, Math.max(0, Number(e.target.value) || 0)))}
              className="h-10 w-full rounded-md border border-input bg-background pl-7 pr-3 text-sm"
            />
          </div>
        </label>
        <label className="block text-sm">
          <span className="font-medium">Interest rate (APR)</span>
          <div className="relative mt-1">
            <input
              type="number"
              min={0}
              max={36}
              step={0.1}
              value={apr}
              onChange={(e) => setApr(Math.min(36, Math.max(0, Number(e.target.value) || 0)))}
              className="h-10 w-full rounded-md border border-input bg-background pl-3 pr-8 text-sm"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
          </div>
        </label>
      </div>
      <div className="mt-4">
        <p className="text-sm font-medium">Loan term</p>
        <div className="mt-1 grid grid-cols-4 gap-2">
          {TERMS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTerm(t)}
              className={cn('h-9 rounded-md border text-sm font-medium', t === term ? 'border-primary bg-accent text-primary' : 'hover:bg-secondary')}
            >
              {t} mo
            </button>
          ))}
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
        Estimate only, not a loan offer. Your rate depends on your credit and lender. Taxes, title and registration fees are not
        included. Private-party auto loans are available from many banks and credit unions.
      </p>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Vehicle history (VIN)                                                      */
/* -------------------------------------------------------------------------- */

export function VehicleHistory({ carId, vinLast6, signedIn, from }: { carId: string; vinLast6: string | null; signedIn: boolean; from: string }) {
  const navigate = useNavigate();
  const [vin, setVin] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    if (!signedIn) {
      navigate('/login', { state: { from } });
      return;
    }
    setLoading(true);
    try {
      const v = await revealVin(carId);
      if (!v) toast.info('The owner has not added the VIN yet. Ask for it in the chat.');
      setVin(v);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (!vin) return;
    await navigator.clipboard.writeText(vin).catch(() => undefined);
    toast.success('VIN copied');
  }

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-bold"><FileSearch className="size-5 text-primary" /> Vehicle history</h2>
      {!vinLast6 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The owner hasn't added the VIN. Ask for it in the chat before you visit — every honest seller will share it.
        </p>
      ) : vin ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-secondary px-3 py-2">
            <code className="flex-1 font-mono text-sm font-semibold tracking-wider">{vin}</code>
            <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy VIN"><Copy /></Button>
          </div>
          <div className="mt-3 grid gap-2">
            <HistoryLink
              href="https://www.nicb.org/vincheck"
              title="Theft & total-loss check"
              text="Free from NICB — paste the VIN on their site."
            />
            <HistoryLink
              href={`https://www.nhtsa.gov/recalls?vin=${vin}`}
              title="Open safety recalls"
              text="Free from NHTSA (U.S. Department of Transportation)."
            />
            <HistoryLink
              href="https://vehiclehistory.bja.ojp.gov/"
              title="Full title history (NMVTIS)"
              text="Low-cost reports from approved providers: title brands, odometer, salvage."
            />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Make sure the VIN on the car (dashboard and door) matches the title.</p>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Check for theft records, total-loss history and open recalls before you buy. VIN ending in{' '}
            <span className="font-mono font-semibold text-foreground">{vinLast6}</span>.
          </p>
          <Button className="mt-3 w-full" variant="outline" onClick={reveal} loading={loading}>
            <FileSearch /> {signedIn ? 'Show full VIN & free checks' : 'Sign in to see the full VIN'}
          </Button>
        </>
      )}
    </section>
  );
}

function HistoryLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-secondary">
      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" />
      <span className="flex-1">
        <span className="font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{text}</span>
      </span>
      <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Safety tips                                                                */
/* -------------------------------------------------------------------------- */

const TIPS = [
  'Meet in a public, well-lit place — many police stations have a "safe exchange zone".',
  'Inspect the car in daylight and take a test drive. Consider a pre-purchase inspection by a mechanic.',
  'Check that the name on the title matches the seller\'s photo ID and the VIN matches the car.',
  'Never pay a deposit, wire money, or send gift cards before seeing the car. Be wary of "shipping only" offers.',
  'Pay with a cashier\'s check at the seller\'s bank or a traceable payment, and get a signed bill of sale.',
];

export function SafetyTips({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <ShieldAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          <strong>Stay safe:</strong> meet in a public place, inspect the car and verify the title matches the seller's ID before
          paying. Never send deposits or wire money in advance.
        </p>
      </div>
    );
  }
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldAlert className="size-5" /> Buying safely</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {TIPS.map((t) => (
          <li key={t} className="flex gap-2">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-600" />
            {t}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Words that often show up in car-sale scams. Used to warn the buyer in chat. */
export const SCAM_PATTERN = /\b(wire|western union|moneygram|gift ?cards?|zelle|cash ?app|venmo|crypto|bitcoin|deposit|shipping|shipped|escrow|ebay motors|out of the country|deployed|military)\b/i;
