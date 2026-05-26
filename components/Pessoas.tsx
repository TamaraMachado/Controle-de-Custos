"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Pencil, X, Save, Plus, Trash2, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle,
  Users, Factory, Check
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Escala { id: string; nome: string; }
interface Planta { id: string; nome: string; }
interface PessoaConfig {
  id?: string;
  projeto_id: string;
  escala_id: string;
  planta_id: string;
  funcao: string;
  quantidade: number;
  custo_unitario: number;
  ordem: number;
}
interface Historico {
  id: string; config_id: string | null; descricao_item: string;
  campo: string; valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}
interface Props { projetoId: string; }

const fmt = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// ─── Funções padrão por tipo de planta ───────────────────────────────────────
const FUNCOES_PADRAO: Record<string, string[]> = {
  default: [
    "Operador 1", "Operador 2 - Aglo", "Operador 4 - COI Aglo",
    "Operador logístico", "Técnico Operação", "Supervisor de operação",
    "Mecânico", "Eletricista", "Utilidades (op 3 - forno)"
  ],
  "Forno Flex": [
    "Operador 2 (abast. forno)", "Operador 3 (forneiro)", "Operador 4",
    "Operador 5", "Operador logístico", "Especializado",
    "Supervisor de op.", "Mecânico", "Eletricista", "Utilidades"
  ],
};

