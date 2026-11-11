import { useEffect } from 'react';

export function useDocumentTitle(title: string | null | undefined, description?: string) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = `${title} | AutoPromo`;
    let meta: HTMLMetaElement | null = null;
    let prevDesc: string | null = null;
    if (description) {
      meta = document.querySelector('meta[name="description"]');
      prevDesc = meta?.getAttribute('content') ?? null;
      meta?.setAttribute('content', description.slice(0, 160));
    }
    return () => {
      document.title = prev;
      if (meta && prevDesc) meta.setAttribute('content', prevDesc);
    };
  }, [title, description]);
}
