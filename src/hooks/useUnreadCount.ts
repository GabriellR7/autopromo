import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchUnreadCount } from '@/lib/chat';

/** Live unread-message count for the header badge. */
export function useUnreadCount(userId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setCount(0);
      return;
    }
    let active = true;
    const refresh = () => fetchUnreadCount().then((n) => active && setCount(n));
    refresh();

    // RLS limits these events to conversations the user is part of.
    const channel = supabase
      .channel(`unread-${userId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, refresh)
      .subscribe();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('ap:messages-read', onFocus);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('ap:messages-read', onFocus);
    };
  }, [userId]);

  return count;
}
