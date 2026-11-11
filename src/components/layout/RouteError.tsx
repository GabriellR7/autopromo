import { useEffect } from 'react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const RELOAD_KEY = 'ap_chunk_reload';

function isChunkError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(msg);
}

/**
 * Shown when a page crashes. After a new deploy, old page files disappear —
 * in that case we reload once automatically to get the new version.
 */
export function RouteError() {
  const error = useRouteError();
  const chunk = isChunkError(error);

  useEffect(() => {
    if (!chunk) return;
    if (sessionStorage.getItem(RELOAD_KEY) !== '1') {
      sessionStorage.setItem(RELOAD_KEY, '1');
      window.location.reload();
    }
  }, [chunk]);

  useEffect(() => {
    console.error(error);
  }, [error]);

  const notFound = isRouteErrorResponse(error) && error.status === 404;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-amber-100">
          <AlertTriangle className="size-7 text-amber-600" />
        </div>
        <h1 className="text-2xl font-bold">{notFound ? 'Page not found' : chunk ? 'A new version is available' : 'Something went wrong'}</h1>
        <p className="mt-2 text-muted-foreground">
          {notFound
            ? "The page you're looking for doesn't exist."
            : chunk
              ? 'We just updated AutoPromo. Reload the page to continue.'
              : 'An unexpected error happened. Try reloading the page — if it keeps happening, contact support.'}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => { sessionStorage.removeItem(RELOAD_KEY); window.location.reload(); }}>Reload</Button>
          <Button asChild variant="outline"><Link to="/">Go home</Link></Button>
        </div>
      </div>
    </div>
  );
}
