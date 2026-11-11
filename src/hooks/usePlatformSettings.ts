import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PlatformSettings } from '@/lib/types';

const FALLBACK: PlatformSettings = {
  id: 1,
  platform_fee_percent: 10,
  default_commission_type: 'fixed',
  default_commission_value: 300,
  enabled_states: ['TX'],
  max_listings_per_user: 5,
  require_listing_approval: false,
};

let cached: PlatformSettings | null = null;

export function usePlatformSettings() {
  const [settings, setSettings] = useState<PlatformSettings>(cached ?? FALLBACK);
  useEffect(() => {
    if (cached) return;
    supabase
      .from('platform_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          cached = { ...(data as PlatformSettings), default_commission_value: Number(data.default_commission_value), platform_fee_percent: Number(data.platform_fee_percent) };
          setSettings(cached);
        }
      });
  }, []);
  return settings;
}
