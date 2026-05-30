"use client";

import { createClient } from "@/lib/supabase";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AuthCallback() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.push("/dashboard");
      else router.push("/");
    });
  }, []);
  return <div className="min-h-screen flex items-center justify-center"><p>Autenticando...</p></div>;
}
