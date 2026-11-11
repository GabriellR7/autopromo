import { Link } from 'react-router-dom';
import { Gauge, MapPin, Settings2 } from 'lucide-react';
import type { CarWithPhotos } from '@/lib/types';
import { coverUrl } from '@/lib/cars';
import { TRANSMISSIONS, labelFor } from '@/lib/constants';
import { carPath, carTitle, cn, formatMiles, formatPrice } from '@/lib/utils';
import { Badge, Skeleton } from '@/components/ui/misc';
import { CarImage } from './CarImage';
import { SaveButton } from './SaveButton';
import { recentPriceDrop } from '@/lib/saved';
import { estimatedMonthly } from './BuyerTools';

export function CarCard({ car, distance, className }: { car: CarWithPhotos; distance?: number | null; className?: string }) {
  const title = carTitle(car);
  const was = recentPriceDrop(car);
  return (
    <Link
      to={carPath(car)}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg',
        className,
      )}
    >
      <div className="relative">
        <CarImage
          src={coverUrl(car)}
          alt={title}
          label={title}
          className="aspect-[4/3]"
          imgClassName="transition-transform duration-500 group-hover:scale-105"
        />
        {car.status === 'pending_sale' && (
          <Badge variant="warning" className="absolute left-3 top-3">Pending sale</Badge>
        )}
        {car.status === 'sold' && <Badge variant="dark" className="absolute left-3 top-3">Sold</Badge>}
        {car.status === 'active' && was && <Badge variant="success" className="absolute left-3 top-3 bg-success text-white">Price drop</Badge>}
        {car.status !== 'sold' && <SaveButton carId={car.id} from={carPath(car)} className="absolute right-3 top-3" />}
        {car.car_photos?.length > 1 && (
          <Badge variant="dark" className="absolute bottom-3 right-3">{car.car_photos.length} photos</Badge>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-semibold group-hover:text-primary">{title}</h3>
        {car.trim_level && <p className="truncate text-sm text-muted-foreground">{car.trim_level}</p>}
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <p className="text-xl font-bold text-navy">{formatPrice(car.price)}</p>
          {was && <p className="text-sm text-muted-foreground line-through">{formatPrice(was)}</p>}
        </div>
        {car.status !== 'sold' && <p className="text-xs text-muted-foreground">est. {formatPrice(estimatedMonthly(car.price))}/mo</p>}
        <div className="mb-3.5 mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Gauge className="size-3.5" />{formatMiles(car.mileage)}</span>
          <span className="flex items-center gap-1"><Settings2 className="size-3.5" />{labelFor(TRANSMISSIONS, car.transmission)}</span>
        </div>
        <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 truncate">
            <MapPin className="size-3.5 shrink-0" />
            {car.city}, {car.state}
          </span>
          {distance != null && <span className="shrink-0 font-medium">{Math.round(distance)} mi away</span>}
        </div>
      </div>
    </Link>
  );
}

export function CarCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
