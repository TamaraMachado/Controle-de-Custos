"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users, Factory, Check, Plus, X, Loader2, AlertCircle,
  Save, History, ChevronDown, ChevronUp, Pencil, Trash2, Sparkles,
  TrendingUp, TrendingDown, Minus, FileSpreadsheet
} from "lucide-react";

interface Escala { id: string; nome: string; }
interface Planta { id: string; nome: string; }
interface Funcao { id: string; nome: string; custo_unitario: number; }
interface TemplateRow { id?: string; funcao_id?: string; nome: string; quantidade: number; custo: number; isNova?: boolean; }
interface Plano { id: string; escala_id: string; planta_id: string; salvo_por: string; observacao: string; updated_at: string; }
interface PlanoHistorico {
  id: string; escala_anterior: string; planta_anterior: string;
  escala_nova: string; planta_nova: string;
  custo_anterior: number; custo_novo: number;
  pessoas_anterior: number; pessoas_novas: number;
  alterado_por: string; observacao: string; alterado_em: string;
}
interface RealizadoRow { id: string; mes: string; funcao: string; quantidade: number; custo_total: number; horas_extras: number; }
interface Props { projetoId: string; }

type Estado = "carregando" | "vazio" | "selecionando" | "salvo" | "editando";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMes = (iso: string) => { const [y,m]=iso.split("-"); const meses=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${meses[parseInt(m)-1]}/${y}`; };

export default function Pessoas({ projetoId }: Props) {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [estado, setEstado] = useState<Estado>("carregando");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [planoRows, setPlanoRows] = useState<TemplateRow[]>([]);
  const [planoHistorico, setPlanoHistorico] = useState<PlanoHistorico[]>([]);

  // Seleção
  const [escalaId, setEscalaId] = useState("");
  const [plantaId, setPlantaId] = useState("");
  const [templateRows, setTemplateRows] = useState<TemplateRow[]>([]); // editável

  // Novos
  const [showNovaEscala, setShowNovaEscala] = useState(false);
  const [showNovaPlanta, setShowNovaPlanta] = useState(false);
  const [novaEscala, setNovaEscala] = useState("");
  const [novaPlanta, setNovaPlanta] = useState("");

  // Modal salvar
  const [showSalvarModal, setShowSalvarModal] = useState(false);
  const [salvoPor, setSalvoPor] = useState("");
  const [salvarObs, setSalvarObs] = useState("");
  const [salvarError, setSalvarError] = useState("");
  const [saving, setSaving] = useState(false);

  // UI
  const [showDetalhe, setShowDetalhe] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showRealizado, setShowRealizado] = useState(true);
  const [realizado, setRealizado] = useState<RealizadoRow[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [{ data: e }, { data: p }, { data: f }] = await Promise.all([
      supabase.from("pessoas_escalas").select("*").order("nome"),
      supabase.from("pessoas_plantas").select("*").order("nome"),
      supabase.from("pessoas_funcoes").select("*").order("nome"),
    ]);
    setEscalas(e ?? []);
    setPlantas(p ?? []);
    setFuncoes(f ?? []);
  }, []);

  const loadPlano = useCallback(async () => {
    const { data } = await supabase.from("projeto_pessoas_plano").select("*").eq("projeto_id", projetoId).single();
    if (data) {
      setPlano(data);
      setEstado("salvo");
      const { data: rows } = await supabase.from("pessoas_template")
        .select("id, quantidade, ordem, pessoas_funcoes(id, nome, custo_unitario)")
        .eq("escala_id", data.escala_id).eq("planta_id", data.planta_id).order("ordem");
      if (rows) {
        setPlanoRows(rows.map((r: any) => ({
          id: r.id, funcao_id: r.pessoas_funcoes.id,
          nome: r.pessoas_funcoes.nome, quantidade: r.quantidade,
          custo: r.pessoas_funcoes.custo_unitario,
        })));
      }
      const { data: hist } = await supabase.from("projeto_pessoas_plano_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false });
      setPlanoHistorico(hist ?? []);
    } else {
      setEstado("vazio");
    }
  }, [projetoId]);

  const loadRealizado = useCallback(async () => {
    const { data } = await supabase.from("pessoas_realizado").select("*").eq("projeto_id", projetoId).order("mes", { ascending: false });
    setRealizado(data ?? []);
  }, [projetoId]);

  useEffect(() => { loadMeta(); loadPlano(); loadRealizado(); }, [loadMeta, loadPlano, loadRealizado]);

  // ── Carregar template ao mudar escala/planta ──────────────────────────────
  const loadTemplate = useCallback(async (eid: string, pid: string) => {
    if (!eid || !pid) { setTemplateRows([]); return; }
    const { data } = await supabase.from("pessoas_template")
      .select("id, quantidade, ordem, pessoas_funcoes(id, nome, custo_unitario)")
      .eq("escala_id", eid).eq("planta_id", pid).order("ordem");
    if (data && data.length > 0) {
      setTemplateRows(data.map((r: any) => ({
        id: r.id, funcao_id: r.pessoas_funcoes.id,
        nome: r.pessoas_funcoes.nome, quantidade: r.quantidade,
        custo: r.pessoas_funcoes.custo_unitario,
      })));
    } else {
      // Sem template ainda — começar vazio para preencher
      setTemplateRows([]);
    }
  }, []);

  useEffect(() => {
    if ((estado === "selecionando" || estado === "editando") && escalaId && plantaId) {
      loadTemplate(escalaId, plantaId);
    }
  }, [escalaId, plantaId, estado, loadTemplate]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const escalaNome = (id: string) => escalas.find(e => e.id === id)?.nome ?? "—";
  const plantaNome = (id: string) => plantas.find(p => p.id === id)?.nome ?? "—";
  const totalPlano = planoRows.reduce((s, r) => s + r.quantidade * r.custo, 0);
  const totalPessoas = planoRows.reduce((s, r) => s + r.quantidade, 0);
  const totalTemplate = templateRows.reduce((s, r) => s + r.quantidade * r.custo, 0);
  const totalTemplatePessoas = templateRows.reduce((s, r) => s + r.quantidade, 0);

  // ── Criar escala/planta ───────────────────────────────────────────────────
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

  // ── Editar template rows ──────────────────────────────────────────────────
  const updateTemplateRow = (idx: number, field: keyof TemplateRow, value: string | number) =>
    setTemplateRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));

  const addTemplateRow = () =>
    setTemplateRows(prev => [...prev, { nome: "", quantidade: 1, custo: 0, isNova: true }]);

  const removeTemplateRow = (idx: number) =>
    setTemplateRows(prev => prev.filter((_, i) => i !== idx));

  // ── Iniciar novo/editar ───────────────────────────────────────────────────
  const iniciarNovo = () => {
    setEscalaId(""); setPlantaId(""); setTemplateRows([]);
    setEstado("selecionando");
  };
  const iniciarEditar = () => {
    setEscalaId(plano?.escala_id ?? "");
    setPlantaId(plano?.planta_id ?? "");
    setTemplateRows(planoRows.map(r => ({ ...r })));
    setEstado("editando");
  };
  const cancelar = () => {
    setEstado(plano ? "salvo" : "vazio");
    setEscalaId(""); setPlantaId(""); setTemplateRows([]);
  };

  // ── Salvar ────────────────────────────────────────────────────────────────
  const requestSalvar = () => {
    if (!escalaId || !plantaId) return;
    setSalvoPor(""); setSalvarObs(""); setSalvarError("");
    setShowSalvarModal(true);
  };

  const confirmarSalvar = async () => {
    if (!salvoPor.trim()) { setSalvarError("Informe quem está salvando."); return; }
    if (templateRows.length === 0) { setSalvarError("Adicione pelo menos uma função."); return; }
    setSaving(true); setSalvarError("");
    const isEdit = estado === "editando" && plano;

    // 1. Salvar/atualizar funções e template
    for (let i = 0; i < templateRows.length; i++) {
      const row = templateRows[i];
      if (!row.nome.trim()) continue;

      let funcaoId = row.funcao_id;

      if (funcaoId) {
        // Atualiza função existente
        await supabase.from("pessoas_funcoes").update({ nome: row.nome, custo_unitario: row.custo }).eq("id", funcaoId);
        // Atualiza template
        if (row.id) {
          await supabase.from("pessoas_template").update({ quantidade: row.quantidade, ordem: i }).eq("id", row.id);
        } else {
          await supabase.from("pessoas_template").insert([{ escala_id: escalaId, planta_id: plantaId, funcao_id: funcaoId, quantidade: row.quantidade, ordem: i }]);
        }
      } else {
        // Nova função
        const { data: newFuncao } = await supabase.from("pessoas_funcoes").insert([{ nome: row.nome, custo_unitario: row.custo }]).select().single();
        if (newFuncao) {
          await supabase.from("pessoas_template").insert([{ escala_id: escalaId, planta_id: plantaId, funcao_id: newFuncao.id, quantidade: row.quantidade, ordem: i }]);
        }
      }
    }

    // 2. Histórico se for edição
    if (isEdit) {
      await supabase.from("projeto_pessoas_plano_historico").insert([{
        projeto_id: projetoId,
        escala_anterior: escalaNome(plano.escala_id), planta_anterior: plantaNome(plano.planta_id),
        escala_nova: escalaNome(escalaId), planta_nova: plantaNome(plantaId),
        custo_anterior: totalPlano, custo_novo: totalTemplate,
        pessoas_anterior: totalPessoas, pessoas_novas: totalTemplatePessoas,
        alterado_por: salvoPor, observacao: salvarObs,
      }]);
      await supabase.from("projeto_pessoas_plano").update({ escala_id: escalaId, planta_id: plantaId, salvo_por: salvoPor, observacao: salvarObs, updated_at: new Date().toISOString() }).eq("projeto_id", projetoId);
    } else {
      await supabase.from("projeto_pessoas_plano").insert([{ projeto_id: projetoId, escala_id: escalaId, planta_id: plantaId, salvo_por: salvoPor, observacao: salvarObs }]);
    }

    setShowSalvarModal(false); setSaving(false);
    setEscalaId(""); setPlantaId(""); setTemplateRows([]);
    await loadMeta();
    await loadPlano();
  };

  // ── Realizado ─────────────────────────────────────────────────────────────
  const mesList = Array.from(new Set(realizado.map(r => r.mes))).sort((a, b) => b.localeCompare(a));
  const realizadoPorMes = (mes: string) => {
    const rows = realizado.filter(r => r.mes === mes);
    return { total: rows.reduce((s, r) => s + r.custo_total, 0), horas_extras: rows.reduce((s, r) => s + r.horas_extras, 0) };
  };
  const deletarMes = async (mes: string) => {
    await supabase.from("pessoas_realizado").delete().eq("projeto_id", projetoId).eq("mes", mes);
    setDeleteConfirm(null); await loadRealizado();
  };

  // ── Render seletor de escala/planta + tabela editável ─────────────────────
  const renderSeletor = () => (
    <div className="space-y-5">
      {/* Escala + Planta */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={13} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>ESCALA DE TRABALHO</span>
            </div>
            <button onClick={() => setShowNovaEscala(v => !v)} className="text-xs px-2 py-1 rounded-lg hover:bg-white/10" style={{ color: "#5560f8" }}>
              <Plus size={11} className="inline mr-1" />Nova
            </button>
          </div>
          {showNovaEscala && (
            <div className="flex gap-2 mb-3">
              <input value={novaEscala} onChange={e => setNovaEscala(e.target.value)} onKeyDown={e => e.key === "Enter" && criarEscala()} className="input-field text-xs py-1.5 flex-1" placeholder="Ex: 4x2" autoFocus />
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

        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Factory size={13} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>PLANTA PRODUTIVA</span>
            </div>
            <button onClick={() => setShowNovaPlanta(v => !v)} className="text-xs px-2 py-1 rounded-lg hover:bg-white/10" style={{ color: "#5560f8" }}>
              <Plus size={11} className="inline mr-1" />Nova
            </button>
          </div>
          {showNovaPlanta && (
            <div className="flex gap-2 mb-3">
              <input value={novaPlanta} onChange={e => setNovaPlanta(e.target.value)} onKeyDown={e => e.key === "Enter" && criarPlanta()} className="input-field text-xs py-1.5 flex-1" placeholder="Ex: Extrusora" autoFocus />
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

      {/* Tabela editável de pessoas */}
      {escalaId && plantaId && (
        <div className="glass rounded-2xl overflow-hidden animate-fadeIn">
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <p className="text-xs font-semibold" style={{ color: "#e8eaf0" }}>Pessoas · {escalaNome(escalaId)} · {plantaNome(plantaId)}</p>
              <p className="text-xs mt-0.5" style={{ color: "#5a607a" }}>
                {templateRows.length === 0 ? "Nenhuma função cadastrada para esta combinação — adicione abaixo." : `${totalTemplatePessoas} pessoas · R$ ${fmt(totalTemplate)}/mês`}
              </p>
            </div>
            <button onClick={addTemplateRow} className="btn-primary py-1.5 px-3 text-xs">
              <Plus size={12} />Função
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Cargo / Função","Quantidade","Custo/mês (R$)","Total R$/mês",""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {templateRows.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6" style={{ color: "#5a607a" }}>
                    Clique em "+ Função" para adicionar cargos.
                  </td></tr>
                ) : templateRows.map((row, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-3 py-2 min-w-56">
                      {/* Select de função com opção nova */}
                      <select
                        value={row.isNova ? "__nova__" : (row.funcao_id ?? "__nova__")}
                        onChange={e => {
                          if (e.target.value === "__nova__") {
                            updateTemplateRow(idx, "funcao_id", undefined as any);
                            updateTemplateRow(idx, "nome", "");
                            updateTemplateRow(idx, "isNova", true as any);
                          } else {
                            const f = funcoes.find(f => f.id === e.target.value);
                            if (f) {
                              setTemplateRows(prev => prev.map((r, i) => i === idx
                                ? { ...r, funcao_id: f.id, nome: f.nome, custo: f.custo_unitario, isNova: false }
                                : r));
                            }
                          }
                        }}
                        className="w-full bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 text-xs"
                        style={{ color: "#e8eaf0" }}>
                        <option value="">Selecione uma função...</option>
                        {funcoes.map(f => (
                          <option key={f.id} value={f.id}>{f.nome}</option>
                        ))}
                        <option value="__nova__">+ Nova função</option>
                      </select>
                      {/* Campo de texto se for nova função */}
                      {row.isNova && (
                        <input value={row.nome} onChange={e => updateTemplateRow(idx, "nome", e.target.value)}
                          className="w-full bg-white/5 outline-none px-2 py-1 rounded mt-1 text-xs border"
                          style={{ color: "#e8eaf0", borderColor: "rgba(85,96,248,0.4)" }}
                          placeholder="Nome da nova função" autoFocus />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" value={row.quantidade} onChange={e => updateTemplateRow(idx, "quantidade", parseInt(e.target.value)||0)}
                        className="w-16 bg-transparent outline-none px-2 py-1 rounded text-center focus:bg-white/5"
                        style={{ color: "#7585fd" }} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" step="0.01" value={row.custo} onChange={e => updateTemplateRow(idx, "custo", parseFloat(e.target.value)||0)}
                        className="w-28 bg-transparent outline-none px-2 py-1 rounded text-right focus:bg-white/5"
                        style={{ color: "#e8eaf0" }} placeholder="0,00" />
                    </td>
                    <td className="px-3 py-2 font-semibold" style={{ color: "#22c55e" }}>
                      R$ {fmt(row.quantidade * row.custo)}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeTemplateRow(idx)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}>
                        <Trash2 size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {templateRows.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(34,197,94,0.06)" }}>
                    <td className="px-4 py-3 font-bold text-xs tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3 font-bold text-center" style={{ color: "#7585fd" }}>{totalTemplatePessoas}</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 font-bold text-base" style={{ color: "#22c55e" }}>R$ {fmt(totalTemplate)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Botões de ação */}
      <div className="flex gap-3 justify-end">
        <button onClick={cancelar} className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
          <X size={13} className="inline mr-1.5" />Cancelar
        </button>
        <button onClick={requestSalvar} disabled={!escalaId || !plantaId}
          className="btn-primary px-6 py-2.5"
          style={(!escalaId || !plantaId) ? { opacity: 0.4, cursor: "not-allowed" } : { background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
          <Save size={14} />
          {estado === "editando" ? "Salvar alteração" : "Salvar planejamento"}
        </button>
      </div>
    </div>
  );

  if (estado === "carregando") return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  return (
    <div className="space-y-5">

      {/* VAZIO */}
      {estado === "vazio" && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}>
            <Users size={28} style={{ color: "#5560f8", opacity: 0.8 }} />
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Nenhum planejamento de pessoal definido</h3>
          <p className="text-sm mb-6 max-w-sm" style={{ color: "#5a607a" }}>Defina a escala, a planta e os cargos para calcular o custo planejado de mão de obra.</p>
          <button onClick={iniciarNovo} className="btn-primary px-6 py-2.5"><Sparkles size={14} />Definir planejamento</button>
        </div>
      )}

      {/* SELECIONANDO */}
      {estado === "selecionando" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-5 rounded-full" style={{ background: "#5560f8" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Novo planejamento de pessoal</h3>
          </div>
          {renderSeletor()}
        </div>
      )}

      {/* SALVO */}
      {estado === "salvo" && plano && (
        <>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between flex-wrap gap-4"
              style={{ borderBottom: showDetalhe ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.25)" }}>
                  <TrendingUp size={18} style={{ color: "#7585fd" }} />
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo Planejado de MO</p>
                  <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>R$ {fmt(totalPlano)}</p>
                </div>
              </div>
              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-xs mb-0.5" style={{ color: "#5a607a" }}>Escala</p>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>{escalaNome(plano.escala_id)}</span>
                </div>
                <div className="text-center">
                  <p className="text-xs mb-0.5" style={{ color: "#5a607a" }}>Planta</p>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>{plantaNome(plano.planta_id)}</span>
                </div>
                <div className="text-center">
                  <p className="text-xs mb-0.5" style={{ color: "#5a607a" }}>Pessoas</p>
                  <p className="text-sm font-bold" style={{ color: "#e8eaf0" }}>{totalPessoas}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowDetalhe(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all hover:bg-white/5"
                  style={{ color: "#5a607a", border: "1px solid rgba(255,255,255,0.07)" }}>
                  {showDetalhe ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showDetalhe ? "Ocultar" : "Ver detalhes"}
                </button>
                <button onClick={iniciarEditar} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} />Editar</button>
              </div>
            </div>

            {showDetalhe && planoRows.length > 0 && (
              <div className="overflow-x-auto animate-fadeIn">
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-5 py-3 text-left font-semibold" style={{ color: "#8890a8" }}>Função</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#8890a8" }}>Quantidade</th>
                      <th className="px-5 py-3 text-right font-semibold" style={{ color: "#8890a8" }}>Custo/mês</th>
                      <th className="px-5 py-3 text-right font-semibold" style={{ color: "#8890a8" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planoRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-5 py-2.5 font-medium" style={{ color: r.quantidade === 0 ? "#3d425a" : "#e8eaf0" }}>{r.nome}</td>
                        <td className="px-5 py-2.5 text-center font-bold" style={{ color: r.quantidade === 0 ? "#3d425a" : "#7585fd" }}>{r.quantidade}</td>
                        <td className="px-5 py-2.5 text-right" style={{ color: "#8890a8" }}>R$ {fmt(r.custo)}</td>
                        <td className="px-5 py-2.5 text-right font-semibold" style={{ color: r.quantidade * r.custo === 0 ? "#3d425a" : "#22c55e" }}>
                          {r.quantidade * r.custo > 0 ? `R$ ${fmt(r.quantidade * r.custo)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                      <td className="px-5 py-3 font-bold text-xs tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                      <td className="px-5 py-3 text-center font-bold" style={{ color: "#7585fd" }}>{totalPessoas}</td>
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3 text-right font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlano)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <span className="text-xs" style={{ color: "#5a607a" }}>
                    Salvo por <strong style={{ color: "#8890a8" }}>{plano.salvo_por}</strong>
                    {plano.observacao && <> · {plano.observacao}</>}
                    {" "}· {new Date(plano.updated_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Histórico de alterações */}
          {planoHistorico.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
              <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center gap-2">
                  <History size={14} style={{ color: "#5560f8" }} />
                  <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Histórico de Alterações</span>
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>{planoHistorico.length}</span>
                </div>
                {showHistorico ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
              </button>
              {showHistorico && (
                <div className="overflow-x-auto" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                    <thead><tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {["Data","De","Para","Custo Anterior","Custo Novo","Alterado por","Obs."].map(h => (
                        <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {planoHistorico.map(h => (
                        <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-2.5" style={{ color: "#ef4444" }}>{h.escala_anterior} · {h.planta_anterior}</td>
                          <td className="px-4 py-2.5" style={{ color: "#22c55e" }}>{h.escala_nova} · {h.planta_nova}</td>
                          <td className="px-4 py-2.5 line-through" style={{ color: "#5a607a" }}>R$ {fmt(h.custo_anterior)}</td>
                          <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>R$ {fmt(h.custo_novo)}</td>
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
        </>
      )}

      {/* EDITANDO */}
      {estado === "editando" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-5 rounded-full" style={{ background: "#f59e0b" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Editar planejamento de pessoal</h3>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>
              Atual: {plano ? `${escalaNome(plano.escala_id)} · ${plantaNome(plano.planta_id)}` : ""}
            </span>
          </div>
          {renderSeletor()}
        </div>
      )}

      {/* CUSTO EXECUTADO */}
      {estado === "salvo" && (
        <div className="glass rounded-2xl overflow-hidden">
          <button onClick={() => setShowRealizado(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5"
            style={{ borderBottom: showRealizado ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.25)" }}>
                <FileSpreadsheet size={15} style={{ color: "#22c55e" }} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Custo Executado de MO</h3>
                <p className="text-xs" style={{ color: "#5a607a" }}>Dados reais por mês · aguardando relatório do RH</p>
              </div>
            </div>
            {showRealizado ? <ChevronUp size={15} style={{ color: "#5a607a" }} /> : <ChevronDown size={15} style={{ color: "#5a607a" }} />}
          </button>
          {showRealizado && (
            <div className="p-5">
              {mesList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3" style={{ color: "#5a607a" }}>
                  <FileSpreadsheet size={28} style={{ opacity: 0.3 }} />
                  <p className="text-sm">Aguardando relatório do RH.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mesList.map(mes => {
                    const real = realizadoPorMes(mes);
                    const diff = real.total - totalPlano;
                    return (
                      <div key={mes} className="rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>{fmtMes(mes)}</span>
                        <div className="flex items-center gap-5">
                          <div className="text-right">
                            <p className="text-xs" style={{ color: "#5a607a" }}>Executado</p>
                            <p className="text-sm font-bold" style={{ color: "#22c55e" }}>R$ {fmt(real.total)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs" style={{ color: "#5a607a" }}>vs Planejado</p>
                            <p className="text-sm font-bold flex items-center gap-1"
                              style={{ color: diff > 0 ? "#ef4444" : diff < 0 ? "#22c55e" : "#5a607a" }}>
                              {diff > 0 ? <TrendingUp size={12} /> : diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                              {diff > 0 ? "+" : ""}{fmt(diff)}
                            </p>
                          </div>
                          {deleteConfirm === mes ? (
                            <div className="flex gap-1">
                              <button onClick={() => deletarMes(mes)} className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Confirmar</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "#5a607a" }}>Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(mes)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20" style={{ color: "#5a607a" }}>
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL SALVAR */}
      {showSalvarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={e => e.target === e.currentTarget && setShowSalvarModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
                {estado === "editando" ? "Confirmar alteração" : "Salvar planejamento"}
              </h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                {escalaNome(escalaId)} · {plantaNome(plantaId)} · {totalTemplatePessoas} pessoas · R$ {fmt(totalTemplate)}/mês
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>{estado === "editando" ? "Alterado por *" : "Salvo por *"}</label>
                <input className="input-field" placeholder="Seu nome" value={salvoPor} onChange={e => setSalvoPor(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label>
                <textarea className="input-field resize-none" rows={3}
                  placeholder={estado === "editando" ? "Motivo da alteração..." : "Referência, versão..."}
                  value={salvarObs} onChange={e => setSalvarObs(e.target.value)} />
              </div>
              {salvarError && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}>
                  <AlertCircle size={12} />{salvarError}
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowSalvarModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                  Cancelar
                </button>
                <button onClick={confirmarSalvar} disabled={saving} className="flex-1 btn-primary justify-center py-2.5"
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {estado === "editando" ? "Confirmar" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
