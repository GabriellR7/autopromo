import { cn } from '@/lib/utils';

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-navy shadow-sm">
        <svg viewBox="0 0 32 32" className="size-6" aria-hidden="true">
          <path
            d="M7 19l2.2-5.4A2.5 2.5 0 0 1 11.5 12h9a2.5 2.5 0 0 1 2.3 1.6L25 19v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-11v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1z"
            fill="#3b82f6"
          />
          <circle cx="11" cy="19" r="1.4" fill="#fff" />
          <circle cx="21" cy="19" r="1.4" fill="#fff" />
        </svg>
      </span>
      <span className={cn('text-lg font-extrabold tracking-tight', light ? 'text-white' : 'text-navy')}>
        Auto<span className="text-primary">Promo</span>
      </span>
    </span>
  );
}
