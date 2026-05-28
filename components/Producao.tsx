"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import {
  Pencil, Save, X, Plus, Trash2, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle,
  Check, Factory, Clock, AlertTriangle
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Planejado {
  id?: string;
  prod_hora: number;
  disponibilidade: number;
  umidade: number;
  perda: number;
  salvo_por?: string;
  observacao?: string;
  updated_at?: string;
}

interface ProducaoDiaria {
  id: string;
  data: string;
  toneladas: number;
  registrado_por: string;
  observacao: string;
}

interface Parada {
  id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  equipamento: string;
  setor: string;
  responsavel: string;
  ocorrencia: string;
}

interface Historico {
  id: string; item_id: string; tipo: string;
  descricao_item: string; campo: string;
  valor_anterior: string; valor_novo: string;
  alterado_por: string; observacao: string; alterado_em: string;
}

interface Props { projetoId: string; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Dias produtivos por mês conforme escala
const DIAS_POR_ESCALA: Record<string, number> = {
  "6x2": 30,   // contínuo 24h/dia
  "6x1": 26,   // 6 dias/semana (dom 22h → sáb 22h)
  "5x2": 25,   // seg 7h → sáb 1h ≈ 138h/semana
};

const HORAS_DIA_ESCALA: Record<string, number> = {
  "6x2": 24,
  "6x1": 24,
  "5x2": 24,
};

const calcProdDia = (p: Planejado) =>
  p.prod_hora * 24 * (p.disponibilidade / 100) * (1 - p.perda / 100) * (1 - p.umidade / 100);

const calcProdMes = (p: Planejado, escala: string) =>
  calcProdDia(p) * (DIAS_POR_ESCALA[escala] ?? 30);

// Horas paradas de um dia (em horas decimais)
const horasParadas = (paradas: Parada[], data: string) =>
  paradas.filter(p => p.data === data).reduce((s, p) => {
    const [hi, mi] = p.hora_inicio.split(":").map(Number);
    const [hf, mf] = p.hora_fim.split(":").map(Number);
    let diff = (hf * 60 + mf) - (hi * 60 + mi);
    if (diff < 0) diff += 24 * 60; // atravessou meia-noite
    return s + diff / 60;
  }, 0);

const dispReal = (paradas: Parada[], data: string, horasDia = 24) => {
  const paradas_h = horasParadas(paradas, data);
  return Math.max(0, ((horasDia - paradas_h) / horasDia) * 100);
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function Producao({ projetoId }: Props) {
  const [escalaNome, setEscalaNome] = useState<string>("");
  const [planejado, setPlanejado] = useState<Planejado | null>(null);
  const [producaoDiaria, setProducaoDiaria] = useState<ProducaoDiaria[]>([]);
  const [paradas, setParadas] = useState<Parada[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistorico, setShowHistorico] = useState(false);

  // Planejado form
  const [estadoPlan, setEstadoPlan] = useState<"novo" | "salvo" | "editando">("novo");
  const [planForm, setPlanForm] = useState({ prod_hora: "", disponibilidade: "", umidade: "", perda: "" });
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [planWho, setPlanWho] = useState("");
  const [planObs, setPlanObs] = useState("");
  const [planError, setPlanError] = useState("");
  const [savingPlan, setSavingPlan] = useState(false);

  // Produção diária
  const [showNovaProd, setShowNovaProd] = useState(false);
  const [prodForm, setProdForm] = useState({ data: new Date().toISOString().split("T")[0], toneladas: "", registrado_por: "", observacao: "" });
  const [prodError, setProdError] = useState("");
  const [savingProd, setSavingProd] = useState(false);
  const [editandoProd, setEditandoProd] = useState<string | null>(null);
  const [editProdForm, setEditProdForm] = useState<Partial<ProducaoDiaria>>({});
  const [showProdEditModal, setShowProdEditModal] = useState(false);
  const [prodEditWho, setProdEditWho] = useState("");
  const [prodEditObs, setProdEditObs] = useState("");
  const [deleteProdTarget, setDeleteProdTarget] = useState<ProducaoDiaria | null>(null);
  const [deleteProdWho, setDeleteProdWho] = useState("");

  // Paradas
  const [showNovaParada, setShowNovaParada] = useState(false);
  const [paradaForm, setParadaForm] = useState({ data: new Date().toISOString().split("T")[0], hora_inicio: "", hora_fim: "", equipamento: "", setor: "", responsavel: "", ocorrencia: "" });
  const [paradaError, setParadaError] = useState("");
  const [savingParada, setSavingParada] = useState(false);
  const [editandoParada, setEditandoParada] = useState<string | null>(null);
  const [editParadaForm, setEditParadaForm] = useState<Partial<Parada>>({});
  const [showParadaEditModal, setShowParadaEditModal] = useState(false);
  const [paradaEditWho, setParadaEditWho] = useState("");
  const [deleteParadaTarget, setDeleteParadaTarget] = useState<Parada | null>(null);
  const [deleteParadaWho, setDeleteParadaWho] = useState("");
  const [showParadas, setShowParadas] = useState(true);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: planoP }, { data: plan }, { data: prod }, { data: par }, { data: hist }] = await Promise.all([
      supabase.from("projeto_pessoas_plano").select("escala_id, pessoas_escalas(nome)").eq("projeto_id", projetoId).single(),
      supabase.from("producao_planejada").select("*").eq("projeto_id", projetoId).single(),
      supabase.from("producao_real_diaria").select("*").eq("projeto_id", projetoId).order("data", { ascending: false }),
      supabase.from("producao_paradas").select("*").eq("projeto_id", projetoId).order("data", { ascending: false }).order("hora_inicio"),
      supabase.from("producao_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(80),
    ]);

    if (planoP?.pessoas_escalas) {
      setEscalaNome((planoP.pessoas_escalas as any).nome ?? "");
    }
    if (plan) { setPlanejado(plan); setEstadoPlan("salvo"); }
    else { setPlanejado(null); setEstadoPlan("novo"); }
    setProducaoDiaria(prod ?? []);
    setParadas(par ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // ── Cálculos planejado ────────────────────────────────────────────────────
  const pfh = parseFloat(planForm.prod_hora) || 0;
  const pfDisp = parseFloat(planForm.disponibilidade) || 0;
  const pfUm = parseFloat(planForm.umidade) || 0;
  const pfPerda = parseFloat(planForm.perda) || 0;
  const previewDia = pfh * 24 * (pfDisp / 100) * (1 - pfPerda / 100) * (1 - pfUm / 100);
  const previewMes = previewDia * (DIAS_POR_ESCALA[escalaNome] ?? 30);

  // Totais reais
  const totalTonMes = producaoDiaria.reduce((s, p) => s + p.toneladas, 0);
  const diasComProd = producaoDiaria.length;
  const mediaDisp = producaoDiaria.length > 0
    ? producaoDiaria.reduce((s, p) => s + dispReal(paradas, p.data), 0) / producaoDiaria.length
    : 0;

  // ── Planejado - salvar ─────────────────────────────────────────────────────
  const requestSavePlan = () => {
    if (!planForm.prod_hora) { setPlanError("Informe a produção por hora."); return; }
    setPlanWho(""); setPlanObs(""); setPlanError(""); setShowPlanModal(true);
  };

  const confirmarSavePlan = async () => {
    if (!planWho.trim()) { setPlanError("Informe quem está salvando."); return; }
    setSavingPlan(true);
    const payload = {
      projeto_id: projetoId,
      prod_hora: pfh, disponibilidade: pfDisp, umidade: pfUm, perda: pfPerda,
      salvo_por: planWho, observacao: planObs, updated_at: new Date().toISOString(),
    };
    if (estadoPlan === "editando" && planejado?.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const changes: any[] = [];
      const campos = [["prod_hora","Produção/hora (t/h)"],["disponibilidade","Disponibilidade (%)"],["umidade","Umidade (%)"],["perda","Perda (%)"]] as [keyof Planejado, string][];
      for (const [f, label] of campos) {
        if (String(planejado[f]) !== String(payload[f as keyof typeof payload])) {
          changes.push({ projeto_id: projetoId, item_id: planejado.id, tipo: "planejado", descricao_item: "Produção planejada", campo: label, valor_anterior: String(planejado[f]), valor_novo: String(payload[f as keyof typeof payload]), alterado_por: planWho, observacao: planObs });
        }
      }
      if (changes.length > 0) await supabase.from("producao_historico").insert(changes);
      await supabase.from("producao_planejada").update(payload).eq("projeto_id", projetoId);
    } else {
      await supabase.from("producao_planejada").insert([payload]);
    }
    setShowPlanModal(false); setSavingPlan(false);
    await load();
  };

  const iniciarEditPlan = () => {
    if (!planejado) return;
    setPlanForm({ prod_hora: String(planejado.prod_hora), disponibilidade: String(planejado.disponibilidade), umidade: String(planejado.umidade), perda: String(planejado.perda) });
    setEstadoPlan("editando");
  };

  // ── Produção diária ───────────────────────────────────────────────────────
  const salvarProd = async () => {
    if (!prodForm.toneladas) { setProdError("Informe as toneladas produzidas."); return; }
    if (!prodForm.registrado_por.trim()) { setProdError("Informe quem está registrando."); return; }
    setSavingProd(true); setProdError("");
    const { data: ins } = await supabase.from("producao_real_diaria").upsert([{
      projeto_id: projetoId, data: prodForm.data, toneladas: parseFloat(prodForm.toneladas),
      registrado_por: prodForm.registrado_por, observacao: prodForm.observacao,
    }], { onConflict: "projeto_id,data" }).select().single();
    if (ins) await supabase.from("producao_historico").insert([{ projeto_id: projetoId, item_id: ins.id, tipo: "real_diario", descricao_item: `Produção ${prodForm.data}`, campo: "Produção registrada", valor_anterior: "—", valor_novo: `${prodForm.toneladas} t`, alterado_por: prodForm.registrado_por, observacao: prodForm.observacao }]);
    setProdForm({ data: new Date().toISOString().split("T")[0], toneladas: "", registrado_por: "", observacao: "" });
    setShowNovaProd(false); setSavingProd(false);
    await load();
  };

  const iniciarEditProd = (p: ProducaoDiaria) => { setEditandoProd(p.id); setEditProdForm({ ...p }); setProdEditWho(""); setProdEditObs(""); };
  const confirmarEditProd = async () => {
    if (!prodEditWho.trim() || !editandoProd) return;
    const orig = producaoDiaria.find(p => p.id === editandoProd)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    if (String(orig.toneladas) !== String(editProdForm.toneladas)) changes.push({ projeto_id: projetoId, item_id: editandoProd, tipo: "real_diario", descricao_item: `Produção ${orig.data}`, campo: "Toneladas", valor_anterior: String(orig.toneladas), valor_novo: String(editProdForm.toneladas), alterado_por: prodEditWho, observacao: prodEditObs });
    if (orig.observacao !== editProdForm.observacao) changes.push({ projeto_id: projetoId, item_id: editandoProd, tipo: "real_diario", descricao_item: `Produção ${orig.data}`, campo: "Observação", valor_anterior: orig.observacao || "—", valor_novo: editProdForm.observacao || "—", alterado_por: prodEditWho, observacao: prodEditObs });
    if (changes.length > 0) await supabase.from("producao_historico").insert(changes);
    await supabase.from("producao_real_diaria").update({ toneladas: editProdForm.toneladas, observacao: editProdForm.observacao, registrado_por: editProdForm.registrado_por }).eq("id", editandoProd);
    setEditandoProd(null); setShowProdEditModal(false);
    await load();
  };

  const excluirProd = async (p: ProducaoDiaria, who: string) => {
    await supabase.from("producao_historico").insert([{ projeto_id: projetoId, item_id: p.id, tipo: "real_diario", descricao_item: `Produção ${p.data}`, campo: "Registro excluído", valor_anterior: `${p.toneladas} t`, valor_novo: "—", alterado_por: who, observacao: "" }]);
    await supabase.from("producao_real_diaria").delete().eq("id", p.id);
    setDeleteProdTarget(null);
    await load();
  };

  // ── Paradas ───────────────────────────────────────────────────────────────
  const salvarParada = async () => {
    if (!paradaForm.hora_inicio || !paradaForm.hora_fim) { setParadaError("Informe hora inicial e final."); return; }
    if (!paradaForm.responsavel.trim()) { setParadaError("Informe o responsável pelo registro."); return; }
    setSavingParada(true); setParadaError("");
    const { data: ins } = await supabase.from("producao_paradas").insert([{
      projeto_id: projetoId, ...paradaForm
    }]).select().single();
    if (ins) await supabase.from("producao_historico").insert([{ projeto_id: projetoId, item_id: ins.id, tipo: "parada", descricao_item: `Parada ${paradaForm.data} ${paradaForm.hora_inicio}-${paradaForm.hora_fim}`, campo: "Parada registrada", valor_anterior: "—", valor_novo: `${paradaForm.equipamento || "Equipamento"} - ${paradaForm.ocorrencia || ""}`, alterado_por: paradaForm.responsavel, observacao: "" }]);
    setParadaForm({ data: new Date().toISOString().split("T")[0], hora_inicio: "", hora_fim: "", equipamento: "", setor: "", responsavel: "", ocorrencia: "" });
    setShowNovaParada(false); setSavingParada(false);
    await load();
  };

  const iniciarEditParada = (p: Parada) => { setEditandoParada(p.id); setEditParadaForm({ ...p }); setParadaEditWho(""); };
  const confirmarEditParada = async () => {
    if (!paradaEditWho.trim() || !editandoParada) return;
    const orig = paradas.find(p => p.id === editandoParada)!;
    await supabase.from("producao_historico").insert([{ projeto_id: projetoId, item_id: editandoParada, tipo: "parada", descricao_item: `Parada ${orig.data}`, campo: "Parada editada", valor_anterior: `${orig.hora_inicio}-${orig.hora_fim} ${orig.equipamento}`, valor_novo: `${editParadaForm.hora_inicio}-${editParadaForm.hora_fim} ${editParadaForm.equipamento}`, alterado_por: paradaEditWho, observacao: "" }]);
    await supabase.from("producao_paradas").update({ ...editParadaForm }).eq("id", editandoParada);
    setEditandoParada(null); setShowParadaEditModal(false);
    await load();
  };

  const excluirParada = async (p: Parada, who: string) => {
    await supabase.from("producao_historico").insert([{ projeto_id: projetoId, item_id: p.id, tipo: "parada", descricao_item: `Parada ${p.data} ${p.hora_inicio}`, campo: "Parada excluída", valor_anterior: `${p.equipamento} - ${p.ocorrencia}`, valor_novo: "—", alterado_por: who, observacao: "" }]);
    await supabase.from("producao_paradas").delete().eq("id", p.id);
    setDeleteParadaTarget(null);
    await load();
  };

  // Agrupar paradas por data
  const datasComParadas = [...new Set(paradas.map(p => p.data))].sort((a,b) => b.localeCompare(a));

  if (loading) return <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}><Loader2 size={20} className="animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="space-y-8">

      {/* Escala info */}
      {escalaNome && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl glass">
          <Factory size={15} style={{ color: "#7585fd" }} />
          <span className="text-sm" style={{ color: "#8890a8" }}>Escala de produção:</span>
          <span className="text-sm font-bold px-3 py-0.5 rounded-lg" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>{escalaNome}</span>
          <span className="text-xs" style={{ color: "#5a607a" }}>· {DIAS_POR_ESCALA[escalaNome] ?? 30} dias produtivos/mês</span>
        </div>
      )}
      {!escalaNome && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
          <AlertTriangle size={14} style={{ color: "#f59e0b" }} />
          <span className="text-xs" style={{ color: "#f59e0b" }}>Defina a escala na aba <strong>Pessoas</strong> para calcular os dias produtivos do mês.</span>
        </div>
      )}

      {/* ══════════════ PLANEJAMENTO ══════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="planejamento"
          descricao={estadoPlan === "salvo" && planejado ? `Previsto: ${fmt(calcProdMes(planejado, escalaNome), 2)} t/mês` : undefined}>
          {estadoPlan === "salvo" ? (
            <button onClick={iniciarEditPlan} className="btn-primary py-2 px-4 text-xs"><Pencil size={13} />Editar</button>
          ) : estadoPlan === "editando" ? (
            <div className="flex gap-2">
              <button onClick={() => setEstadoPlan("salvo")} className="px-4 py-2 rounded-xl text-xs" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={requestSavePlan} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}><Save size={13} />Salvar</button>
            </div>
          ) : (
            <button onClick={requestSavePlan} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}><Save size={13} />Salvar planejamento</button>
          )}
        </SectionHeader>

        <div className="glass rounded-2xl p-6 space-y-5">
          {/* Inputs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Produção/hora (t/h)", key: "prod_hora", placeholder: "0,0000" },
              { label: "Disponibilidade (%)", key: "disponibilidade", placeholder: "0,00" },
              { label: "Umidade (%)", key: "umidade", placeholder: "0,00" },
              { label: "Perda (%)", key: "perda", placeholder: "0,00" },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>{f.label}</label>
                {(estadoPlan === "novo" || estadoPlan === "editando") ? (
                  <input type="number" step="0.0001"
                    value={(planForm as Record<string,string>)[f.key]}
                    onChange={e => setPlanForm(p => ({ ...p, [f.key]: e.target.value }))}
                    className="input-field text-sm" placeholder={f.placeholder} />
                ) : (
                  <div className="input-field text-sm font-semibold" style={{ color: "#e8eaf0", cursor: "default" }}>
                    {fmt((planejado as Record<string,number>)[f.key], 4)}
                    {f.key !== "prod_hora" && <span style={{ color: "#5a607a" }}> %</span>}
                    {f.key === "prod_hora" && <span style={{ color: "#5a607a" }}> t/h</span>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Resultados calculados */}
          {(() => {
            const p = estadoPlan === "salvo" && planejado ? planejado : { prod_hora: pfh, disponibilidade: pfDisp, umidade: pfUm, perda: pfPerda };
            const prodDia = calcProdDia(p as Planejado);
            const prodMes = calcProdMes(p as Planejado, escalaNome);
            if (prodDia === 0) return null;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}>
                {[
                  { label: "Produção/dia prevista", value: `${fmt(prodDia, 2)} t/dia`, color: "#7585fd" },
                  { label: "Dias produtivos/mês", value: `${DIAS_POR_ESCALA[escalaNome] ?? 30} dias`, color: "#8890a8" },
                  { label: "Produção/mês prevista", value: `${fmt(prodMes, 2)} t/mês`, color: "#e8eaf0", big: true },
                  { label: "Eficiência líquida", value: `${fmt(((p as Planejado).disponibilidade/100) * (1-(p as Planejado).perda/100) * (1-(p as Planejado).umidade/100) * 100, 2)} %`, color: "#22c55e" },
                ].map(item => (
                  <div key={item.label} className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                    <p className={`font-bold ${item.big ? "text-xl" : "text-base"}`} style={{ color: item.color }}>{item.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </section>

      {/* ══════════════ CUSTO REAL ════════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="realizado"
          descricao={diasComProd > 0 ? `${diasComProd} dias · ${fmt(totalTonMes, 2)} t total` : undefined}>
          <div className="flex gap-2">
            <button onClick={() => setShowNovaParada(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all"
              style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", color: "#f59e0b" }}>
              <Clock size={13} />Registrar parada
            </button>
            <button onClick={() => setShowNovaProd(true)} className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              <Plus size={13} />Produção do dia
            </button>
          </div>
        </SectionHeader>

        {/* Resumo real */}
        {producaoDiaria.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: "Total produzido", value: `${fmt(totalTonMes, 2)} t`, color: "#22c55e" },
              { label: "Média diária", value: `${fmt(totalTonMes / diasComProd, 2)} t/dia`, color: "#7585fd" },
              { label: "Disponib. média real", value: `${fmt(mediaDisp, 1)} %`, color: mediaDisp >= (planejado?.disponibilidade ?? 0) ? "#22c55e" : "#ef4444" },
            ].map(item => (
              <div key={item.label} className="glass rounded-xl px-4 py-3 text-center">
                <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Form nova produção */}
        {showNovaProd && (
          <div className="glass rounded-2xl p-5 mb-4 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Registrar produção do dia</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Data</label>
                <input type="date" value={prodForm.data} onChange={e => setProdForm(p => ({ ...p, data: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Toneladas produzidas *</label>
                <input type="number" step="0.0001" value={prodForm.toneladas} onChange={e => setProdForm(p => ({ ...p, toneladas: e.target.value }))} className="input-field text-xs py-2" placeholder="0,0000" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                <input value={prodForm.registrado_por} onChange={e => setProdForm(p => ({ ...p, registrado_por: e.target.value }))} className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Observação</label>
                <input value={prodForm.observacao} onChange={e => setProdForm(p => ({ ...p, observacao: e.target.value }))} className="input-field text-xs py-2" placeholder="Observações do turno..." style={{ color: "#e8eaf0" }} />
              </div>
            </div>
            {prodError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{prodError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNovaProd(false); setProdError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={salvarProd} disabled={savingProd} className="btn-primary py-2 px-5 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                {savingProd ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Salvar
              </button>
            </div>
          </div>
        )}

        {/* Form nova parada */}
        {showNovaParada && (
          <div className="glass rounded-2xl p-5 mb-4 space-y-4 animate-fadeIn" style={{ border: "1px solid rgba(245,158,11,0.2)" }}>
            <p className="text-xs font-semibold" style={{ color: "#f59e0b" }}>Registrar parada da planta</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Data</label>
                <input type="date" value={paradaForm.data} onChange={e => setParadaForm(p => ({ ...p, data: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Hora inicial *</label>
                <input type="time" value={paradaForm.hora_inicio} onChange={e => setParadaForm(p => ({ ...p, hora_inicio: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Hora final *</label>
                <input type="time" value={paradaForm.hora_fim} onChange={e => setParadaForm(p => ({ ...p, hora_fim: e.target.value }))} className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Equipamento</label>
                <input value={paradaForm.equipamento} onChange={e => setParadaForm(p => ({ ...p, equipamento: e.target.value }))} className="input-field text-xs py-2" placeholder="Ex: Extrusora 1" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Setor responsável</label>
                <input value={paradaForm.setor} onChange={e => setParadaForm(p => ({ ...p, setor: e.target.value }))} className="input-field text-xs py-2" placeholder="Ex: Manutenção" style={{ color: "#e8eaf0" }} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Responsável pelo registro *</label>
                <input value={paradaForm.responsavel} onChange={e => setParadaForm(p => ({ ...p, responsavel: e.target.value }))} className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Ocorrência</label>
                <input value={paradaForm.ocorrencia} onChange={e => setParadaForm(p => ({ ...p, ocorrencia: e.target.value }))} className="input-field text-xs py-2" placeholder="Descreva o motivo da parada..." style={{ color: "#e8eaf0" }} />
              </div>
            </div>
            {paradaError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{paradaError}</div>}
            <div className="flex gap-2">
              <button onClick={() => { setShowNovaParada(false); setParadaError(""); }} className="px-4 py-2 rounded-xl text-xs font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}><X size={12} className="inline mr-1" />Cancelar</button>
              <button onClick={salvarParada} disabled={savingParada} className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-semibold" style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", color: "#f59e0b" }}>
                {savingParada ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Registrar parada
              </button>
            </div>
          </div>
        )}

        {/* Tabela produção diária */}
        <div className="glass rounded-2xl overflow-hidden mb-4">
          <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs font-semibold" style={{ color: "#22c55e" }}>Produção Diária</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {["Data","Toneladas (t)","H. Paradas","Disponib. Real","Registrado por","Observação",""].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {producaoDiaria.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-sm" style={{ color: "#5a607a" }}>Nenhuma produção registrada ainda.</td></tr>
                ) : producaoDiaria.map(p => {
                  const isEdit = editandoProd === p.id;
                  const hParadas = horasParadas(paradas, p.data);
                  const dispR = dispReal(paradas, p.data);
                  const dispPlan = planejado?.disponibilidade ?? 0;
                  return (
                    <tr key={p.id} className="group" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5"><span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{new Date(p.data+"T12:00:00").toLocaleDateString("pt-BR")}</span></td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input type="number" step="0.0001" value={editProdForm.toneladas ?? ""} onChange={e => setEditProdForm(f => ({ ...f, toneladas: parseFloat(e.target.value) }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-24 text-right" style={{ color: "#22c55e" }} />
                          : <span className="text-sm font-bold" style={{ color: "#22c55e" }}>{fmt(p.toneladas, 2)} t</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs" style={{ color: hParadas > 0 ? "#f59e0b" : "#5a607a" }}>
                          {hParadas > 0 ? `${fmt(hParadas, 2)} h` : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md"
                          style={{ background: dispR >= dispPlan ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: dispR >= dispPlan ? "#22c55e" : "#ef4444" }}>
                          {fmt(dispR, 1)} %
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input value={editProdForm.registrado_por ?? ""} onChange={e => setEditProdForm(f => ({ ...f, registrado_por: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-28" style={{ color: "#8890a8" }} />
                          : <span className="text-xs" style={{ color: "#8890a8" }}>{p.registrado_por}</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        {isEdit ? <input value={editProdForm.observacao ?? ""} onChange={e => setEditProdForm(f => ({ ...f, observacao: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-36" style={{ color: "#8890a8" }} />
                          : <span className="text-xs truncate block max-w-xs" style={{ color: "#8890a8" }}>{p.observacao || "—"}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isEdit ? (
                          <div className="flex gap-1">
                            <button onClick={() => setEditandoProd(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                            <button onClick={() => setShowProdEditModal(true)} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
                          </div>
                        ) : (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => iniciarEditProd(p)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#7585fd" }}><Pencil size={11} /></button>
                            <button onClick={() => setDeleteProdTarget(p)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}><Trash2 size={11} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {producaoDiaria.length > 0 && (
                <tfoot>
                  <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(34,197,94,0.06)" }}>
                    <td className="px-4 py-3 text-right text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                    <td className="px-4 py-3"><span className="text-base font-bold" style={{ color: "#22c55e" }}>{fmt(totalTonMes, 2)} t</span></td>
                    <td colSpan={5} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Paradas */}
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(245,158,11,0.2)" }}>
          <button onClick={() => setShowParadas(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5" style={{ background: "rgba(245,158,11,0.05)" }}>
            <div className="flex items-center gap-2">
              <Clock size={14} style={{ color: "#f59e0b" }} />
              <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Paradas da Planta</span>
              {paradas.length > 0 && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}>{paradas.length}</span>}
            </div>
            {showParadas ? <ChevronUp size={14} style={{ color: "#5a607a" }} /> : <ChevronDown size={14} style={{ color: "#5a607a" }} />}
          </button>
          {showParadas && (
            <div style={{ borderTop: "1px solid rgba(245,158,11,0.15)" }}>
              {datasComParadas.length === 0 ? (
                <div className="flex items-center justify-center py-8" style={{ color: "#5a607a" }}><p className="text-sm">Nenhuma parada registrada.</p></div>
              ) : datasComParadas.map(data => {
                const paradasDia = paradas.filter(p => p.data === data);
                const hTotalDia = paradasDia.reduce((s, p) => {
                  const [hi,mi]=p.hora_inicio.split(":").map(Number); const [hf,mf]=p.hora_fim.split(":").map(Number);
                  let d=(hf*60+mf)-(hi*60+mi); if(d<0)d+=1440; return s+d/60;
                }, 0);
                return (
                  <div key={data} style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex items-center justify-between px-5 py-2.5" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <span className="text-xs font-semibold" style={{ color: "#e8eaf0" }}>{new Date(data+"T12:00:00").toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"short" })}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs" style={{ color: "#f59e0b" }}>{fmt(hTotalDia, 2)} h paradas</span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b" }}>{fmt(100 - (hTotalDia/24)*100, 1)}% disponível</span>
                      </div>
                    </div>
                    {paradasDia.map(par => {
                      const isEdit = editandoParada === par.id;
                      return (
                        <div key={par.id} className="group flex items-center gap-3 px-5 py-2 text-xs flex-wrap"
                          style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          {isEdit ? (
                            <>
                              <input type="time" value={editParadaForm.hora_inicio ?? ""} onChange={e => setEditParadaForm(f => ({ ...f, hora_inicio: e.target.value }))} className="bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 w-24" style={{ color: "#f59e0b" }} />
                              <span style={{ color: "#5a607a" }}>→</span>
                              <input type="time" value={editParadaForm.hora_fim ?? ""} onChange={e => setEditParadaForm(f => ({ ...f, hora_fim: e.target.value }))} className="bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 w-24" style={{ color: "#f59e0b" }} />
                              <input value={editParadaForm.equipamento ?? ""} onChange={e => setEditParadaForm(f => ({ ...f, equipamento: e.target.value }))} className="bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 w-28" style={{ color: "#e8eaf0" }} placeholder="Equipamento" />
                              <input value={editParadaForm.setor ?? ""} onChange={e => setEditParadaForm(f => ({ ...f, setor: e.target.value }))} className="bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 w-24" style={{ color: "#8890a8" }} placeholder="Setor" />
                              <input value={editParadaForm.ocorrencia ?? ""} onChange={e => setEditParadaForm(f => ({ ...f, ocorrencia: e.target.value }))} className="bg-transparent outline-none px-2 py-1 rounded focus:bg-white/5 flex-1" style={{ color: "#8890a8" }} placeholder="Ocorrência" />
                              <div className="flex gap-1">
                                <button onClick={() => setEditandoParada(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                                <button onClick={() => setShowParadaEditModal(true)} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(245,158,11,0.2)", color: "#f59e0b" }}><Save size={11} /></button>
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="font-bold" style={{ color: "#f59e0b" }}>{par.hora_inicio} → {par.hora_fim}</span>
                              {par.equipamento && <span className="px-2 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.07)", color: "#e8eaf0" }}>{par.equipamento}</span>}
                              {par.setor && <span style={{ color: "#8890a8" }}>{par.setor}</span>}
                              {par.ocorrencia && <span className="flex-1 truncate" style={{ color: "#8890a8" }}>{par.ocorrencia}</span>}
                              <span style={{ color: "#5a607a" }}>— {par.responsavel}</span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => iniciarEditParada(par)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#7585fd" }}><Pencil size={10} /></button>
                                <button onClick={() => setDeleteParadaTarget(par)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-red-500/20" style={{ color: "#ef4444" }}><Trash2 size={10} /></button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
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
                  {["Data/Hora","Tipo","Item","Campo","Anterior","Novo","Alterado por"].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {historico.map(h => (
                    <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "#5a607a" }}>{new Date(h.alterado_em).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-2.5"><span className="px-2 py-0.5 rounded-md" style={{ background: h.tipo === "planejado" ? "rgba(85,96,248,0.15)" : h.tipo === "parada" ? "rgba(245,158,11,0.15)" : "rgba(34,197,94,0.15)", color: h.tipo === "planejado" ? "#7585fd" : h.tipo === "parada" ? "#f59e0b" : "#22c55e" }}>{h.tipo}</span></td>
                      <td className="px-4 py-2.5 font-medium" style={{ color: "#e8eaf0" }}>{h.descricao_item || "—"}</td>
                      <td className="px-4 py-2.5"><span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "#8890a8" }}>{h.campo}</span></td>
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

      {/* ══ MODAIS ════════════════════════════════════════════════════════════ */}
      {/* Modal salvar planejado */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowPlanModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>{estadoPlan === "editando" ? "Confirmar alteração" : "Salvar planejamento"}</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>Produção prevista: {fmt(previewMes, 2)} t/mês · {fmt(previewDia, 2)} t/dia</p>
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

      {/* Modal editar produção */}
      {showProdEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}><h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição</h3></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={prodEditWho} onChange={e => setProdEditWho(e.target.value)} autoFocus /></div>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label><textarea className="input-field resize-none" rows={2} value={prodEditObs} onChange={e => setProdEditObs(e.target.value)} /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowProdEditModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarEditProd} disabled={!prodEditWho.trim()} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !prodEditWho.trim() ? 0.5 : 1 }}>
                  <Save size={14} />Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal editar parada */}
      {showParadaEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}><h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição da parada</h3></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label><input className="input-field" placeholder="Seu nome" value={paradaEditWho} onChange={e => setParadaEditWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setShowParadaEditModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarEditParada} disabled={!paradaEditWho.trim()} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", opacity: !paradaEditWho.trim() ? 0.5 : 1 }}>
                  <Save size={14} />Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal excluir produção */}
      {deleteProdTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteProdTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="p-6 space-y-4">
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir registro</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>Excluindo produção de <strong style={{ color: "#e8eaf0" }}>{new Date(deleteProdTarget.data+"T12:00:00").toLocaleDateString("pt-BR")}</strong> · {fmt(deleteProdTarget.toneladas, 2)} t</p>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteProdWho} onChange={e => setDeleteProdWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteProdTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={() => excluirProd(deleteProdTarget, deleteProdWho)} disabled={!deleteProdWho.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteProdWho.trim() ? 0.5 : 1 }}>
                  <Trash2 size={14} />Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal excluir parada */}
      {deleteParadaTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setDeleteParadaTarget(null)}>
          <div className="w-full max-w-sm rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(239,68,68,0.2)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="p-6 space-y-4">
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Excluir parada</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>Parada: <strong style={{ color: "#f59e0b" }}>{deleteParadaTarget.hora_inicio} → {deleteParadaTarget.hora_fim}</strong> · {deleteParadaTarget.equipamento}</p>
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Excluído por *</label><input className="input-field" placeholder="Seu nome" value={deleteParadaWho} onChange={e => setDeleteParadaWho(e.target.value)} autoFocus /></div>
              <div className="flex gap-3">
                <button onClick={() => setDeleteParadaTarget(null)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={() => excluirParada(deleteParadaTarget, deleteParadaWho)} disabled={!deleteParadaWho.trim()} className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "white", opacity: !deleteParadaWho.trim() ? 0.5 : 1 }}>
                  <Trash2 size={14} />Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
