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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const supabase = createClient();

  useEffect(() => {
    setCurrentUrl(window.location.origin);
    supabase.from("projects").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setProject(data);
    });
    supabase.from("versions").select("*").eq("project_id", id).order("version_number", { ascending: false }).limit(1).single().then(({ data }) => {
      if (!data) return;
      supabase.from("pins").select("*").eq("project_id", id).eq("version_id", data.id).then(({ data: pinsData }) => {
        setPins(pinsData || []);
      });
    });
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Almanac</h1>
        <button onClick={loginGoogle} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Entrar</button>
      </header>

      <div className="flex-1 relative" onClick={handleIframeClick}>
        {iframeRef && <iframe ref={iframeRef} className="w-full h-full border-0" sandbox="allow-same-origin" />}
        {pins.map(pin => (
          <button key={pin.id} onClick={(e) => { e.stopPropagation(); setSelectedPin(pin); loadComments(pin.id); }}
            className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg ${
              pin.status === "resolved" ? "bg-green-500" : pin.status === "reopened" ? "bg-blue-500" : "bg-orange-500"
            }`}
            style={{ left: `${pin.x_percent}%`, top: `${pin.y_percent}%` }}>
            {pin.status === "resolved" ? "✓" : "●"}
          </button>
        ))}
      </div>

      {selectedPin && (
        <div className="fixed right-4 top-20 w-80 bg-white rounded-xl shadow-xl border p-4 max-h-96 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-medium text-sm">Comentários</h3>
            <button onClick={() => setSelectedPin(null)} className="text-xs text-gray-400">✕</button>
          </div>
          {comments.map(c => (
            <div key={c.id} className="bg-gray-50 rounded-lg p-2 mb-2 text-sm">
              <p className="text-gray-800">{c.content}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(c.created_at).toLocaleString("pt-BR")}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-xs text-gray-400">Nenhum comentário</p>}
        </div>
      )}

      {showLoginModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 text-center max-w-sm shadow-xl">
            <p className="text-lg font-medium mb-4">Faça login para comentar</p>
            <button onClick={loginGoogle}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">Entrar com Google</button>
          </div>
        </div>
      )}
    </div>
  );
}
