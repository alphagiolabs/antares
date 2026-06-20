import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, type AppUser } from '../lib/supabase';

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function _fetchProfile(userId: string): Promise<Partial<AppUser> | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('display_name, is_admin, is_disabled')
    .eq('user_id', userId)
    .single();
  if (error || !data) return null;
  return {
    displayName: data.display_name ?? null,
    isAdmin: !!data.is_admin,
    isDisabled: !!data.is_disabled,
  };
}

function _mapUser(supabaseUser: any, profile: Partial<AppUser> | null): AppUser {
  return {
    id: supabaseUser.id,
    email: supabaseUser.email ?? '',
    displayName: profile?.displayName ?? null,
    isAdmin: profile?.isAdmin ?? false,
    isDisabled: profile?.isDisabled ?? false,
    createdAt: supabaseUser.created_at ?? '',
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshUser = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (mountedRef.current) { setUser(null); setLoading(false); }
        return;
      }
      const profile = await _fetchProfile(session.user.id);
      if (mountedRef.current) {
        setUser(_mapUser(session.user, profile));
        setLoading(false);
      }
    } catch (err) {
      console.warn('[auth] refreshUser error:', err);
      if (mountedRef.current) { setUser(null); setLoading(false); }
    }
  }, []);

  useEffect(() => {
    refreshUser();
    // Safety timeout: if Supabase is unreachable, show login after 5s
    const timeout = setTimeout(() => {
      if (mountedRef.current && loading) {
        console.warn('[auth] Session check timed out, showing login screen');
        setLoading(false);
      }
    }, 5000);
    if (!supabase) { clearTimeout(timeout); return; }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        if (mountedRef.current) setUser(null);
        return;
      }
      _fetchProfile(session.user.id).then((profile) => {
        if (mountedRef.current) setUser(_mapUser(session.user, profile));
      });
    });
    return () => { clearTimeout(timeout); subscription.unsubscribe(); };
  }, [refreshUser, loading]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase no configurado' };
    const { error: sbError } = await supabase.auth.signInWithPassword({ email, password });
    if (sbError) {
      setError(sbError.message);
      return { error: sbError.message };
    }
    setError(null);
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase no configurado' };
    const { error: sbError } = await supabase.auth.signUp({ email, password });
    if (sbError) {
      setError(sbError.message);
      return { error: sbError.message };
    }
    setError(null);
    return { error: null };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    if (mountedRef.current) setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signIn, signUp, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
