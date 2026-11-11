import { useEffect } from 'react';

const SITE_NAME = 'AutoPromo';
const DEFAULT_DESCRIPTION =
  'AutoPromo connects car owners with local promoters who help find buyers. List your car free for 30 days or earn referral commissions.';

interface SeoOptions {
  /** Absolute or root-relative image for social previews. */
  image?: string | null;
  /** Structured data (schema.org) injected as JSON-LD. */
  jsonLd?: Record<string, unknown> | null;
  /** Keep private pages out of search results. */
  noindex?: boolean;
  type?: 'website' | 'product';
}

function setMeta(attr: 'name' | 'property', key: string, value: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (value == null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(url: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;
}

/**
 * Sets <title>, description, canonical URL, Open Graph / Twitter tags and
 * optional JSON-LD for the current page. (Kept under its original name so
 * every page already using it gets the full SEO treatment.)
 */
export function useDocumentTitle(title: string | null | undefined, description?: string, options: SeoOptions = {}) {
  const { image, jsonLd, noindex, type } = options;
  const jsonLdString = jsonLd ? JSON.stringify(jsonLd) : null;

  useEffect(() => {
    if (!title) return;
    const fullTitle = `${title} | ${SITE_NAME}`;
    const desc = (description || DEFAULT_DESCRIPTION).replace(/\s+/g, ' ').trim().slice(0, 160);
    const url = window.location.origin + window.location.pathname;
    const img = image ? new URL(image, window.location.origin).href : `${window.location.origin}/og-default.png`;

    const privatePath = /^\/(dashboard|admin|login|signup|onboarding|auth|check-email|forgot-password|reset-password)(\/|$)/.test(
      window.location.pathname,
    );

    document.title = fullTitle;
    setMeta('name', 'description', desc);
    setMeta('name', 'robots', noindex || privatePath ? 'noindex, nofollow' : 'index, follow');
    setCanonical(url);
    setMeta('property', 'og:site_name', SITE_NAME);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', desc);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', type ?? 'website');
    setMeta('property', 'og:image', img);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', desc);
    setMeta('name', 'twitter:image', img);

    let script: HTMLScriptElement | null = null;
    if (jsonLdString) {
      script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.page = 'true';
      script.textContent = jsonLdString;
      document.head.appendChild(script);
    }
    return () => {
      script?.remove();
    };
  }, [title, description, image, jsonLdString, noindex, type]);
}

/** Private areas (dashboard, admin, auth) should never be indexed. */
export function useNoIndex(title: string) {
  useDocumentTitle(title, undefined, { noindex: true });
}
