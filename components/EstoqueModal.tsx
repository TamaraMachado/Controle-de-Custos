"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  X, Plus, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
  Loader2, Package, DollarSign, TrendingDown, History,
  ChevronDown, ChevronUp, AlertCircle, Check
} from "lucide-react";

interface Movimentacao {
  id: string;
  tipo: "RECEBIMENTO" | "CONSUMO" | "PERDA";
  data: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  observacao: string;
  registrado_por: string;
  created_at: string;
}

interface Props {
  projetoId: string;
  custoDiretoId: string;
  descricao: string;
  unidade?: string;
  onClose: () => void;
}

const fmt = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const TIPO_CONFIG = {
  RECEBIMENTO: {
    label: "Recebimento",
    icon: ArrowDownToLine,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
    sign: +1,
  },
  CONSUMO: {
    label: "Consumo",
    icon: ArrowUpFromLine,
    color: "#7585fd",
    bg: "rgba(85,96,248,0.12)",
    border: "rgba(85,96,248,0.3)",
    sign: -1,
  },
  PERDA: {
    label: "Perda",
    icon: AlertTriangle,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
    sign: -1,
  },
};

export default function EstoqueModal({ projetoId, custoDiretoId, descricao, onClose }: Props) {
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showHistorico, setShowHistorico] = useState(true);
  const [error, setError] = useState("");

  // Form
  const [tipo, setTipo] = useState<"RECEBIMENTO" | "CONSUMO" | "PERDA">("RECEBIMENTO");
  const [data, setData] = useState(new Date().toISOString().split("T")[0]);
  const [quantidade, setQuantidade] = useState("");
  const [custoUnitario, setCustoUnitario] = useState("");
  const [observacao, setObservacao] = useState("");
  const [registradoPor, setRegistradoPor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("estoque_movimentacoes")
      .select("*")
      .eq("custo_direto_id", custoDiretoId)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false });
    setMovs(rows ?? []);
    setLoading(false);
  }, [custoDiretoId]);

  useEffect(() => { load(); }, [load]);

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const totalRecebido = movs.filter(m => m.tipo === "RECEBIMENTO").reduce((s, m) => s + m.quantidade, 0);
  const totalConsumido = movs.filter(m => m.tipo === "CONSUMO").reduce((s, m) => s + m.quantidade, 0);
  const totalPerdido = movs.filter(m => m.tipo === "PERDA").reduce((s, m) => s + m.quantidade, 0);
  const estoqueAtual = totalRecebido - totalConsumido - totalPerdido;

  const custoRecebido = movs.filter(m => m.tipo === "RECEBIMENTO").reduce((s, m) => s + m.custo_total, 0);
  const custoConsumido = movs.filter(m => m.tipo === "CONSUMO").reduce((s, m) => s + m.custo_total, 0);
  const custoPerdido = movs.filter(m => m.tipo === "PERDA").reduce((s, m) => s + m.custo_total, 0);
  const custoEstoque = custoRecebido - custoConsumido - custoPerdido;

  // Custo médio ponderado atual
  const custoMedio = totalRecebido > 0 ? custoRecebido / totalRecebido : 0;

  // ── Calcular custo_total automaticamente ─────────────────────────────────
  const qtd = parseFloat(quantidade) || 0;
  const cUnit = parseFloat(custoUnitario.replace(",", ".")) || custoMedio;
  const custoTotalCalc = qtd * cUnit;

  // ── Salvar movimentação ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (!quantidade || qtd <= 0) { setError("Informe a quantidade."); return; }
    if (!registradoPor.trim()) { setError("Informe quem está registrando."); return; }
    if ((tipo === "CONSUMO" || tipo === "PERDA") && qtd > estoqueAtual) {
      setError(`Quantidade maior que o estoque atual (${fmt(estoqueAtual, 4)} t).`);
      return;
    }
    setSaving(true);
    setError("");

    // Para CONSUMO e PERDA sem custo unitário, usa custo médio
    const unitFinal = cUnit || custoMedio;
    const totalFinal = qtd * unitFinal;

    await supabase.from("estoque_movimentacoes").insert([{
      projeto_id: projetoId,
      custo_direto_id: custoDiretoId,
      tipo,
      data,
      quantidade: qtd,
      custo_unitario: unitFinal,
      custo_total: totalFinal,
      observacao: observacao.trim(),
      registrado_por: registradoPor.trim(),
    }]);

    // Reset form
    setQuantidade("");
    setCustoUnitario("");
    setObservacao("");
    setShowForm(false);
    setSaving(false);
    await load();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(10px)" }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-3xl rounded-2xl flex flex-col animate-scaleIn"
        style={{
          background: "#161822",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 100px rgba(0,0,0,0.7)",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.3)" }}>
              <Package size={16} style={{ color: "#7585fd" }} />
            </div>
            <div>
              <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
                Controle de Estoque
              </h2>
              <p className="text-xs" style={{ color: "#5a607a" }}>{descricao}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/10 transition-all" style={{ color: "#5a607a" }}>
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">

          {/* ── Cards de resumo ── */}
          {loading ? (
            <div className="flex items-center justify-center py-8" style={{ color: "#5a607a" }}>
              <Loader2 size={18} className="animate-spin mr-2" />Carregando...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Estoque atual */}
                <div className="col-span-2 rounded-xl p-4" style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Package size={13} style={{ color: "#7585fd" }} />
                    <span className="text-xs font-semibold" style={{ color: "#7585fd" }}>ESTOQUE ATUAL</span>
                  </div>
                  <p className="text-2xl font-bold" style={{ color: estoqueAtual < 0 ? "#ef4444" : "#e8eaf0" }}>
                    {fmt(estoqueAtual, 4)} t
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                    Custo: R$ {fmt(custoEstoque)} · Custo médio: R$ {fmt(custoMedio, 4)}/t
                  </p>
                </div>

                {/* Total recebido */}
                <div className="rounded-xl p-4" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)" }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ArrowDownToLine size={12} style={{ color: "#22c55e" }} />
                    <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>RECEBIDO</span>
                  </div>
                  <p className="text-base font-bold" style={{ color: "#e8eaf0" }}>{fmt(totalRecebido, 4)} t</p>
                  <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>R$ {fmt(custoRecebido)}</p>
                </div>

                {/* Consumo + Perda */}
                <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown size={12} style={{ color: "#ef4444" }} />
                    <span className="text-xs font-semibold" style={{ color: "#ef4444" }}>CONSUMO + PERDA</span>
                  </div>
                  <p className="text-base font-bold" style={{ color: "#e8eaf0" }}>{fmt(totalConsumido + totalPerdido, 4)} t</p>
                  <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>R$ {fmt(custoConsumido + custoPerdido)}</p>
                </div>
              </div>

              {/* ── Nova movimentação ── */}
              {!showForm ? (
                <div className="flex gap-2">
                  {(["RECEBIMENTO", "CONSUMO", "PERDA"] as const).map(t => {
                    const cfg = TIPO_CONFIG[t];
                    const Icon = cfg.icon;
                    return (
                      <button key={t} onClick={() => { setTipo(t); setShowForm(true); setError(""); }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                        style={{ background: cfg.bg, border: `1px solid ${cfg.border}`, color: cfg.color }}>
                        <Icon size={13} />{cfg.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl p-5 space-y-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {/* Tipo selector */}
                  <div className="flex gap-2 mb-1">
                    {(["RECEBIMENTO", "CONSUMO", "PERDA"] as const).map(t => {
                      const cfg = TIPO_CONFIG[t];
                      const Icon = cfg.icon;
                      return (
                        <button key={t} onClick={() => setTipo(t)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                          style={tipo === t
                            ? { background: cfg.bg, border: `1.5px solid ${cfg.border}`, color: cfg.color }
                            : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", color: "#5a607a" }}>
                          {tipo === t && <Check size={10} />}<Icon size={11} />{cfg.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Data</label>
                      <input type="date" value={data} onChange={e => setData(e.target.value)} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Quantidade (t)</label>
                      <input type="number" step="0.0001" value={quantidade} onChange={e => setQuantidade(e.target.value)}
                        className="input-field text-xs py-2" placeholder="0,0000" style={{ color: "#e8eaf0" }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>
                        Custo unitário (R$/t)
                        {tipo !== "RECEBIMENTO" && <span className="ml-1 text-xs" style={{ color: "#5a607a" }}>· deixe em branco para usar custo médio ({fmt(custoMedio, 4)})</span>}
                      </label>
                      <input type="number" step="0.01" value={custoUnitario} onChange={e => setCustoUnitario(e.target.value)}
                        className="input-field text-xs py-2" placeholder={tipo !== "RECEBIMENTO" ? `${fmt(custoMedio, 2)} (custo médio)` : "0,00"}
                        style={{ color: "#e8eaf0" }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Custo total calculado</label>
                      <div className="input-field text-xs py-2 font-semibold" style={{ color: "#22c55e", cursor: "default" }}>
                        R$ {fmt(custoTotalCalc)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                      <input value={registradoPor} onChange={e => setRegistradoPor(e.target.value)}
                        className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Observação</label>
                      <input value={observacao} onChange={e => setObservacao(e.target.value)}
                        className="input-field text-xs py-2" placeholder="NF, lote, motivo..." style={{ color: "#e8eaf0" }} />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
                      style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}>
                      <AlertCircle size={12} />{error}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowForm(false); setError(""); }}
                      className="px-4 py-2 rounded-xl text-xs font-medium transition-all"
                      style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                      Cancelar
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold transition-all"
                      style={{ background: TIPO_CONFIG[tipo].bg, border: `1px solid ${TIPO_CONFIG[tipo].border}`, color: TIPO_CONFIG[tipo].color }}>
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                      Registrar {TIPO_CONFIG[tipo].label}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Histórico ── */}
              <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                <button onClick={() => setShowHistorico(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
                  style={{ background: "rgba(255,255,255,0.02)" }}>
                  <div className="flex items-center gap-2">
                    <History size={13} style={{ color: "#5560f8" }} />
                    <span className="text-xs font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Movimentações</span>
                    {movs.length > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{movs.length}</span>
                    )}
                  </div>
                  {showHistorico ? <ChevronUp size={13} style={{ color: "#5a607a" }} /> : <ChevronDown size={13} style={{ color: "#5a607a" }} />}
                </button>

                {showHistorico && (
                  <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {movs.length === 0 ? (
                      <div className="flex items-center justify-center py-8" style={{ color: "#5a607a" }}>
                        <p className="text-sm">Nenhuma movimentação registrada.</p>
                      </div>
                    ) : (
                      <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                            {["Data","Tipo","Quantidade","Custo Unit.","Custo Total","Registrado por","Observação"].map(h => (
                              <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {movs.map(m => {
                            const cfg = TIPO_CONFIG[m.tipo];
                            const Icon = cfg.icon;
                            return (
                              <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>
                                  {new Date(m.data + "T12:00:00").toLocaleDateString("pt-BR")}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md w-fit text-xs font-semibold"
                                    style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                                    <Icon size={10} />{cfg.label}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 font-semibold" style={{ color: cfg.sign > 0 ? "#22c55e" : "#ef4444" }}>
                                  {cfg.sign > 0 ? "+" : "-"}{fmt(m.quantidade, 4)} t
                                </td>
                                <td className="px-4 py-2.5" style={{ color: "#8890a8" }}>R$ {fmt(m.custo_unitario, 4)}</td>
                                <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>R$ {fmt(m.custo_total)}</td>
                                <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{m.registrado_por || "—"}</td>
                                <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: "#8890a8" }}>{m.observacao || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
