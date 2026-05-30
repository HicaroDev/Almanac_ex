"use client";

import { useAuth } from "./auth-provider";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface HeaderProps {
  notificationCount?: number;
  onNotificationClick?: () => void;
}

export function Header({ notificationCount = 0, onNotificationClick }: HeaderProps) {
  const { user } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <header className="flex items-center justify-between px-4 md:px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-4">
        <Link href="/dashboard" className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-indigo-600 tracking-tight">Almanac</span>
          <span className="text-[10px] font-mono text-gray-400 hidden sm:inline">v1.0.5</span>
        </Link>
      </div>
      {user && (
        <div className="flex items-center gap-3">
          <button onClick={onNotificationClick} className="relative hover:scale-110 transition">
            <span className="text-lg">🔔</span>
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold shadow-lg">
                {notificationCount > 9 ? "9+" : notificationCount}
              </span>
            )}
          </button>
          <span className="text-sm text-gray-600 hidden sm:inline">{user.name}</span>
          {user.avatar_url && (
            <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full ring-2 ring-indigo-200" />
          )}
          <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
            Sair
          </button>
        </div>
      )}
    </header>
  );
}
