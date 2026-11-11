import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { ActiveMode, Profile } from '@/lib/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<Profile, 'full_name' | 'avatar_url' | 'city' | 'state' | 'is_owner' | 'is_promoter' | 'active_mode' | 'onboarded' | 'accepted_terms_at' | 'promoter_agreement_at'>>) => Promise<{ error: string | null }>;
  setMode: (mode: ActiveMode) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    // The profile row is created by a DB trigger right after sign-up; retry
    // briefly in case we get here a few milliseconds before it exists.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (data) {
        setProfile(data as Profile);
        return;
      }
      if (error) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    setProfile(null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      if (mounted) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        // Defer: calling Supabase inside this callback can deadlock the auth lock.
        setTimeout(() => {
          loadProfile(newSession?.user.id);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session?.user.id), [loadProfile, session?.user.id]);

  const updateProfile = useCallback<AuthContextValue['updateProfile']>(
    async (patch) => {
      if (!session?.user.id) return { error: 'Not signed in.' };
      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', session.user.id)
        .select('*')
        .single();
      if (error) return { error: error.message };
      setProfile(data as Profile);
      return { error: null };
    },
    [session?.user.id],
  );

  const setMode = useCallback(
    async (mode: ActiveMode) => {
      const patch: Partial<Profile> = { active_mode: mode };
      if (mode === 'owner') patch.is_owner = true;
      if (mode === 'promoter') patch.is_promoter = true;
      await updateProfile(patch);
    },
    [updateProfile],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      refreshProfile,
      updateProfile,
      setMode,
      signOut,
    }),
    [session, profile, loading, refreshProfile, updateProfile, setMode, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
