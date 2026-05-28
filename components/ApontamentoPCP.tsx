"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Pencil, Save, X, Trash2, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Check, Clock
} from "lucide-react";

interface Apontamento {
  id: string;
  mes: string;
  funcao: string;
  atividade: string;
  horas: number;
  registrado_por: string;
  created_at: string;
}

interface Historico {
  id: string; item_id: string; descricao_item: string;
  campo: string; valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}

interface Props { projetoId: string; }

const fmt = (v: number, d = 1) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMes = (iso: string) => { try { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; } catch { return iso; } };

export default function ApontamentoPCP({ projetoId }: Props) {
  const [apontamentos, setApontamentos] = useState<Apontamento[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistorico, setShowHistorico] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(new Date().toISOString().slice(0, 7));

  // Form novo
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ mes: new Date().toISOString().slice(0, 7), funcao: "", atividade: "", horas: "", registrado_por: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Edição inline
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Apontamento>>({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [editWho, setEditWho] = useState("");
  const [editObs, setEditObs] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Excluir
  const [deleteTarget, setDeleteTarget] = useState<Apontamento | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: apts }, { data: hist }] = await Promise.all([
      supabase.from("apontamento_horas").select("*").eq("projeto_id", projetoId)
        .order("mes", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("apontamento_historico").select("*").eq("projeto_id", projetoId)
        .order("alterado_em", { ascending: false }).limit(80),
    ]);
    setApontamentos(apts ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // Meses disponíveis
  const meses = Array.from(new Set(apontamentos.map(a => a.mes.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const aptsFiltrados = apontamentos.filter(a => a.mes.slice(0, 7) === mesFiltro);
  const totalHorasMes = aptsFiltrados.reduce((s, a) => s + a.horas, 0);

  // Salvar novo
  const salvar = async () => {
    if (!form.funcao.trim()) { setFormError("Informe a função."); return; }
    if (!form.horas || parseFloat(form.horas) <= 0) { setFormError("Informe as horas."); return; }
    if (!form.registrado_por.trim()) { setFormError("Informe quem está registrando."); return; }
    setSaving(true); setFormError("");
    const mesDate = form.mes + "-01";
    const { data: ins } = await supabase.from("apontamento_horas").insert([{
      projeto_id: projetoId, mes: mesDate,
      funcao: form.funcao, atividade: form.atividade,
      horas: parseFloat(form.horas), registrado_por: form.registrado_por,
    }]).select().single();
    if (ins) await supabase.from("apontamento_historico").insert([{
      projeto_id: projetoId, item_id: ins.id,
      descricao_item: form.funcao,
      campo: "Apontamento criado", valor_anterior: "—",
      valor_novo: `${form.horas}h · ${form.funcao}`,
      alterado_por: form.registrado_por, observacao: "",
    }]);
    setForm(p => ({ ...p, funcao: "", atividade: "", horas: "", registrado_por: "" }));
    setShowForm(false); setSaving(false);
    await load();
  };

  // Editar
  const iniciarEdit = (a: Apontamento) => { setEditandoId(a.id); setEditForm({ ...a }); setEditWho(""); setEditObs(""); };
  const requestSaveEdit = () => { setEditWho(""); setEditObs(""); setShowEditModal(true); };
  const confirmarEdit = async () => {
    if (!editWho.trim() || !editandoId) return;
    setSavingEdit(true);
    const orig = apontamentos.find(a => a.id === editandoId)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const campos = [["funcao","Função"],["atividade","Atividade"],["horas","Horas"]] as [keyof Apontamento, string][];
    for (const [f, label] of campos) {
      if (String(orig[f] ?? "") !== String((editForm as any)[f] ?? "")) {
        changes.push({ projeto_id: projetoId, item_id: editandoId, descricao_item: orig.funcao, campo: label, valor_anterior: String(orig[f] ?? "—"), valor_novo: String((editForm as any)[f] ?? "—"), alterado_por: editWho, observacao: editObs });
      }
    }
    if (changes.length > 0) await supabase.from("apontamento_historico").insert(changes);
    await supabase.from("apontamento_horas").update({ funcao: editForm.funcao, atividade: editForm.atividade, horas: editForm.horas }).eq("id", editandoId);
    setEditandoId(null); setShowEditModal(false); setSavingEdit(false);
    await load();
  };

  // Excluir
  const openDelete = (a: Apontamento) => { setDeleteTarget(a); setDeleteWho(""); setDeleteError(""); };
  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget) return;
    setDeleting(true);
    const { id, funcao } = deleteTarget; const who = deleteWho;
    await supabase.from("apontamento_historico").insert([{
      projeto_id: projetoId, item_id: id, descricao_item: funcao,
      campo: "Apontamento excluído", valor_anterior: funcao, valor_novo: "—",
      alterado_por: who, observacao: "",
    }]);
    await supabase.from("apontamento_horas").delete().eq("id", id);
    setDeleteTarget(null); setDeleting(false);
    await load();
  };

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}><Loader2 size={20} className="animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="space-y-6">

      {/* Header explicativo */}
      <div className="flex items-start gap-3 px-4 py-3 rounded-xl" style={{ background: "rgba(85,96,248,0.08)", border: "1px solid rgba(85,96,248,0.2)" }}>
        <Clock size={16} style={{ color: "#7585fd", marginTop: 2 }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Apontamento de Horas PCP</p>
          <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>
            Registre as horas trabalhadas por função e atividade. Os dados alimentarão automaticamente o custo real na aba SG&A.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Seletor de mês */}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-xs font-medium" style={{ color: "#8890a8" }}>Mês:</span>
          <input type="month" value={mesFiltro} onChange={e => setMesFiltro(e.target.value)}
            className="input-field text-xs py-1.5 w-36" style={{ color: "#e8eaf0" }} />
          {totalHorasMes > 0 && (
            <span className="text-xs px-3 py-1.5 rounded-xl font-semibold" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>
              {fmt(totalHorasMes)} h apontadas em {fmtMes(mesFiltro)}
            </span>
          )}
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
          <Plus size={13} />Novo apontamento
        </button>
      </div>

      {/* Form novo apontamento */}
      {showForm && (
        <div className="glass rounded-2xl p-5 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
          <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Registrar horas</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Mês de referência</label>
              <input type="month" value={form.mes} onChange={e => setForm(p => ({ ...p, mes: e.target.value }))}
                className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Função *</label>
              <input value={form.funcao} onChange={e => setForm(p => ({ ...p, funcao: e.target.value }))}
                className="input-field text-xs py-2" placeholder="Ex: Analista PCP" style={{ color: "#e8eaf0" }} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Atividade</label>
              <input value={form.atividade} onChange={e => setForm(p => ({ ...p, atividade: e.target.value }))}
                className="input-field text-xs py-2" placeholder="Ex: Planejamento de produção" style={{ color: "#e8eaf0" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Horas *</label>
              <input type="number" step="0.5" value={form.horas} onChange={e => setForm(p => ({ ...p, horas: e.target.value }))}
                className="input-field text-xs py-2" placeholder="0,0" style={{ color: "#e8eaf0" }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
              <input value={form.registrado_por} onChange={e => setForm(p => ({ ...p, registrado_por: e.target.value }))}
                className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
            </div>
          </div>
          {formError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{formError}</div>}
          <div className="flex gap-2">
            <button onClick={() => { setShowForm(false); setFormError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
              <X size={12} className="inline mr-1" />Cancelar
            </button>
            <button onClick={salvar} disabled={saving} className="btn-primary py-2 px-5 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Registrar
            </button>
          </div>
        </div>
      )}

      {/* Tabela de apontamentos do mês */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold" style={{ color: "#e8eaf0" }}>
            Apontamentos · {fmtMes(mesFiltro)}
            {aptsFiltrados.length > 0 && <span className="ml-2 text-xs" style={{ color: "#5a607a" }}>{aptsFiltrados.length} registro{aptsFiltrados.length > 1 ? "s" : ""}</span>}
          </p>
          {totalHorasMes > 0 && <span className="text-sm font-bold" style={{ color: "#7585fd" }}>{fmt(totalHorasMes)} h total</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Função / Cargo","Atividade","Horas","Registrado por","Data registro",""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aptsFiltrados.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-sm" style={{ color: "#5a607a" }}>
                  Nenhum apontamento em {fmtMes(mesFiltro)}. Clique em "Novo apontamento" para registrar.
                </td></tr>
              ) : aptsFiltrados.map(a => {
                const isEdit = editandoId === a.id;
                return (
                  <tr key={a.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-4 py-2.5">
                      {isEdit
                        ? <input value={editForm.funcao ?? ""} onChange={e => setEditForm(p => ({ ...p, funcao: e.target.value }))} className="w-44 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#e8eaf0" }} />
                        : <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{a.funcao}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit
                        ? <input value={editForm.atividade ?? ""} onChange={e => setEditForm(p => ({ ...p, atividade: e.target.value }))} className="w-48 bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5" style={{ color: "#8890a8" }} />
                        : <span className="text-xs" style={{ color: "#8890a8" }}>{a.atividade || "—"}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {isEdit
                        ? <input type="number" step="0.5" value={editForm.horas ?? ""} onChange={e => setEditForm(p => ({ ...p, horas: parseFloat(e.target.value) || 0 }))} className="w-20 bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5" style={{ color: "#7585fd" }} />
                        : <span className="text-sm font-bold" style={{ color: "#7585fd" }}>{fmt(a.horas)} h</span>}
                    </td>
                    <td className="px-4 py-2.5"><span className="text-xs" style={{ color: "#8890a8" }}>{a.registrado_por}</span></td>
                    <td className="px-4 py-2.5"><span className="text-xs" style={{ color: "#5a607a" }}>{new Date(a.created_at).toLocaleDateString("pt-BR")}</span></td>
                    <td className="px-3 py-2.5">
                      {isEdit ? (
                        <div className="flex gap-1">
                          <button onClick={() => setEditandoId(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                          <button onClick={requestSaveEdit} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
                        </div>
                      ) : (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => iniciarEdit(a)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#7585fd" }}><Pencil size={11} /></button>
                          <button onClick={() => openDelete(a)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}><Trash2 size={11} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {aptsFiltrados.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                  <td colSpan={2} className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                  <td className="px-4 py-3"><span className="text-base font-bold" style={{ color: "#7585fd" }}>{fmt(totalHorasMes)} h</span></td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Histórico */}
      {historico.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex items-center gap-2">
              <History size={14} style={{ color: "#5560f8" }} />
              <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Alterações</span>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{historico.length}</span>
            </div>
            {showHistorico ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
          </button>
          {showHistorico && (
            <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Data/Hora","Item","Campo","Valor Anterior","Valor Novo","Alterado por","Obs."].map(h => (
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
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal editar */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição</h3>
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

      {/* Modal excluir */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir apontamento</h3>
              <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Excluindo: <strong style={{ color: "#e8eaf0" }}>{deleteTarget.funcao}</strong> · {fmt(deleteTarget.horas)} h</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={e => setDeleteWho(e.target.value)} autoFocus /></div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{deleteError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting || !deleteWho.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteWho.trim() ? 0.5 : 1 }}>
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
