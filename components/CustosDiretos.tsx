"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus, Trash2, Pencil, X, Save, DollarSign,
  Loader2, History, ChevronDown, ChevronUp, AlertCircle
} from "lucide-react";

interface CustoDireto {
  id?: string;
  projeto_id: string;
  codigo: string;
  descricao: string;
  receita: number;
  quantidade: number;
  custo_unitario: number;
  custo_frete: number;
  referencia: string;
  taxa_cambio: number;
}

interface Historico {
  id: string;
  custo_direto_id: string | null;
  descricao_item: string;
  campo: string;
  valor_anterior: string;
  valor_novo: string;
  alterado_por: string;
  observacao: string;
  alterado_em: string;
}

interface SaveModalData { alterado_por: string; observacao: string; }
interface Props { projetoId: string; }

const FIELD_LABELS: Record<string, string> = {
  codigo: "Código", descricao: "Descrição", receita: "Receita (%)",
  quantidade: "Quantidade", custo_unitario: "Custo Unitário (R$/ton)",
  custo_frete: "Custo Frete (R$/ton)", referencia: "Referência", taxa_cambio: "Taxa de Câmbio",
};

const fmt = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const emptyRow = (projetoId: string, taxa: number): CustoDireto => ({
  projeto_id: projetoId, codigo: "", descricao: "", receita: 0,
  quantidade: 0, custo_unitario: 0, custo_frete: 0,
  referencia: "Custo médio de estoque", taxa_cambio: taxa,
});