// Qtd padrão por escala para plantas padrão
const QTD_PADRAO: Record<string, number[]> = {
  "6x2": [0, 4, 4, 8, 1, 1, 4, 4, 4],
  "5x2": [0, 3, 3, 3, 1, 1, 3, 3, 3],
  "6x1": [0, 3, 3, 3, 1, 1, 3, 3, 3],
};
const QTD_FORNO: Record<string, number[]> = {
  "6x2": [4, 16, 4, 4, 4, 1, 1, 4, 4, 4],
  "5x2": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "6x1": [3, 12, 3, 3, 3, 1, 1, 3, 3, 3],
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function Pessoas({ projetoId }: Props) {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [escalaId, setEscalaId] = useState<string>("");
  const [plantaId, setPlantaId] = useState<string>("");
  const [saved, setSaved] = useState<PessoaConfig[]>([]);
  const [editing, setEditing] = useState<PessoaConfig[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  // Nova escala/planta
  const [showNovaEscala, setShowNovaEscala] = useState(false);
  const [novaEscala, setNovaEscala] = useState("");
  const [showNovaPlanta, setShowNovaPlanta] = useState(false);
  const [novaPlanta, setNovaPlanta] = useState("");
  // Save modal
  const [showModal, setShowModal] = useState(false);
  const [modalWho, setModalWho] = useState("");
  const [modalObs, setModalObs] = useState("");
  const [modalError, setModalError] = useState("");
  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<PessoaConfig | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteObs, setDeleteObs] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("pessoas_escalas").select("*").order("nome"),
      supabase.from("pessoas_plantas").select("*").order("nome"),
    ]);
    setEscalas(e ?? []);
    setPlantas(p ?? []);
    setLoading(false);
  }, []);

  const loadConfig = useCallback(async (eid: string, pid: string) => {
    if (!eid || !pid) { setSaved([]); return; }
    const { data } = await supabase.from("pessoas_config")
      .select("*").eq("projeto_id", projetoId).eq("escala_id", eid).eq("planta_id", pid)
      .order("ordem");
    setSaved(data ?? []);
  }, [projetoId]);

  const loadHistorico = useCallback(async () => {
    const { data } = await supabase.from("pessoas_historico")
      .select("*").eq("projeto_id", projetoId)
      .order("alterado_em", { ascending: false }).limit(60);
    setHistorico(data ?? []);
  }, [projetoId]);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { loadConfig(escalaId, plantaId); }, [escalaId, plantaId, loadConfig]);
  useEffect(() => { loadHistorico(); }, [loadHistorico]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const escalaNome = escalas.find(e => e.id === escalaId)?.nome ?? "";
  const plantaNome = plantas.find(p => p.id === plantaId)?.nome ?? "";
  const totalCusto = saved.reduce((s, r) => s + r.quantidade * r.custo_unitario, 0);
  const totalPessoas = saved.reduce((s, r) => s + r.quantidade, 0);

  const emptyRow = (ordem: number): PessoaConfig => ({
    projeto_id: projetoId, escala_id: escalaId, planta_id: plantaId,
    funcao: "", quantidade: 0, custo_unitario: 0, ordem,
  });

  // ── Pré-popular com dados padrão ──────────────────────────────────────────
  const prePopular = () => {
    const isForno = plantaNome === "Forno Flex";
    const funcoes = isForno ? FUNCOES_PADRAO["Forno Flex"] : FUNCOES_PADRAO.default;
    const qtds = (isForno ? QTD_FORNO : QTD_PADRAO)[escalaNome] ?? funcoes.map(() => 0);
    const rows: PessoaConfig[] = funcoes.map((funcao, i) => ({
      projeto_id: projetoId, escala_id: escalaId, planta_id: plantaId,
      funcao, quantidade: qtds[i] ?? 0, custo_unitario: 0, ordem: i,
    }));
    setEditing(rows);
    setIsEditing(true);
  };

  // ── Edit ──────────────────────────────────────────────────────────────────
  const startEdit = () => { setEditing(saved.map(r => ({ ...r }))); setIsEditing(true); };
  const cancelEdit = () => { setEditing([]); setIsEditing(false); };
  const updateRow = (idx: number, field: keyof PessoaConfig, value: string | number) =>
    setEditing(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  const addRow = () => setEditing(prev => [...prev, emptyRow(prev.length)]);
  const removeEditRow = (idx: number) => setEditing(prev => prev.filter((_, i) => i !== idx));

  // ── Delete (view mode) ───────────────────────────────────────────────────
  const openDelete = (row: PessoaConfig) => { setDeleteTarget(row); setDeleteWho(""); setDeleteObs(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget?.id) return;
    setDeleting(true);
    const id = deleteTarget.id;
    const funcao = deleteTarget.funcao;
    const who = deleteWho; const obs = deleteObs;
    await supabase.from("pessoas_historico").insert([{
      projeto_id: projetoId, config_id: id, descricao_item: funcao,
      campo: "Função excluída", valor_anterior: funcao, valor_novo: "-",
      alterado_por: who, observacao: obs,
    }]);
    await supabase.from("pessoas_config").delete().eq("id", id);
    setDeleteTarget(null); setDeleting(false);
    await loadConfig(escalaId, plantaId);
    await loadHistorico();
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const requestSave = () => { setModalWho(""); setModalObs(""); setModalError(""); setShowModal(true); };
  const confirmSave = async () => {
    if (!modalWho.trim()) { setModalError("Informe quem está salvando."); return; }
    setShowModal(false); setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const savedMap = new Map(saved.map(r => [r.id, r]));
    for (const row of editing) {
      const payload = { projeto_id: projetoId, escala_id: escalaId, planta_id: plantaId, funcao: row.funcao, quantidade: row.quantidade, custo_unitario: row.custo_unitario, ordem: row.ordem };
      if (row.id) {
        const orig = savedMap.get(row.id);
        if (orig) {
          for (const f of ["funcao", "quantidade", "custo_unitario"] as (keyof PessoaConfig)[]) {
            if (String(orig[f]) !== String(row[f])) {
              changes.push({ projeto_id: projetoId, config_id: row.id, descricao_item: row.funcao, campo: f === "funcao" ? "Função" : f === "quantidade" ? "Quantidade" : "Custo Unitário", valor_anterior: String(orig[f]), valor_novo: String(row[f]), alterado_por: modalWho, observacao: modalObs });
            }
          }
        }
        await supabase.from("pessoas_config").update(payload).eq("id", row.id);
      } else {
        const { data: ins } = await supabase.from("pessoas_config").insert([payload]).select().single();
        changes.push({ projeto_id: projetoId, config_id: ins?.id ?? null, descricao_item: row.funcao || "Nova função", campo: "Função criada", valor_anterior: "-", valor_novo: row.funcao, alterado_por: modalWho, observacao: modalObs });
      }
    }
    for (const orig of saved) {
      if (orig.id && !editing.find(r => r.id === orig.id)) {
        await supabase.from("pessoas_historico").insert([{ projeto_id: projetoId, config_id: orig.id, descricao_item: orig.funcao, campo: "Função excluída", valor_anterior: orig.funcao, valor_novo: "-", alterado_por: modalWho, observacao: modalObs }]);
        await supabase.from("pessoas_config").delete().eq("id", orig.id);
      }
    }
    if (changes.length > 0) await supabase.from("pessoas_historico").insert(changes);
    setIsEditing(false); setEditing([]); setSaving(false);
    await loadConfig(escalaId, plantaId);
    await loadHistorico();
  };

  // ── Nova escala/planta ────────────────────────────────────────────────────
  const criarEscala = async () => {
    if (!novaEscala.trim()) return;
    const { data } = await supabase.from("pessoas_escalas").insert([{ nome: novaEscala.trim() }]).select().single();
    if (data) { setEscalas(p => [...p, data]); setEscalaId(data.id); }
    setNovaEscala(""); setShowNovaEscala(false);
  };
  const criarPlanta = async () => {
    if (!novaPlanta.trim()) return;
    const { data } = await supabase.from("pessoas_plantas").insert([{ nome: novaPlanta.trim() }]).select().single();
    if (data) { setPlantas(p => [...p, data]); setPlantaId(data.id); }
    setNovaPlanta(""); setShowNovaPlanta(false);
  };

  const displayRows = isEditing ? editing : saved;

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Seletores ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Escala */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={14} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>ESCALA DE TRABALHO</span>
            </div>
            <button onClick={() => setShowNovaEscala(v => !v)} className="text-xs px-2 py-1 rounded-lg transition-all hover:bg-white/10" style={{ color: "#5560f8" }}>
              <Plus size={11} className="inline mr-1" />Nova
            </button>
          </div>
          {showNovaEscala && (
            <div className="flex gap-2 mb-3">
              <input value={novaEscala} onChange={e => setNovaEscala(e.target.value)} onKeyDown={e => e.key === "Enter" && criarEscala()}
                className="input-field text-xs py-1.5 flex-1" placeholder="Ex: 4x2" autoFocus />
              <button onClick={criarEscala} className="btn-primary py-1.5 px-3 text-xs"><Check size={12} /></button>
              <button onClick={() => setShowNovaEscala(false)} className="py-1.5 px-2 rounded-lg text-xs" style={{ color: "#5a607a" }}><X size={12} /></button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {escalas.map(e => (
              <button key={e.id} onClick={() => setEscalaId(e.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={escalaId === e.id
                  ? { background: "rgba(85,96,248,0.25)", border: "1.5px solid rgba(85,96,248,0.6)", color: "#e8eaf0" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                {escalaId === e.id && <Check size={10} className="inline mr-1" />}{e.nome}
              </button>
            ))}
          </div>
        </div>

        {/* Planta */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Factory size={14} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>PLANTA PRODUTIVA</span>
            </div>
            <button onClick={() => setShowNovaPlanta(v => !v)} className="text-xs px-2 py-1 rounded-lg transition-all hover:bg-white/10" style={{ color: "#5560f8" }}>
              <Plus size={11} className="inline mr-1" />Nova
            </button>
          </div>
          {showNovaPlanta && (
            <div className="flex gap-2 mb-3">
              <input value={novaPlanta} onChange={e => setNovaPlanta(e.target.value)} onKeyDown={e => e.key === "Enter" && criarPlanta()}
                className="input-field text-xs py-1.5 flex-1" placeholder="Ex: Secador vertical" autoFocus />
              <button onClick={criarPlanta} className="btn-primary py-1.5 px-3 text-xs"><Check size={12} /></button>
              <button onClick={() => setShowNovaPlanta(false)} className="py-1.5 px-2 rounded-lg text-xs" style={{ color: "#5a607a" }}><X size={12} /></button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {plantas.map(p => (
              <button key={p.id} onClick={() => setPlantaId(p.id)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={plantaId === p.id
                  ? { background: "rgba(34,197,94,0.2)", border: "1.5px solid rgba(34,197,94,0.5)", color: "#e8eaf0" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                {plantaId === p.id && <Check size={10} className="inline mr-1" />}{p.nome}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conteúdo (só se escala E planta selecionadas) ── */}
      {!escalaId || !plantaId ? (
        <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <Users size={32} style={{ color: "#3d425a", marginBottom: 12 }} />
          <p className="text-sm font-medium" style={{ color: "#5a607a" }}>Selecione uma escala e uma planta para visualizar as pessoas</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-3 py-1.5 rounded-xl font-semibold" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd", border: "1px solid rgba(85,96,248,0.25)" }}>{escalaNome}</span>
              <span className="text-xs" style={{ color: "#3d425a" }}>×</span>
              <span className="text-xs px-3 py-1.5 rounded-xl font-semibold" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}>{plantaNome}</span>
            </div>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  {saved.length === 0 && (
                    <button onClick={prePopular} className="py-2 px-3 text-xs rounded-xl transition-all" style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
                      <Plus size={12} className="inline mr-1" />Pré-popular padrão
                    </button>
                  )}
                  <button onClick={startEdit} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} />Editar</button>
                </>
              ) : (
                <>
                  <button onClick={cancelEdit} className="py-2 px-4 text-xs rounded-xl transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={13} className="inline mr-1" />Cancelar</button>
                  <button onClick={addRow} className="btn-primary py-2 px-3 text-xs"><Plus size={13} />Função</button>
                  <button onClick={requestSave} disabled={saving} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Totais rápidos */}
          {saved.length > 0 && !isEditing && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Total de pessoas", value: totalPessoas.toString(), color: "#7585fd" },
                { label: "Custo total MO", value: `R$ ${fmt(totalCusto)}`, color: "#22c55e" },
              ].map(item => (
                <div key={item.label} className="glass rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs" style={{ color: "#5a607a" }}>{item.label}</span>
                  <span className="text-sm font-bold" style={{ color: item.color }}>{item.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Tabela */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Função / Cargo","Quantidade","Custo Unit. (R$)","Total (R$)",""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-12 text-sm" style={{ color: "#5a607a" }}>
                      {isEditing ? 'Clique em "+ Função" para adicionar.' : 'Nenhuma função cadastrada. Clique em "Editar" ou "Pré-popular padrão".'}
                    </td></tr>
                  ) : displayRows.map((row, idx) => {
                    const total = row.quantidade * row.custo_unitario;
                    return (
                      <tr key={row.id ?? `new-${idx}`} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <td className="px-3 py-2">
                          {isEditing
                            ? <input value={row.funcao} onChange={e => updateRow(idx, "funcao", e.target.value)} className="w-52 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg focus:bg-white/5" style={{ color: "#e8eaf0" }} placeholder="Nome da função" />
                            : <span className="text-xs font-medium px-1" style={{ color: "#e8eaf0" }}>{row.funcao || "—"}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing
                            ? <input type="number" value={row.quantidade} onChange={e => updateRow(idx, "quantidade", parseInt(e.target.value) || 0)} className="w-20 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs font-semibold px-1" style={{ color: "#7585fd" }}>{row.quantidade}</span>}
                        </td>
                        <td className="px-3 py-2">
                          {isEditing
                            ? <input type="number" step="0.01" value={row.custo_unitario} onChange={e => updateRow(idx, "custo_unitario", parseFloat(e.target.value) || 0)} className="w-32 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs px-1" style={{ color: "#e8eaf0" }}>{fmt(row.custo_unitario)}</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-xs font-semibold" style={{ color: total > 0 ? "#22c55e" : "#3d425a" }}>{total > 0 ? `R$ ${fmt(total)}` : "—"}</span>
                        </td>
                        <td className="px-2 py-2">
                          {isEditing
                            ? <button onClick={() => removeEditRow(idx)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20 transition-all" style={{ color: "#5a607a" }}><Trash2 size={12} /></button>
                            : <button onClick={() => openDelete(row)} className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all" style={{ color: "#ef4444" }}><Trash2 size={12} /></button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {displayRows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                      <td className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold" style={{ color: "#7585fd" }}>
                          {(isEditing ? editing : saved).reduce((s, r) => s + r.quantidade, 0)} pessoas
                        </span>
                      </td>
                      <td />
                      <td className="px-3 py-3 text-right">
                        <span className="text-xs font-semibold" style={{ color: "#5a607a" }}>R$</span>
                        <span className="text-sm font-bold ml-1" style={{ color: "#e8eaf0" }}>
                          {fmt((isEditing ? editing : saved).reduce((s, r) => s + r.quantidade * r.custo_unitario, 0))}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Histórico */}
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
            <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
              <div className="flex items-center gap-2">
                <History size={15} style={{ color: "#5560f8" }} />
                <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Edições</span>
                {historico.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{historico.length}</span>}
              </div>
              {showHistorico ? <ChevronUp size={15} style={{ color: "#5a607a" }} /> : <ChevronDown size={15} style={{ color: "#5a607a" }} />}
            </button>
            {showHistorico && (
              <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                {historico.length === 0
                  ? <div className="flex items-center justify-center gap-2 py-8" style={{ color: "#5a607a" }}><History size={16} /><span className="text-sm">Nenhuma alteração ainda.</span></div>
                  : <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Data/Hora","Item","Campo","Valor Anterior","Valor Novo","Alterado por","Observação"].map(h => (
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
                          <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-md" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>{h.campo}</span></td>
                          <td className="px-4 py-2.5 line-through" style={{ color: "#ef4444", opacity: 0.8 }}>{h.valor_anterior || "—"}</td>
                          <td className="px-4 py-2.5 font-medium" style={{ color: "#22c55e" }}>{h.valor_novo || "—"}</td>
                          <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.alterado_por}</td>
                          <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: "#8890a8" }}>{h.observacao || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>}
              </div>
            )}
          </div>
        </>
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}><Trash2 size={15} style={{ color: "#ef4444" }} /></div>
                <div><h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir função</h3><p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Registrado no histórico</p></div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#fca5a5" }}>Excluindo: <strong>{deleteTarget.funcao}</strong></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={e => setDeleteWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Motivo</label><textarea className="input-field resize-none" rows={2} value={deleteObs} onChange={e => setDeleteObs(e.target.value)} /></div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={13} />{deleteError}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white" }}>
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar alterações</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>Registre quem está salvando</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={modalWho} onChange={e => setModalWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={3} value={modalObs} onChange={e => setModalObs(e.target.value)} /></div>
              {modalError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={13} />{modalError}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmSave} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}><Save size={14} />Confirmar e salvar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
