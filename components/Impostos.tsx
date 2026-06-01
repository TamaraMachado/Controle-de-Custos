"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import SectionHeader from "@/components/SectionHeader";
import { Save, Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

// ─── ICMS por estado (origem SP) ─────────────────────────────────────────────
const ICMS_SP: Record<string, number> = {
  AC:7, AL:7, AM:7, AP:7, BA:7, CE:7, DF:7, ES:7, GO:7, MA:7,
  MG:12, MS:7, MT:7, PA:7, PB:7, PE:7, PI:7, PR:12, RJ:12, RN:7,
  RO:7, RR:7, RS:12, SC:12, SE:7, SP:18, TO:7,
};

const PIS_COFINS = 9.25;
const ESTADOS = Object.keys(ICMS_SP).sort();
const DIAS_ESCALA: Record<string, number> = { "6x2": 30, "6x1": 26, "5x2": 25 };

const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

// Fórmula: preço COM = preço SEM / (1 - PIS_COFINS/100) / (1 - ICMS/100)
const calcComImposto = (semImposto: number, icms: number) =>
  semImposto / (1 - PIS_COFINS / 100) / (1 - icms / 100);

interface Props { projetoId: string; }

export default function Impostos({ projetoId }: Props) {
  const [loading, setLoading] = useState(true);
  const [estadoSelecionado, setEstadoSelecionado] = useState("");
  const [showTabelaRef, setShowTabelaRef] = useState(true);

  // Totais calculados da plataforma
  const [custoTotalSemImposto, setCustoTotalSemImposto] = useState(0);
  const [producaoPrevista, setProducaoPrevista] = useState(0);

  // Salvar estado
  const [salvoPor, setSalvoPor] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalError, setModalError] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);

    // Config salva
    const { data: config } = await supabase
      .from("impostos_config").select("*").eq("projeto_id", projetoId).single();
    if (config?.estado_destino) setEstadoSelecionado(config.estado_destino);

    // Buscar todos os custos planejados (mesma lógica do Resumo)
    const [
      { data: custosDiretos }, { data: pessoasPlano }, { data: sgaPlan },
      { data: roloMats }, { data: fretePlan }, { data: prodPlan },
    ] = await Promise.all([
      supabase.from("custos_diretos").select("receita, custo_unitario, custo_frete").eq("projeto_id", projetoId),
      supabase.from("projeto_pessoas_plano").select("escala_id, planta_id, pessoas_escalas(nome)").eq("projeto_id", projetoId).single(),
      supabase.from("sga_planejado").select("horas, custo").eq("projeto_id", projetoId),
      supabase.from("rolo_materiais").select("custo_rolo").eq("projeto_id", projetoId),
      supabase.from("frete_planejado").select("custo_por_ton").eq("projeto_id", projetoId).single(),
      supabase.from("producao_planejada").select("*").eq("projeto_id", projetoId).single(),
    ]);

    // Produção prevista
    const escalaNome = (pessoasPlano?.pessoas_escalas as any)?.nome ?? "";
    const diasMes = DIAS_ESCALA[escalaNome] ?? 30;
    let prodMes = 0;
    if (prodPlan) {
      const prodDia = prodPlan.prod_hora * 24 * (prodPlan.disponibilidade / 100) * (1 - prodPlan.perda / 100) * (1 - prodPlan.umidade / 100);
      prodMes = prodDia * diasMes;
    }
    setProducaoPrevista(prodMes);

    // Custo direto planejado
    const planCD = prodMes > 0
      ? (custosDiretos ?? []).reduce((s: number, r: any) => s + (r.receita / 100) * prodMes * (r.custo_unitario + r.custo_frete), 0)
      : 0;

    // Pessoas
    let planPessoas = 0;
    if (pessoasPlano) {
      const { data: tmpl } = await supabase.from("pessoas_template")
        .select("quantidade, pessoas_funcoes(custo_unitario)")
        .eq("escala_id", pessoasPlano.escala_id).eq("planta_id", pessoasPlano.planta_id);
      planPessoas = (tmpl ?? []).reduce((s: number, r: any) => s + r.quantidade * r.pessoas_funcoes.custo_unitario, 0);
    }

    const planSGA = (sgaPlan ?? []).reduce((s: number, r: any) => s + r.horas * r.custo, 0);
    const planRolo = (roloMats ?? []).reduce((s: number, r: any) => s + r.custo_rolo, 0);
    const planFrete = fretePlan?.custo_por_ton && prodMes > 0 ? fretePlan.custo_por_ton * prodMes : 0;

    setCustoTotalSemImposto(planCD + planPessoas + planSGA + planRolo + planFrete);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // ── Cálculos ──────────────────────────────────────────────────────────────
  const icms = estadoSelecionado ? ICMS_SP[estadoSelecionado] ?? 0 : 0;
  const custoTonSemImposto = producaoPrevista > 0 ? custoTotalSemImposto / producaoPrevista : 0;
  const custoTotalComImposto = estadoSelecionado ? calcComImposto(custoTotalSemImposto, icms) : 0;
  const custoTonComImposto = estadoSelecionado ? calcComImposto(custoTonSemImposto, icms) : 0;
  const fatorImposto = estadoSelecionado ? (custoTotalComImposto / custoTotalSemImposto - 1) * 100 : 0;

  // ── Salvar estado ─────────────────────────────────────────────────────────
  const confirmarSalvar = async () => {
    if (!salvoPor.trim()) { setModalError("Informe quem está salvando."); return; }
    setSaving(true); setModalError("");
    await supabase.from("impostos_config").upsert([{
      projeto_id: projetoId, estado_destino: estadoSelecionado,
      salvo_por: salvoPor, updated_at: new Date().toISOString(),
    }], { onConflict: "projeto_id" });
    setShowModal(false); setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ══ TABELA DE REFERÊNCIA ICMS ══════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <button onClick={() => setShowTabelaRef(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
          style={{ borderBottom: showTabelaRef ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
          <div>
            <p className="text-sm font-semibold text-left" style={{ color: "#e8eaf0" }}>Tabela de Referência — ICMS por Estado</p>
            <p className="text-xs text-left mt-0.5" style={{ color: "#5a607a" }}>Origem: São Paulo (SP) · PIS/COFINS fixo: 9,25%</p>
          </div>
          {showTabelaRef ? <ChevronUp size={15} style={{ color: "#5a607a" }} /> : <ChevronDown size={15} style={{ color: "#5a607a" }} />}
        </button>
        {showTabelaRef && (
          <div className="p-5">
            <div className="flex flex-wrap gap-2">
              {ESTADOS.map(uf => {
                const taxa = ICMS_SP[uf];
                const isSelected = uf === estadoSelecionado;
                const cor = taxa === 18 ? "#ef4444" : taxa === 12 ? "#f59e0b" : "#22c55e";
                return (
                  <div key={uf} onClick={() => setEstadoSelecionado(uf)}
                    className="flex flex-col items-center px-3 py-2.5 rounded-xl cursor-pointer transition-all hover:scale-105"
                    style={isSelected
                      ? { background: `rgba(${taxa === 18 ? "239,68,68" : taxa === 12 ? "245,158,11" : "34,197,94"},0.25)`, border: `2px solid ${cor}`, minWidth: 52 }
                      : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", minWidth: 52 }}>
                    <span className="text-xs font-bold" style={{ color: isSelected ? cor : "#e8eaf0" }}>{uf}</span>
                    <span className="text-xs font-semibold mt-0.5" style={{ color: cor }}>{taxa}%</span>
                  </div>
                );
              })}
            </div>
            {/* Legenda */}
            <div className="flex gap-4 mt-4">
              {[["#22c55e","7% — Estados do Norte, Nordeste, Centro-Oeste"], ["#f59e0b","12% — MG, PR, RJ, RS, SC"], ["#ef4444","18% — SP (intra-estadual)"]].map(([c, l]) => (
                <div key={l} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ background: c as string }} />
                  <span className="text-xs" style={{ color: "#8890a8" }}>{l}</span>
                </div>
              ))}
            </div>
            {/* Fórmula */}
            <div className="mt-4 px-4 py-3 rounded-xl text-xs" style={{ background: "rgba(85,96,248,0.08)", border: "1px solid rgba(85,96,248,0.15)" }}>
              <p className="font-semibold mb-1" style={{ color: "#7585fd" }}>Fórmula de cálculo:</p>
              <p style={{ color: "#8890a8" }}>
                Preço COM impostos = Preço SEM impostos ÷ (1 − 9,25%) ÷ (1 − ICMS%)
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ══ PLANEJAMENTO ═══════════════════════════════════════════════════ */}
      <section>
        <SectionHeader tipo="planejamento" descricao="Selecione o estado de destino para calcular o imposto">
          {estadoSelecionado && (
            <button onClick={() => { setSalvoPor(""); setModalError(""); setShowModal(true); }}
              className="btn-primary py-2 px-4 text-xs" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
              <Save size={13} />Salvar destino
            </button>
          )}
        </SectionHeader>

        {/* Seletor de estado */}
        <div className="glass rounded-2xl p-5 space-y-5">
          <div className="max-w-sm">
            <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Para onde o produto será enviado?</label>
            <select value={estadoSelecionado} onChange={e => setEstadoSelecionado(e.target.value)}
              className="input-field text-sm" style={{ color: estadoSelecionado ? "#e8eaf0" : "#5a607a" }}>
              <option value="">Selecione o estado de destino...</option>
              {ESTADOS.map(uf => (
                <option key={uf} value={uf}>{uf} — ICMS {ICMS_SP[uf]}%</option>
              ))}
            </select>
          </div>

          {/* Cards de resultado */}
          {custoTotalSemImposto > 0 && (
            <div className="space-y-3">
              {/* Linha 1: Totais */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl px-5 py-4" style={{ background: "rgba(85,96,248,0.08)", border: "1px solid rgba(85,96,248,0.2)" }}>
                  <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo total SEM imposto</p>
                  <p className="text-2xl font-bold" style={{ color: "#7585fd" }}>R$ {fmt(custoTotalSemImposto)}</p>
                  <p className="text-xs mt-1" style={{ color: "#5a607a" }}>soma de todos os custos planejados</p>
                </div>
                <div className="rounded-xl px-5 py-4" style={{ background: estadoSelecionado ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)", border: `1px solid ${estadoSelecionado ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.07)"}` }}>
                  <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo total COM imposto {estadoSelecionado ? `(→ ${estadoSelecionado})` : ""}</p>
                  {estadoSelecionado ? (
                    <>
                      <p className="text-2xl font-bold" style={{ color: "#ef4444" }}>R$ {fmt(custoTotalComImposto)}</p>
                      <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                        PIS/COFINS 9,25% + ICMS {icms}% · carga total +{fmt(fatorImposto, 1)}%
                      </p>
                    </>
                  ) : (
                    <p className="text-base mt-2" style={{ color: "#3d425a" }}>Selecione o estado de destino</p>
                  )}
                </div>
              </div>

              {/* Linha 2: Por tonelada */}
              {producaoPrevista > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl px-5 py-4" style={{ background: "rgba(85,96,248,0.05)", border: "1px solid rgba(85,96,248,0.12)" }}>
                    <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo/ton SEM imposto</p>
                    <p className="text-xl font-bold" style={{ color: "#7585fd" }}>R$ {fmt(custoTonSemImposto, 2)}/t</p>
                    <p className="text-xs mt-1" style={{ color: "#5a607a" }}>base: {fmt(producaoPrevista, 1)} t previstas/mês</p>
                  </div>
                  <div className="rounded-xl px-5 py-4" style={{ background: estadoSelecionado ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${estadoSelecionado ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)"}` }}>
                    <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo/ton COM imposto {estadoSelecionado ? `(→ ${estadoSelecionado})` : ""}</p>
                    {estadoSelecionado ? (
                      <p className="text-xl font-bold" style={{ color: "#ef4444" }}>R$ {fmt(custoTonComImposto, 2)}/t</p>
                    ) : (
                      <p className="text-base mt-2" style={{ color: "#3d425a" }}>Selecione o estado</p>
                    )}
                  </div>
                </div>
              )}

              {/* Detalhamento do imposto */}
              {estadoSelecionado && (
                <div className="rounded-xl px-5 py-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-xs font-semibold mb-3" style={{ color: "#8890a8" }}>DETALHAMENTO DO IMPOSTO</p>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    {[
                      { label: "PIS/COFINS", valor: `${PIS_COFINS}%`, detalhe: "fixo", cor: "#f59e0b" },
                      { label: `ICMS → ${estadoSelecionado}`, valor: `${icms}%`, detalhe: "variável por estado", cor: "#f59e0b" },
                      { label: "Carga total", valor: `+${fmt(fatorImposto, 2)}%`, detalhe: "sobre o preço base", cor: "#ef4444" },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                        <p className="text-lg font-bold" style={{ color: item.cor }}>{item.valor}</p>
                        <p className="text-xs" style={{ color: "#3d425a" }}>{item.detalhe}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {custoTotalSemImposto === 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)" }}>
              <AlertCircle size={14} style={{ color: "#f59e0b" }} />
              <span className="text-xs" style={{ color: "#f59e0b" }}>Configure os custos nas outras abas para calcular o imposto aqui.</span>
            </div>
          )}
        </div>
      </section>

      {/* Modal salvar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Salvar destino</h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>Estado: <strong style={{ color: "#e8eaf0" }}>{estadoSelecionado}</strong> · ICMS {icms}%</p>
            </div>
            <div className="p-6 space-y-4">
              <div><label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Salvo por *</label>
                <input className="input-field" placeholder="Seu nome" value={salvoPor} onChange={e => setSalvoPor(e.target.value)} autoFocus /></div>
              {modalError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{modalError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSalvar} disabled={saving} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
