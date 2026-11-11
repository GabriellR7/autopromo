import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { cn, initials } from '@/lib/utils';

/* ---------- Card ---------- */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border bg-card text-card-foreground shadow-sm', className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-6', className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg font-semibold leading-none', className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-0', className)} {...props} />;
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center p-6 pt-0', className)} {...props} />;
}

/* ---------- Badge ---------- */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        accent: 'bg-accent text-accent-foreground',
        success: 'bg-success/10 text-success',
        warning: 'bg-amber-100 text-amber-800',
        destructive: 'bg-destructive/10 text-destructive',
        outline: 'border text-foreground',
        dark: 'bg-navy/85 text-white backdrop-blur',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);
export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

/* ---------- Skeleton ---------- */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} {...props} />;
}

/* ---------- Spinner ---------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-6 animate-spin text-primary', className)} />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner />
    </div>
  );
}

/* ---------- Alert ---------- */
const alertIcons = { error: AlertCircle, success: CheckCircle2, info: Info };
export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: 'error' | 'success' | 'info';
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = alertIcons[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-3 rounded-md border p-3 text-sm',
        variant === 'error' && 'border-destructive/30 bg-destructive/5 text-destructive',
        variant === 'success' && 'border-success/30 bg-success/5 text-success',
        variant === 'info' && 'border-primary/20 bg-accent text-accent-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
    </div>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({
  name,
  src,
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = React.useState(false);
  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-navy text-sm font-semibold text-white',
        className,
      )}
    >
      {src && !failed ? (
        <img src={src} alt="" className="size-full object-cover" onError={() => setFailed(true)} referrerPolicy="no-referrer" />
      ) : (
        initials(name)
      )}
    </div>
  );
}

/* ---------- Checkbox ---------- */
export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn('mt-0.5 size-4 shrink-0 rounded border-input accent-primary', className)}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

/* ---------- Empty state ---------- */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-14 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-accent">
        <Icon className="size-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
