"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import {
  Plus, Trash2, Pencil, X, Save, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Check
} from "lucide-react";

const DEFAULTS = [
  { equipamento: "Pá carregadeira",      custo_unitario: 30000, quantidade: 1 },
  { equipamento: "Caminhão basculante",  custo_unitario: 25000, quantidade: 1 },
  { equipamento: "Mini pá carregadeira", custo_unitario: 15000, quantidade: 1 },
  { equipamento: "Caminhão Poli",        custo_unitario: 25000, quantidade: 1 },
  { equipamento: "Empilhadeira",         custo_unitario: 0,     quantidade: 1 },
  { equipamento: "Manutenção",           custo_unitario: 50000, quantidade: 1 },
  { equipamento: "Combustível",          custo_unitario: 50000, quantidade: 1 },
  { equipamento: "Mob/desmob",           custo_unitario: 3000,  quantidade: 1 },
// ─── Equipamentos pré-definidos ───────────────────────────────────────────────
const EQUIPAMENTOS = [
  "Pá carregadeira",
  "Caminhão basculante",
  "Mini pá carregadeira",
  "Caminhão Poli",
  "Empilhadeira",
  "Manutenção",
  "Combustível",
  "Mob/desmob",
];

interface LogRow {
  id?: string;
  projeto_id: string;
  equipamento: string;
  custo_unitario: number;
  quantidade: number;
  ordem: number;
}

interface LogRealizado {
  id: string;
  mes: string;
  equipamento: string;
  custo_unitario: number;
  quantidade: number;
  observacao: string;
}

interface Historico {
  id: string; item_id: string | null; tipo: string;
  descricao_item: string; campo: string;
  valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}

interface Props { projetoId: string; }

const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMes = (iso: string) => { try { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; } catch { return iso; } };
const emptyRow = (projetoId: string, ordem: number): LogRow => ({ projeto_id: projetoId, equipamento: "", custo_unitario: 0, quantidade: 1, ordem });

export default function LogisticaInterna({ projetoId }: Props) {
  const [savedPlan, setSavedPlan] = useState<LogRow[]>([]);
  const [editingPlan, setEditingPlan] = useState<LogRow[]>([]);
  const [isEditingPlan, setIsEditingPlan] = useState(false);
  const [realizado, setRealizado] = useState<LogRealizado[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);

  // Modal salvar planejado
  const [showModal, setShowModal] = useState(false);
  const [modalWho, setModalWho] = useState("");
  const [modalObs, setModalObs] = useState("");
  const [modalError, setModalError] = useState("");

  // Excluir planejado
  const [deleteTarget, setDeleteTarget] = useState<LogRow | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Real — novo
  const [showNovoReal, setShowNovoReal] = useState(false);
  const [realForm, setRealForm] = useState({ mes: new Date().toISOString().slice(0,7), equipamento: "", equipamentoNovo: "", custo_unitario: "", quantidade: "1", observacao: "" });
  const [realWho, setRealWho] = useState("");
  const [realError, setRealError] = useState("");
  const [savingReal, setSavingReal] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0,7));

  // Edição real
  const [editandoRealId, setEditandoRealId] = useState<string | null>(null);
  const [editRealForm, setEditRealForm] = useState<Partial<LogRealizado>>({});
  const [showEditRealModal, setShowEditRealModal] = useState(false);
  const [editRealWho, setEditRealWho] = useState("");
  const [editRealObs, setEditRealObs] = useState("");
  const [savingEditReal, setSavingEditReal] = useState(false);

  // Excluir real
  const [deleteRealTarget, setDeleteRealTarget] = useState<LogRealizado | null>(null);
  const [deleteRealWho, setDeleteRealWho] = useState("");

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: plan }, { data: real }, { data: hist }] = await Promise.all([
      supabase.from("logistica_planejado").select("*").eq("projeto_id", projetoId).order("ordem"),
      supabase.from("logistica_realizado").select("*").eq("projeto_id", projetoId).order("mes", { ascending: false }),
      supabase.from("logistica_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(80),
    ]);

    let planejadoFinal = plan ?? [];

    // Auto-seed defaults se ainda não houver nada cadastrado
    if (planejadoFinal.length === 0) {
      const { data: criados } = await supabase.from("logistica_planejado").insert(
        DEFAULTS.map((d, i) => ({ ...d, projeto_id: projetoId, ordem: i }))
      ).select();
      if (criados) planejadoFinal = criados;
    }

    setSavedPlan(planejadoFinal);
    setRealizado(real ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // Totais
  const totalPlan = savedPlan.reduce((s, r) => s + r.custo_unitario * r.quantidade, 0);
  const meses = Array.from(new Set(realizado.map(r => r.mes.slice(0,7)))).sort((a,b) => b.localeCompare(a));
  const realDoMes = realizado.filter(r => r.mes.slice(0,7) === mesFiltro);
  const totalReal = realDoMes.reduce((s, r) => s + r.custo_unitario * r.quantidade, 0);

  // ── Planejado ─────────────────────────────────────────────────────────────
  const startEdit = () => { setEditingPlan(savedPlan.map(r => ({ ...r }))); setIsEditingPlan(true); };
  const cancelEdit = () => { setEditingPlan([]); setIsEditingPlan(false); };

  const updateRow = (idx: number, field: keyof LogRow, value: string | number) =>
    setEditingPlan(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const addRow = () => setEditingPlan(prev => [...prev, emptyRow(projetoId, prev.length)]);

  const requestSave = () => { setModalWho(""); setModalObs(""); setModalError(""); setShowModal(true); };

  const confirmSave = async () => {
    if (!modalWho.trim()) { setModalError("Informe quem está salvando."); return; }
    setShowModal(false); setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const savedMap = new Map(savedPlan.map(r => [r.id, r]));

    for (const row of editingPlan) {
      const payload = { projeto_id: projetoId, equipamento: row.equipamento, custo_unitario: row.custo_unitario, quantidade: row.quantidade, ordem: row.ordem };
      if (row.id) {
        const orig = savedMap.get(row.id);
        if (orig) {
          const campos = [["equipamento","Equipamento"],["custo_unitario","Custo unitário"],["quantidade","Quantidade"]] as [keyof LogRow, string][];
          for (const [f, label] of campos) {
            if (String(orig[f]) !== String(row[f])) {
              changes.push({ projeto_id: projetoId, item_id: row.id, tipo: "planejado", descricao_item: row.equipamento || orig.equipamento, campo: label, valor_anterior: String(orig[f]), valor_novo: String(row[f]), alterado_por: modalWho, observacao: modalObs });
            }
          }
        }
        await supabase.from("logistica_planejado").update(payload).eq("id", row.id);
      } else {
        const { data: ins } = await supabase.from("logistica_planejado").insert([payload]).select().single();
        changes.push({ projeto_id: projetoId, item_id: ins?.id, tipo: "planejado", descricao_item: row.equipamento || "Novo item", campo: "Item criado", valor_anterior: "—", valor_novo: row.equipamento, alterado_por: modalWho, observacao: modalObs });
      }
    }
    for (const orig of savedPlan) {
      if (orig.id && !editingPlan.find(r => r.id === orig.id)) {
        await supabase.from("logistica_historico").insert([{ projeto_id: projetoId, item_id: orig.id, tipo: "planejado", descricao_item: orig.equipamento, campo: "Item excluído", valor_anterior: orig.equipamento, valor_novo: "—", alterado_por: modalWho, observacao: modalObs }]);
        await supabase.from("logistica_planejado").delete().eq("id", orig.id);
      }
    }
    if (changes.length > 0) await supabase.from("logistica_historico").insert(changes);
    setIsEditingPlan(false); setEditingPlan([]); setSaving(false);
    await load();
  };

  const openDelete = (row: LogRow) => { setDeleteTarget(row); setDeleteWho(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget?.id) return;
    setDeleting(true);
    await supabase.from("logistica_historico").insert([{ projeto_id: projetoId, item_id: deleteTarget.id, tipo: "planejado", descricao_item: deleteTarget.equipamento, campo: "Item excluído", valor_anterior: deleteTarget.equipamento, valor_novo: "—", alterado_por: deleteWho, observacao: "" }]);
    await supabase.from("logistica_planejado").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null); setDeleting(false);
    await load();
  };

  // Equipamento resolvido (lida com "novo")
  const equip = (form: typeof realForm) =>
    form.equipamento === "__novo__" ? form.equipamentoNovo.trim() : form.equipamento;

  // ── Realizado ─────────────────────────────────────────────────────────────
  const salvarReal = async () => {
    const eq = equip(realForm);
    if (!eq) { setRealError("Selecione ou informe o equipamento."); return; }
    if (!realWho.trim()) { setRealError("Informe quem está registrando."); return; }
    setSavingReal(true); setRealError("");
    const { data: ins } = await supabase.from("logistica_realizado").insert([{
      projeto_id: projetoId, mes: realForm.mes + "-01",
      equipamento: eq, custo_unitario: parseFloat(realForm.custo_unitario) || 0,
      quantidade: parseFloat(realForm.quantidade) || 1, observacao: realForm.observacao,
    }]).select().single();
    if (ins) await supabase.from("logistica_historico").insert([{ projeto_id: projetoId, item_id: ins.id, tipo: "realizado", descricao_item: eq, campo: "Registro criado", valor_anterior: "—", valor_novo: `${eq} · R$ ${fmt(ins.custo_unitario)}`, alterado_por: realWho, observacao: "" }]);
    setRealForm(p => ({ ...p, equipamento: "", equipamentoNovo: "", custo_unitario: "", quantidade: "1", observacao: "" }));
    setRealWho(""); setShowNovoReal(false); setSavingReal(false);
    await load();
  };

  const iniciarEditReal = (r: LogRealizado) => { setEditandoRealId(r.id); setEditRealForm({ ...r }); setEditRealWho(""); setEditRealObs(""); };
  const requestSaveEditReal = () => { setEditRealWho(""); setEditRealObs(""); setShowEditRealModal(true); };
  const confirmarEditReal = async () => {
    if (!editRealWho.trim() || !editandoRealId) return;
    setSavingEditReal(true);
    const orig = realizado.find(r => r.id === editandoRealId)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const campos = [["equipamento","Equipamento"],["custo_unitario","Custo unitário"],["quantidade","Quantidade"],["observacao","Observação"]] as [keyof LogRealizado, string][];
    for (const [f, label] of campos) {
      if (String(orig[f] ?? "") !== String((editRealForm as any)[f] ?? "")) {
        changes.push({ projeto_id: projetoId, item_id: editandoRealId, tipo: "realizado", descricao_item: orig.equipamento, campo: label, valor_anterior: String(orig[f] ?? "—"), valor_novo: String((editRealForm as any)[f] ?? "—"), alterado_por: editRealWho, observacao: editRealObs });
      }
    }
    if (changes.length > 0) await supabase.from("logistica_historico").insert(changes);
    await supabase.from("logistica_realizado").update({ equipamento: editRealForm.equipamento, custo_unitario: editRealForm.custo_unitario, quantidade: editRealForm.quantidade, observacao: editRealForm.observacao }).eq("id", editandoRealId);
    setEditandoRealId(null); setShowEditRealModal(false); setSavingEditReal(false);
    await load();
  };

  const excluirReal = async (r: LogRealizado, who: string) => {
    await supabase.from("logistica_historico").insert([{ projeto_id: projetoId, item_id: r.id, tipo: "realizado", descricao_item: r.equipamento, campo: "Registro excluído", valor_anterior: r.equipamento, valor_novo: "—", alterado_por: who, observacao: "" }]);
    await supabase.from("logistica_realizado").delete().eq("id", r.id);
    setDeleteRealTarget(null);
    await load();
  };

  const displayPlan = isEditingPlan ? editingPlan : savedPlan;

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}><Loader2 size={20} className="animate-spin mr-2" />Carregando...</div>;

  // Componente de select de equipamento reutilizável
  const EquipSelect = ({ value, novo, onChange, onNovoChange }: { value: string; novo: string; onChange: (v: string) => void; onNovoChange: (v: string) => void }) => (
    <div>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="input-field text-xs py-2" style={{ color: value ? "#e8eaf0" : "#5a607a" }}>
        <option value="">Selecione o equipamento...</option>
        {EQUIPAMENTOS.map(eq => <option key={eq} value={eq}>{eq}</option>)}
        <option value="__novo__">+ Novo equipamento</option>
      </select>
      {value === "__novo__" && (
        <input value={novo} onChange={e => onNovoChange(e.target.value)}
          className="input-field text-xs py-2 mt-2" placeholder="Digite o equipamento"
          style={{ color: "#e8eaf0" }} autoFocus />
      )}
    </div>
  );

  return (
    <div className="space-y-8">

      {/* ══════════════ PLANEJAMENTO ══════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="planejamento" total={totalPlan} totalLabel="Total mensal planejado:">
          {!isEditingPlan ? (
            <button onClick={startEdit} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} />Editar</button>
          ) : (
            <div className="flex gap-2">
              <button onClick={cancelEdit} className="px-4 py-2 rounded-xl text-xs" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={addRow} className="btn-primary py-2 px-3 text-xs"><Plus size={13} />Linha</button>
              <button onClick={requestSave} disabled={saving} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
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
                  {["Equipamento","Custo Unitário (R$)","Quantidade","Valor Total",""].map(h => (
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
                    <td className="px-4 py-2.5 min-w-48">
                      {isEditingPlan ? (
                        <select value={row.equipamento} onChange={e => updateRow(idx, "equipamento", e.target.value)}
                          className="w-full bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5"
                          style={{ color: "#e8eaf0" }}>
                          <option value="">Selecione...</option>
                          {EQUIPAMENTOS.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                          <option value="__novo__">+ Novo</option>
                        </select>
                      ) : (
                        <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{row.equipamento || "—"}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditingPlan
                        ? <input type="number" step="0.01" value={row.custo_unitario} onChange={e => updateRow(idx, "custo_unitario", parseFloat(e.target.value)||0)} className="w-28 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                        : <span className="text-xs" style={{ color: "#8890a8" }}>R$ {fmt(row.custo_unitario)}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEditingPlan
                        ? <input type="number" step="0.01" value={row.quantidade} onChange={e => updateRow(idx, "quantidade", parseFloat(e.target.value)||0)} className="w-20 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                        : <span className="text-xs" style={{ color: "#8890a8" }}>{fmt(row.quantidade, 2)}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-bold" style={{ color: "#7585fd" }}>R$ {fmt(row.custo_unitario * row.quantidade)}</span>
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
                    <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3"><span className="text-sm font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(displayPlan.reduce((s,r) => s + r.custo_unitario * r.quantidade, 0))}</span></td>
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
        <SectionHeader tipo="realizado" total={totalReal} totalLabel={`Total ${fmtMes(mesFiltro)}:`}>
          <button onClick={() => setShowNovoReal(true)} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
            <Plus size={13} />Registrar
          </button>
        </SectionHeader>

        {/* Seletor de mês */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <span className="text-xs font-medium" style={{ color: "#8890a8" }}>Mês:</span>
          <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}
            className="input-field text-xs py-1.5 w-36" style={{ color: "#e8eaf0" }} />
          {meses.filter(m => m !== mesFiltro).map(m => (
            <button key={m} onClick={() => setMesFiltro(m)}
              className="px-3 py-1.5 rounded-xl text-xs transition-all"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
              {fmtMes(m)}
            </button>
          ))}
        </div>

        {/* Form novo real */}
        {showNovoReal && (
          <div className="glass rounded-2xl p-5 mb-4 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Registrar custo real</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Mês de referência</label>
                <input type="month" value={realForm.mes} onChange={e => setRealForm(p => ({ ...p, mes: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Equipamento *</label>
                <EquipSelect value={realForm.equipamento} novo={realForm.equipamentoNovo}
                  onChange={v => setRealForm(p => ({ ...p, equipamento: v }))}
                  onNovoChange={v => setRealForm(p => ({ ...p, equipamentoNovo: v }))} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Custo unitário (R$)</label>
                <input type="number" step="0.01" value={realForm.custo_unitario} onChange={e => setRealForm(p => ({ ...p, custo_unitario: e.target.value }))} className="input-field text-xs py-2" placeholder="0,00" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Quantidade</label>
                <input type="number" step="0.01" value={realForm.quantidade} onChange={e => setRealForm(p => ({ ...p, quantidade: e.target.value }))} className="input-field text-xs py-2" placeholder="1" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>
                  Valor total
                  {realForm.custo_unitario && realForm.quantidade && (
                    <span style={{ color: "#5560f8" }}> · R$ {fmt((parseFloat(realForm.custo_unitario)||0) * (parseFloat(realForm.quantidade)||0))}</span>
                  )}
                </label>
                <input className="input-field text-xs py-2" placeholder="Calculado automaticamente" disabled style={{ color: "#3d425a" }} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Observação</label>
                <input value={realForm.observacao} onChange={e => setRealForm(p => ({ ...p, observacao: e.target.value }))} className="input-field text-xs py-2" placeholder="NF, contrato, referência..." style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                <input value={realWho} onChange={e => setRealWho(e.target.value)} className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
              </div>
            </div>
            {realError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{realError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNovoReal(false); setRealError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={salvarReal} disabled={savingReal} className="btn-primary py-2 px-5 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {savingReal ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Salvar
              </button>
            </div>
          </div>
        )}

        {/* Tabela real */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Equipamento","Custo Unitário","Quantidade","Valor Total","Observação",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {realDoMes.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>Nenhum registro em {fmtMes(mesFiltro)}.</td></tr>
                ) : realDoMes.map(r => {
                  const isEdit = editandoRealId === r.id;
                  return (
                    <tr key={r.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5">
                        {isEdit
                          ? <input value={editRealForm.equipamento ?? ""} onChange={e => setEditRealForm(p => ({ ...p, equipamento: e.target.value }))} className="w-40 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{r.equipamento}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit
                          ? <input type="number" step="0.01" value={editRealForm.custo_unitario ?? ""} onChange={e => setEditRealForm(p => ({ ...p, custo_unitario: parseFloat(e.target.value)||0 }))} className="w-28 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>R$ {fmt(r.custo_unitario)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit
                          ? <input type="number" step="0.01" value={editRealForm.quantidade ?? ""} onChange={e => setEditRealForm(p => ({ ...p, quantidade: parseFloat(e.target.value)||0 }))} className="w-20 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>{fmt(r.quantidade, 2)}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold" style={{ color: "#22c55e" }}>R$ {fmt((editandoRealId === r.id ? (editRealForm.custo_unitario ?? r.custo_unitario) : r.custo_unitario) * (editandoRealId === r.id ? (editRealForm.quantidade ?? r.quantidade) : r.quantidade))}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit
                          ? <input value={editRealForm.observacao ?? ""} onChange={e => setEditRealForm(p => ({ ...p, observacao: e.target.value }))} className="w-36 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#8890a8" }} />
                          : <span className="text-xs truncate block max-w-xs" style={{ color: "#8890a8" }}>{r.observacao || "—"}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEdit ? (
                          <div className="flex gap-1">
                            <button onClick={() => setEditandoRealId(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                            <button onClick={requestSaveEditReal} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
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
                    <td colSpan={3} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3"><span className="text-sm font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalReal)}</span></td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Comparativo planejado vs real */}
        {totalPlan > 0 && totalReal > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Planejado", value: `R$ ${fmt(totalPlan)}`, color: "#7585fd", bg: "rgba(85,96,248,0.1)", border: "rgba(85,96,248,0.2)" },
              { label: `Real ${fmtMes(mesFiltro)}`, value: `R$ ${fmt(totalReal)}`, color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
              { label: "Diferença", value: `${totalReal - totalPlan > 0 ? "+" : ""}R$ ${fmt(totalReal - totalPlan)}`, color: totalReal > totalPlan ? "#ef4444" : "#22c55e", bg: totalReal > totalPlan ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", border: totalReal > totalPlan ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)" },
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

      {/* ══ MODAIS ════════════════════════════════════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}><h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar alterações</h3></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={modalWho} onChange={e => setModalWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={modalObs} onChange={e => setModalObs(e.target.value)} /></div>
              {modalError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{modalError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmSave} disabled={saving} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
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
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir item</h3>
              <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Excluindo: <strong>{deleteTarget.equipamento}</strong></p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={e => setDeleteWho(e.target.value)} autoFocus /></div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{deleteError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteWho.trim() ? 0.5 : 1 }}>
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
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir registro</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>Excluindo: <strong style={{ color: "#e8eaf0" }}>{deleteRealTarget.equipamento}</strong> · R$ {fmt(deleteRealTarget.custo_unitario * deleteRealTarget.quantidade)}</p>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteRealWho} onChange={e => setDeleteRealWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteRealTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={() => excluirReal(deleteRealTarget, deleteRealWho)} disabled={!deleteRealWho.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteRealWho.trim() ? 0.5 : 1 }}>
                  <Trash2 size={14} />Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showEditRealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowEditRealModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}><h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição</h3></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={editRealWho} onChange={e => setEditRealWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={editRealObs} onChange={e => setEditRealObs(e.target.value)} /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowEditRealModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarEditReal} disabled={!editRealWho.trim() || savingEditReal} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !editRealWho.trim() ? 0.5 : 1 }}>
                  {savingEditReal ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
