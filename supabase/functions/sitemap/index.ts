// =============================================================================
// Edge Function: sitemap  →  served at https://YOUR-DOMAIN/sitemap.xml
// (Netlify/Vercel proxy /sitemap.xml to this function — see public/_redirects
// and vercel.json). Lists public pages and every live car listing.
// Secret: SITE_URL (e.g. https://autopromo.com)
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SITE_URL = (Deno.env.get('SITE_URL') ?? 'http://localhost:5173').replace(/\/$/, '');
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// Must match src/lib/utils.ts → slugify / carSlug
function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const xmlEscape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

Deno.serve(async () => {
  const { data: cars, error } = await db
    .from('cars')
    .select('public_id, year, make, model, city, state, updated_at')
    .in('status', ['active', 'pending_sale'])
    .order('published_at', { ascending: false })
    .limit(45000);

  if (error) return new Response('Sitemap unavailable', { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const staticPages = [
    { path: '/', priority: '1.0', freq: 'daily' },
    { path: '/cars', priority: '0.9', freq: 'hourly' },
    { path: '/how-it-works', priority: '0.6', freq: 'monthly' },
    { path: '/faq', priority: '0.5', freq: 'monthly' },
    { path: '/terms', priority: '0.2', freq: 'yearly' },
    { path: '/privacy', priority: '0.2', freq: 'yearly' },
  ];

  const urls = [
    ...staticPages.map(
      (p) => `<url><loc>${SITE_URL}${p.path}</loc><lastmod>${today}</lastmod><changefreq>${p.freq}</changefreq><priority>${p.priority}</priority></url>`,
    ),
    ...(cars ?? []).map((c) => {
      const slug = slugify([c.year, c.make, c.model, c.city ?? '', c.state ?? '', String(c.public_id)].join(' '));
      return `<url><loc>${xmlEscape(`${SITE_URL}/cars/${slug}`)}</loc><lastmod>${String(c.updated_at).slice(0, 10)}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`;
    }),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
});
