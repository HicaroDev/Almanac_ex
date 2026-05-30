"use client";

import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@/lib/types";

const AuthCtx = createContext<{ user: User | null; loading: boolean }>({
  user: null, loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) fetchUser(data.session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) fetchUser(session.user.id);
      else { setUser(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchUser(id: string) {
    const supabase = createClient();
    const { data } = await supabase.from("users").select("*").eq("id", id).single();
    setUser(data); setLoading(false);
  }

  return <AuthCtx.Provider value={{ user, loading }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