export default function CustosDiretos({ projetoId }: Props) {
  const [saved, setSaved] = useState<CustoDireto[]>([]);
  const [editing, setEditing] = useState<CustoDireto[]>([]);
  const [taxa, setTaxa] = useState(5.80);
  const [taxaEdit, setTaxaEdit] = useState(5.80);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [showHistorico, setShowHistorico] = useState(false);
  // Save modal
  const [showModal, setShowModal] = useState(false);
  const [modalData, setModalData] = useState<SaveModalData>({ alterado_por: "", observacao: "" });
  const [modalError, setModalError] = useState("");
  // Delete modal (view mode)
  const [deleteTarget, setDeleteTarget] = useState<CustoDireto | null>(null);
  const [deleteWho, setDeleteWho] = useState("");
  const [deleteObs, setDeleteObs] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase.from("custos_diretos").select("*").eq("projeto_id", projetoId).order("created_at", { ascending: true });
    const { data: hist } = await supabase.from("custos_diretos_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(50);
    if (rows && rows.length > 0) { setTaxa(rows[0].taxa_cambio ?? 5.80); setSaved(rows); } else { setSaved([]); }
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { loadData(); }, [loadData]);

  const calcTotal = (rows: CustoDireto[], t: number) => {
    const brl = rows.reduce((s, r) => s + r.quantidade * (r.custo_unitario + r.custo_frete), 0);
    return { brl, usd: t > 0 ? brl / t : 0 };
  };
  const { brl: totalBRL, usd: totalUSD } = calcTotal(saved, taxa);

  const startEdit = () => { setEditing(saved.map((r) => ({ ...r }))); setTaxaEdit(taxa); setIsEditing(true); };
  const cancelEdit = () => { setEditing([]); setIsEditing(false); };
  const updateEditing = (idx: number, field: keyof CustoDireto, value: string | number) => {
    setEditing((prev) => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  };
  const addEditRow = () => setEditing((prev) => [...prev, emptyRow(projetoId, taxaEdit)]);
  const removeEditRow = (idx: number) => setEditing((prev) => prev.filter((_, i) => i !== idx));

  // ── Delete in view mode ───────────────────────────────────────────────────
  const openDeleteModal = (row: CustoDireto) => {
    setDeleteTarget(row);
    setDeleteWho("");
    setDeleteObs("");
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deleteWho.trim()) { setDeleteError("Informe quem está excluindo."); return; }
    if (!deleteTarget?.id) return;
    setDeleting(true);
    await supabase.from("custos_diretos").delete().eq("id", deleteTarget.id);
    await supabase.from("custos_diretos_historico").insert([{
      projeto_id: projetoId,
      custo_direto_id: deleteTarget.id,
      descricao_item: deleteTarget.descricao || deleteTarget.codigo || deleteTarget.id,
      campo: "Linha excluída",
      valor_anterior: deleteTarget.descricao,
      valor_novo: "-",
      alterado_por: deleteWho,
      observacao: deleteObs,
    }]);
    setDeleteTarget(null);
    setDeleting(false);
    await loadData();
  };

  // ── Save flow ─────────────────────────────────────────────────────────────
  const requestSave = () => { setModalData({ alterado_por: "", observacao: "" }); setModalError(""); setShowModal(true); };

  const confirmSave = async () => {
    if (!modalData.alterado_por.trim()) { setModalError("Informe quem está realizando a alteração."); return; }
    setShowModal(false);
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    const savedMap = new Map(saved.map((r) => [r.id, r]));
    if (taxaEdit !== taxa) {
      changes.push({ projeto_id: projetoId, custo_direto_id: null, descricao_item: "Taxa de câmbio", campo: "taxa_cambio", valor_anterior: fmt(taxa, 4), valor_novo: fmt(taxaEdit, 4), alterado_por: modalData.alterado_por, observacao: modalData.observacao });
    }
    for (const row of editing) {
      const payload = { ...row, taxa_cambio: taxaEdit };
      delete (payload as Record<string, unknown>).id;
      if (row.id) {
        const orig = savedMap.get(row.id);
        if (orig) {
          const fields: (keyof CustoDireto)[] = ["codigo","descricao","receita","quantidade","custo_unitario","custo_frete","referencia"];
          for (const f of fields) {
            if (String(orig[f]) !== String(row[f])) {
              changes.push({ projeto_id: projetoId, custo_direto_id: row.id, descricao_item: row.descricao || row.codigo || row.id, campo: FIELD_LABELS[f] ?? f, valor_anterior: String(orig[f]), valor_novo: String(row[f]), alterado_por: modalData.alterado_por, observacao: modalData.observacao });
            }
          }
        }
        await supabase.from("custos_diretos").update({ ...payload, taxa_cambio: taxaEdit }).eq("id", row.id);
      } else {
        const { data: inserted } = await supabase.from("custos_diretos").insert([{ ...payload, taxa_cambio: taxaEdit }]).select().single();
        changes.push({ projeto_id: projetoId, custo_direto_id: inserted?.id ?? null, descricao_item: row.descricao || row.codigo || "Nova linha", campo: "Linha criada", valor_anterior: "-", valor_novo: row.descricao, alterado_por: modalData.alterado_por, observacao: modalData.observacao });
      }
    }
    for (const orig of saved) {
      if (orig.id && !editing.find((r) => r.id === orig.id)) {
        await supabase.from("custos_diretos").delete().eq("id", orig.id);
        changes.push({ projeto_id: projetoId, custo_direto_id: orig.id, descricao_item: orig.descricao || orig.codigo || orig.id, campo: "Linha excluída", valor_anterior: orig.descricao, valor_novo: "-", alterado_por: modalData.alterado_por, observacao: modalData.observacao });
      }
    }
    await supabase.from("custos_diretos").update({ taxa_cambio: taxaEdit }).eq("projeto_id", projetoId);
    if (changes.length > 0) await supabase.from("custos_diretos_historico").insert(changes);
    setIsEditing(false); setEditing([]); setSaving(false);
    await loadData();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  const displayRows = isEditing ? editing : saved;
  const displayTaxa = isEditing ? taxaEdit : taxa;
  const { brl: editBRL, usd: editUSD } = calcTotal(editing, taxaEdit);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <DollarSign size={13} style={{ color: "#5a607a" }} />
          <span className="text-xs" style={{ color: "#8890a8" }}>Taxa R$/US$</span>
          {isEditing ? (
            <input type="number" step="0.01" value={taxaEdit} onChange={(e) => setTaxaEdit(parseFloat(e.target.value) || 0)} className="w-20 text-right text-sm font-medium bg-transparent outline-none" style={{ color: "#e8eaf0" }} />
          ) : (
            <span className="text-sm font-semibold ml-1" style={{ color: "#e8eaf0" }}>{fmt(taxa, 4)}</span>
          )}
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <button onClick={startEdit} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} /> Editar</button>
          ) : (
            <>
              <button onClick={cancelEdit} className="py-2 px-4 text-xs rounded-xl transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={13} className="inline mr-1" />Cancelar</button>
              <button onClick={addEditRow} className="btn-primary py-2 px-3 text-xs"><Plus size={13} /> Linha</button>
              <button onClick={requestSave} disabled={saving} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}Salvar alterações
              </button>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                {["Código","Descrição","Receita %","Qtd","C. Unit. (R$/ton)","C. Frete (R$/ton)","C. MP (R$/ton)","Referência","Total R$","Total US$",""].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 ? (
                <tr><td colSpan={11} className="text-center py-12 text-sm" style={{ color: "#5a607a" }}>{isEditing ? 'Clique em "+ Linha" para adicionar.' : "Nenhum item cadastrado. Clique em Editar para começar."}</td></tr>
              ) : displayRows.map((row, idx) => {
                const custoMP = row.custo_unitario + row.custo_frete;
                const totalR = row.quantidade * custoMP;
                const totalU = displayTaxa > 0 ? totalR / displayTaxa : 0;
                return (
                  <tr key={row.id ?? `new-${idx}`} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-2 py-2">{isEditing ? <input value={row.codigo} onChange={(e) => updateEditing(idx,"codigo",e.target.value)} className="w-24 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg focus:bg-white/5" style={{ color: "#e8eaf0" }} placeholder="000000" /> : <span className="text-xs px-2" style={{ color: "#8890a8" }}>{row.codigo || "—"}</span>}</td>
                    <td className="px-2 py-2">{isEditing ? <input value={row.descricao} onChange={(e) => updateEditing(idx,"descricao",e.target.value)} className="w-36 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg focus:bg-white/5" style={{ color: "#e8eaf0" }} placeholder="Descrição" /> : <span className="text-xs px-2 font-medium" style={{ color: "#e8eaf0" }}>{row.descricao}</span>}</td>
                    <td className="px-2 py-2">{isEditing ? <div className="flex items-center gap-1"><input type="number" value={row.receita} onChange={(e) => updateEditing(idx,"receita",parseFloat(e.target.value)||0)} className="w-14 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} /><span className="text-xs" style={{ color: "#5a607a" }}>%</span></div> : <span className="text-xs px-2" style={{ color: "#8890a8" }}>{fmt(row.receita,0)}%</span>}</td>
                    <td className="px-2 py-2">{isEditing ? <input type="number" value={row.quantidade} onChange={(e) => updateEditing(idx,"quantidade",parseFloat(e.target.value)||0)} className="w-24 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} /> : <span className="text-xs px-2 text-right block" style={{ color: "#e8eaf0" }}>{fmt(row.quantidade,4)}</span>}</td>
                    <td className="px-2 py-2">{isEditing ? <input type="number" value={row.custo_unitario} onChange={(e) => updateEditing(idx,"custo_unitario",parseFloat(e.target.value)||0)} className="w-28 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#e8eaf0" }} /> : <span className="text-xs px-2 text-right block" style={{ color: "#e8eaf0" }}>{fmt(row.custo_unitario)}</span>}</td>
                    <td className="px-2 py-2">{isEditing ? <input type="number" value={row.custo_frete} onChange={(e) => updateEditing(idx,"custo_frete",parseFloat(e.target.value)||0)} className="w-28 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg text-right focus:bg-white/5" style={{ color: "#0ea5e9" }} /> : <span className="text-xs px-2 text-right block" style={{ color: "#0ea5e9" }}>{fmt(row.custo_frete)}</span>}</td>
                    <td className="px-3 py-2 text-right"><span className="text-xs font-semibold" style={{ color: "#22c55e" }}>{fmt(custoMP)}</span></td>
                    <td className="px-2 py-2">{isEditing ? <input value={row.referencia} onChange={(e) => updateEditing(idx,"referencia",e.target.value)} className="w-44 bg-transparent outline-none text-xs px-2 py-1.5 rounded-lg focus:bg-white/5" style={{ color: "#f59e0b" }} placeholder="Referência" /> : <span className="text-xs px-2" style={{ color: "#f59e0b" }}>{row.referencia || "—"}</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><span className="text-xs" style={{ color: "#5a607a" }}>R$</span><span className="text-xs ml-1 font-medium" style={{ color: "#e8eaf0" }}>{totalR > 0 ? fmt(totalR) : "—"}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap"><span className="text-xs" style={{ color: "#5a607a" }}>$</span><span className="text-xs ml-1 font-medium" style={{ color: "#e8eaf0" }}>{totalU > 0 ? fmt(totalU) : "—"}</span></td>
                    <td className="px-2 py-2">
                      {isEditing ? (
                        <button onClick={() => removeEditRow(idx)} className="w-6 h-6 rounded flex items-center justify-center transition-all hover:bg-red-500/20" style={{ color: "#5a607a" }}><Trash2 size={12} /></button>
                      ) : (
                        <button onClick={() => openDeleteModal(row)}
                          className="w-6 h-6 rounded flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 hover:bg-red-500/20"
                          style={{ color: "#ef4444" }}
                          title="Excluir linha">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {displayRows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                  <td colSpan={8} className="px-3 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                  <td className="px-3 py-3 text-right whitespace-nowrap"><span className="text-xs font-semibold" style={{ color: "#5a607a" }}>R$</span><span className="text-sm font-bold ml-1" style={{ color: "#e8eaf0" }}>{fmt(isEditing ? editBRL : totalBRL)}</span></td>
                  <td className="px-3 py-3 text-right whitespace-nowrap"><span className="text-xs font-semibold" style={{ color: "#5a607a" }}>$</span><span className="text-sm font-bold ml-1" style={{ color: "#e8eaf0" }}>{fmt(isEditing ? editUSD : totalUSD)}</span></td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Histórico */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
        <button onClick={() => setShowHistorico((v) => !v)} className="w-full flex items-center justify-between px-5 py-4 transition-colors hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center gap-2">
            <History size={15} style={{ color: "#5560f8" }} />
            <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Edições</span>
            {historico.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{historico.length}</span>}
          </div>
          {showHistorico ? <ChevronUp size={15} style={{ color: "#5a607a" }} /> : <ChevronDown size={15} style={{ color: "#5a607a" }} />}
        </button>
        {showHistorico && (
          <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
            {historico.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8" style={{ color: "#5a607a" }}><History size={16} /><span className="text-sm">Nenhuma alteração registrada ainda.</span></div>
            ) : (
              <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Data/Hora","Item","Campo","Valor Anterior","Valor Novo","Alterado por","Observação"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.descricao_item || "—"}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-md text-xs" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>{h.campo}</span></td>
                      <td className="px-4 py-2.5 line-through" style={{ color: "#ef4444", opacity: 0.8 }}>{h.valor_anterior || "—"}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#22c55e" }}>{h.valor_novo || "—"}</td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.alterado_por}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate" style={{ color: "#8890a8" }}>{h.observacao || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Delete Modal ── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={(e) => e.target === e.currentTarget && setDeleteTarget(null)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <Trash2 size={15} style={{ color: "#ef4444" }} />
                </div>
                <div>
                  <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Excluir linha</h3>
                  <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>Esta ação será registrada no histórico</p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", color: "#fca5a5" }}>
                Excluindo: <strong>{deleteTarget.descricao || deleteTarget.codigo}</strong>
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label>
                <input className="input-field" placeholder="Seu nome" value={deleteWho} onChange={(e) => setDeleteWho(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Motivo / Observação</label>
                <textarea className="input-field resize-none" rows={2} placeholder="Por que está excluindo esta linha?" value={deleteObs} onChange={(e) => setDeleteObs(e.target.value)} />
              </div>
              {deleteError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}><AlertCircle size={13} />{deleteError}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmDelete} disabled={deleting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white" }}>
                  {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Confirmar exclusão
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Save Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Confirmar alterações</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>Registre quem está salvando e o motivo</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label>
                <input className="input-field" placeholder="Seu nome" value={modalData.alterado_por} onChange={(e) => setModalData((d) => ({ ...d, alterado_por: e.target.value }))} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label>
                <textarea className="input-field resize-none" rows={3} placeholder="Motivo da alteração, referência, etc." value={modalData.observacao} onChange={(e) => setModalData((d) => ({ ...d, observacao: e.target.value }))} />
              </div>
              {modalError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)", border: "1px solid rgba(255,107,107,0.2)" }}><AlertCircle size={13} />{modalError}</div>}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmSave} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  <Save size={14} />Confirmar e salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
