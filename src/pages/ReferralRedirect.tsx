import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { LinkIcon } from 'lucide-react';
import { resolveReferral } from '@/lib/promotions';
import { carPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState, PageLoader } from '@/components/ui/misc';

/** Short referral link: /r/CODE → /cars/<slug>?ref=CODE (the click is recorded there). */
export default function ReferralRedirect() {
  const { code = '' } = useParams();
  const [target, setTarget] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    resolveReferral(code).then((car) => setTarget(car ? `${carPath(car)}?ref=${encodeURIComponent(code)}` : null));
  }, [code]);

  if (target === undefined) return <PageLoader />;
  if (target) return <Navigate to={target} replace />;
  return (
    <div className="container py-20">
      <EmptyState
        icon={LinkIcon}
        title="This link is no longer active"
        description="The car may have been sold or the promotion ended. Check out other cars for sale."
        action={<Button asChild><Link to="/cars">Browse cars</Link></Button>}
      />
    </div>
  );
}
