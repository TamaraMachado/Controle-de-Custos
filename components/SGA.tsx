"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import {
  Plus, Trash2, Pencil, X, Save, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Clock
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

interface Apontamento {
  id: string;
  mes: string;
  funcao: string;
  atividade: string;
  horas: number;
  registrado_por: string;
  created_at: string;
}

interface ApontHistorico {
  id: string; item_id: string; descricao_item: string;
  campo: string; valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
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
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);

  // Apontamentos (custo real - somente leitura)
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [apontHistorico, setApontHistorico] = useState<ApontHistorico[]>([]);
  const [sgaCustoMap, setSgaCustoMap] = useState<Record<string, number>>({});
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [showApontHistorico, setShowApontHistorico] = useState(false);
  // Edição de custo/h por apontamento (só em SGA)
  const [editandoCustoId, setEditandoCustoId] = useState<string | null>(null);
  const [custoHoraEdit, setCustoHoraEdit] = useState("");
  const [showCustoModal, setShowCustoModal] = useState(false);
  const [custoEditWho, setCustoEditWho] = useState("");
  const [savingCusto, setSavingCusto] = useState(false);

  // Modal salvar planejado
  const [showModal, setShowModal] = useState(false);
  const [modalWho, setModalWho] = useState("");
  const [modalObs, setModalObs] = useState("");
  const [modalError, setModalError] = useState("");

  // Modal excluir planejado
  const [deleteTarget, setDeleteTarget] = useState<SGARow | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteObs, setDeleteObs] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: plan }, { data: hist }, { data: apts }, { data: aptHist }, { data: sgaPlan }] = await Promise.all([
      supabase.from("sga_planejado").select("*").eq("projeto_id", projetoId).order("ordem"),
      supabase.from("sga_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(60),
      supabase.from("apontamento_horas").select("*").eq("projeto_id", projetoId)
        .order("mes", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("apontamento_historico").select("*").eq("projeto_id", projetoId)
        .order("alterado_em", { ascending: false }).limit(60),
      supabase.from("sga_planejado").select("atividade, custo").eq("projeto_id", projetoId),
    ]);
    setSavedPlan(plan ?? []);
    setHistorico(hist ?? []);
    setApontamentos(apts ?? []);
    setApontHistorico(aptHist ?? []);
    // Mapa atividade → custo/h do planejado
    const map: Record<string, number> = {};
    (sgaPlan ?? []).forEach((r: any) => { if (r.atividade) map[r.atividade] = r.custo; });
    setSgaCustoMap(map);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  const totalPlan = savedPlan.reduce((s, r) => s + r.horas * r.custo, 0);
  const meses = Array.from(new Set(apontamentos.map(a => a.mes.slice(0,7)))).sort((a,b) => b.localeCompare(a));
  const mesAtivo = mesSelecionado || meses[0] || "";
  const aptsMes = apontamentos.filter(a => a.mes.slice(0,7) === mesAtivo);

  // Retorna custo/h: do campo custo_hora do apontamento (se editado), senão do mapa do planejado
  const getCustoHora = (a: Apontamento) => {
    if ((a as any).custo_hora > 0) return (a as any).custo_hora;
    return sgaCustoMap[a.atividade] ?? 0;
  };

  const totalHorasMes = aptsMes.reduce((s, a) => s + a.horas, 0);
  const totalCustoMes = aptsMes.reduce((s, a) => s + a.horas * getCustoHora(a), 0);

  // Salvar custo/h editado em SGA
  const iniciarEditCusto = (a: Apontamento) => {
    setEditandoCustoId(a.id);
    setCustoHoraEdit(String(getCustoHora(a) || ""));
  };

  const requestSaveCusto = () => { setCustoEditWho(""); setShowCustoModal(true); };

  const confirmarSaveCusto = async () => {
    if (!custoEditWho.trim() || !editandoCustoId) return;
    setSavingCusto(true);
    const orig = apontamentos.find(a => a.id === editandoCustoId)!;
    const custoAnterior = getCustoHora(orig);
    const custoNovo = parseFloat(custoHoraEdit) || 0;
    // Atualiza custo_hora no apontamento
    await supabase.from("apontamento_horas").update({ custo_hora: custoNovo } as any).eq("id", editandoCustoId);
    // Registra no histórico do SGA
    await supabase.from("sga_historico").insert([{
      projeto_id: projetoId, item_id: editandoCustoId, tipo: "realizado",
      descricao_item: `${orig.funcao} · ${orig.atividade || ""}`,
      campo: "Custo/hora editado",
      valor_anterior: `R$ ${fmt(custoAnterior, 4)}/h`,
      valor_novo: `R$ ${fmt(custoNovo, 4)}/h`,
      alterado_por: custoEditWho, observacao: "",
    }]);
    setEditandoCustoId(null); setShowCustoModal(false); setSavingCusto(false);
    await load();
  };

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

  const openDelete = (row: SGARow) => { setDeleteTarget(row); setDeleteWho(""); setDeleteObs(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget?.id) return;
    setDeleting(true);
    await supabase.from("sga_historico").insert([{ projeto_id: projetoId, item_id: deleteTarget.id, tipo: "planejado", descricao_item: deleteTarget.funcao, campo: "Linha excluída", valor_anterior: deleteTarget.funcao, valor_novo: "—", alterado_por: deleteWho, observacao: deleteObs }]);
    await supabase.from("sga_planejado").delete().eq("id", deleteTarget.id);
    setDeleteTarget(null); setDeleting(false);
    await load();
  };

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
                  {["Função / Cargo","Atividade desempenhada","Horas/mês","Custo (R$/h)","Total R$/mês",""].map(h => (
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
                        : <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>R$ {fmt(row.custo, 4)}/h</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-bold" style={{ color: "#7585fd" }}>R$ {fmt(row.horas * row.custo)}</span>
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
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right"><span className="text-sm font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(displayPlan.reduce((s,r) => s+(r.horas*r.custo),0))}</span></td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </section>

      {/* ══════════════ CUSTO REAL — APONTAMENTOS ════════════════════════════ */}
      <section>
        <SectionHeader tipo="realizado"
          descricao="Dados importados do Apontamento de Horas PCP · somente leitura"
          total={totalHorasMes > 0 ? undefined : undefined}>
          {/* sem botão — edição é feita na aba Apontamento */}
        </SectionHeader>

        {/* Aviso de somente leitura */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4" style={{ background: "rgba(85,96,248,0.07)", border: "1px solid rgba(85,96,248,0.15)" }}>
          <Clock size={13} style={{ color: "#7585fd" }} />
          <span className="text-xs" style={{ color: "#7585fd" }}>Para lançar ou editar horas, acesse a aba <strong>Apontamento de Horas PCP</strong>.</span>
        </div>

        {/* Seletor de mês */}
        {meses.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {meses.map(m => (
              <button key={m} onClick={() => setMesSelecionado(m)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={mesAtivo === m
                  ? { background: "rgba(34,197,94,0.2)", border: "1.5px solid rgba(34,197,94,0.4)", color: "#e8eaf0" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                {fmtMes(m)}
              </button>
            ))}
          </div>
        )}

        {/* Tabela apontamentos */}
        <div className="glass rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                  {["Função / Cargo","Atividade","Horas","Custo/h (R$)","Custo Total","Registrado por",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aptsMes.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>
                    {meses.length === 0
                      ? "Nenhum apontamento registrado. Use a aba Apontamento de Horas PCP para lançar."
                      : `Nenhum apontamento em ${mesAtivo ? fmtMes(mesAtivo) : ""}. Selecione outro mês ou registre na aba Apontamento de Horas PCP.`}
                  </td></tr>
                ) : aptsMes.map(a => {
                  const custoH = getCustoHora(a);
                  const custoTotal = a.horas * custoH;
                  const isEditingCusto = editandoCustoId === a.id;
                  const semCusto = custoH === 0;
                  return (
                    <tr key={a.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5"><span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{a.funcao}</span></td>
                      <td className="px-4 py-2.5"><span className="text-xs" style={{ color: "#8890a8" }}>{a.atividade || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className="text-sm font-bold" style={{ color: "#22c55e" }}>{fmt(a.horas, 1)} h</span></td>
                      <td className="px-4 py-2.5">
                        {isEditingCusto ? (
                          <div className="flex items-center gap-1">
                            <input type="number" step="0.01" value={custoHoraEdit}
                              onChange={e => setCustoHoraEdit(e.target.value)}
                              className="w-24 bg-white/5 outline-none text-xs px-2 py-1 rounded border"
                              style={{ color: "#e8eaf0", borderColor: "rgba(85,96,248,0.4)" }}
                              autoFocus />
                            <button onClick={requestSaveCusto} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={10} /></button>
                            <button onClick={() => setEditandoCustoId(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={10} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold" style={{ color: semCusto ? "#ef4444" : "#7585fd" }}>
                              {semCusto ? "— definir" : `R$ ${fmt(custoH, 2)}/h`}
                            </span>
                            <button onClick={() => iniciarEditCusto(a)}
                              className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all"
                              style={{ color: "#7585fd" }} title="Editar custo/h">
                              <Pencil size={9} />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-bold" style={{ color: semCusto ? "#3d425a" : "#e8eaf0" }}>
                          {semCusto ? "—" : `R$ ${fmt(custoTotal)}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5"><span className="text-xs" style={{ color: "#5a607a" }}>{a.registrado_por}</span></td>
                      <td className="px-3 py-2.5" />
                    </tr>
                  );
                })}
              </tbody>
              {aptsMes.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(34,197,94,0.06)" }}>
                    <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3"><span className="text-base font-bold" style={{ color: "#22c55e" }}>{fmt(totalHorasMes, 1)} h</span></td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3"><span className="text-base font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalCustoMes)}</span></td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Histórico dos apontamentos (somente leitura) */}
        {apontHistorico.length > 0 && (
          <div className="rounded-2xl overflow-hidden mt-4" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={() => setShowApontHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-2">
                <History size={14} style={{ color: "#22c55e" }} />
                <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Apontamentos</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}>{apontHistorico.length}</span>
                <span className="text-xs" style={{ color: "#5a607a" }}>· somente leitura</span>
              </div>
              {showApontHistorico ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
            </button>
            {showApontHistorico && (
              <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Data/Hora","Item","Campo","Anterior","Novo","Alterado por"].map(h => (
                      <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {apontHistorico.map(h => (
                      <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.descricao_item || "—"}</td>
                        <td className="px-4 py-2.5"><span className="px-1.5 py-0.5 rounded text-xs" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>{h.campo}</span></td>
                        <td className="px-4 py-2.5 line-through" style={{ color: "#ef4444", opacity: 0.8 }}>{h.valor_anterior || "—"}</td>
                        <td className="px-4 py-2.5 font-medium" style={{ color: "#22c55e" }}>{h.valor_novo || "—"}</td>
                        <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.alterado_por}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ══ HISTÓRICO PLANEJADO ══════════════════════════════════════════════ */}
      {historico.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center gap-2">
              <History size={14} style={{ color: "#5560f8" }} />
              <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Edições do Planejamento</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{historico.length}</span>
            </div>
            {showHistorico ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
          </button>
          {showHistorico && (
            <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Data/Hora","Item","Campo","Anterior","Novo","Alterado por","Obs."].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {historico.map(h => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
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

      {/* Modais planejado */}
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
                <button onClick={confirmSavePlan} disabled={saving} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCustoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowCustoModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar custo/hora</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                Novo custo: <strong style={{ color: "#7585fd" }}>R$ {fmt(parseFloat(custoHoraEdit)||0, 2)}/h</strong>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label>
                <input className="input-field" placeholder="Seu nome" value={custoEditWho} onChange={e => setCustoEditWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowCustoModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSaveCusto} disabled={!custoEditWho.trim() || savingCusto} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !custoEditWho.trim() ? 0.5 : 1 }}>
                  {savingCusto ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
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
    </div>
  );
}
