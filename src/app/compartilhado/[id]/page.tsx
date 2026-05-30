"use client";

import { createClient } from "@/lib/supabase";
import { useParams } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import type { Project, Version, Pin, PinComment } from "@/lib/types";

export default function SharedProject() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [comments, setComments] = useState<PinComment[]>([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");
  const [latestVersion, setLatestVersion] = useState<Version | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const supabase = createClient();

  useEffect(() => {
    setCurrentUrl(window.location.origin);
    (async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", id).single();
      if (proj) setProject(proj);
      const { data: ver } = await supabase.from("versions").select("*").eq("project_id", id).order("version_number", { ascending: false }).limit(1).single();
      if (ver) {
        setLatestVersion(ver);
        const { data: pinsData } = await supabase.from("pins").select("*").eq("project_id", id).eq("version_id", ver.id);
        setPins(pinsData || []);
      }
    })();
  }, [id]);

  function handleIframeClick() {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setShowLoginModal(true);
    });
  }

  async function loadComments(pinId: string) {
    const { data } = await supabase.from("pin_comments").select("*").eq("pin_id", pinId).order("created_at");
    setComments(data || []);
  }

  async function loginGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${currentUrl}/auth/callback` },
    });
  }

  if (isMobile) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0b1a2e] to-[#061220] p-8 text-center">
      <div className="text-6xl mb-4">📱</div>
      <h1 className="text-2xl font-bold text-white mb-2">Almanac</h1>
      <p className="text-blue-200/60 max-w-xs">O sistema não pode ser aberto em celular. Abra em um tablet ou computador para ver este projeto.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-indigo-600">Almanac</h1>
        <button onClick={loginGoogle} className="text-sm px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all">
          Entrar para comentar
        </button>
      </header>

      <div className="flex-1 relative" onClick={handleIframeClick}>
        {latestVersion && (
          <iframe ref={iframeRef}
            src={supabase.storage.from("mockups").getPublicUrl(latestVersion.storage_path).data.publicUrl}
            className="w-full h-full border-0" sandbox="allow-scripts"
            style={{ pointerEvents: "none" }} />
        )}
        {pins.map(pin => (
          <button key={pin.id} onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); loadComments(pin.id); }}
            className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md transition hover:scale-110 ${
              pin.status === "resolved" ? "bg-green-500" : pin.status === "reopened" ? "bg-blue-500" : "bg-orange-500"
            }`}
            style={{ left: `${pin.x_percent}%`, top: `${pin.y_percent}%` }}>
            {pin.status === "resolved" ? "✓" : "●"}
          </button>
        ))}
      </div>

      {selectedPin && (
        <div className="fixed right-4 top-20 w-72 lg:w-80 bg-white rounded-2xl shadow-lg border border-gray-200 p-4 max-h-96 overflow-y-auto animate-fade-in">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-sm text-gray-900">Comentários</h3>
            <button onClick={() => setSelectedPin(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
          </div>
          {comments.map(c => (
            <div key={c.id} className="bg-gray-50 rounded-xl p-2 mb-2 text-sm">
              <p className="text-gray-800">{c.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-400">Nenhum comentário</p>}
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm shadow-xl border border-gray-200 animate-fade-in">
            <p className="text-lg font-medium text-gray-900 mb-4">Faça login para comentar</p>
            <button onClick={loginGoogle}
              className="px-6 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-sm text-sm">
              Entrar com Google
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
