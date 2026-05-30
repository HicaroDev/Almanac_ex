"use client";

import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import { Header } from "@/components/header";
import type { Project, Version, Pin, PinComment, ActivityFeed } from "@/lib/types";
import { clusterPins, getPinSize, getClusterSize } from "@/utils/clusterPins";
import type { PinDisplay } from "@/utils/clusterPins";

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
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, { emoji: string; count: number; userReacted: boolean }[]>>({});
  const [activeTab, setActiveTab] = useState<"comments" | "versions">("comments");
  const [showShare, setShowShare] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [activity, setActivity] = useState<ActivityFeed[]>([]);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [clusterExpanded, setClusterExpanded] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) router.push("/");
  }, [user, authLoading]);

  const supabase = createClient();

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: proj } = await supabase.from("projects").select("*").eq("id", id).single();
      if (proj) setProject(proj);
      if (proj?.shared_emails) setSharedEmails(proj.shared_emails);
    })();
    loadVersions();
  }, [user, id]);

  useEffect(() => {
    if (!currentVersion || !user) return;
    supabase.from("pins").select("*").eq("project_id", id).eq("version_id", currentVersion.id).then(({ data }) => {
      setPins(data || []);
    });
  }, [currentVersion, user]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel("pins-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pins", filter: `project_id=eq.${id}` }, (payload) => {
        const newPin = payload.new as Pin;
        setPins(prev => prev.some(p => p.id === newPin.id) ? prev : [...prev, newPin]);
        setNotificationCount(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, id]);

  useEffect(() => {
    if (!user) return;
    supabase.from("activity_feed").select("*, users(name, avatar_url)").eq("project_id", id).order("created_at", { ascending: false }).limit(20).then(({ data }) => {
      setActivity(data || []);
    });
    const channel = supabase.channel("activity-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_feed", filter: `project_id=eq.${id}` }, (payload) => {
        const item = payload.new as ActivityFeed;
        setActivity(prev => [item, ...prev].slice(0, 20));
        setNotificationCount(prev => prev + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, id]);

  function loadVersions() {
    supabase.from("versions").select("*").eq("project_id", id).order("version_number", { ascending: false }).then(({ data, error }) => {
      if (error) { console.error("loadVersions error:", error); return; }
      const v = data || [];
      setVersions(v);
      if (v.length > 0) setCurrentVersion(v[0]);
    });
  }

  async function handleIframeClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!user || !iframeRef.current || !currentVersion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    const { data, error } = await supabase.from("pins").insert({
      project_id: id, version_id: currentVersion.id,
      x_percent: Math.round(x * 100) / 100,
      y_percent: Math.round(y * 100) / 100,
      status: "open", created_by: user.id,
    }).select().single();
    if (error) { console.error("Pin insert error:", error); return; }
    if (data) {
      setPins(prev => [...prev, data]);
      setSelectedPin(data);
      setComments([]);
      setNewComment("");
      setActiveTab("comments");
      supabase.from("activity_feed").insert({
        project_id: id, user_id: user.id, action: "pin_created", target: data.id,
      }).then();
    }
  }

  async function addComment() {
    if (!newComment.trim() || !selectedPin || !user) return;
    const { data } = await supabase.from("pin_comments").insert({
      pin_id: selectedPin.id, user_id: user.id, content: newComment.trim(),
      parent_id: replyTo,
    }).select().single();
    if (data) {
      setComments(prev => [...prev, data]);
      setNewComment("");
      setReplyTo(null);
      supabase.from("activity_feed").insert({
        project_id: id, user_id: user.id, action: "comment_created", target: selectedPin.id,
      }).then();
    }
  }

  async function editComment(commentId: string) {
    if (!editText.trim() || !user) return;
    await supabase.from("pin_comments").update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq("id", commentId);
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: editText.trim(), edited_at: new Date().toISOString() } : c));
    setEditingComment(null);
    setEditText("");
  }

  async function deleteComment(commentId: string) {
    if (!user) return;
    await supabase.from("pin_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setShowDeleteConfirm(null);
  }

  async function loadReactions(pinId: string) {
    const { data } = await supabase.from("pin_reactions").select("*").eq("pin_id", pinId);
    if (!data) return;
    const grouped: Record<string, { emoji: string; count: number; userReacted: boolean }[]> = {};
    const map: Record<string, { emoji: string; userIds: string[] }> = {};
    for (const r of data) {
      if (!map[r.emoji]) map[r.emoji] = { emoji: r.emoji, userIds: [] };
      map[r.emoji].userIds.push(r.user_id);
    }
    grouped[pinId] = Object.values(map).map(m => ({
      emoji: m.emoji, count: m.userIds.length, userReacted: m.userIds.includes(user?.id || ""),
    }));
    setReactions(prev => ({ ...prev, ...grouped }));
  }

  async function toggleReaction(pinId: string, emoji: string) {
    if (!user) return;
    const existing = reactions[pinId]?.find(r => r.emoji === emoji);
    if (existing?.userReacted) {
      await supabase.from("pin_reactions").delete().eq("pin_id", pinId).eq("user_id", user.id).eq("emoji", emoji);
    } else {
      await supabase.from("pin_reactions").insert({ pin_id: pinId, user_id: user.id, emoji }).select().single();
    }
    loadReactions(pinId);
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

  async function deletePin() {
    if (!selectedPin || !user) return;
    await supabase.from("pin_comments").delete().eq("pin_id", selectedPin.id);
    await supabase.from("pin_reactions").delete().eq("pin_id", selectedPin.id);
    await supabase.from("pins").delete().eq("id", selectedPin.id);
    setPins(prev => prev.filter(p => p.id !== selectedPin.id));
    setSelectedPin(null);
  }

  async function loadComments(pinId: string) {
    const { data } = await supabase.from("pin_comments").select("*").eq("pin_id", pinId).order("created_at");
    setComments(data || []);
    loadReactions(pinId);
  }

  const handlePinClick = useCallback((pin: Pin) => {
    setSelectedPin(pin);
    loadComments(pin.id);
    setActiveTab("comments");
    setClusterExpanded(null);
  }, []);

  const handleClusterClick = useCallback((clusterId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setClusterExpanded(prev => prev === clusterId ? null : clusterId);
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
      const { error } = await supabase.storage.from("mockups").upload(path, file, { upsert: true, contentType: "text/html" });
      if (error) { alert("Erro no upload"); return; }
      const { data: pubData } = supabase.storage.from("mockups").getPublicUrl(path);
      const { error: verError } = await supabase.from("versions").insert({
        project_id: id, version_number: versionNumber, storage_path: path, created_by: user!.id,
      });
      if (verError) { console.error("Version insert error:", verError); alert("Erro ao criar versão"); return; }
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

  async function addShareEmail() {
    if (!shareEmail.trim() || !user) return;
    const updated = [...new Set([...sharedEmails, shareEmail.trim()])];
    await supabase.from("projects").update({ shared_emails: updated }).eq("id", id);
    setSharedEmails(updated);
    setShareEmail("");
  }

  async function removeShareEmail(email: string) {
    const updated = sharedEmails.filter(e => e !== email);
    await supabase.from("projects").update({ shared_emails: updated }).eq("id", id);
    setSharedEmails(updated);
  }

  const displayedPins: PinDisplay[] = clusterPins(pins);
  const pinOrder = [...pins].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const pinNumber = new Map(pinOrder.map((p, i) => [p.id, i + 1]));

  if (authLoading || !project) return <div className="min-h-screen flex items-center justify-center text-gray-400 bg-gray-50">Carregando...</div>;
  if (isMobile) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-[#0b1a2e] to-[#061220] p-8 text-center">
      <div className="text-6xl mb-4">📱</div>
      <h1 className="text-2xl font-bold text-white mb-2">Almanac</h1>
      <p className="text-blue-200/60 max-w-xs">O sistema não pode ser aberto em celular. Abra em um tablet ou computador para usar.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header notificationCount={notificationCount} onNotificationClick={() => setShowNotifications(prev => !prev)} />
      {showNotifications && (
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}>
          <div className="absolute right-4 md:right-6 top-16 bg-white rounded-2xl shadow-lg border border-gray-200 w-80 max-h-96 overflow-y-auto z-50 animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b border-gray-200 font-medium text-sm text-gray-900">Atividades recentes</div>
            {activity.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Nenhuma atividade ainda</p>
            ) : (
              activity.map(item => (
                <div key={item.id} className="px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 text-sm">
                  <span className="text-gray-700">
                    {item.action === "pin_created" && "📌 Novo pin criado"}
                    {item.action === "version_created" && "📦 Nova versão enviada"}
                    {item.action === "resolved" && "✅ Pin resolvido"}
                    {item.action === "reopened" && "🔄 Pin reaberto"}
                    {item.action === "commented" && "💬 Novo comentário"}
                    {!["pin_created","version_created","resolved","reopened","commented"].includes(item.action) && item.action}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{new Date(item.created_at).toLocaleString("pt-BR")}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      <div className="bg-white border-b border-gray-200 px-3 md:px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => setShowSidebar(prev => !prev)}
            className="md:hidden text-gray-400 hover:text-gray-600 text-lg px-1">
            ☰
          </button>
          <h1 className="font-semibold text-gray-900 truncate text-sm md:text-base">{project.name}</h1>
          {versions.length > 0 && (
            <select className="text-sm bg-white border border-gray-200 rounded-lg px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={currentVersion?.id || ""}
              onChange={e => setCurrentVersion(versions.find(v => v.id === e.target.value) || null)}>
              {versions.map(v => <option key={v.id} value={v.id}>v{v.version_number}</option>)}
            </select>
          )}
        </div>
        <div className="flex gap-1.5 md:gap-2">
          <button onClick={uploadHTML} className="px-2.5 md:px-3 py-1.5 text-xs md:text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-sm">
            Upload
          </button>
          <button onClick={() => setShowShare(true)} className="px-2.5 md:px-3 py-1.5 text-xs md:text-sm bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition-all">
            Compartilhar
          </button>
          <button onClick={async () => {
            await supabase.from("projects").update({ status: project.status === "active" ? "archived" : "active" }).eq("id", id);
            setProject({ ...project, status: project.status === "active" ? "archived" : "active" });
            router.push("/dashboard");
          }} className="hidden md:inline px-3 py-1.5 text-sm bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-all">
            {project.status === "active" ? "Arquivar" : "Desarquivar"}
          </button>
        </div>
      </div>

      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-200 animate-fade-in">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Compartilhar Projeto</h2>
            <div className="flex gap-2 mb-4">
              <input readOnly value={`${location.origin}/compartilhado/${id}`}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700" />
              <button onClick={copyShareLink} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all">Copiar</button>
            </div>
            <div className="border-t border-gray-200 pt-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Pessoas com acesso</h3>
              <p className="text-xs text-gray-400 mb-2">O link público já permite visualizar. Adicione e-mails para colaboradores poderem comentar.</p>
              {sharedEmails.length > 0 && (
                <div className="space-y-1 mb-3">
                  {sharedEmails.map(email => (
                    <div key={email} className="flex items-center justify-between bg-gray-50 rounded-xl px-2 py-1.5 text-sm">
                      <span className="flex items-center gap-1 text-gray-700">
                        <span className="text-gray-400">📧</span> {email}
                      </span>
                      <button onClick={() => removeShareEmail(email)} className="text-red-500/70 hover:text-red-500 text-xs font-medium">Remover</button>
                    </div>
                  ))}
                </div>
              )}
              {sharedEmails.length === 0 && (
                <p className="text-xs text-gray-400 mb-2 italic">Nenhum colaborador adicionado ainda</p>
              )}
              <div className="flex gap-2">
                <input value={shareEmail} onChange={e => setShareEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addShareEmail()}
                  placeholder="email@exemplo.com"
                  className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                <button onClick={addShareEmail} className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 transition-all">Adicionar</button>
              </div>
            </div>
            <button onClick={() => setShowShare(false)} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">Fechar</button>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 relative">
          {currentVersion ? (
            <>
              {!iframeLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
                  <p className="text-gray-400">Carregando mockup...</p>
                </div>
              )}
              <iframe ref={iframeRef} onLoad={() => setIframeLoaded(true)}
                src={supabase.storage.from("mockups").getPublicUrl(currentVersion.storage_path).data.publicUrl}
                className="w-full h-full border-0" sandbox="allow-scripts"
                style={{ pointerEvents: "none" }} />
              <div className="absolute inset-0 cursor-crosshair"
                onMouseDown={(e) => { dragStart.current = { x: e.clientX, y: e.clientY }; }}
                onMouseUp={(e) => {
                  if (!dragStart.current) return;
                  const dx = Math.abs(e.clientX - dragStart.current.x);
                  const dy = Math.abs(e.clientY - dragStart.current.y);
                  dragStart.current = null;
                  if (dx > 5 || dy > 5) return;
                  setClusterExpanded(null);
                  handleIframeClick(e);
                }}
                onMouseLeave={() => { dragStart.current = null; }} />
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              <div className="text-center">
                <p className="text-lg mb-2">Nenhum mockup ainda</p>
                <button onClick={uploadHTML} className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-500 transition-all shadow-sm">
                  Fazer Upload
                </button>
              </div>
            </div>
          )}

          {displayedPins.map((item, idx) => {
            if ("isCluster" in item && item.isCluster) {
              const size = getClusterSize(item.count);
              const isExpanded = clusterExpanded === item.id;
              return (
                <div key={item.id} className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${item.x_percent}%`, top: `${item.y_percent}%` }}>
                  <button onClick={(e) => handleClusterClick(item.id, e)}
                    className="rounded-full bg-orange-500 text-white font-bold shadow-md hover:scale-110 transition flex items-center justify-center"
                    style={{ width: `${Math.min(size + 8, 28)}px`, height: `${Math.min(size + 8, 28)}px`, fontSize: `${Math.min(9 + item.count, 12)}px` }}>
                    {item.count}
                  </button>
                  {isExpanded && (
                    <div className="absolute top-full mt-2 bg-white border border-gray-200 rounded-xl shadow-lg p-2 z-50 min-w-[160px] animate-fade-in"
                      onClick={e => e.stopPropagation()}>
                      {item.pins.map(pin => (
                        <button key={pin.id} onClick={() => { setSelectedPin(pin); loadComments(pin.id); setActiveTab("comments"); setClusterExpanded(null); }}
                          className="block w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition">
                          #{pinNumber.get(pin.id) || "?"} - ({Math.round(pin.x_percent)}%, {Math.round(pin.y_percent)}%)
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            const pin = item as Pin;
            const size = getPinSize();
            return (
              <button key={pin.id} onClick={(e) => { e.stopPropagation(); handlePinClick(pin); }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center font-bold text-white shadow-md transition hover:scale-110 ${
                  pin.status === "resolved" ? "bg-green-500" : pin.status === "reopened" ? "bg-blue-500" : "bg-orange-500"
                } ${selectedPin?.id === pin.id ? "animate-spin-shadow ring-2 ring-green-400" : ""}`}
                style={{ left: `${pin.x_percent}%`, top: `${pin.y_percent}%`, width: `${size}px`, height: `${size}px`, fontSize: `${Math.max(9, size - 6)}px` }}>
                {pinNumber.get(pin.id) || idx + 1}
              </button>
            );
          })}
        </div>

        <div className={`${showSidebar ? "block" : "hidden"} md:block w-72 lg:w-80 bg-white border-l border-gray-200 overflow-y-auto p-4`}>
          <div className="flex gap-2 mb-4">
            <button onClick={() => setActiveTab("comments")}
              className={`flex-1 py-1.5 text-sm rounded-xl transition-all ${activeTab === "comments" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              Comentários
            </button>
            <button onClick={() => setActiveTab("versions")}
              className={`flex-1 py-1.5 text-sm rounded-xl transition-all ${activeTab === "versions" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50"}`}>
              Versões
            </button>
          </div>

          {activeTab === "comments" && (
            selectedPin ? (
              <div>
                  <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-sm text-gray-900">Pin #{pinNumber.get(selectedPin.id) || "?"}</h3>
                  <div className="flex gap-1 flex-wrap justify-end">
                    {user && user.id === selectedPin.created_by && (
                      <button onClick={deletePin}
                        className="text-xs px-2 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition">Deletar</button>
                    )}
                    {user && (
                      <button onClick={togglePinStatus}
                        className={`text-xs px-2 py-1 rounded-lg transition ${selectedPin.status === "open" ? "bg-green-50 text-green-600 hover:bg-green-100" : "bg-orange-50 text-orange-600 hover:bg-orange-100"}`}>
                        {selectedPin.status === "open" ? "Resolver" : "Reabrir"}
                      </button>
                    )}
                    <button onClick={() => { setSelectedPin(null); setReplyTo(null); }} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
                  </div>
                </div>

                <div className="space-y-2 mb-3 max-h-60 overflow-y-auto">
                  {comments.map(c => (
                    <div key={c.id} className="bg-gray-50 rounded-xl p-2 text-sm">
                      {editingComment === c.id ? (
                        <div className="flex gap-2">
                          <input value={editText} onChange={e => setEditText(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && editComment(c.id)}
                            className="flex-1 px-2 py-1 text-sm bg-white border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" autoFocus />
                          <button onClick={() => editComment(c.id)} className="text-xs text-indigo-600">Salvar</button>
                          <button onClick={() => setEditingComment(null)} className="text-xs text-gray-400">Cancelar</button>
                        </div>
                      ) : (
                        <>
                          <p className="text-gray-800">{c.content}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString("pt-BR")}{c.edited_at ? " (editado)" : ""}</p>
                            {user && user.id === c.user_id && (
                              <>
                                <button onClick={() => { setEditingComment(c.id); setEditText(c.content); }}
                                  className="text-xs text-indigo-600 hover:text-indigo-500">editar</button>
                                <button onClick={() => setShowDeleteConfirm(c.id)}
                                  className="text-xs text-red-500 hover:text-red-400">deletar</button>
                              </>
                            )}
                            <button onClick={() => { setReplyTo(c.id); setNewComment(""); }}
                              className="text-xs text-gray-400 hover:text-gray-600">responder</button>
                          </div>
                          {c.parent_id && (
                            <p className="text-[10px] text-gray-300 mt-1">↳ resposta</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                  {comments.length === 0 && <p className="text-xs text-gray-400">Nenhum comentário ainda. Digite abaixo!</p>}
                </div>

                {reactions[selectedPin.id] && reactions[selectedPin.id].length > 0 && (
                  <div className="flex gap-1 mb-3 flex-wrap">
                    {reactions[selectedPin.id].map(r => (
                      <button key={r.emoji} onClick={() => toggleReaction(selectedPin.id, r.emoji)}
                        className={`text-sm px-2 py-1 rounded-full border transition ${r.userReacted ? "bg-indigo-50 border-indigo-200 text-gray-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                        {r.emoji} {r.count}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-1 mb-2">
                  {["👍", "❤️", "😂", "🎯", "💡"].map(emoji => (
                    <button key={emoji} onClick={() => toggleReaction(selectedPin.id, emoji)}
                      className="text-sm px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                      {emoji}
                    </button>
                  ))}
                </div>

                {user && (
                  <div>
                    {replyTo && (
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs text-gray-400">Respondendo a comentário</span>
                        <button onClick={() => setReplyTo(null)} className="text-xs text-red-500">✕</button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input value={newComment} onChange={e => setNewComment(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && addComment()}
                        placeholder={replyTo ? "Digite sua resposta..." : "Digite um comentário..."}
                        className="flex-1 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
                      <button onClick={addComment} disabled={!newComment.trim()}
                        className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-xl hover:bg-indigo-500 disabled:opacity-50 transition-all">Enviar</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Clique em um pin para ver comentários</p>
            )
          )}

          {showDeleteConfirm && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
              <div className="bg-white rounded-2xl p-6 text-center max-w-sm shadow-xl border border-gray-200 animate-fade-in">
                <p className="text-sm text-gray-900 mb-4">Deletar comentário?</p>
                <div className="flex gap-2 justify-center">
                  <button onClick={() => deleteComment(showDeleteConfirm)} className="px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-400 text-sm transition-all">Deletar</button>
                  <button onClick={() => setShowDeleteConfirm(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 text-sm transition-all">Cancelar</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "versions" && (
            <div className="space-y-2">
              {versions.map(v => (
                <div key={v.id} onClick={() => setCurrentVersion(v)}
                  className={`p-3 rounded-xl cursor-pointer text-sm transition-all ${currentVersion?.id === v.id ? "bg-indigo-50 border border-indigo-200 text-gray-900" : "bg-white border border-gray-100 text-gray-600 hover:bg-gray-50"}`}>
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
