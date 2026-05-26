"use client";

import { useRouter } from "next/navigation";
import { Projeto, supabase } from "@/lib/supabase";
import { ArrowRight, Package, User, Calendar, Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  projeto: Projeto;
  index: number;
  onDelete: () => void;
}

const COLORS = [
  { bg: "rgba(85,96,248,0.12)", border: "rgba(85,96,248,0.3)", dot: "#5560f8" },
  { bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", dot: "#22c55e" },
  { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", dot: "#f59e0b" },
  { bg: "rgba(236,72,153,0.1)", border: "rgba(236,72,153,0.25)", dot: "#ec4899" },
  { bg: "rgba(14,165,233,0.1)", border: "rgba(14,165,233,0.25)", dot: "#0ea5e9" },
  { bg: "rgba(168,85,247,0.1)", border: "rgba(168,85,247,0.25)", dot: "#a855f7" },
];

export default function ProjetoCard({ projeto, index, onDelete }: Props) {
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const color = COLORS[index % COLORS.length];

  const dataFormatada = new Date(projeto.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    setDeleting(true);
    await supabase.from("projetos").delete().eq("id", projeto.id);
    onDelete();
  };

  return (
    <div
      className="glass glass-hover rounded-2xl p-5 cursor-pointer relative group"
      style={{
        opacity: 0,
        animation: `slideUp 0.4s ease forwards`,
        animationDelay: `${index * 0.08}s`,
      }}
      onClick={() => router.push(`/projeto/${projeto.id}`)}
    >
      {/* Color accent */}
      <div
        className="absolute top-0 left-6 right-6 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${color.dot}, transparent)` }}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: color.bg, border: `1px solid ${color.border}` }}
        >
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color.dot }} />
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all"
            style={{
              background: confirmDelete ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
              border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
              color: confirmDelete ? "#ef4444" : "#5a607a",
            }}
            title={confirmDelete ? "Clique novamente para confirmar" : "Excluir projeto"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Project name */}
      <h3
        className="font-semibold text-base mb-3 leading-snug"
        style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}
      >
        {projeto.nome}
      </h3>

      {/* Info rows */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <Package size={12} style={{ color: "#5a607a", flexShrink: 0 }} />
          <span className="text-xs truncate" style={{ color: "#8890a8" }}>
            {projeto.produto}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <User size={12} style={{ color: "#5a607a", flexShrink: 0 }} />
          <span className="text-xs truncate" style={{ color: "#8890a8" }}>
            {projeto.cliente}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar size={12} style={{ color: "#5a607a", flexShrink: 0 }} />
          <span className="text-xs" style={{ color: "#5a607a" }}>
            {dataFormatada}
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between pt-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span className="text-xs" style={{ color: "#5a607a" }}>
          Ver detalhes
        </span>
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center transition-all group-hover:translate-x-0.5"
          style={{ background: color.bg, color: color.dot }}
        >
          <ArrowRight size={12} />
        </div>
      </div>
    </div>
  );
}
