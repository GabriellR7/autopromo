import type { MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Heart } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toggleSavedCar, useSavedIds } from '@/lib/saved';
import { cn } from '@/lib/utils';

/** Heart button. `overlay` = round white button on top of a photo. */
export function SaveButton({ carId, from, variant = 'overlay', className }: { carId: string; from: string; variant?: 'overlay' | 'inline'; className?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const saved = useSavedIds(user?.id).has(carId);

  async function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info('Sign in to save cars and get price-drop alerts.');
      navigate('/login', { state: { from } });
      return;
    }
    try {
      await toggleSavedCar(user.id, carId, !saved);
      if (!saved) toast.success("Saved — we'll email you if the price drops.");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (variant === 'inline') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        className={cn('flex w-full items-center justify-center gap-2 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground', className)}
      >
        <Heart className={cn('size-4', saved && 'fill-red-500 text-red-500')} />
        {saved ? 'Saved' : 'Save this car'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from saved' : 'Save car'}
      className={cn(
        'flex size-9 items-center justify-center rounded-full bg-white/90 text-navy shadow transition hover:scale-105 hover:bg-white',
        className,
      )}
    >
      <Heart className={cn('size-[18px]', saved && 'fill-red-500 text-red-500')} />
    </button>
  );
}
