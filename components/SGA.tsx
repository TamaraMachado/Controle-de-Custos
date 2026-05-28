"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import {
  Plus, Trash2, Pencil, X, Save, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Check
} from "lucide-react";

interface SGARow {
  id?: string;
  projeto_id: string;
  funcao: string;
  atividade: string;
  horas: number;
  custo: number;
  ordem: number;
}

interface SGARealizado {
  id: string;
  mes: string;
  funcao: string;
  atividade: string;
  horas: number;
  custo: number;
}

interface Historico {
  id: string; item_id: string | null; tipo: string;
  descricao_item: string; campo: string;
  valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}

interface Props { projetoId: string; }
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMes = (iso: string) => { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; };

const emptyRow = (projetoId: string, ordem: number): SGARow => ({ projeto_id: projetoId, funcao: "", atividade: "", horas: 0, custo: 0, ordem });

export default function SGA({ projetoId }: Props) {
  const [savedPlan, setSavedPlan] = useState<SGARow[]>([]);
  const [editingPlan, setEditingPlan] = useState<SGARow[]>([]);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [realizado, setRealizado] = useState<SGARealizado[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  // Modal salvar
  const [showModal, setShowModal] = useState(false);
  const [modalWho, setModalWho] = useState("");
  const [modalObs, setModalObs] = useState("");
  const [modalError, setModalError] = useState("");
  // Modal excluir
  const [deleteTarget, setDeleteTarget] = useState<SGARow | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteObs, setDeleteObs] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);
  // Realizado
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [showNovoReal, setShowNovoReal] = useState(false);
  const [realForm, setRealForm] = useState({ mes: new Date().toISOString().slice(0,7), funcao: "", atividade: "", horas: "", custo: "" });
  const [realFormWho, setRealFormWho] = useState("");
  const [savingReal, setSavingReal] = useState(false);
  const [realFormError, setRealFormError] = useState("");
  // Edição realizado
  const [editandoReal, setEditandoReal] = useState<string | null>(null);
  const [realEditForm, setRealEditForm] = useState<Partial<SGARealizado>>({});
  const [showRealSaveModal, setShowRealSaveModal] = useState(false);
  const [realSaveWho, setRealSaveWho] = useState("");
  const [realSaveObs, setRealSaveObs] = useState("");
  const [savingRealEdit, setSavingRealEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: plan }, { data: real }, { data: hist }] = await Promise.all([
      supabase.from("sga_planejado").select("*").eq("projeto_id", projetoId).order("ordem"),
      supabase.from("sga_realizado").select("*").eq("projeto_id", projetoId).order("mes", { ascending: false }),
      supabase.from("sga_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(60),
    ]);
    setSavedPlan(plan ?? []);
    setRealizado(real ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  const totalPlan = savedPlan.reduce((s, r) => s + r.custo, 0);
  const meses = Array.from(new Set(realizado.map(r => r.mes))).sort((a,b) => b.localeCompare(a));
  const mesAtivo = mesSelecionado || meses[0] || "";
  const realDoMes = realizado.filter(r => r.mes === mesAtivo + "-01" || r.mes === mesAtivo);
  const totalReal = realDoMes.reduce((s, r) => s + r.custo, 0);

  // ── Planejado ─────────────────────────────────────────────────────────────
  const startEditPlan = () => { setEditingPlan(savedPlan.map(r => ({ ...r }))); setIsEditingPlan(true); };
  const cancelEditPlan = () => { setEditingPlan([]); setIsEditingPlan(false); };
  const updatePlan = (idx: number, f: keyof SGARow, v: string | number) =>
    setEditingPlan(prev => prev.map((r, i) => i === idx ? { ...r, [f]: v } : r));
  const addPlanRow = () => setEditingPlan(prev => [...prev, emptyRow(projetoId, prev.length)]);

  const requestSavePlan = () => { setModalWho(""); setModalObs(""); setModalError(""); setShowModal(true); };

  const confirmSavePlan = async () => {
    if (!modalWho.trim()) { setModalError("Informe quem está salvando."); return; }
    setShowModal(false); setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const savedMap = new Map(savedPlan.map(r => [r.id, r]));

    for (const row of editingPlan) {
      const payload = { projeto_id: projetoId, funcao: row.funcao, atividade: row.atividade, horas: row.horas, custo: row.custo, ordem: row.ordem };
      if (row.id) {
        const orig = savedMap.get(row.id);
        if (orig) {
          for (const [f, label] of [["funcao","Função"],["atividade","Atividade"],["horas","Horas"],["custo","Custo"]] as [keyof SGARow, string][]) {
            if (String(orig[f]) !== String(row[f])) {
              changes.push({ projeto_id: projetoId, item_id: row.id, tipo: "planejado", descricao_item: row.funcao || orig.funcao, campo: label, valor_anterior: String(orig[f]), valor_novo: String(row[f]), alterado_por: modalWho, observacao: modalObs });
            }
          }
        }
        await supabase.from("sga_planejado").update(payload).eq("id", row.id);
      } else {
        const { data: ins } = await supabase.from("sga_planejado").insert([payload]).select().single();
        changes.push({ projeto_id: projetoId, item_id: ins?.id, tipo: "planejado", descricao_item: row.funcao || "Nova linha", campo: "Linha criada", valor_anterior: "—", valor_novo: row.funcao, alterado_por: modalWho, observacao: modalObs });
      }
    }
    for (const orig of savedPlan) {
      if (orig.id && !editingPlan.find(r => r.id === orig.id)) {
        await supabase.from("sga_historico").insert([{ projeto_id: projetoId, item_id: orig.id, tipo: "planejado", descricao_item: orig.funcao, campo: "Linha excluída", valor_anterior: orig.funcao, valor_novo: "—", alterado_por: modalWho, observacao: modalObs }]);
        await supabase.from("sga_planejado").delete().eq("id", orig.id);
      }
    }
    if (changes.length > 0) await supabase.from("sga_historico").insert(changes);
    setIsEditingPlan(false); setEditingPlan([]); setSaving(false);
    await load();
  };

  // ── Excluir planejado (view mode) ─────────────────────────────────────────
  const openDelete = (row: SGARow) => { setDeleteTarget(row); setDeleteWho(""); setDeleteObs(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget?.id) return;
    setDeleting(true);
    const { id, funcao } = deleteTarget; const who = deleteWho; const obs = deleteObs;
    await supabase.from("sga_historico").insert([{ projeto_id: projetoId, item_id: id, tipo: "planejado", descricao_item: funcao, campo: "Linha excluída", valor_anterior: funcao, valor_novo: "—", alterado_por: who, observacao: obs }]);
    await supabase.from("sga_planejado").delete().eq("id", id);
    setDeleteTarget(null); setDeleting(false);
    await load();
  };

  // ── Realizado ─────────────────────────────────────────────────────────────
  const salvarReal = async () => {
    if (!realForm.funcao.trim()) { setRealFormError("Informe a função."); return; }
    if (!realFormWho.trim()) { setRealFormError("Informe quem está registrando."); return; }
    setSavingReal(true); setRealFormError("");
    const mesDate = realForm.mes + "-01";
    const { data: ins } = await supabase.from("sga_realizado").insert([{
      projeto_id: projetoId, mes: mesDate,
      funcao: realForm.funcao, atividade: realForm.atividade,
      horas: parseFloat(realForm.horas) || 0, custo: parseFloat(realForm.custo) || 0,
    }]).select().single();
    if (ins) await supabase.from("sga_historico").insert([{ projeto_id: projetoId, item_id: ins.id, tipo: "realizado", descricao_item: realForm.funcao, campo: "Registro criado", valor_anterior: "—", valor_novo: realForm.funcao, alterado_por: realFormWho, observacao: "" }]);
    setRealForm({ mes: realForm.mes, funcao: "", atividade: "", horas: "", custo: "" });
    setRealFormWho(""); setShowNovoReal(false); setSavingReal(false);
    await load();
  };

  const iniciarEditReal = (r: SGARealizado) => { setEditandoReal(r.id); setRealEditForm({ ...r }); setRealSaveWho(""); setRealSaveObs(""); };
  const requestSaveRealEdit = () => { setRealSaveWho(""); setRealSaveObs(""); setShowRealSaveModal(true); };
  const confirmarSaveRealEdit = async () => {
    if (!realSaveWho.trim() || !editandoReal) return;
    setSavingRealEdit(true);
    const orig = realizado.find(r => r.id === editandoReal)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    for (const [f, label] of [["funcao","Função"],["atividade","Atividade"],["horas","Horas"],["custo","Custo"]] as [keyof SGARealizado, string][]) {
      if (String(orig[f] ?? "") !== String((realEditForm as any)[f] ?? "")) {
        changes.push({ projeto_id: projetoId, item_id: editandoReal, tipo: "realizado", descricao_item: orig.funcao, campo: label, valor_anterior: String(orig[f] ?? "—"), valor_novo: String((realEditForm as any)[f] ?? "—"), alterado_por: realSaveWho, observacao: realSaveObs });
      }
    }
    if (changes.length > 0) await supabase.from("sga_historico").insert(changes);
    await supabase.from("sga_realizado").update({ funcao: realEditForm.funcao, atividade: realEditForm.atividade, horas: realEditForm.horas, custo: realEditForm.custo }).eq("id", editandoReal);
    setEditandoReal(null); setShowRealSaveModal(false); setSavingRealEdit(false);
    await load();
  };

  const excluirReal = async (r: SGARealizado, who: string) => {
    await supabase.from("sga_historico").insert([{ projeto_id: projetoId, item_id: r.id, tipo: "realizado", descricao_item: r.funcao, campo: "Registro excluído", valor_anterior: r.funcao, valor_novo: "—", alterado_por: who, observacao: "" }]);
    await supabase.from("sga_realizado").delete().eq("id", r.id);
    await load();
  };
  const [deleteRealTarget, setDeleteRealTarget] = useState<SGARealizado | null>(null);
  const [deleteRealWho, setDeleteRealWho] = useState("");

  const displayPlan = isEditingPlan ? editingPlan : savedPlan;

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}><Loader2 size={20} className="animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="space-y-8">

      {/* ══════════════ PLANEJAMENTO ══════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="planejamento" total={totalPlan} totalLabel="Total mensal planejado:">
          {!isEditingPlan ? (
            <button onClick={startEditPlan} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} />Editar</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelEditPlan} className="px-4 py-2 rounded-xl text-xs transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={addPlanRow} className="btn-primary py-2 px-3 text-xs"><Plus size={13} />Linha</button>
              <button onClick={requestSavePlan} disabled={saving} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar
              </button>
            </div>
          )}
        </SectionHeader>

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Função / Cargo","Atividade desempenhada","Horas/mês","Custo (R$/mês)",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayPlan.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>
                    {isEditingPlan ? 'Clique em "+ Linha" para adicionar.' : "Nenhum item planejado. Clique em Editar para começar."}
                  </td></tr>
                ) : displayPlan.map((row, idx) => (
                  <tr key={row.id ?? `new-${idx}`} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-2.5">
                      {isEditingPlan ? <input value={row.funcao} onChange={e => updatePlan(idx,"funcao",e.target.value)} className="w-44 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#e8eaf0" }} placeholder="Função" />
                        : <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{row.funcao || "—"}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditingPlan ? <input value={row.atividade} onChange={e => updatePlan(idx,"atividade",e.target.value)} className="w-52 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#e8eaf0" }} placeholder="Atividade" />
                        : <span className="text-xs" style={{ color: "#8890a8" }}>{row.atividade || "—"}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditingPlan ? <input type="number" value={row.horas} onChange={e => updatePlan(idx,"horas",parseFloat(e.target.value)||0)} className="w-20 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                        : <span className="text-xs" style={{ color: "#8890a8" }}>{fmt(row.horas,1)} h</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditingPlan ? <input type="number" step="0.01" value={row.custo} onChange={e => updatePlan(idx,"custo",parseFloat(e.target.value)||0)} className="w-28 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                        : <span className="text-xs font-semibold" style={{ color: "#7585fd" }}>R$ {fmt(row.custo)}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditingPlan
                        ? <button onClick={() => setEditingPlan(p => p.filter((_,i) => i !== idx))} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#5a607a" }}><Trash2 size={12} /></button>
                        : <button onClick={() => openDelete(row)} className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              {displayPlan.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>{fmt(displayPlan.reduce((s,r) => s+r.horas,0),1)} h</td>
                    <td className="px-4 py-3 text-right"><span className="text-sm font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(displayPlan.reduce((s,r) => s+r.custo,0))}</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════ CUSTO REAL ════════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="realizado" total={totalReal} totalLabel={`Total ${mesAtivo ? fmtMes(mesAtivo+"-01") : ""}:`}>
          <button onClick={() => setShowNovoReal(true)} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
            <Plus size={13} />Registrar
          </button>
        </SectionHeader>

        {/* Seletor de mês */}
        {meses.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {meses.map(m => (
              <button key={m} onClick={() => setMesSelecionado(m)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={(mesSelecionado || meses[0]) === m
                  ? { background: "rgba(34,197,94,0.2)", border: "1.5px solid rgba(34,197,94,0.4)", color: "#e8eaf0" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                {fmtMes(m+"-01")}
              </button>
            ))}
          </div>
        )}

        {/* Form novo registro */}
        {showNovoReal && (
          <div className="glass rounded-2xl p-5 mb-4 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Novo registro de custo real</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Mês de referência</label>
                <input type="month" value={realForm.mes} onChange={e => setRealForm(p => ({ ...p, mes: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Função *</label>
                <input value={realForm.funcao} onChange={e => setRealForm(p => ({ ...p, funcao: e.target.value }))} className="input-field text-xs py-2" placeholder="Função" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Atividade</label>
                <input value={realForm.atividade} onChange={e => setRealForm(p => ({ ...p, atividade: e.target.value }))} className="input-field text-xs py-2" placeholder="Atividade" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Horas</label>
                <input type="number" value={realForm.horas} onChange={e => setRealForm(p => ({ ...p, horas: e.target.value }))} className="input-field text-xs py-2" placeholder="0" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Custo (R$)</label>
                <input type="number" step="0.01" value={realForm.custo} onChange={e => setRealForm(p => ({ ...p, custo: e.target.value }))} className="input-field text-xs py-2" placeholder="0,00" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                <input value={realFormWho} onChange={e => setRealFormWho(e.target.value)} className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
              </div>
            </div>
            {realFormError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{realFormError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNovoReal(false); setRealFormError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={salvarReal} disabled={savingReal} className="btn-primary py-2 px-5 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {savingReal ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Salvar registro
              </button>
            </div>
          </div>
        )}

        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Função / Cargo","Atividade","Horas","Custo (R$)",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {realDoMes.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>
                    {meses.length === 0 ? "Nenhum custo real registrado ainda." : "Nenhum registro para este mês."}
                  </td></tr>
                ) : realDoMes.map(r => {
                  const isEdit = editandoReal === r.id;
                  return (
                    <tr key={r.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input value={realEditForm.funcao ?? ""} onChange={e => setRealEditForm(p => ({ ...p, funcao: e.target.value }))} className="w-40 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{r.funcao}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input value={realEditForm.atividade ?? ""} onChange={e => setRealEditForm(p => ({ ...p, atividade: e.target.value }))} className="w-48 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#8890a8" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>{r.atividade || "—"}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" value={realEditForm.horas ?? ""} onChange={e => setRealEditForm(p => ({ ...p, horas: parseFloat(e.target.value)||0 }))} className="w-20 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>{fmt(r.horas,1)} h</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" step="0.01" value={realEditForm.custo ?? ""} onChange={e => setRealEditForm(p => ({ ...p, custo: parseFloat(e.target.value)||0 }))} className="w-28 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#22c55e" }} />
                          : <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>R$ {fmt(r.custo)}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEdit ? (
                          <div className="flex gap-1">
                            <button onClick={() => setEditandoReal(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                            <button onClick={requestSaveRealEdit} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => iniciarEditReal(r)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#7585fd" }}><Pencil size={11} /></button>
                            <button onClick={() => setDeleteRealTarget(r)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {realDoMes.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(34,197,94,0.06)" }}>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>{fmt(realDoMes.reduce((s,r) => s+r.horas,0),1)} h</td>
                    <td className="px-4 py-3 text-right"><span className="text-sm font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalReal)}</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Comparativo planejado vs real */}
        {savedPlan.length > 0 && realDoMes.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Planejado", value: totalPlan, color: "#7585fd", bg: "rgba(85,96,248,0.1)", border: "rgba(85,96,248,0.2)" },
              { label: `Real ${mesAtivo ? fmtMes(mesAtivo+"-01") : ""}`, value: totalReal, color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
              { label: "Diferença", value: totalReal - totalPlan, color: totalReal > totalPlan ? "#ef4444" : "#22c55e", bg: totalReal > totalPlan ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: totalReal > totalPlan ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)" },
            ].map(item => (
              <div key={item.label} className="rounded-xl px-4 py-3 text-center" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                <p className="text-xs mb-1" style={{ color: item.color }}>{item.label}</p>
                <p className="text-lg font-bold" style={{ color: "#e8eaf0" }}>{item.value > 0 ? "+" : ""}{item.label === "Diferença" && item.value > 0 ? "+" : ""}R$ {fmt(Math.abs(item.value))}</p>
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
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-md text-xs" style={{ background: h.tipo === "planejado" ? "rgba(85,96,248,0.15)" : "rgba(34,197,94,0.15)", color: h.tipo === "planejado" ? "#7585fd" : "#22c55e" }}>{h.tipo}</span></td>
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
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar alterações</h3>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={modalWho} onChange={e => setModalWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={modalObs} onChange={e => setModalObs(e.target.value)} /></div>
              {modalError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{modalError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmSavePlan} disabled={saving} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
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
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir linha</h3>
              <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Excluindo: <strong>{deleteTarget.funcao}</strong></p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={e => setDeleteWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Motivo</label><textarea className="input-field resize-none" rows={2} value={deleteObs} onChange={e => setDeleteObs(e.target.value)} /></div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{deleteError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white" }}>
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteRealTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteRealTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="p-6 space-y-4">
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir registro real</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>Excluindo: <strong style={{ color: "#e8eaf0" }}>{deleteRealTarget.funcao}</strong> · {fmtMes(deleteRealTarget.mes)}</p>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteRealWho} onChange={e => setDeleteRealWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteRealTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={async () => { if (!deleteRealWho.trim()) return; await excluirReal(deleteRealTarget, deleteRealWho); setDeleteRealTarget(null); }} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteRealWho.trim() ? 0.5 : 1 }}>
                  <Trash2 size={14} />Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRealSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowRealSaveModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição</h3>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={realSaveWho} onChange={e => setRealSaveWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={realSaveObs} onChange={e => setRealSaveObs(e.target.value)} /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowRealSaveModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSaveRealEdit} disabled={!realSaveWho.trim() || savingRealEdit} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !realSaveWho.trim() ? 0.5 : 1 }}>
                  {savingRealEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
