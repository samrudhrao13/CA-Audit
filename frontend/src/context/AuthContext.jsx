import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { firebaseAuth } from "../lib/firebase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading, null = signed out

  useEffect(() => {
    return onAuthStateChanged(firebaseAuth, setUser);
  }, []);

  const value = {
    user: user ?? null,
    loading: user === undefined,
    signOut: () => firebaseSignOut(firebaseAuth),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
