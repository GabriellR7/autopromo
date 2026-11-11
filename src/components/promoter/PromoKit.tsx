import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import { Check, Copy, Download, Mail, MessageCircle, QrCode, Share2, Smartphone, Sparkles } from 'lucide-react';
import type { MyPromotion } from '@/lib/promotions';
import { shareTargets, shortLink } from '@/lib/promotions';
import { formatMiles, formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';

type Kit = Pick<MyPromotion, 'referral_code' | 'year' | 'make' | 'model' | 'trim_level' | 'price' | 'city' | 'state' | 'cover_url'> & {
  mileage?: number | null;
};

export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  async function copy(text: string, key = text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      toast.success('Copied!');
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.');
    }
  }
  return { copied, copy };
}

function adText(p: Kit, url: string) {
  const title = `${p.year} ${p.make} ${p.model}${p.trim_level ? ` ${p.trim_level}` : ''}`;
  return [
    `🚗 FOR SALE: ${title}`,
    `💵 ${formatPrice(p.price)}${p.mileage ? ` · ${formatMiles(p.mileage)}` : ''}`,
    `📍 ${p.city}, ${p.state}`,
    '',
    'Private owner, deal directly with the seller. Photos, details and safe in-app contact here 👇',
    url,
  ].join('\n');
}

/* ---------------- Share row (copy + social buttons) ---------------- */
export function ShareButtons({ promo, compact = false }: { promo: Kit; compact?: boolean }) {
  const url = shortLink(promo.referral_code);
  const text = `Check out this ${promo.year} ${promo.make} ${promo.model} for ${formatPrice(promo.price)} in ${promo.city}, ${promo.state}`;
  const targets = shareTargets(url, text);
  const { copied, copy } = useCopy();
  const [qrOpen, setQrOpen] = useState(false);
  const [kitOpen, setKitOpen] = useState(false);

  const items = [
    { href: targets.facebook, label: 'Facebook', icon: Share2 },
    { href: targets.whatsapp, label: 'WhatsApp', icon: MessageCircle },
    { href: targets.sms, label: 'SMS', icon: Smartphone },
    { href: targets.email, label: 'Email', icon: Mail },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 truncate rounded-md border bg-secondary/50 px-3 py-2 font-mono text-xs sm:text-sm">{url}</div>
        <Button size="sm" variant={copied === url ? 'secondary' : 'default'} onClick={() => copy(url)}>
          {copied === url ? <Check /> : <Copy />} {copied === url ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map(({ href, label, icon: Icon }) => (
          <Button key={label} asChild size="sm" variant="outline">
            <a href={href} target="_blank" rel="noopener noreferrer"><Icon /> {compact ? null : label}</a>
          </Button>
        ))}
        <Button size="sm" variant="outline" onClick={() => setQrOpen(true)}><QrCode /> {compact ? null : 'QR code'}</Button>
        <Button size="sm" variant="navy" onClick={() => setKitOpen(true)}><Sparkles /> Promo kit</Button>
      </div>
      <QrDialog open={qrOpen} onClose={() => setQrOpen(false)} url={url} name={`${promo.year}-${promo.make}-${promo.model}`} />
      <PromoKitDialog open={kitOpen} onClose={() => setKitOpen(false)} promo={promo} />
    </div>
  );
}

/* ---------------- QR code ---------------- */
function QrDialog({ open, onClose, url, name }: { open: boolean; onClose: () => void; url: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: '#0f1d3a', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [open, url]);

  return (
    <Dialog open={open} onClose={onClose} title="QR code" description="Print it on a flyer or show it at events. Scans go to your referral link.">
      <div className="flex flex-col items-center gap-4">
        {src ? <img src={src} alt="QR code for referral link" className="size-64 rounded-lg border" /> : <div className="size-64 animate-pulse rounded-lg bg-muted" />}
        <p className="break-all text-center font-mono text-xs text-muted-foreground">{url}</p>
        {src && (
          <Button asChild className="w-full">
            <a href={src} download={`autopromo-qr-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`}><Download /> Download PNG</a>
          </Button>
        )}
      </div>
    </Dialog>
  );
}

