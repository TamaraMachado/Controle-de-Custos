"use client";

import { useEffect, useState } from "react";
import { supabase, Projeto } from "@/lib/supabase";
import NovoProjetoModal from "@/components/NovoProjetoModal";
import ProjetoCard from "@/components/ProjetoCard";
import { Plus, BarChart3, Layers } from "lucide-react";

export default function HomePage() {
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);

  const carregarProjetos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("projetos")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setProjetos(data);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregarProjetos();
  }, []);

  const handleProjetoCriado = () => {
    setModalAberto(false);
    carregarProjetos();
  };

  return (
    <div className="min-h-screen" style={{ background: "#0f1117" }}>
      {/* Background decoration */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(85,96,248,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Header */}
      <header className="relative border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #5560f8, #3d3eed)" }}
            >
              <BarChart3 size={18} color="white" strokeWidth={2} />
            </div>
            <div>
              <h1
                className="text-lg font-bold tracking-tight"
                style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}
              >
                Controle de Custos
              </h1>
              <p className="text-xs" style={{ color: "#5a607a" }}>
                Gestão de projetos e custos
              </p>
            </div>
          </div>

          <button
            className="btn-primary"
            onClick={() => setModalAberto(true)}
          >
            <Plus size={16} strokeWidth={2.5} />
            Novo Projeto
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="relative max-w-7xl mx-auto px-6 py-10">
        {/* Page title */}
        <div className="mb-8 animate-fadeIn">
          <h2
            className="text-2xl font-bold mb-1"
            style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}
          >
            Meus Projetos
          </h2>
          <p className="text-sm" style={{ color: "#5a607a" }}>
            {projetos.length === 0
              ? "Nenhum projeto criado ainda"
              : `${projetos.length} projeto${projetos.length > 1 ? "s" : ""} cadastrado${projetos.length > 1 ? "s" : ""}`}
          </p>
        </div>

        {/* Projects grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="glass rounded-2xl p-6 h-40 animate-pulse"
                style={{ animationDelay: `${i * 0.1}s` }}
              />
            ))}
          </div>
        ) : projetos.length === 0 ? (
          /* Empty state */
          <div
            className="flex flex-col items-center justify-center py-24 animate-fadeIn"
            style={{ opacity: 0, animationDelay: "0.1s", animationFillMode: "forwards" }}
          >
            <div
              className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6"
              style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}
            >
              <Layers size={36} style={{ color: "#5560f8" }} />
            </div>
            <h3
              className="text-xl font-semibold mb-2"
              style={{ fontFamily: "var(--font-sora)", color: "#c8cde0" }}
            >
              Nenhum projeto ainda
            </h3>
            <p className="text-sm mb-6 text-center max-w-xs" style={{ color: "#5a607a" }}>
              Crie seu primeiro projeto para começar a controlar os custos
            </p>
            <button className="btn-primary" onClick={() => setModalAberto(true)}>
              <Plus size={16} strokeWidth={2.5} />
              Criar primeiro projeto
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projetos.map((projeto, idx) => (
              <ProjetoCard
                key={projeto.id}
                projeto={projeto}
                index={idx}
                onDelete={carregarProjetos}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalAberto && (
        <NovoProjetoModal
          onClose={() => setModalAberto(false)}
          onSucesso={handleProjetoCriado}
        />
      )}
    </div>
  );
}
