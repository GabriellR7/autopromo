import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { fetchMySubscription, planState, type PlanState, type Subscription } from '@/lib/billing';

export function useSubscription() {
  const { user } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    try {
      setSub(await fetchMySubscription(user.id));
    } catch {
      /* banner is best-effort */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    reload();
  }, [reload]);

  const state: PlanState = planState(sub);
  return { sub, state, loading, reload };
}
