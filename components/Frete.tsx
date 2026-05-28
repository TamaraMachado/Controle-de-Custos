"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import {
  Pencil, Save, X, Plus, Trash2, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Check
} from "lucide-react";

interface FretePlanejado {
  id?: string;
  custo_por_ton: number;
  salvo_por?: string;
  observacao?: string;
  updated_at?: string;
}

interface FreteRealizado {
  id: string;
  data_cte: string;
  numero_cte: string;
  custo_por_ton: number;
  custo_cte: number;
  quantidade_ton: number;
  observacao: string;
}

interface Historico {
  id: string; item_id: string; tipo: string;
  descricao_item: string; campo: string;
  valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}

interface Props { projetoId: string; }

const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

export default function Frete({ projetoId }: Props) {
  const [planejado, setPlanejado] = useState<FretePlanejado | null>(null);
  const [realizado, setRealizado] = useState<FreteRealizado[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistorico, setShowHistorico] = useState(false);

  // Planejado
  const [estadoPlan, setEstadoPlan] = useState<"novo" | "salvo" | "editando">("novo");
  const [planForm, setPlanForm] = useState({ custo_por_ton: "" });
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planWho, setPlanWho] = useState("");
  const [planObs, setPlanObs] = useState("");
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  // Realizado - novo
  const [showNovoReal, setShowNovoReal] = useState(false);
  const [realForm, setRealForm] = useState({
    data_cte: new Date().toISOString().split("T")[0],
    numero_cte: "", custo_por_ton: "", custo_cte: "", quantidade_ton: "", observacao: ""
  });
  const [realWho, setRealWho] = useState("");
  const [realError, setRealError] = useState("");
  const [savingReal, setSavingReal] = useState(false);

  // Realizado - edição
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<FreteRealizado>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editWho, setEditWho] = useState("");
  const [editObs, setEditObs] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Exclusão
  const [deleteTarget, setDeleteTarget] = useState<FreteRealizado | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: plan }, { data: real }, { data: hist }] = await Promise.all([
      supabase.from("frete_planejado").select("*").eq("projeto_id", projetoId).single(),
      supabase.from("frete_realizado").select("*").eq("projeto_id", projetoId).order("data_cte", { ascending: false }),
      supabase.from("frete_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(60),
    ]);
    if (plan) { setPlanejado(plan); setEstadoPlan("salvo"); }
    else { setPlanejado(null); setEstadoPlan("novo"); setPlanForm({ custo_por_ton: "" }); }
    setRealizado(real ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalCTEs = realizado.reduce((s, r) => s + r.custo_cte, 0);
  const totalTons = realizado.reduce((s, r) => s + r.quantidade_ton, 0);
  const custoMedioReal = totalTons > 0 ? totalCTEs / totalTons : 0;

  // ── Planejado ─────────────────────────────────────────────────────────────
  const requestSavePlan = () => {
    if (!planForm.custo_por_ton) { setPlanError("Informe o custo previsto por tonelada."); return; }
    setPlanWho(""); setPlanObs(""); setPlanError(""); setShowPlanModal(true);
  };

  const confirmarSavePlan = async () => {
    if (!planWho.trim()) { setPlanError("Informe quem está salvando."); return; }
    setSavingPlan(true); setPlanError("");
    const custo = parseFloat(planForm.custo_por_ton) || 0;

    if (estadoPlan === "editando" && planejado?.id) {
      await supabase.from("frete_historico").insert([{
        projeto_id: projetoId, item_id: planejado.id, tipo: "planejado",
        descricao_item: "Custo previsto frete",
        campo: "Custo por tonelada (R$/ton)",
        valor_anterior: fmt(planejado.custo_por_ton, 4),
        valor_novo: fmt(custo, 4),
        alterado_por: planWho, observacao: planObs,
      }]);
      await supabase.from("frete_planejado").update({ custo_por_ton: custo, salvo_por: planWho, observacao: planObs, updated_at: new Date().toISOString() }).eq("projeto_id", projetoId);
    } else {
      await supabase.from("frete_planejado").insert([{ projeto_id: projetoId, custo_por_ton: custo, salvo_por: planWho, observacao: planObs }]);
    }

    setShowPlanModal(false); setSavingPlan(false);
    await load();
  };

  const iniciarEditPlan = () => {
    setPlanForm({ custo_por_ton: String(planejado?.custo_por_ton ?? "") });
    setEstadoPlan("editando");
  };

  // ── Realizado - salvar novo ───────────────────────────────────────────────
  // Custo da CTE pode ser calculado automaticamente
  const custoCalculado = (parseFloat(realForm.custo_por_ton) || 0) * (parseFloat(realForm.quantidade_ton) || 0);

  const salvarReal = async () => {
    if (!realForm.numero_cte.trim()) { setRealError("Informe o número da CTE."); return; }
    if (!realWho.trim()) { setRealError("Informe quem está registrando."); return; }
    setSavingReal(true); setRealError("");

    const custoCte = parseFloat(realForm.custo_cte) || custoCalculado;
    const { data: ins } = await supabase.from("frete_realizado").insert([{
      projeto_id: projetoId,
      data_cte: realForm.data_cte,
      numero_cte: realForm.numero_cte,
      custo_por_ton: parseFloat(realForm.custo_por_ton) || 0,
      custo_cte: custoCte,
      quantidade_ton: parseFloat(realForm.quantidade_ton) || 0,
      observacao: realForm.observacao,
    }]).select().single();

    if (ins) {
      await supabase.from("frete_historico").insert([{
        projeto_id: projetoId, item_id: ins.id, tipo: "realizado",
        descricao_item: `CTE ${realForm.numero_cte}`,
        campo: "CTE registrada", valor_anterior: "—",
        valor_novo: `CTE ${realForm.numero_cte} · R$ ${fmt(custoCte)}`,
        alterado_por: realWho, observacao: realForm.observacao,
      }]);
    }

    setRealForm({ data_cte: new Date().toISOString().split("T")[0], numero_cte: "", custo_por_ton: "", custo_cte: "", quantidade_ton: "", observacao: "" });
    setRealWho(""); setShowNovoReal(false); setSavingReal(false);
    await load();
  };

  // ── Realizado - editar ────────────────────────────────────────────────────
  const iniciarEdit = (r: FreteRealizado) => { setEditandoId(r.id); setEditForm({ ...r }); setEditWho(""); setEditObs(""); };
  const requestSaveEdit = () => { setEditWho(""); setEditObs(""); setShowEditModal(true); };

  const confirmarEdit = async () => {
    if (!editWho.trim() || !editandoId) return;
    setSavingEdit(true);
    const orig = realizado.find(r => r.id === editandoId)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const campos = [
      ["data_cte","Data"], ["numero_cte","Nº CTE"], ["custo_por_ton","Custo/ton"],
      ["custo_cte","Custo CTE"], ["quantidade_ton","Quantidade (ton)"], ["observacao","Observação"]
    ] as [keyof FreteRealizado, string][];
    for (const [f, label] of campos) {
      if (String(orig[f] ?? "") !== String((editForm as any)[f] ?? "")) {
        changes.push({ projeto_id: projetoId, item_id: editandoId, tipo: "realizado",
          descricao_item: `CTE ${orig.numero_cte}`, campo: label,
          valor_anterior: String(orig[f] ?? "—"), valor_novo: String((editForm as any)[f] ?? "—"),
          alterado_por: editWho, observacao: editObs });
      }
    }
    if (changes.length > 0) await supabase.from("frete_historico").insert(changes);
    await supabase.from("frete_realizado").update({
      data_cte: editForm.data_cte, numero_cte: editForm.numero_cte,
      custo_por_ton: editForm.custo_por_ton, custo_cte: editForm.custo_cte,
      quantidade_ton: editForm.quantidade_ton, observacao: editForm.observacao,
    }).eq("id", editandoId);
    setEditandoId(null); setShowEditModal(false); setSavingEdit(false);
    await load();
  };

  // ── Excluir ───────────────────────────────────────────────────────────────
  const openDelete = (r: FreteRealizado) => { setDeleteTarget(r); setDeleteWho(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget) return;
    setDeleting(true);
    const { id, numero_cte } = deleteTarget; const who = deleteWho;
    await supabase.from("frete_historico").insert([{
      projeto_id: projetoId, item_id: id, tipo: "realizado",
      descricao_item: `CTE ${numero_cte}`, campo: "CTE excluída",
      valor_anterior: numero_cte, valor_novo: "—", alterado_por: who, observacao: "",
    }]);
    await supabase.from("frete_realizado").delete().eq("id", id);
    setDeleteTarget(null); setDeleting(false);
    await load();
  };

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}><Loader2 size={20} className="animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="space-y-8">

      {/* ══════════════ PLANEJAMENTO ══════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="planejamento"
          descricao={estadoPlan === "salvo" && planejado ? `R$ ${fmt(planejado.custo_por_ton, 4)}/ton` : undefined}>
          {estadoPlan === "salvo" ? (
            <button onClick={iniciarEditPlan} className="btn-primary py-2 px-4 text-xs">
              <Pencil size={13} />Editar
            </button>
          ) : estadoPlan === "editando" ? (
            <div className="flex gap-2">
              <button onClick={() => setEstadoPlan("salvo")} className="px-4 py-2 rounded-xl text-xs transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                <X size={12} className="inline mr-1" />Cancelar
              </button>
              <button onClick={requestSavePlan} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                <Save size={13} />Salvar
              </button>
            </div>
          ) : (
            <button onClick={requestSavePlan} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              <Save size={13} />Salvar planejamento
            </button>
          )}
        </SectionHeader>

        <div className="glass rounded-2xl p-6">
          {estadoPlan === "salvo" && planejado ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div className="rounded-xl px-6 py-4" style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}>
                <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo previsto de frete</p>
                <p className="text-3xl font-bold" style={{ color: "#7585fd" }}>R$ {fmt(planejado.custo_por_ton, 4)}</p>
                <p className="text-xs mt-1" style={{ color: "#5a607a" }}>por tonelada</p>
              </div>
              <div className="text-xs" style={{ color: "#5a607a" }}>
                Salvo por <strong style={{ color: "#8890a8" }}>{planejado.salvo_por}</strong>
                {planejado.observacao && <> · {planejado.observacao}</>}
                {planejado.updated_at && <> · {new Date(planejado.updated_at).toLocaleDateString("pt-BR")}</>}
              </div>
            </div>
          ) : (
            <div className="max-w-sm space-y-3">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Custo previsto de frete (R$/ton)</label>
                <input type="number" step="0.0001"
                  value={planForm.custo_por_ton}
                  onChange={e => setPlanForm({ custo_por_ton: e.target.value })}
                  className="input-field text-sm" placeholder="0,0000"
                  autoFocus />
              </div>
              {planError && <p className="text-xs" style={{ color: "#ff6b6b" }}>{planError}</p>}
              <p className="text-xs" style={{ color: "#5a607a" }}>
                {estadoPlan === "novo" ? "Informe o custo de frete planejado por tonelada transportada." : "Atualize o custo planejado e clique em Salvar."}
              </p>
            </div>
          )}
        </div>
      </section>

      {/* ══════════════ CUSTO REAL ════════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="realizado"
          total={totalCTEs} totalLabel="Total CTEs:">
          <button onClick={() => setShowNovoReal(true)} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
            <Plus size={13} />Nova CTE
          </button>
        </SectionHeader>

        {/* Form nova CTE */}
        {showNovoReal && (
          <div className="glass rounded-2xl p-5 mb-4 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Registrar nova CTE</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Data</label>
                <input type="date" value={realForm.data_cte} onChange={e => setRealForm(p => ({ ...p, data_cte: e.target.value }))}
                  className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Número da CTE *</label>
                <input value={realForm.numero_cte} onChange={e => setRealForm(p => ({ ...p, numero_cte: e.target.value }))}
                  className="input-field text-xs py-2" placeholder="Ex: 000123456" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Quantidade (ton)</label>
                <input type="number" step="0.0001" value={realForm.quantidade_ton} onChange={e => setRealForm(p => ({ ...p, quantidade_ton: e.target.value }))}
                  className="input-field text-xs py-2" placeholder="0,0000" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Custo por tonelada (R$/ton)</label>
                <input type="number" step="0.0001" value={realForm.custo_por_ton} onChange={e => setRealForm(p => ({ ...p, custo_por_ton: e.target.value }))}
                  className="input-field text-xs py-2" placeholder="0,0000" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>
                  Custo total da CTE (R$)
                  {custoCalculado > 0 && <span style={{ color: "#5560f8" }}> · calculado: R$ {fmt(custoCalculado)}</span>}
                </label>
                <input type="number" step="0.01" value={realForm.custo_cte} onChange={e => setRealForm(p => ({ ...p, custo_cte: e.target.value }))}
                  className="input-field text-xs py-2" placeholder={custoCalculado > 0 ? fmt(custoCalculado) : "0,00"}
                  style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                <input value={realWho} onChange={e => setRealWho(e.target.value)}
                  className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Observação</label>
                <input value={realForm.observacao} onChange={e => setRealForm(p => ({ ...p, observacao: e.target.value }))}
                  className="input-field text-xs py-2" placeholder="Transportadora, rota, NF referenciada..." style={{ color: "#e8eaf0" }} />
              </div>
            </div>
            {realError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{realError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNovoReal(false); setRealError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                <X size={12} className="inline mr-1" />Cancelar
              </button>
              <button onClick={salvarReal} disabled={savingReal} className="btn-primary py-2 px-5 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {savingReal ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Salvar CTE
              </button>
            </div>
          </div>
        )}

        {/* Resumo real */}
        {realizado.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Total gasto em frete", value: `R$ ${fmt(totalCTEs)}`, color: "#22c55e" },
              { label: "Total transportado", value: `${fmt(totalTons, 2)} ton`, color: "#7585fd" },
              { label: "Custo médio real/ton", value: `R$ ${fmt(custoMedioReal, 4)}/ton`, color: planejado && custoMedioReal > planejado.custo_por_ton ? "#ef4444" : "#22c55e" },
            ].map(item => (
              <div key={item.label} className="glass rounded-xl px-4 py-3 text-center">
                <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabela CTEs */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Data","Nº CTE","Qtd (ton)","Custo/ton (R$)","Custo CTE (R$)","Custo/ton vs Plan.","Observação",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {realizado.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>Nenhuma CTE registrada ainda.</td></tr>
                ) : realizado.map(r => {
                  const isEdit = editandoId === r.id;
                  const vsPlan = planejado ? r.custo_por_ton - planejado.custo_por_ton : null;
                  return (
                    <tr key={r.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="date" value={editForm.data_cte ?? ""} onChange={e => setEditForm(p => ({ ...p, data_cte: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-32" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#e8eaf0" }}>{new Date(r.data_cte + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input value={editForm.numero_cte ?? ""} onChange={e => setEditForm(p => ({ ...p, numero_cte: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-28" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs font-semibold" style={{ color: "#e8eaf0" }}>{r.numero_cte || "—"}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" step="0.0001" value={editForm.quantidade_ton ?? ""} onChange={e => setEditForm(p => ({ ...p, quantidade_ton: parseFloat(e.target.value) || 0 }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5 w-24" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>{fmt(r.quantidade_ton, 2)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" step="0.0001" value={editForm.custo_por_ton ?? ""} onChange={e => setEditForm(p => ({ ...p, custo_por_ton: parseFloat(e.target.value) || 0 }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5 w-28" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#e8eaf0" }}>R$ {fmt(r.custo_por_ton, 4)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" step="0.01" value={editForm.custo_cte ?? ""} onChange={e => setEditForm(p => ({ ...p, custo_cte: parseFloat(e.target.value) || 0 }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5 w-28" style={{ color: "#22c55e" }} />
                          : <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>R$ {fmt(r.custo_cte)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {vsPlan !== null ? (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                            style={{ background: vsPlan > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: vsPlan > 0 ? "#ef4444" : "#22c55e" }}>
                            {vsPlan > 0 ? "+" : ""}{fmt(vsPlan, 4)}
                          </span>
                        ) : <span style={{ color: "#3d425a" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {isEdit ? <input value={editForm.observacao ?? ""} onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-40" style={{ color: "#8890a8" }} />
                          : <span className="text-xs truncate block max-w-xs" style={{ color: "#8890a8" }}>{r.observacao || "—"}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEdit ? (
                          <div className="flex gap-1">
                            <button onClick={() => setEditandoId(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                            <button onClick={requestSaveEdit} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => iniciarEdit(r)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#7585fd" }}><Pencil size={11} /></button>
                            <button onClick={() => openDelete(r)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {realizado.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(34,197,94,0.06)" }}>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>{fmt(totalTons, 2)} ton</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>Média: R$ {fmt(custoMedioReal, 4)}</td>
                    <td className="px-4 py-3 text-right"><span className="text-sm font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalCTEs)}</span></td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Comparativo planejado vs real */}
        {planejado && realizado.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Custo planejado/ton", value: `R$ ${fmt(planejado.custo_por_ton, 4)}`, color: "#7585fd", bg: "rgba(85,96,248,0.1)", border: "rgba(85,96,248,0.2)" },
              { label: "Custo médio real/ton", value: `R$ ${fmt(custoMedioReal, 4)}`, color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
              { label: "Diferença/ton", value: `${custoMedioReal - planejado.custo_por_ton > 0 ? "+" : ""}R$ ${fmt(custoMedioReal - planejado.custo_por_ton, 4)}`, color: custoMedioReal > planejado.custo_por_ton ? "#ef4444" : "#22c55e", bg: custoMedioReal > planejado.custo_por_ton ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: custoMedioReal > planejado.custo_por_ton ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)" },
            ].map(item => (
              <div key={item.label} className="rounded-xl px-4 py-3 text-center" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                <p className="text-base font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ HISTÓRICO ════════════════════════════════════════════════════════ */}
      {historico.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center gap-2">
              <History size={14} style={{ color: "#5560f8" }} />
              <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Edições</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{historico.length}</span>
            </div>
            {showHistorico ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
          </button>
          {showHistorico && (
            <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Data/Hora","Tipo","Item","Campo","Anterior","Novo","Alterado por","Obs."].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {historico.map(h => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-md" style={{ background: h.tipo === "planejado" ? "rgba(85,96,248,0.15)" : "rgba(34,197,94,0.15)", color: h.tipo === "planejado" ? "#7585fd" : "#22c55e" }}>{h.tipo}</span></td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.descricao_item || "—"}</td>
                      <td className="px-4 py-2.5"><span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "#8890a8" }}>{h.campo}</span></td>
                      <td className="px-4 py-2.5 line-through" style={{ color: "#ef4444", opacity: 0.8 }}>{h.valor_anterior || "—"}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#22c55e" }}>{h.valor_novo || "—"}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.alterado_por}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: "#8890a8" }}>{h.observacao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modais */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowPlanModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>{estadoPlan === "editando" ? "Confirmar alteração" : "Salvar planejamento"}</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>Custo previsto: R$ {fmt(parseFloat(planForm.custo_por_ton) || 0, 4)}/ton</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>{estadoPlan === "editando" ? "Alterado por *" : "Salvo por *"}</label><input className="input-field" placeholder="Seu nome" value={planWho} onChange={e => setPlanWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={planObs} onChange={e => setPlanObs(e.target.value)} /></div>
              {planError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{planError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowPlanModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSavePlan} disabled={savingPlan} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {savingPlan ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição da CTE</h3>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={editWho} onChange={e => setEditWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={editObs} onChange={e => setEditObs(e.target.value)} /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowEditModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarEdit} disabled={!editWho.trim() || savingEdit} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !editWho.trim() ? 0.5 : 1 }}>
                  {savingEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir CTE</h3>
              <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Excluindo: <strong style={{ color: "#e8eaf0" }}>CTE {deleteTarget.numero_cte}</strong> · R$ {fmt(deleteTarget.custo_cte)}</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={e => setDeleteWho(e.target.value)} autoFocus /></div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{deleteError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteWho.trim() ? 0.5 : 1 }}>
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Confirmar exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
