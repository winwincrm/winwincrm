import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

export type AppRole = "admin" | "manager" | "superiormanager" | "agent";

export interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  office_id: string | null;
  team_id: string | null;
  status: "active" | "inactive";
  language_preference: string;
  must_change_password: boolean;
}

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  loadError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

async function loadProfileData(uid: string) {
  const [{ data: prof, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", uid),
  ]);
  if (profileError) throw profileError;
  if (rolesError) throw rolesError;
  const nextProfile = (prof as Profile) ?? null;
  if (nextProfile?.language_preference) {
    void i18n.changeLanguage(nextProfile.language_preference);
  }
  const list = (roles ?? []).map((r: { role: AppRole }) => r.role);
  const nextRole: AppRole | null = list.includes("admin")
    ? "admin"
    : list.includes("superiormanager")
      ? "superiormanager"
      : list.includes("manager")
        ? "manager"
        : list.includes("agent")
          ? "agent"
          : null;

  return { profile: nextProfile, role: nextRole };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    let lastUserId: string | null = null;
    let loadedUserId: string | null = null;
    let loadSeq = 0;
    let firstResolve = true;

    const resolveInitialLoad = () => {
      if (!mounted || !firstResolve) return;
      firstResolve = false;
      setLoading(false);
    };

    // Safety net: if Supabase is unreachable and profile never loads, unblock UI after 4s.
    const initialLoadTimeout = window.setTimeout(resolveInitialLoad, 4000);

    const applySession = async (nextSession: Session | null) => {
      if (!mounted) return;
      sessionRef.current = nextSession;
      setSession(nextSession);
      const uid = nextSession?.user?.id ?? null;

      if (!uid) {
        lastUserId = null;
        loadedUserId = null;
        setProfile(null);
        setRole(null);
        resolveInitialLoad();
        return;
      }

      // Same user — no need to refetch profile/roles on token refresh or visibility change.
      // Only flip `loading` once profile has actually been loaded for this uid; otherwise let
      // the in-flight load (started by the first caller) finish and resolve loading itself.
      if (uid === lastUserId) {
        if (loadedUserId === uid) resolveInitialLoad();
        return;
      }
      lastUserId = uid;

      const seq = ++loadSeq;
      const next = await loadProfileData(uid).catch((error: unknown) => {
        console.error("[auth] Failed to load profile data", error);
        const msg = error instanceof Error ? error.message : JSON.stringify(error);
        setLoadError(msg || "Unknown error loading profile/roles");
        return { profile: null, role: null };
      });
      if (!mounted || seq !== loadSeq) return;
      if (next.profile && next.role) setLoadError(null);
      setProfile(next.profile);
      setRole(next.role);
      loadedUserId = uid;
      resolveInitialLoad();
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      void applySession(s);
    });

    void supabase.auth.getSession()
      .then(({ data }) => applySession(data.session))
      .catch(() => applySession(null));

    return () => {
      mounted = false;
      window.clearTimeout(initialLoadTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const s = sessionRef.current;
    if (!s?.user) return;
    setLoadError(null);
    const next = await loadProfileData(s.user.id).catch((error: unknown) => {
      console.error("[auth] Failed to refresh profile data", error);
      const msg = error instanceof Error ? error.message : JSON.stringify(error);
      setLoadError(msg || "Unknown error loading profile/roles");
      return { profile: null, role: null };
    });
    setProfile(next.profile);
    setRole(next.role);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role,
      loading,
      loadError,
      refresh,
      signOut,
    }),
    [session, profile, role, loading, loadError, refresh, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
