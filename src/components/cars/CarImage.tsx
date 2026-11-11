import { useState } from 'react';
import { Car as CarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Car photo with a graceful placeholder when there is no image (or it fails to load). */
export function CarImage({
  src,
  alt,
  className,
  imgClassName,
  label,
  eager = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  imgClassName?: string;
  label?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200', className)}>
      {showImage ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailed(true)}
          className={cn('size-full object-cover', imgClassName)}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-slate-400">
          <CarIcon className="size-10" strokeWidth={1.25} />
          {label && <span className="px-4 text-center text-xs font-medium">{label}</span>}
        </div>
      )}
    </div>
  );
}
