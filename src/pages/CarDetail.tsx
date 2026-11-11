import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  BadgeCheck, CalendarDays, Calendar, ChevronLeft, ChevronRight, Expand, Fuel, Gauge, Hash, MapPin,
  MessageSquare, Palette, Settings2, Share2, Car as CarIcon, X,
} from 'lucide-react';
import { fetchCarByPublicId, fetchSimilarCars, sortedPhotos } from '@/lib/cars';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getReferralCode, getReferrerName } from '@/lib/referral';
import { requestPromotion } from '@/lib/promotions';
import { startConversation } from '@/lib/chat';
import { BODY_TYPES, FUEL_TYPES, TRANSMISSIONS, labelFor } from '@/lib/constants';
import type { CarDetail as CarDetailType, CarWithPhotos } from '@/lib/types';
import { carPath, carSlug, carTitle, cn, commissionAmount, formatDate, formatMiles, formatPrice, publicIdFromSlug, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Alert, Avatar, Badge, EmptyState, PageLoader } from '@/components/ui/misc';
import { CarImage } from '@/components/cars/CarImage';
import { CarCard } from '@/components/cars/CarCard';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { RatingSummary, ReportButton } from '@/components/community/Community';
import { PaymentEstimator, SafetyTips, VehicleHistory, estimatedMonthly } from '@/components/cars/BuyerTools';
import { SaveButton } from '@/components/cars/SaveButton';
import { recentPriceDrop } from '@/lib/saved';

