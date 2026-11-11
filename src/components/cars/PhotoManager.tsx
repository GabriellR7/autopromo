import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import { deleteCarPhoto, friendlyDbError, savePhotoOrder, uploadCarPhoto } from '@/lib/listings';
import { MAX_PHOTOS } from '@/lib/constants';
import type { CarPhoto } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Upload (drag & drop or click), reorder (drag or arrows), set cover and delete
 * photos of a listing. The first photo is the cover.
 */
export function PhotoManager({
  ownerId,
  carId,
  photos,
  onChange,
}: {
  ownerId: string;
  carId: string;
  photos: CarPhoto[];
  onChange: (photos: CarPhoto[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const remaining = MAX_PHOTOS - photos.length;

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    if (files.length > remaining) toast.warning(`You can add ${remaining} more photo${remaining === 1 ? '' : 's'}. Extra files were skipped.`);
    const batch = files.slice(0, Math.max(remaining, 0));
    if (!batch.length) return;

    setUploading(batch.length);
    let current = [...photos];
    // Upload sequentially so positions stay in the order the user picked.
    for (const file of batch) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25 MB before compression).`);
        setUploading((n) => n - 1);
        continue;
      }
      try {
        const photo = await uploadCarPhoto(ownerId, carId, file, current.length);
        current = [...current, photo];
        onChange(current);
      } catch (e) {
        toast.error(`${file.name}: ${friendlyDbError((e as Error).message)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function reorder(next: CarPhoto[]) {
    const previous = photos;
    onChange(next);
    try {
      await savePhotoOrder(next);
    } catch (e) {
      onChange(previous);
      toast.error(`Could not save order: ${(e as Error).message}`);
    }
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    reorder(next);
  }

  async function remove(photo: CarPhoto) {
    try {
      await deleteCarPhoto(photo);
      const next = photos.filter((p) => p.id !== photo.id);
      onChange(next);
      if (next.length) await savePhotoOrder(next);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDropActive(false);
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-4">
      {remaining > 0 && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            if (dragIndex === null) setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
            dropActive ? 'border-primary bg-accent' : 'border-input hover:border-primary/60 hover:bg-secondary/50',
          )}
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            {uploading > 0 ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
          </div>
          <p className="mt-3 font-semibold">
            {uploading > 0 ? `Uploading ${uploading} photo${uploading > 1 ? 's' : ''}…` : 'Drag photos here or click to upload'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            JPG, PNG or WebP · up to {MAX_PHOTOS} photos ({remaining} left) · we resize them automatically
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {photos.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Drag to reorder. The first photo is the cover shown in search results.</p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo, i) => (
              <li
                key={photo.id}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dragIndex !== null) move(dragIndex, i);
                  setDragIndex(null);
                }}
                className={cn(
                  'group relative aspect-[4/3] cursor-grab overflow-hidden rounded-lg border-2 bg-muted active:cursor-grabbing',
                  i === 0 ? 'border-primary' : 'border-transparent',
                  dragIndex === i && 'opacity-40',
                )}
              >
                <img src={photo.url} alt={`Photo ${i + 1}`} className="size-full object-cover" draggable={false} />
                {i === 0 && (
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                    <Star className="size-3 fill-current" /> Cover
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                  <div className="flex gap-1">
                    <IconBtn label="Move left" onClick={() => move(i, i - 1)} disabled={i === 0}><ArrowLeft /></IconBtn>
                    <IconBtn label="Move right" onClick={() => move(i, i + 1)} disabled={i === photos.length - 1}><ArrowRight /></IconBtn>
                    {i !== 0 && <IconBtn label="Make cover" onClick={() => move(i, 0)}><Star /></IconBtn>}
                  </div>
                  <IconBtn label="Delete photo" onClick={() => remove(photo)} danger><Trash2 /></IconBtn>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, disabled, danger, children }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-7 items-center justify-center rounded-md text-white transition disabled:opacity-30 [&_svg]:size-3.5',
        danger ? 'bg-destructive hover:bg-destructive/90' : 'bg-white/20 backdrop-blur hover:bg-white/35',
      )}
    >
      {children}
    </button>
  );
}
