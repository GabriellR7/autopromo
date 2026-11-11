/**
 * Resizes and compresses an image in the browser before upload.
 * Keeps uploads small (~200–500 KB) without a server.
 */
export async function compressImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('File is not an image.');

  const bitmap = await createImageBitmap(file).catch(() => null);
  const source: { width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void } =
    bitmap
      ? { width: bitmap.width, height: bitmap.height, draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h) }
      : await loadViaImgElement(file);

  const scale = Math.min(1, maxSize / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not supported in this browser.');
  source.draw(ctx, width, height);
  bitmap?.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not compress image.'))), 'image/jpeg', quality);
  });
}

function loadViaImgElement(file: File) {
  return new Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void }>(
    (resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight, draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h) });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read image.'));
      };
      img.src = url;
    },
  );
}