export default function CarDetail() {
  const { slug = '' } = useParams();
  const publicId = publicIdFromSlug(slug);
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [promoting, setPromoting] = useState(false);
  const [contacting, setContacting] = useState<'message' | 'visit' | null>(null);
  const [car, setCar] = useState<CarDetailType | null | undefined>(undefined);
  const [similar, setSimilar] = useState<CarWithPhotos[]>([]);
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicId) return;
    let cancelled = false;
    setCar(undefined);
    setIndex(0);
    fetchCarByPublicId(publicId)
      .then((c) => {
        if (cancelled) return;
        setCar(c);
        if (c) {
          supabase.rpc('increment_car_views', { p_car_id: c.id }).then(() => undefined);
          fetchSimilarCars(c).then((s) => !cancelled && setSimilar(s));
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setCar(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [publicId]);

  const photos = useMemo(() => sortedPhotos(car?.car_photos), [car]);
  const title = car ? carTitle(car) : null;
  const seoJsonLd = useMemo(() => {
    if (!car) return null;
    const fuelMap: Record<string, string> = { gasoline: 'Gasoline', diesel: 'Diesel', hybrid: 'Hybrid', plug_in_hybrid: 'PlugInHybrid', electric: 'Electric', flex: 'FlexFuel' };
    return {
      '@context': 'https://schema.org',
      '@type': 'Car',
      name: `${car.year} ${car.make} ${car.model}${car.trim_level ? ` ${car.trim_level}` : ''}`,
      brand: { '@type': 'Brand', name: car.make },
      model: car.model,
      vehicleModelDate: String(car.year),
      mileageFromOdometer: { '@type': 'QuantitativeValue', value: car.mileage, unitCode: 'SMI' },
      fuelType: fuelMap[car.fuel_type] ?? car.fuel_type,
      vehicleTransmission: car.transmission,
      bodyType: car.body_type,
      color: car.exterior_color ?? undefined,
      itemCondition: 'https://schema.org/UsedCondition',
      image: photos.slice(0, 5).map((p) => p.url),
      description: car.description ?? undefined,
      offers: {
        '@type': 'Offer',
        price: car.price,
        priceCurrency: 'USD',
        availability: car.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
        url: window.location.origin + carPath(car),
        areaServed: { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: car.city, addressRegion: car.state, postalCode: car.zip, addressCountry: 'US' } },
      },
    };
  }, [car, photos]);

  useDocumentTitle(
    car ? `${title}${car.trim_level ? ` ${car.trim_level}` : ''} for sale in ${car.city}, ${car.state} — ${formatPrice(car.price)}` : null,
    car
      ? `${title} for sale in ${car.city}, ${car.state}: ${formatPrice(car.price)}, ${formatMiles(car.mileage)}. ${car.description ?? 'Private seller — contact the owner directly on AutoPromo.'}`
      : undefined,
    { image: photos[0]?.url ?? null, jsonLd: seoJsonLd, type: 'product' },
  );

  // Keyboard navigation in the lightbox
  useEffect(() => {
    if (!lightbox) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(false);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % Math.max(photos.length, 1));
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + photos.length) % Math.max(photos.length, 1));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, photos.length]);

  // Leave room under the footer for the fixed mobile action bar.
  const showMobileBar = Boolean(car) && car!.owner_id !== user?.id && car!.status !== 'sold';
  useEffect(() => {
    if (!showMobileBar) return;
    document.body.classList.add('pb-24', 'lg:pb-0');
    return () => document.body.classList.remove('pb-24', 'lg:pb-0');
  }, [showMobileBar]);

  if (!publicId) return <Navigate to="/cars" replace />;
  if (car === undefined) return <PageLoader />;
  if (car === null) {
    return (
      <div className="container py-16">
        {error && <Alert variant="error" className="mb-6">{error}</Alert>}
        <EmptyState
          icon={CarIcon}
          title="This listing isn't available"
          description="It may have been removed by the owner or the link is incorrect."
          action={<Button asChild><Link to="/cars">Browse other cars</Link></Button>}
        />
      </div>
    );
  }

  // Canonical slug: redirect if someone visits /cars/123 or an outdated slug
  if (carSlug(car) !== slug) return <Navigate to={carPath(car)} replace />;

  const isOwner = user?.id === car.owner_id;
  const current = photos[index];
  const fromPromoter = getReferralCode();
  const wasPrice = recentPriceDrop(car);
  const referrerName = getReferrerName();

  async function share() {
    const url = window.location.href.split('?')[0]!;
    try {
      if (navigator.share) await navigator.share({ title: title!, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard');
      }
    } catch {
      /* user cancelled */
    }
  }

  async function promote() {
    if (!user) {
      navigate('/signup', { state: { from: carPath(car!) } });
      return;
    }
    if (!profile?.promoter_agreement_at) {
      navigate('/dashboard/promoter');
      return;
    }
    setPromoting(true);
    try {
      const req = await requestPromotion(car!.id);
      if (req.status === 'approved') {
        toast.success('You can promote this car! Your link is in the promoter dashboard.');
        navigate('/dashboard/promoter');
      } else {
        toast.success('Request sent — the owner will review it.');
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPromoting(false);
    }
  }

  async function contact(scheduleVisit = false) {
    if (!user) {
      navigate('/login', { state: { from: carPath(car!) } });
      return;
    }
    setContacting(scheduleVisit ? 'visit' : 'message');
    try {
      const conversationId = await startConversation(car!.id, null, getReferralCode());
      navigate(`/dashboard/messages/${conversationId}${scheduleVisit ? '?visit=1' : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
      setContacting(null);
    }
  }


  const specs = [
    { icon: Calendar, label: 'Year', value: car.year },
    { icon: Gauge, label: 'Mileage', value: formatMiles(car.mileage) },
    { icon: Settings2, label: 'Transmission', value: labelFor(TRANSMISSIONS, car.transmission) },
    { icon: Fuel, label: 'Fuel type', value: labelFor(FUEL_TYPES, car.fuel_type) },
    { icon: CarIcon, label: 'Body type', value: labelFor(BODY_TYPES, car.body_type) },
    { icon: Palette, label: 'Exterior color', value: car.exterior_color || '—' },
    { icon: Hash, label: 'VIN', value: car.vin_last6 ? `•••••••••••${car.vin_last6}` : 'Not provided' },
    { icon: CalendarDays, label: 'Listed', value: formatDate(car.published_at ?? car.created_at) },
  ];

  return (
    <div className="container py-6 sm:py-8">
      <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
        <Link to="/cars" className="flex items-center gap-1 hover:text-foreground">
          <ChevronLeft className="size-4" /> All cars
        </Link>
        <span>/</span>
        <Link to={`/cars?make=${encodeURIComponent(car.make)}`} className="hover:text-foreground">{car.make}</Link>
        <span>/</span>
        <span className="truncate text-foreground">{car.model}</span>
      </nav>

      {isOwner && car.status !== 'active' && (
        <Alert className="mb-5" title={`This listing is ${car.status.replace('_', ' ')}`}>
          Only you can see it. <Link to={`/dashboard/listings/${car.id}/edit`} className="font-semibold underline">Edit listing</Link>
        </Alert>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.55fr_1fr]">
        {/* Gallery */}
        <div>
          <div className="relative overflow-hidden rounded-2xl">
            <CarImage src={current?.url} alt={title!} label={title!} className="aspect-[4/3]" eager />
            {photos.length > 0 && (
              <button
                onClick={() => setLightbox(true)}
                className="absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-white/90 text-navy shadow hover:bg-white"
                aria-label="View fullscreen"
              >
                <Expand className="size-4" />
              </button>
            )}
            {photos.length > 1 && (
              <>
                <GalleryArrow side="left" onClick={() => setIndex((i) => (i - 1 + photos.length) % photos.length)} />
                <GalleryArrow side="right" onClick={() => setIndex((i) => (i + 1) % photos.length)} />
                <Badge variant="dark" className="absolute bottom-3 right-3">{index + 1} / {photos.length}</Badge>
              </>
            )}
            {car.status === 'pending_sale' && <Badge variant="warning" className="absolute left-3 top-3">Pending sale</Badge>}
            {car.status === 'sold' && <Badge variant="dark" className="absolute left-3 top-3">Sold</Badge>}
          </div>
          {photos.length > 1 && (
            <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setIndex(i)}
                  className={cn('h-16 w-24 shrink-0 overflow-hidden rounded-lg border-2 transition', i === index ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100')}
                  aria-label={`Photo ${i + 1}`}
                >
                  <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Summary + seller */}
        <div className="space-y-5">
          <div>
            <p className="text-xs text-muted-foreground">Listed {timeAgo(car.published_at ?? car.created_at)} · {car.views.toLocaleString('en-US')} views</p>
            <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{title}</h1>
            {car.trim_level && <p className="text-muted-foreground">{car.trim_level}</p>}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3">
              <p className="text-3xl font-extrabold text-navy sm:text-4xl">{formatPrice(car.price)}</p>
              {wasPrice && car.status !== 'sold' && (
                <p className="text-sm">
                  <span className="text-muted-foreground line-through">{formatPrice(wasPrice)}</span>{' '}
                  <span className="font-semibold text-success">Price drop −{formatPrice(wasPrice - car.price)}</span>
                </p>
              )}
            </div>
            {car.status !== 'sold' && (
              <a href="#payment" className="text-sm font-medium text-primary hover:underline">
                est. {formatPrice(estimatedMonthly(car.price))}/mo
              </a>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4" /> {car.city}, {car.state} {car.zip}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="secondary"><Gauge />{formatMiles(car.mileage)}</Badge>
              <Badge variant="secondary"><Settings2 />{labelFor(TRANSMISSIONS, car.transmission)}</Badge>
              <Badge variant="secondary"><Fuel />{labelFor(FUEL_TYPES, car.fuel_type)}</Badge>
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Avatar name={car.owner?.full_name} src={car.owner?.avatar_url} className="size-12" />
              <div className="min-w-0">
                <p className="truncate font-semibold">{car.owner?.full_name ?? 'Private owner'}</p>
                <p className="text-xs text-muted-foreground">
                  Private seller · Member since {car.owner ? new Date(car.owner.created_at).getFullYear() : '—'}
                </p>
                <RatingSummary userId={car.owner?.id} />
              </div>
              {car.owner?.identity_verified && (
                <Badge variant="success" className="ml-auto shrink-0"><BadgeCheck />Verified Owner</Badge>
              )}
            </div>

            {isOwner ? (
              <Button asChild className="mt-5 w-full" variant="outline">
                <Link to={`/dashboard/listings/${car.id}/edit`}>Edit your listing</Link>
              </Button>
            ) : car.status === 'sold' ? (
              <p className="mt-5 rounded-lg bg-secondary p-3 text-center text-sm font-medium">This car has been sold.</p>
            ) : (
              <div className="mt-5 grid gap-2">
                <Button size="lg" onClick={() => contact(false)} loading={contacting === 'message'} disabled={Boolean(contacting)}>
                  <MessageSquare /> Contact
                </Button>
                <Button size="lg" variant="outline" onClick={() => contact(true)} loading={contacting === 'visit'} disabled={Boolean(contacting)}>
                  <CalendarDays /> Schedule a visit
                </Button>
              </div>
            )}
            {!isOwner && car.status !== 'sold' && <SaveButton carId={car.id} from={carPath(car)} variant="inline" className="mt-3" />}
            <button onClick={share} className="mt-1 flex w-full items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              <Share2 className="size-4" /> Share this car
            </button>
            {!isOwner && <div className="mt-1 text-center"><ReportButton targetType="car" targetId={car.id} /></div>}
            {fromPromoter && !isOwner && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {referrerName ? `Shared with you by ${referrerName}.` : 'You were referred by a promoter.'}
              </p>
            )}
          </div>

          {!isOwner && car.status === 'active' && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/20 bg-accent p-4">
              <div className="text-sm">
                <p className="font-semibold text-accent-foreground">Earn {formatPrice(commissionAmount(car))} promoting this car</p>
                <p className="text-muted-foreground">Share it with your network and get paid when it sells.</p>
              </div>
              <Button size="sm" variant="navy" onClick={promote} loading={promoting}>Promote</Button>
            </div>
          )}

          <SafetyTips compact />
        </div>
      </div>

      {/* Specs + description */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.55fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-bold">Specifications</h2>
            <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
              {specs.map(({ icon: Icon, label, value }) => (
                <div key={label} className="bg-card p-4">
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="size-3.5" />{label}</dt>
                  <dd className="mt-1 text-sm font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {car.description && (
            <section>
              <h2 className="text-xl font-bold">Seller's description</h2>
              <p className="mt-3 whitespace-pre-line leading-relaxed text-muted-foreground">{car.description}</p>
            </section>
          )}
          {!isOwner && <SafetyTips />}
        </div>
        <aside className="space-y-5">
          <VehicleHistory carId={car.id} vinLast6={car.vin_last6} signedIn={Boolean(user)} from={carPath(car)} />
          {car.status !== 'sold' && (
            <div id="payment" className="scroll-mt-24">
              <PaymentEstimator price={car.price} />
            </div>
          )}
        </aside>
      </div>

      {similar.length > 0 && (
        <section className="mt-14">
          <h2 className="text-xl font-bold">Similar cars</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {similar.map((c) => <CarCard key={c.id} car={c} />)}
          </div>
        </section>
      )}

      {/* Mobile action bar: price + contact always within reach */}
      {!isOwner && car.status !== 'sold' && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur lg:hidden" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-extrabold leading-tight text-navy">{formatPrice(car.price)}</p>
              <p className="truncate text-xs text-muted-foreground">est. {formatPrice(estimatedMonthly(car.price))}/mo · {car.city}, {car.state}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => contact(true)} disabled={Boolean(contacting)} aria-label="Schedule a visit">
              <CalendarDays />
            </Button>
            <Button onClick={() => contact(false)} loading={contacting === 'message'} disabled={Boolean(contacting)}>
              <MessageSquare /> Message seller
            </Button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setLightbox(false)}>
          <button className="absolute right-4 top-4 rounded-full p-2 text-white hover:bg-white/10" aria-label="Close">
            <X className="size-6" />
          </button>
          <img src={current.url} alt={title!} className="max-h-[90vh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          {photos.length > 1 && (
            <>
              <GalleryArrow side="left" dark onClick={(e) => { e.stopPropagation(); setIndex((i) => (i - 1 + photos.length) % photos.length); }} />
              <GalleryArrow side="right" dark onClick={(e) => { e.stopPropagation(); setIndex((i) => (i + 1) % photos.length); }} />
              <span className="absolute bottom-5 text-sm text-white/80">{index + 1} / {photos.length}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function GalleryArrow({ side, onClick, dark = false }: { side: 'left' | 'right'; onClick: (e: MouseEvent) => void; dark?: boolean }) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={side === 'left' ? 'Previous photo' : 'Next photo'}
      className={cn(
        'absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full shadow transition',
        side === 'left' ? 'left-3' : 'right-3',
        dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-white/90 text-navy hover:bg-white',
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
