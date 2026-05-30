"use client";

import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Header } from "@/components/header";
import type { Project } from "@/lib/types";

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [filter, setFilter] = useState<"active" | "archived" | "all">("active");
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    let q = supabase.from("projects").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    q.then(({ data }) => setProjects(data || []));
  }, [user, filter]);

  async function createProject() {
    if (!newName.trim()) return;
    const supabase = createClient();
    const { data } = await supabase.from("projects").insert({
      user_id: user!.id, name: newName.trim(),
    }).select().single();
    if (data) router.push(`/projeto/${data.id}`);
    setShowNew(false); setNewName("");
  }

  async function toggleArchive(p: Project) {
    const supabase = createClient();
    await supabase.from("projects").update({
      status: p.status === "active" ? "archived" : "active",
    }).eq("id", p.id);
    setProjects(projects.map(pp => pp.id === p.id ? { ...pp, status: p.status === "active" ? "archived" as const : "active" as const } : pp));
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            {(["active", "archived", "all"] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${filter === f ? "bg-indigo-600 text-white" : "bg-white text-gray-600 border hover:bg-gray-50"}`}>
                {f === "active" ? "Ativos" : f === "archived" ? "Arquivados" : "Todos"}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNew(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            + Novo Projeto
          </button>
        </div>

        {showNew && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-semibold mb-4">Novo Projeto</h2>
              <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createProject()}
                placeholder="Nome do projeto" className="w-full px-3 py-2 border rounded-lg mb-4" />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowNew(false); setNewName(""); }} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancelar</button>
                <button onClick={createProject} disabled={!newName.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">Criar</button>
              </div>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500 text-lg mb-2">Nenhum projeto {filter === "active" ? "ativo" : filter === "archived" ? "arquivado" : ""}</p>
            <p className="text-gray-400 mb-4">Crie seu primeiro projeto para começar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div key={p.id} className="bg-white rounded-xl border shadow-sm hover:shadow-md transition p-5">
                <div onClick={() => router.push(`/projeto/${p.id}`)} className="cursor-pointer">
                  <h3 className="font-semibold text-gray-800 mb-1">{p.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}`}>
                    {p.status === "active" ? "Ativo" : "Arquivado"}
                  </span>
                  <p className="text-xs text-gray-400 mt-2">{new Date(p.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="mt-3 pt-3 border-t flex gap-2">
                  <button onClick={() => toggleArchive(p)}
                    className="text-xs text-gray-500 hover:text-gray-700">
                    {p.status === "active" ? "Arquivar" : "Desarquivar"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
