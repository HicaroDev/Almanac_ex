"use client";

import { useAuth } from "./auth-provider";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function Header() {
  const { user } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b shadow-sm">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="text-xl font-bold text-gray-800">Almanac</Link>
      </div>
      {user && (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user.name}</span>
          {user.avatar_url && (
            <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
          )}
          <button onClick={handleLogout} className="text-sm text-red-500 hover:text-red-700">
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