/* ---------------- Promo kit: ad text + square image ---------------- */
function PromoKitDialog({ open, onClose, promo }: { open: boolean; onClose: () => void; promo: Kit }) {
  const url = shortLink(promo.referral_code);
  const initialText = useMemo(() => adText(promo, url), [promo, url]);
  const [text, setText] = useState(initialText);
  const [image, setImage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { copied, copy } = useCopy();

  useEffect(() => setText(initialText), [initialText]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setGenerating(true);
    renderSquareImage(promo, url)
      .then((dataUrl) => !cancelled && setImage(dataUrl))
      .catch(() => !cancelled && setImage(null))
      .finally(() => !cancelled && setGenerating(false));
    return () => {
      cancelled = true;
    };
  }, [open, promo, url]);

  async function shareImage() {
    if (!image) return;
    try {
      const blob = await (await fetch(image)).blob();
      const file = new File([blob], 'autopromo-car.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text });
      } else {
        toast.info('Your browser cannot share images directly. Download the image instead.');
      }
    } catch {
      /* cancelled */
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Promo kit" description="Ready-to-post text and image for Facebook, Instagram, WhatsApp groups and more." className="sm:max-w-2xl">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Square image (1080×1080)</p>
          <div className="aspect-square overflow-hidden rounded-lg border bg-muted">
            {image ? <img src={image} alt="Promo image" className="size-full" /> : generating ? <div className="size-full animate-pulse" /> : null}
          </div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="flex-1" disabled={!image}>
              <a href={image ?? '#'} download="autopromo-car.png"><Download /> Download</a>
            </Button>
            <Button size="sm" variant="outline" onClick={shareImage} disabled={!image}><Share2 /> Share</Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Post text</p>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={11} className="text-sm" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => copy(text, 'text')}>
            {copied === 'text' ? <Check /> : <Copy />} {copied === 'text' ? 'Copied' : 'Copy text'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Only post true information from the listing. Don't promise warranties or condition details the owner didn't state.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function renderSquareImage(p: Kit, url: string): Promise<string> {
  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  const navy = '#0f1d3a';
  const blue = '#3b82f6';

  // Background
  ctx.fillStyle = navy;
  ctx.fillRect(0, 0, S, S);

  // Photo (cover-fit into the top 70%)
  const photoH = 740;
  let drewPhoto = false;
  if (p.cover_url) {
    try {
      const img = await loadImage(p.cover_url);
      const scale = Math.max(S / img.width, photoH / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (S - w) / 2, (photoH - h) / 2, w, h);
      drewPhoto = true;
    } catch {
      drewPhoto = false;
    }
  }
  if (!drewPhoto) {
    const g = ctx.createLinearGradient(0, 0, S, photoH);
    g.addColorStop(0, '#1e3a8a');
    g.addColorStop(1, navy);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, photoH);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.font = '800 220px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🚗', S / 2, photoH / 2 + 80);
  }

  // Fade into the info panel
  const fade = ctx.createLinearGradient(0, photoH - 220, 0, photoH);
  fade.addColorStop(0, 'rgba(15,29,58,0)');
  fade.addColorStop(1, navy);
  ctx.fillStyle = fade;
  ctx.fillRect(0, photoH - 220, S, 220);

  // "For sale" tag
  ctx.fillStyle = blue;
  roundRect(ctx, 48, 48, 230, 64, 32);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '800 32px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FOR SALE', 48 + 115, 92);

  // Title + price
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = '800 64px Inter, system-ui, sans-serif';
  fitText(ctx, `${p.year} ${p.make} ${p.model}`, 60, 820, S - 120, 64);
  ctx.fillStyle = '#93c5fd';
  ctx.font = '800 76px Inter, system-ui, sans-serif';
  ctx.fillText(formatPrice(p.price), 60, 915);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '500 34px Inter, system-ui, sans-serif';
  const details = [p.mileage ? formatMiles(p.mileage) : null, `${p.city}, ${p.state}`].filter(Boolean).join('  ·  ');
  ctx.fillText(details, 60, 975);

  // QR code bottom-right
  try {
    const qr = await QRCode.toDataURL(url, { width: 200, margin: 1, color: { dark: navy, light: '#ffffff' } });
    const qrImg = await loadImage(qr);
    ctx.fillStyle = '#fff';
    roundRect(ctx, S - 268, S - 268, 220, 220, 20);
    ctx.fill();
    ctx.drawImage(qrImg, S - 258, S - 258, 200, 200);
  } catch {
    /* QR optional */
  }

  // Footer
  ctx.fillStyle = '#64748b';
  ctx.font = '600 28px Inter, system-ui, sans-serif';
  ctx.fillText('AutoPromo · Deal directly with the owner', 60, 1035);

  return canvas.toDataURL('image/png');
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number) {
  let s = size;
  while (s > 36) {
    ctx.font = `800 ${s}px Inter, system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW - 260) break;
    s -= 4;
  }
  ctx.fillText(text, x, y);
}
