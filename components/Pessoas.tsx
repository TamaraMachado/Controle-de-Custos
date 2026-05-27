"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users, Factory, Check, Plus, X, Upload,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Minus, Loader2, AlertCircle, FileSpreadsheet, Trash2,
  Pencil, Save, History, Sparkles
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Escala { id: string; nome: string; }
interface Planta { id: string; nome: string; }
interface PlanoRow { funcao: string; quantidade: number; total: number; }
interface Plano {
  id: string; escala_id: string; planta_id: string;
  salvo_por: string; observacao: string; updated_at: string;
}
interface PlanoHistorico {
  id: string; escala_anterior: string; planta_anterior: string;
  escala_nova: string; planta_nova: string;
  custo_anterior: number; custo_novo: number;
  pessoas_anterior: number; pessoas_novas: number;
  alterado_por: string; observacao: string; alterado_em: string;
}
interface RealizadoRow {
  id: string; mes: string; funcao: string;
  quantidade: number; custo_total: number; horas_extras: number;
}
interface Props { projetoId: string; }

type Estado = "carregando" | "vazio" | "selecionando" | "salvo" | "editando";

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMes = (iso: string) => {
  const [y, m] = iso.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m)-1]}/${y}`;
};

export default function Pessoas({ projetoId }: Props) {
  // Meta
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  // Estado principal
  const [estado, setEstado] = useState<Estado>("carregando");
  const [plano, setPlano] = useState<Plano | null>(null);
  const [planoRows, setPlanoRows] = useState<PlanoRow[]>([]);
  const [planoHistorico, setPlanoHistorico] = useState<PlanoHistorico[]>([]);
  // Seleção em edição
  const [escalaId, setEscalaId] = useState("");
  const [plantaId, setPlantaId] = useState("");
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
  const [showNovaEscala, setShowNovaEscala] = useState(false);
  const [showNovaPlanta, setShowNovaPlanta] = useState(false);
  const [novaEscala, setNovaEscala] = useState("");
  const [novaPlanta, setNovaPlanta] = useState("");
  // Realizado
  const [realizado, setRealizado] = useState<RealizadoRow[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ── Load meta ─────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("pessoas_escalas").select("*").order("nome"),
      supabase.from("pessoas_plantas").select("*").order("nome"),
    ]);
    setEscalas(e ?? []);
    setPlantas(p ?? []);
  }, []);

  // ── Load plano do projeto ─────────────────────────────────────────────────
  const loadPlano = useCallback(async () => {
    const { data } = await supabase
      .from("projeto_pessoas_plano")
      .select("*")
      .eq("projeto_id", projetoId)
      .single();

    if (data) {
      setPlano(data);
      setEstado("salvo");
      // Carregar template
      const { data: rows } = await supabase
        .from("pessoas_template")
        .select("quantidade, ordem, pessoas_funcoes(nome, custo_unitario)")
        .eq("escala_id", data.escala_id)
        .eq("planta_id", data.planta_id)
        .order("ordem");
      if (rows) {
        setPlanoRows(rows.map((r: any) => ({
          funcao: r.pessoas_funcoes.nome,
          quantidade: r.quantidade,
          total: r.quantidade * r.pessoas_funcoes.custo_unitario,
        })));
      }
      // Carregar histórico
      const { data: hist } = await supabase
        .from("projeto_pessoas_plano_historico")
        .select("*")
        .eq("projeto_id", projetoId)
        .order("alterado_em", { ascending: false });
      setPlanoHistorico(hist ?? []);
    } else {
      setEstado("vazio");
    }
  }, [projetoId]);

  // ── Load realizado ────────────────────────────────────────────────────────
  const loadRealizado = useCallback(async () => {
    const { data } = await supabase
      .from("pessoas_realizado")
      .select("*")
      .eq("projeto_id", projetoId)
      .order("mes", { ascending: false });
    setRealizado(data ?? []);
  }, [projetoId]);

  // ── Load template preview (seleção em andamento) ──────────────────────────
  const [previewRows, setPreviewRows] = useState<PlanoRow[]>([]);
  const loadPreview = useCallback(async (eid: string, pid: string) => {
    if (!eid || !pid) { setPreviewRows([]); return; }
    const { data } = await supabase
      .from("pessoas_template")
      .select("quantidade, ordem, pessoas_funcoes(nome, custo_unitario)")
      .eq("escala_id", eid)
      .eq("planta_id", pid)
      .order("ordem");
    if (data) {
      setPreviewRows(data.map((r: any) => ({
        funcao: r.pessoas_funcoes.nome,
        quantidade: r.quantidade,
        total: r.quantidade * r.pessoas_funcoes.custo_unitario,
      })));
    } else {
      setPreviewRows([]);
    }
  }, []);

  useEffect(() => {
    loadMeta();
    loadPlano();
    loadRealizado();
  }, [loadMeta, loadPlano, loadRealizado]);

  useEffect(() => {
    if (estado === "selecionando" || estado === "editando") {
      loadPreview(escalaId, plantaId);
    }
  }, [escalaId, plantaId, estado, loadPreview]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const escalaNome = (id: string) => escalas.find(e => e.id === id)?.nome ?? "—";
  const plantaNome = (id: string) => plantas.find(p => p.id === id)?.nome ?? "—";
  const totalPlanejado = planoRows.reduce((s, r) => s + r.total, 0);
  const totalPessoas = planoRows.reduce((s, r) => s + r.quantidade, 0);
  const previewTotal = previewRows.reduce((s, r) => s + r.total, 0);
  const previewPessoas = previewRows.reduce((s, r) => s + r.quantidade, 0);

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

  // ── Iniciar novo/editar ───────────────────────────────────────────────────
  const iniciarNovo = () => {
    setEscalaId(""); setPlantaId("");
    setEstado("selecionando");
  };
  const iniciarEditar = () => {
    setEscalaId(plano?.escala_id ?? "");
    setPlantaId(plano?.planta_id ?? "");
    setEstado("editando");
  };
  const cancelar = () => {
    setEstado(plano ? "salvo" : "vazio");
    setEscalaId(""); setPlantaId("");
    setPreviewRows([]);
  };

  // ── Salvar ────────────────────────────────────────────────────────────────
  const requestSalvar = () => {
    if (!escalaId || !plantaId) { return; }
    setSalvoPor(""); setSalvarObs(""); setSalvarError("");
    setShowSalvarModal(true);
  };

  const confirmarSalvar = async () => {
    if (!salvoPor.trim()) { setSalvarError("Informe quem está salvando."); return; }
    setSaving(true); setSalvarError("");

    const isEdit = estado === "editando" && plano;

    if (isEdit) {
      // Registrar histórico antes de salvar
      await supabase.from("projeto_pessoas_plano_historico").insert([{
        projeto_id: projetoId,
        escala_anterior: escalaNome(plano.escala_id),
        planta_anterior: plantaNome(plano.planta_id),
        escala_nova: escalaNome(escalaId),
        planta_nova: plantaNome(plantaId),
        custo_anterior: totalPlanejado,
        custo_novo: previewTotal,
        pessoas_anterior: totalPessoas,
        pessoas_novas: previewPessoas,
        alterado_por: salvoPor,
        observacao: salvarObs,
      }]);
      await supabase.from("projeto_pessoas_plano")
        .update({ escala_id: escalaId, planta_id: plantaId, salvo_por: salvoPor, observacao: salvarObs, updated_at: new Date().toISOString() })
        .eq("projeto_id", projetoId);
    } else {
      await supabase.from("projeto_pessoas_plano").insert([{
        projeto_id: projetoId,
        escala_id: escalaId,
        planta_id: plantaId,
        salvo_por: salvoPor,
        observacao: salvarObs,
      }]);
    }

    setShowSalvarModal(false);
    setSaving(false);
    setEscalaId(""); setPlantaId(""); setPreviewRows([]);
    await loadPlano();
  };

  // ── Realizado ─────────────────────────────────────────────────────────────
  const mesList = Array.from(new Set(realizado.map(r => r.mes))).sort((a, b) => b.localeCompare(a));
  const realizadoPorMes = (mes: string) => {
    const rows = realizado.filter(r => r.mes === mes);
    return {
      total: rows.reduce((s, r) => s + r.custo_total, 0),
      horas_extras: rows.reduce((s, r) => s + r.horas_extras, 0),
    };
  };

  const deletarMes = async (mes: string) => {
    await supabase.from("pessoas_realizado").delete().eq("projeto_id", projetoId).eq("mes", mes);
    setDeleteConfirm(null);
    await loadRealizado();
  };

  // ─── Render Seletor (usado em selecionando e editando) ────────────────────
  const renderSeletor = () => (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Escala */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={13} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>ESCALA DE TRABALHO</span>
            </div>
            <button onClick={() => setShowNovaEscala(v => !v)} className="text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-all" style={{ color: "#5560f8" }}>
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
              <Factory size={13} style={{ color: "#7585fd" }} />
              <span className="text-xs font-semibold" style={{ color: "#8890a8" }}>PLANTA PRODUTIVA</span>
            </div>
            <button onClick={() => setShowNovaPlanta(v => !v)} className="text-xs px-2 py-1 rounded-lg hover:bg-white/10 transition-all" style={{ color: "#5560f8" }}>
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

      {/* Preview do custo */}
      {escalaId && plantaId && (
        <div className="glass rounded-2xl p-4 animate-fadeIn">
          {previewRows.length === 0 ? (
            <p className="text-xs text-center py-2" style={{ color: "#5a607a" }}>Sem template para esta combinação.</p>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Prévia do custo planejado</p>
                <p className="text-xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(previewTotal)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs" style={{ color: "#5a607a" }}>{escalaNome(escalaId)} · {plantaNome(plantaId)}</p>
                <p className="text-sm font-semibold" style={{ color: "#7585fd" }}>{previewPessoas} pessoas</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-3 justify-end">
        <button onClick={cancelar}
          className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
          <X size={13} className="inline mr-1.5" />Cancelar
        </button>
        <button
          onClick={requestSalvar}
          disabled={!escalaId || !plantaId}
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

      {/* ══ ESTADO VAZIO ═════════════════════════════════════════════════════ */}
      {estado === "vazio" && (
        <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}>
            <Users size={28} style={{ color: "#5560f8", opacity: 0.8 }} />
          </div>
          <h3 className="text-base font-semibold mb-2" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
            Nenhum planejamento de pessoal definido
          </h3>
          <p className="text-sm mb-6 max-w-sm" style={{ color: "#5a607a" }}>
            Defina a escala de trabalho e a planta produtiva para calcular o custo planejado de mão de obra.
          </p>
          <button onClick={iniciarNovo} className="btn-primary px-6 py-2.5">
            <Sparkles size={14} />Definir planejamento
          </button>
        </div>
      )}

      {/* ══ ESTADO SELECIONANDO ═══════════════════════════════════════════════ */}
      {estado === "selecionando" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-5 rounded-full" style={{ background: "#5560f8" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Novo planejamento de pessoal</h3>
          </div>
          {renderSeletor()}
        </div>
      )}

      {/* ══ ESTADO SALVO ═════════════════════════════════════════════════════ */}
      {estado === "salvo" && plano && (
        <>
          {/* Card principal */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-6 py-5 flex items-center justify-between flex-wrap gap-4"
              style={{ borderBottom: showDetalhe ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.25)" }}>
                  <TrendingUp size={18} style={{ color: "#7585fd" }} />
                </div>
                <div>
                  <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo Planejado de MO</p>
                  <p className="text-2xl font-bold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
                    R$ {fmt(totalPlanejado)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-5">
                <div className="text-center">
                  <p className="text-xs mb-0.5" style={{ color: "#5a607a" }}>Escala</p>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>
                    {escalaNome(plano.escala_id)}
                  </span>
                </div>
                <div className="text-center">
                  <p className="text-xs mb-0.5" style={{ color: "#5a607a" }}>Planta</p>
                  <span className="text-xs font-bold px-3 py-1 rounded-lg" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>
                    {plantaNome(plano.planta_id)}
                  </span>
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
                <button onClick={iniciarEditar} className="btn-primary py-2 px-4 text-xs">
                  <Pencil size={13} />Editar
                </button>
              </div>
            </div>

            {/* Detalhes ocultos */}
            {showDetalhe && planoRows.length > 0 && (
              <div className="overflow-x-auto animate-fadeIn">
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <th className="px-5 py-3 text-left font-semibold" style={{ color: "#8890a8" }}>Função</th>
                      <th className="px-5 py-3 text-center font-semibold" style={{ color: "#8890a8" }}>Quantidade</th>
                      <th className="px-5 py-3 text-right font-semibold" style={{ color: "#8890a8" }}>Custo Mensal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {planoRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-5 py-2.5 font-medium" style={{ color: r.quantidade === 0 ? "#3d425a" : "#e8eaf0" }}>{r.funcao}</td>
                        <td className="px-5 py-2.5 text-center font-bold" style={{ color: r.quantidade === 0 ? "#3d425a" : "#7585fd" }}>{r.quantidade}</td>
                        <td className="px-5 py-2.5 text-right" style={{ color: r.total === 0 ? "#3d425a" : "#e8eaf0" }}>
                          {r.total > 0 ? `R$ ${fmt(r.total)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                      <td className="px-5 py-3 font-bold text-xs tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                      <td className="px-5 py-3 text-center font-bold" style={{ color: "#7585fd" }}>{totalPessoas} pessoas</td>
                      <td className="px-5 py-3 text-right font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlanejado)}</td>
                    </tr>
                  </tfoot>
                </table>
                {/* Info salvo por */}
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
              <button onClick={() => setShowHistorico(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
                style={{ background: "rgba(255,255,255,0.02)" }}>
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
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        {["Data","De","Para","Custo Anterior","Custo Novo","Alterado por","Obs."].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {planoHistorico.map(h => (
                        <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                          <td className="px-4 py-2.5"><span style={{ color: "#ef4444" }}>{h.escala_anterior} · {h.planta_anterior}</span></td>
                          <td className="px-4 py-2.5"><span style={{ color: "#22c55e" }}>{h.escala_nova} · {h.planta_nova}</span></td>
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

      {/* ══ ESTADO EDITANDO ═══════════════════════════════════════════════════ */}
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

      {/* ══ CUSTO EXECUTADO (só aparece quando há plano salvo) ════════════════ */}
      {(estado === "salvo") && (
        <div className="glass rounded-2xl overflow-hidden">
          <button onClick={() => setShowRealizado(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
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
                  <p className="text-xs" style={{ color: "#3d425a" }}>Quando disponível, o custo real será importado aqui via CSV.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {mesList.map(mes => {
                    const real = realizadoPorMes(mes);
                    const diff = real.total - totalPlanejado;
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
                          {real.horas_extras > 0 && (
                            <div className="text-right">
                              <p className="text-xs" style={{ color: "#5a607a" }}>H. Extras</p>
                              <p className="text-sm font-bold" style={{ color: "#f59e0b" }}>R$ {fmt(real.horas_extras)}</p>
                            </div>
                          )}
                          {deleteConfirm === mes ? (
                            <div className="flex gap-1">
                              <button onClick={() => deletarMes(mes)} className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Confirmar</button>
                              <button onClick={() => setDeleteConfirm(null)} className="text-xs px-2 py-1 rounded-lg" style={{ color: "#5a607a" }}>Cancelar</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirm(mes)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/20 transition-all" style={{ color: "#5a607a" }}>
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

      {/* ══ MODAL SALVAR ═════════════════════════════════════════════════════ */}
      {showSalvarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={e => e.target === e.currentTarget && setShowSalvarModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn"
            style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
                {estado === "editando" ? "Confirmar alteração" : "Salvar planejamento"}
              </h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                {escalaNome(escalaId)} · {plantaNome(plantaId)} · R$ {fmt(previewTotal)} · {previewPessoas} pessoas
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>
                  {estado === "editando" ? "Alterado por *" : "Salvo por *"}
                </label>
                <input className="input-field" placeholder="Seu nome" value={salvoPor} onChange={e => setSalvoPor(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label>
                <textarea className="input-field resize-none" rows={3}
                  placeholder={estado === "editando" ? "Motivo da alteração..." : "Referência, versão do planejamento..."}
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
