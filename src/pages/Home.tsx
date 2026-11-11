import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, BadgeDollarSign, Camera, Car, Handshake, MapPin, MessageSquare,
  Search, Share2, ShieldCheck, Star, Users,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchFeaturedCars } from '@/lib/cars';
import { POPULAR_MAKES, RADIUS_OPTIONS } from '@/lib/constants';
import type { CarWithPhotos } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { CarCard, CarCardSkeleton } from '@/components/cars/CarCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const PRICE_OPTIONS = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000];
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 25 }, (_, i) => currentYear + 1 - i);

export default function Home() {
  useDocumentTitle('Sell your car faster', 'List your car on AutoPromo — free for 30 days, then $10/month. Local promoters share it with their network and earn a referral fee only when it sells. Buy used cars directly from owners in Texas.');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [featured, setFeatured] = useState<CarWithPhotos[] | null>(null);
  const [form, setForm] = useState({ make: '', model: '', yearMin: '', priceMax: '', zip: '', radius: '50' });

  useEffect(() => {
    fetchFeaturedCars(8).then(setFeatured).catch(() => setFeatured([]));
  }, []);

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (form.make) p.set('make', form.make);
    if (form.model.trim()) p.set('model', form.model.trim());
    if (form.yearMin) p.set('yearMin', form.yearMin);
    if (form.priceMax) p.set('priceMax', form.priceMax);
    if (/^\d{5}$/.test(form.zip)) {
      p.set('zip', form.zip);
      p.set('radius', form.radius);
      p.set('sort', 'distance');
    }
    navigate(`/cars?${p.toString()}`);
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-navy">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.35),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(59,130,246,0.15),transparent_50%)]" />
        <div className="container relative pb-28 pt-16 sm:pt-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-blue-200">
              <MapPin className="size-3.5" /> Now live in Texas
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] text-white sm:text-5xl lg:text-6xl">
              Sell your car faster. <span className="text-blue-400">Let promoters find your buyer.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-slate-300">
              Try it free for 30 days, then just $10/month. Local promoters share your car with their network and
              earn a referral fee only when it sells — you close the deal directly with the buyer.
            </p>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="container relative -mt-16">
        <form onSubmit={onSearch} className="grid gap-3 rounded-2xl border bg-card p-4 shadow-xl sm:grid-cols-2 sm:p-5 lg:grid-cols-[1.1fr_1.1fr_0.8fr_0.9fr_0.8fr_0.7fr_auto]">
          <Select value={form.make} onChange={set('make')} aria-label="Make">
            <option value="">Any make</option>
            {POPULAR_MAKES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Input placeholder="Model (e.g. Camry)" value={form.model} onChange={set('model')} aria-label="Model" />
          <Select value={form.yearMin} onChange={set('yearMin')} aria-label="Minimum year">
            <option value="">Any year</option>
            {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}+</option>)}
          </Select>
          <Select value={form.priceMax} onChange={set('priceMax')} aria-label="Max price">
            <option value="">Any price</option>
            {PRICE_OPTIONS.map((p) => <option key={p} value={p}>Up to ${p.toLocaleString('en-US')}</option>)}
          </Select>
          <Input
            placeholder="ZIP code"
            inputMode="numeric"
            maxLength={5}
            value={form.zip}
            onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value.replace(/\D/g, '') }))}
            aria-label="ZIP code"
          />
          <Select value={form.radius} onChange={set('radius')} aria-label="Radius">
            {RADIUS_OPTIONS.map((r) => <option key={r} value={r}>{r} mi</option>)}
          </Select>
          <Button type="submit" className="h-10 sm:col-span-2 lg:col-span-1">
            <Search /> Search
          </Button>
        </form>
      </section>

      {/* Trust strip */}
      <section className="container mt-12 grid gap-4 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: 'Verified owners', text: 'Look for the Verified Owner badge on sellers who confirmed their identity.' },
          { icon: MessageSquare, title: 'Safe in-app chat', text: 'Talk to sellers without sharing your number upfront.' },
          { icon: Handshake, title: 'Deal directly', text: 'No dealer markup. The owner sells and transfers the title.' },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex items-start gap-4 rounded-xl border bg-card p-5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
              <Icon className="size-5" />
            </div>
            <div>
              <p className="font-semibold">{title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Featured */}
      <section className="container mt-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold sm:text-3xl">Fresh listings</h2>
            <p className="mt-1 text-muted-foreground">Recently listed by owners near you.</p>
          </div>
          <Link to="/cars" className="hidden items-center gap-1 text-sm font-semibold text-primary hover:underline sm:flex">
            See all cars <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {featured === null
            ? Array.from({ length: 4 }).map((_, i) => <CarCardSkeleton key={i} />)
            : featured.map((car) => <CarCard key={car.id} car={car} />)}
        </div>
        {featured?.length === 0 && (
          <p className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">
            No cars listed yet. <Link to={user ? '/dashboard/listings/new' : '/signup'} className="font-semibold text-primary">Be the first!</Link>
          </p>
        )}
        <div className="mt-6 text-center sm:hidden">
          <Button asChild variant="outline"><Link to="/cars">See all cars</Link></Button>
        </div>
      </section>

      {/* How it works */}
      <section className="mt-20 bg-secondary/50 py-16 sm:py-20">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold">How AutoPromo works</h2>
            <p className="mt-3 text-muted-foreground">Two ways to win — whether you have a car to sell or a network to share it with.</p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <StepsCard
              badge="For car owners"
              icon={Car}
              steps={[
                { icon: Camera, title: 'List your car', text: 'Free for 30 days, then $10/month. Add photos, price and the referral fee you’ll pay if a promoter brings the buyer.' },
                { icon: Users, title: 'Promoters share it', text: 'Local promoters post your car on social media, groups and to people they know.' },
                { icon: Handshake, title: 'Sell directly', text: 'Meet the buyer, close the deal and transfer the title yourself. Pay the fee only if it sells.' },
              ]}
            />
            <StepsCard
              badge="For promoters"
              icon={BadgeDollarSign}
              dark
              steps={[
                { icon: Search, title: 'Pick cars to promote', text: 'Browse listings near you and see the commission each owner offers.' },
                { icon: Share2, title: 'Share your link', text: 'Get a unique referral link and a ready-to-post kit for Facebook, WhatsApp and more.' },
                { icon: BadgeDollarSign, title: 'Earn when it sells', text: 'When your buyer purchases the car, you get paid straight to your bank account.' },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Testimonials (placeholder) */}
      <section className="container mt-20">
        <h2 className="text-center text-3xl font-bold">What people are saying</h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">Sample testimonials — replace with real reviews after launch.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { name: 'Jessica R.', role: 'Sold a 2018 Accord in Austin', text: 'I listed on a Monday and a promoter brought me a buyer by Saturday. I didn’t have to answer 50 lowball messages.' },
            { name: 'Marcus T.', role: 'Promoter in Houston', text: 'I share cars in my church and work groups. Two sales last month paid my car note. Super simple.' },
            { name: 'Daniel P.', role: 'Bought a RAV4 in San Antonio', text: 'Talking through the app felt safer than random marketplace ads. The owner was verified and the car was exactly as listed.' },
          ].map((t) => (
            <figure key={t.name} className="rounded-xl border bg-card p-6">
              <div className="flex gap-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="size-4 fill-current" />)}
              </div>
              <blockquote className="mt-4 text-sm leading-relaxed">“{t.text}”</blockquote>
              <figcaption className="mt-5">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* CTAs */}
      <section className="container mt-20 grid gap-5 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl bg-navy p-8 text-white sm:p-10">
          <div className="absolute -right-10 -top-10 size-48 rounded-full bg-primary/30 blur-3xl" />
          <BadgeCheck className="size-8 text-blue-400" />
          <h3 className="mt-4 text-2xl font-bold">Sell your car faster</h3>
          <p className="mt-2 max-w-md text-slate-300">First 30 days free, then $10/month — cancel anytime. You set the price and the referral fee, and the fee is only due if a promoter brings your buyer.</p>
          <Button asChild variant="white" size="lg" className="mt-6">
            <Link to={user ? '/dashboard/listings/new' : '/signup'}>List your car <ArrowRight /></Link>
          </Button>
        </div>
        <div className="relative overflow-hidden rounded-2xl bg-primary p-8 text-white sm:p-10">
          <div className="absolute -bottom-12 -right-6 size-48 rounded-full bg-white/20 blur-3xl" />
          <BadgeDollarSign className="size-8" />
          <h3 className="mt-4 text-2xl font-bold">Earn as a Promoter</h3>
          <p className="mt-2 max-w-md text-blue-100">No inventory, no upfront cost. Share cars with your network and earn a commission on every sale you refer.</p>
          <Button asChild variant="white" size="lg" className="mt-6">
            <Link to={user ? '/dashboard' : '/signup'}>Start earning <ArrowRight /></Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function StepsCard({
  badge,
  icon: BadgeIcon,
  steps,
  dark = false,
}: {
  badge: string;
  icon: typeof Car;
  steps: { icon: typeof Car; title: string; text: string }[];
  dark?: boolean;
}) {
  return (
    <div className={dark ? 'rounded-2xl bg-navy p-7 text-white sm:p-9' : 'rounded-2xl border bg-card p-7 sm:p-9'}>
      <span className={dark ? 'inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-blue-200' : 'inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground'}>
        <BadgeIcon className="size-3.5" /> {badge}
      </span>
      <ol className="mt-7 space-y-6">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4">
            <div className={dark ? 'flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-bold' : 'flex size-10 shrink-0 items-center justify-center rounded-full bg-navy font-bold text-white'}>
              {i + 1}
            </div>
            <div>
              <p className="flex items-center gap-2 font-semibold"><s.icon className="size-4 opacity-70" />{s.title}</p>
              <p className={dark ? 'mt-1 text-sm text-slate-300' : 'mt-1 text-sm text-muted-foreground'}>{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
