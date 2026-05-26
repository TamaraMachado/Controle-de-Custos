"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { X, FolderPlus, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
  onSucesso: () => void;
}

export default function NovoProjetoModal({ onClose, onSucesso }: Props) {
  const [nome, setNome] = useState("");
  const [produto, setProduto] = useState("");
  const [cliente, setCliente] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !produto.trim() || !cliente.trim()) {
      setErro("Preencha todos os campos.");
      return;
    }

    setLoading(true);
    setErro("");

    const { error } = await supabase.from("projetos").insert([
      { nome: nome.trim(), produto: produto.trim(), cliente: cliente.trim() },
    ]);

    if (error) {
      setErro("Erro ao criar projeto. Tente novamente.");
      setLoading(false);
      return;
    }

    onSucesso();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl animate-scaleIn"
        style={{
          background: "#161822",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(85,96,248,0.1)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.3)" }}
            >
              <FolderPlus size={15} style={{ color: "#7585fd" }} />
            </div>
            <div>
              <h2
                className="text-base font-semibold"
                style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}
              >
                Novo Projeto
              </h2>
              <p className="text-xs" style={{ color: "#5a607a" }}>
                Preencha as informações do projeto
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-white/10"
            style={{ color: "#5a607a" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "#8890a8" }}
            >
              Nome do Projeto
            </label>
            <input
              className="input-field"
              placeholder="Ex: Projeto Alpha 2024"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "#8890a8" }}
            >
              Produto
            </label>
            <input
              className="input-field"
              placeholder="Ex: Tecido Jeans 380g"
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "#8890a8" }}
            >
              Cliente
            </label>
            <input
              className="input-field"
              placeholder="Ex: Empresa XYZ Ltda."
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
            />
          </div>

          {erro && (
            <p
              className="text-xs px-3 py-2 rounded-lg"
              style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}
            >
              {erro}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "#8890a8",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 btn-primary justify-center py-2.5"
            >
              {loading ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <>
                  <FolderPlus size={15} />
                  Criar Projeto
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
