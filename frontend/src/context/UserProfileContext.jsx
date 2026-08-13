import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";

const UserProfileContext = createContext(null);

export function UserProfileProvider({ children }) {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState(undefined); // undefined = loading, null = none
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    try {
      const { profile } = await api.get("/api/auth/me");
      setProfile(profile);
      return profile;
    } catch {
      setProfile(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    // Firebase hasn't finished restoring the persisted session yet — don't
    // treat "not resolved yet" as "signed out" (that's what was kicking
    // people back to /login on every reload).
    if (authLoading) return;
    refresh();
  }, [authLoading, refresh]);

  return (
    <UserProfileContext.Provider value={{ profile, loading: authLoading || loading, refresh }}>
      {children}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error("useUserProfile must be used inside <UserProfileProvider>");
  return ctx;
}
