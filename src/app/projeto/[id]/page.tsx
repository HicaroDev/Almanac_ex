"use client";

import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Header } from "@/components/header";
import type { Project, Version, Pin, PinComment } from "@/lib/types";

export default function ProjectPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersion, setCurrentVersion] = useState<Version | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [selectedPin, setSelectedPin] = useState<Pin | null>(null);
  const [comments, setComments] = useState<PinComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState<"comments" | "versions">("comments");
  const [showShare, setShowShare] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading]);

  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    supabase.from("projects").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setProject(data);
    });
    loadVersions();
  }, [user, id]);

  function loadVersions() {
    supabase.from("versions").select("*").eq("project_id", id).order("version_number", { ascending: false }).then(({ data }) => {
      const v = data || [];
      setVersions(v);
      if (v.length > 0) setCurrentVersion(v[0]);
    });
  }

  useEffect(() => {
    if (!currentVersion || !user) return;
    supabase.from("pins").select("*").eq("project_id", id).eq("version_id", currentVersion.id).then(({ data }) => {
      setPins(data || []);
    });
  }, [currentVersion, user]);

  async function handleIframeClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!user || !iframeRef.current || !currentVersion) return;
    const rect = iframeRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const { data } = await supabase.from("pins").insert({
      project_id: id, version_id: currentVersion.id,
      x_percent: Math.round(x * 100) / 100,
      y_percent: Math.round(y * 100) / 100,
      status: "open", created_by: user.id,
    }).select().single();
    if (data) {
      setPins(prev => [...prev, data]);
      setSelectedPin(data);
      setNewComment("");
      supabase.from("activity_feed").insert({
        project_id: id, user_id: user.id, action: "pin_created", target: data.id,
      }).then();
    }
  }

  async function addComment() {
    if (!newComment.trim() || !selectedPin || !user) return;
    const { data } = await supabase.from("pin_comments").insert({
      pin_id: selectedPin.id, user_id: user.id, content: newComment.trim(),
    }).select().single();
    if (data) { setComments(prev => [...prev, data]); setNewComment(""); }
  }

  async function togglePinStatus() {
    if (!selectedPin || !user) return;
    const newStatus = selectedPin.status === "open" ? "resolved" as const : "open" as const;
    await supabase.from("pins").update({ status: newStatus }).eq("id", selectedPin.id);
    setSelectedPin(prev => prev ? { ...prev, status: newStatus } : null);
    setPins(prev => prev.map(p => p.id === selectedPin.id ? { ...p, status: newStatus } : p));
    supabase.from("activity_feed").insert({
      project_id: id, user_id: user.id, action: newStatus === "resolved" ? "resolved" : "reopened", target: selectedPin.id,
    }).then();
  }

  async function loadComments(pinId: string) {
    const { data } = await supabase.from("pin_comments").select("*").eq("pin_id", pinId).order("created_at");
    setComments(data || []);
  }

  const handlePinClick = useCallback((pin: Pin) => {
    setSelectedPin(pin);
    loadComments(pin.id);
  }, []);

  async function uploadHTML() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".html";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || file.size > 10 * 1024 * 1024) { alert("Arquivo muito grande (max 10MB)"); return; }
      const versionNumber = versions.length > 0 ? versions[0].version_number + 1 : 1;
      const path = `${user!.id}/${id}/v${versionNumber}.html`;
      const { error } = await supabase.storage.from("mockups").upload(path, file, { upsert: true });
      if (error) { alert("Erro no upload"); return; }
      const { data: pubData } = supabase.storage.from("mockups").getPublicUrl(path);
      await supabase.from("versions").insert({
        project_id: id, version_number: versionNumber, storage_path: path, created_by: user!.id,
      });
      await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", id);
      loadVersions();
      supabase.from("activity_feed").insert({
        project_id: id, user_id: user!.id, action: "version_created", target: `${versionNumber}`,
      }).then();
    };
    input.click();
  }

  function copyShareLink() {
    navigator.clipboard.writeText(`${location.origin}/compartilhado/${id}`);
    setShowShare(false);
  }

  if (authLoading || !project) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-semibold text-gray-800">{project.name}</h1>
          {versions.length > 0 && (
            <select className="text-sm border rounded px-2 py-1"
              value={currentVersion?.id || ""}
              onChange={e => setCurrentVersion(versions.find(v => v.id === e.target.value) || null)}>
              {versions.map(v => <option key={v.id} value={v.id}>v{v.version_number}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={uploadHTML} className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Upload HTML
          </button>
          <button onClick={() => setShowShare(true)} className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">
            Compartilhar
          </button>
          <button onClick={async () => {
            await supabase.from("projects").update({ status: project.status === "active" ? "archived" : "active" }).eq("id", id);
            setProject({ ...project, status: project.status === "active" ? "archived" : "active" });
            router.push("/dashboard");
          }} className="px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 text-gray-600">
            {project.status === "active" ? "Arquivar" : "Desarquivar"}
          </button>
        </div>
      </div>

      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Compartilhar Projeto</h2>
            <div className="flex gap-2">
              <input readOnly value={`${location.origin}/compartilhado/${id}`} className="flex-1 px-3 py-2 border rounded-lg text-sm bg-gray-50" />
              <button onClick={copyShareLink} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Copiar</button>
            </div>
            <button onClick={() => setShowShare(false)} className="mt-3 text-sm text-gray-500 hover:text-gray-700">Fechar</button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          {currentVersion ? (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                  <p className="text-gray-400">Carregando mockup...</p>
                </div>
              )}
              <iframe ref={iframeRef} onLoad={() => setIframeLoaded(true)}
                src={supabase.storage.from("mockups").getPublicUrl(currentVersion.storage_path).data.publicUrl}
                className="w-full h-full border-0" sandbox="allow-same-origin"
                style={{ pointerEvents: "none" }} />
              <div className="absolute inset-0 cursor-crosshair" onClick={handleIframeClick} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">Nenhum mockup ainda</p>
                <button onClick={uploadHTML} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                  Fazer Upload
                </button>
              </div>
            </div>
          )}

          {pins.map(pin => (
            <button key={pin.id} onClick={(e) => { e.stopPropagation(); handlePinClick(pin); }}
              className={`absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg transition hover:scale-110 ${
                pin.status === "resolved" ? "bg-green-500" : pin.status === "reopened" ? "bg-blue-500" : "bg-orange-500"
              }`}
              style={{ left: `${pin.x_percent}%`, top: `${pin.y_percent}%` }}>
              {pin.status === "resolved" ? "✓" : "●"}
            </button>
          ))}
        </div>

        <div className="w-80 bg-white border-l overflow-y-auto p-4">
          <div className="flex gap-2 mb-4">
            <button onClick={() => setActiveTab("comments")}
              className={`flex-1 py-1.5 text-sm rounded-lg ${activeTab === "comments" ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
              Comentários
            </button>
            <button onClick={() => setActiveTab("versions")}
              className={`flex-1 py-1.5 text-sm rounded-lg ${activeTab === "versions" ? "bg-indigo-100 text-indigo-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
              Versões
            </button>
          </div>

          {activeTab === "comments" && (
            selectedPin ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm">Comentário</h3>
                  <div className="flex gap-1">
                    {user && (
                      <button onClick={togglePinStatus}
                        className={`text-xs px-2 py-1 rounded ${selectedPin.status === "open" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                        {selectedPin.status === "open" ? "Resolver" : "Reabrir"}
                      </button>
                    )}
                    <button onClick={() => setSelectedPin(null)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                </div>

                <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-gray-50 rounded-lg p-2 text-sm">
                      <p className="text-gray-800">{c.content}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(c.created_at).toLocaleString("pt-BR")}{c.edited_at ? " (editado)" : ""}</p>
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-xs text-gray-400">Nenhum comentário ainda</p>}
                </div>

                {user && (
                  <div className="flex gap-2">
                    <input value={newComment} onChange={e => setNewComment(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && addComment()}
                      placeholder="Digite um comentário..." className="flex-1 px-3 py-1.5 text-sm border rounded-lg" />
                    <button onClick={addComment} disabled={!newComment.trim()}
                      className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">Enviar</button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Clique em um pin para ver comentários</p>
            )
          )}

          {activeTab === "versions" && (
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} onClick={() => setCurrentVersion(v)}
                  className={`p-3 rounded-lg cursor-pointer text-sm ${currentVersion?.id === v.id ? "bg-indigo-100 border border-indigo-200" : "bg-gray-50 hover:bg-gray-100"}`}>
                  <p className="font-medium">Versão {v.version_number}</p>
                  <p className="text-xs text-gray-400">{new Date(v.created_at).toLocaleString("pt-BR")}</p>
                </div>
              ))}
              {versions.length === 0 && <p className="text-sm text-gray-400">Nenhuma versão ainda</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
