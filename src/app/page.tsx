"use client";

import { createClient } from "@/lib/supabase";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { SparklesCore } from "@/components/sparkles-core";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push("/dashboard");
  }, [user, loading]);

  async function loginGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback` } });
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0b1a2e] via-[#0f2b4a] to-[#061220] relative overflow-hidden">
      <div className="absolute inset-0">
        <SparklesCore
          id="login-sparkles"
          minSize={0.6}
          maxSize={1.8}
          particleDensity={100}
          particleColor="#60a5fa"
          speed={2}
        />
      </div>
      <div className="text-center max-w-md mx-auto p-8 relative z-10">
        <div className="flex items-baseline justify-center gap-3 mb-2">
          <h1 className="text-5xl font-bold text-white tracking-tight">Almanac</h1>
          <span className="text-sm font-mono text-blue-300/50">v1.0.5</span>
        </div>
        <p className="text-lg text-blue-200/70 mb-8">Colabore em mockups HTML com feedbacks ancorados</p>
        <button onClick={loginGoogle} disabled={loading}
          className="flex items-center gap-3 px-6 py-3 bg-white/10 backdrop-blur-sm border border-blue-300/20 rounded-xl shadow-lg hover:shadow-blue-500/20 hover:bg-white/15 transition-all disabled:opacity-50 mx-auto text-white">
          <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Entrar com Google
        </button>
      </div>
    </div>
  );
}
