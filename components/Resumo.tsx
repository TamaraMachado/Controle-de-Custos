"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

interface Props { projetoId: string; }
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMes = (iso: string) => { try { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; } catch { return iso; } };

const DIAS_ESCALA: Record<string, number> = { "6x2": 30, "6x1": 26, "5x2": 25 };
const PIS_COFINS = 9.25;
const ICMS_SP: Record<string, number> = {
  AC:7,AL:7,AM:7,AP:7,BA:7,CE:7,DF:7,ES:7,GO:7,MA:7,
  MG:12,MS:7,MT:7,PA:7,PB:7,PE:7,PI:7,PR:12,RJ:12,RN:7,
  RO:7,RR:7,RS:12,SC:12,SE:7,SP:18,TO:7,
};
const calcComImposto = (sem: number, icms: number) => sem / (1 - PIS_COFINS / 100) / (1 - icms / 100);

interface CatData { label: string; planejado: number; real: number; aba: string; }

export default function Resumo({ projetoId }: Props) {
  const [loading, setLoading] = useState(true);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [categorias, setCategorias] = useState<CatData[]>([]);
  const [estadoDestino, setEstadoDestino] = useState("");

  // Produção planejada
  const [prodHoraPrev, setProdHoraPrev] = useState(0);
  const [prodDiaPrev, setProdDiaPrev] = useState(0);
  const [prodMesPrev, setProdMesPrev] = useState(0);
  const [totalPlanMes, setTotalPlanMes] = useState(0);

  // Produção real
  const [prodMesReal, setProdMesReal] = useState(0);
  const [diasComProd, setDiasComProd] = useState(0);
  const [totalRealMes, setTotalRealMes] = useState(0);

  const load = useCallback(async (mes?: string) => {
    setLoading(true);

    // ── Produção planejada ──────────────────────────────────────────────────
    const [{ data: prodPlan }, { data: pessoasPlano }, { data: prodRealTodos }] = await Promise.all([
      supabase.from("producao_planejada").select("*").eq("projeto_id", projetoId).single(),
      supabase.from("projeto_pessoas_plano").select("escala_id, planta_id, pessoas_escalas(nome)").eq("projeto_id", projetoId).single(),
      supabase.from("producao_real_diaria").select("toneladas, data").eq("projeto_id", projetoId),
    ]);

    const escalaNome = (pessoasPlano?.pessoas_escalas as any)?.nome ?? "";
    const diasMes = DIAS_ESCALA[escalaNome] ?? 30;

    let prodDia = 0, prodMesP = 0, prodH = 0;
    if (prodPlan) {
      prodH = prodPlan.prod_hora;
      prodDia = prodPlan.prod_hora * 24 * (prodPlan.disponibilidade / 100) * (1 - prodPlan.perda / 100) * (1 - prodPlan.umidade / 100);
      prodMesP = prodDia * diasMes;
    }
    setProdHoraPrev(prodH);
    setProdDiaPrev(prodDia);
    setProdMesPrev(prodMesP);

    // Impostos
    try {
      const { data: ic } = await supabase.from("impostos_config").select("estado_destino").eq("projeto_id", projetoId).single();
      if (ic?.estado_destino) setEstadoDestino(ic.estado_destino);
    } catch (_) {}

    // ── Custos planejados ───────────────────────────────────────────────────
    const [
      { data: custosDiretos }, { data: sgaPlan }, { data: roloMats },
      { data: fretePlan }, { data: logisticaPlan },
    ] = await Promise.all([
      supabase.from("custos_diretos").select("receita, custo_unitario, custo_frete").eq("projeto_id", projetoId),
      supabase.from("sga_planejado").select("horas, custo").eq("projeto_id", projetoId),
      supabase.from("rolo_materiais").select("custo_rolo").eq("projeto_id", projetoId),
      supabase.from("frete_planejado").select("custo_por_ton").eq("projeto_id", projetoId).single(),
      supabase.from("logistica_planejado").select("custo_unitario, quantidade").eq("projeto_id", projetoId),
    ]);

    const planCD = prodMesP > 0 ? (custosDiretos ?? []).reduce((s: number, r: any) => s + (r.receita / 100) * prodMesP * (r.custo_unitario + r.custo_frete), 0) : 0;
    const planSGA = (sgaPlan ?? []).reduce((s: number, r: any) => s + r.horas * r.custo, 0);
    const planRolo = (roloMats ?? []).reduce((s: number, r: any) => s + r.custo_rolo, 0);
    const planFrete = fretePlan?.custo_por_ton && prodMesP > 0 ? fretePlan.custo_por_ton * prodMesP : 0;
    const planLogistica = (logisticaPlan ?? []).reduce((s: number, r: any) => s + r.custo_unitario * r.quantidade, 0);

    let planPessoas = 0;
    if (pessoasPlano) {
      const { data: tmpl } = await supabase.from("pessoas_template").select("quantidade, pessoas_funcoes(custo_unitario)").eq("escala_id", pessoasPlano.escala_id).eq("planta_id", pessoasPlano.planta_id);
      planPessoas = (tmpl ?? []).reduce((s: number, r: any) => s + r.quantidade * r.pessoas_funcoes.custo_unitario, 0);
    }

    const totalPlan = planCD + planPessoas + planSGA + planRolo + planFrete + planLogistica;
    setTotalPlanMes(totalPlan);

    // ── Meses disponíveis ───────────────────────────────────────────────────
    const [{ data: estMes }, { data: pessMes }, { data: sgaMes }, { data: prodDiaMes }, { data: freteMes }] = await Promise.all([
      supabase.from("estoque_movimentacoes").select("created_at").eq("projeto_id", projetoId),
      supabase.from("pessoas_realizado").select("mes").eq("projeto_id", projetoId),
      supabase.from("sga_realizado").select("mes").eq("projeto_id", projetoId),
      supabase.from("producao_real_diaria").select("data").eq("projeto_id", projetoId),
      supabase.from("frete_realizado").select("data_cte").eq("projeto_id", projetoId),
    ]);
    const allMeses = new Set<string>();
    (estMes ?? []).forEach((r: any) => allMeses.add(r.created_at.slice(0,7)));
    (pessMes ?? []).forEach((r: any) => allMeses.add(r.mes.slice(0,7)));
    (sgaMes ?? []).forEach((r: any) => allMeses.add(r.mes.slice(0,7)));
    (prodDiaMes ?? []).forEach((r: any) => allMeses.add(r.data.slice(0,7)));
    (freteMes ?? []).forEach((r: any) => allMeses.add(r.data_cte.slice(0,7)));
    const mesesList = Array.from(allMeses).sort((a,b) => b.localeCompare(a));
    setMeses(mesesList);

    const mesAtivo = mes || mesesList[0] || "";
    if (!mes && mesesList[0]) setMesSelecionado(mesesList[0]);

    // ── Real do mês ─────────────────────────────────────────────────────────
    let realCD = 0, realPessoas = 0, realSGA = 0, realFrete = 0, realLog = 0, prodReal = 0, dias = 0;

    if (mesAtivo) {
      const mesStart = mesAtivo + "-01";
      const mesEnd = mesAtivo + "-31";
      const [{ data: estR }, { data: pessR }, { data: sgaR }, { data: prodR }, { data: freteR }, { data: logR }] = await Promise.all([
        supabase.from("estoque_movimentacoes").select("custo_total").eq("projeto_id", projetoId).eq("tipo","CONSUMO").gte("data", mesStart).lte("data", mesEnd),
        supabase.from("pessoas_realizado").select("custo_total").eq("projeto_id", projetoId).gte("mes", mesStart).lte("mes", mesEnd),
        supabase.from("sga_realizado").select("custo").eq("projeto_id", projetoId).gte("mes", mesStart).lte("mes", mesEnd),
        supabase.from("producao_real_diaria").select("toneladas, data").eq("projeto_id", projetoId).gte("data", mesStart).lte("data", mesEnd),
        supabase.from("frete_realizado").select("custo_cte").eq("projeto_id", projetoId).gte("data_cte", mesStart).lte("data_cte", mesEnd),
        supabase.from("logistica_realizado").select("custo_unitario, quantidade").eq("projeto_id", projetoId).gte("mes", mesStart).lte("mes", mesEnd),
      ]);
      realCD = (estR ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
      realPessoas = (pessR ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
      realSGA = (sgaR ?? []).reduce((s: number, r: any) => s + r.custo, 0);
      realFrete = (freteR ?? []).reduce((s: number, r: any) => s + r.custo_cte, 0);
      realLog = (logR ?? []).reduce((s: number, r: any) => s + r.custo_unitario * r.quantidade, 0);
      prodReal = (prodR ?? []).reduce((s: number, r: any) => s + r.toneladas, 0);
      dias = (prodR ?? []).length;
    }

    const totalReal = realCD + realPessoas + realSGA + realFrete + realLog;
    setProdMesReal(prodReal);
    setDiasComProd(dias);
    setTotalRealMes(totalReal);

    setCategorias([
      { label: "Custos Diretos (MP)", planejado: planCD, real: realCD, aba: "custos-diretos" },
      { label: "Mão de Obra (Pessoas)", planejado: planPessoas, real: realPessoas, aba: "pessoas" },
      { label: "SG&A", planejado: planSGA, real: realSGA, aba: "sga" },
      { label: "Rolo", planejado: planRolo, real: 0, aba: "rolo" },
      { label: "Frete", planejado: planFrete, real: realFrete, aba: "frete" },
      { label: "Logística Interna", planejado: planLogistica, real: realLog, aba: "logistica-interna" },
      { label: "Utilidades", planejado: 0, real: 0, aba: "utilidades" },
      { label: "Manutenção", planejado: 0, real: 0, aba: "manutencao" },
      { label: "Outros Custos", planejado: 0, real: 0, aba: "outros-custos" },
    ]);

    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // Cálculos derivados
  const icms = estadoDestino ? ICMS_SP[estadoDestino] ?? 0 : 0;
  const totalPlan = categorias.reduce((s, c) => s + c.planejado, 0);
  const totalReal = categorias.reduce((s, c) => s + c.real, 0);
  const custoPlanTon = prodMesPrev > 0 ? totalPlan / prodMesPrev : 0;
  const custoRealTon = prodMesReal > 0 ? totalReal / prodMesReal : 0;
  const totalPlanComImp = estadoDestino ? calcComImposto(totalPlan, icms) : 0;
  const totalRealComImp = estadoDestino && totalReal > 0 ? calcComImposto(totalReal, icms) : 0;
  const prodDiaReal = diasComProd > 0 ? prodMesReal / diasComProd : 0;
  const prodHoraReal = prodDiaReal > 0 ? prodDiaReal / 24 : 0;

  const totalDiff = totalReal - totalPlan;
  const custoPlanTonComImp = estadoDestino ? calcComImposto(custoPlanTon, icms) : 0;
  const custoRealTonComImp = estadoDestino && custoRealTon > 0 ? calcComImposto(custoRealTon, icms) : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando resumo...
    </div>
  );

  // ── Helpers de card ─────────────────────────────────────────────────────
  const Card = ({ label, value, sub, color = "#e8eaf0", bg = "rgba(255,255,255,0.03)", border = "rgba(255,255,255,0.07)" }: { label: string; value: string; sub?: string; color?: string; bg?: string; border?: string }) => (
    <div className="rounded-xl px-4 py-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs mb-1.5" style={{ color: "#5a607a" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: "#5a607a" }}>{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Seletor de mês */}
      <div>
        <p className="text-xs font-semibold mb-3" style={{ color: "#8890a8" }}>MÊS DE REFERÊNCIA PARA CUSTO REAL</p>
        {meses.length === 0 ? (
          <p className="text-sm" style={{ color: "#5a607a" }}>Nenhum custo real registrado ainda.</p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {meses.map(m => (
              <button key={m} onClick={() => { setMesSelecionado(m); load(m); }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={mesSelecionado === m
                  ? { background: "rgba(85,96,248,0.2)", border: "1.5px solid rgba(85,96,248,0.5)", color: "#e8eaf0" }
                  : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                {fmtMes(m)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ══ PLANEJAMENTO ══════════════════════════════════════════════════════ */}
      <section className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(85,96,248,0.05)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#5560f8" }} />
            <span className="text-sm font-bold tracking-wide" style={{ color: "#7585fd" }}>PLANEJAMENTO</span>
            {estadoDestino && <span className="text-xs px-2 py-0.5 rounded-full ml-2" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>Imposto → {estadoDestino} (ICMS {icms}%)</span>}
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Produção prevista/hora"
            value={prodHoraPrev > 0 ? `${fmt(prodHoraPrev, 2)} t/h` : "—"}
            color="#7585fd" bg="rgba(85,96,248,0.06)" border="rgba(85,96,248,0.15)" />
          <Card label="Produção prevista/dia"
            value={prodDiaPrev > 0 ? `${fmt(prodDiaPrev, 2)} t/dia` : "—"}
            color="#7585fd" bg="rgba(85,96,248,0.06)" border="rgba(85,96,248,0.15)" />
          <Card label="Produção prevista/mês"
            value={prodMesPrev > 0 ? `${fmt(prodMesPrev, 1)} t/mês` : "—"}
            color="#7585fd" bg="rgba(85,96,248,0.06)" border="rgba(85,96,248,0.15)" />
          <Card label="Custo/tonelada previsto (sem imposto)"
            value={custoPlanTon > 0 ? `R$ ${fmt(custoPlanTon, 2)}/t` : "—"}
            sub={estadoDestino && custoPlanTonComImp > 0 ? `Com imposto: R$ ${fmt(custoPlanTonComImp, 2)}/t` : undefined}
            color="#e8eaf0" />
          <Card label="Total previsto do mês (sem imposto)"
            value={totalPlan > 0 ? `R$ ${fmt(totalPlan)}` : "—"}
            color="#e8eaf0" />
          <Card label={`Total previsto com imposto${estadoDestino ? ` (→ ${estadoDestino})` : ""}`}
            value={totalPlanComImp > 0 ? `R$ ${fmt(totalPlanComImp)}` : estadoDestino ? "—" : "Configure estado na aba Impostos"}
            sub={totalPlanComImp > 0 ? `+${fmt((totalPlanComImp/totalPlan - 1)*100, 1)}% sobre o total` : undefined}
            color={totalPlanComImp > 0 ? "#ef4444" : "#3d425a"}
            bg={totalPlanComImp > 0 ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)"}
            border={totalPlanComImp > 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)"} />
        </div>
      </section>

      {/* ══ CUSTO REAL ════════════════════════════════════════════════════════ */}
      <section className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(34,197,94,0.04)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span className="text-sm font-bold tracking-wide" style={{ color: "#22c55e" }}>CUSTO REAL</span>
            {mesSelecionado && <span className="text-xs px-2 py-0.5 rounded-full ml-2" style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}>{fmtMes(mesSelecionado)}</span>}
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card label="Produção real/hora"
            value={prodHoraReal > 0 ? `${fmt(prodHoraReal, 1)} t/h` : "—"}
            sub={diasComProd > 0 ? `média de ${diasComProd} dia${diasComProd > 1 ? "s" : ""}` : undefined}
            color="#22c55e" bg="rgba(34,197,94,0.06)" border="rgba(34,197,94,0.15)" />
          <Card label="Produção real/dia"
            value={prodDiaReal > 0 ? `${fmt(prodDiaReal, 2)} t/dia` : "—"}
            sub={diasComProd > 0 ? `média do mês` : undefined}
            color="#22c55e" bg="rgba(34,197,94,0.06)" border="rgba(34,197,94,0.15)" />
          <Card label="Produção real do mês"
            value={prodMesReal > 0 ? `${fmt(prodMesReal, 1)} t` : "—"}
            sub={prodMesPrev > 0 ? `${fmt((prodMesReal/prodMesPrev)*100, 1)}% do previsto` : undefined}
            color="#22c55e" bg="rgba(34,197,94,0.06)" border="rgba(34,197,94,0.15)" />
          <Card label="Custo/tonelada real (sem imposto)"
            value={custoRealTon > 0 ? `R$ ${fmt(custoRealTon, 2)}/t` : "—"}
            sub={estadoDestino && custoRealTonComImp > 0 ? `Com imposto: R$ ${fmt(custoRealTonComImp, 2)}/t` : undefined}
            color="#e8eaf0" />
          <Card label="Total real do mês (sem imposto)"
            value={totalReal > 0 ? `R$ ${fmt(totalReal)}` : "—"}
            sub={totalPlan > 0 && totalReal > 0 ? `${totalDiff > 0 ? "+" : ""}${fmt((totalDiff/totalPlan)*100, 1)}% vs planejado` : undefined}
            color="#e8eaf0" />
          <Card label={`Total real com imposto${estadoDestino ? ` (→ ${estadoDestino})` : ""}`}
            value={totalRealComImp > 0 ? `R$ ${fmt(totalRealComImp)}` : totalReal > 0 && estadoDestino ? "—" : "—"}
            sub={totalRealComImp > 0 ? `+${fmt((totalRealComImp/totalReal - 1)*100, 1)}% sobre o total` : undefined}
            color={totalRealComImp > 0 ? "#ef4444" : "#3d425a"}
            bg={totalRealComImp > 0 ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.02)"}
            border={totalRealComImp > 0 ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)"} />
        </div>
      </section>

      {/* ══ DETALHAMENTO POR CATEGORIA ════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <BarChart3 size={16} style={{ color: "#7585fd" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Detalhamento por Categoria</h3>
          {prodMesPrev > 0 && <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>Custos diretos sobre {fmt(prodMesPrev, 1)} t previstas</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>Categoria</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#7585fd" }}>Planejado (R$/mês)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#7585fd" }}>Plan. (R$/ton)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#22c55e" }}>Real {mesSelecionado ? fmtMes(mesSelecionado) : ""}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#22c55e" }}>Real (R$/ton)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>Diferença</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>% Variação</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(cat => {
                const diff = cat.real - cat.planejado;
                const pct = cat.planejado > 0 ? (diff / cat.planejado) * 100 : 0;
                const semDados = cat.planejado === 0 && cat.real === 0;
                const planTon = prodMesPrev > 0 && cat.planejado > 0 ? cat.planejado / prodMesPrev : 0;
                const realTon = prodMesReal > 0 && cat.real > 0 ? cat.real / prodMesReal : 0;
                return (
                  <tr key={cat.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium" style={{ color: semDados ? "#3d425a" : "#e8eaf0" }}>{cat.label}</span>
                      {semDados && <span className="ml-2 text-xs" style={{ color: "#3d425a" }}>— não configurado</span>}
                    </td>
                    <td className="px-5 py-3 text-right"><span className="text-sm font-semibold" style={{ color: cat.planejado > 0 ? "#7585fd" : "#3d425a" }}>{cat.planejado > 0 ? `R$ ${fmt(cat.planejado)}` : "—"}</span></td>
                    <td className="px-5 py-3 text-right"><span className="text-xs" style={{ color: planTon > 0 ? "#5560f8" : "#3d425a" }}>{planTon > 0 ? `R$ ${fmt(planTon, 2)}` : "—"}</span></td>
                    <td className="px-5 py-3 text-right"><span className="text-sm font-semibold" style={{ color: cat.real > 0 ? "#22c55e" : "#3d425a" }}>{cat.real > 0 ? `R$ ${fmt(cat.real)}` : "—"}</span></td>
                    <td className="px-5 py-3 text-right"><span className="text-xs" style={{ color: realTon > 0 ? "#16a34a" : "#3d425a" }}>{realTon > 0 ? `R$ ${fmt(realTon, 2)}` : "—"}</span></td>
                    <td className="px-5 py-3 text-right">
                      {!semDados && (cat.planejado > 0 || cat.real > 0) ? (
                        <span className="text-sm font-semibold flex items-center justify-end gap-1" style={{ color: diff > 0 ? "#ef4444" : diff < 0 ? "#22c55e" : "#5a607a" }}>
                          {diff > 0 ? <TrendingUp size={12} /> : diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                          {diff > 0 ? "+" : ""}{fmt(diff)}
                        </span>
                      ) : <span style={{ color: "#3d425a" }}>—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {cat.planejado > 0 && cat.real > 0 ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: pct > 5 ? "rgba(239,68,68,0.15)" : pct < -5 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)", color: pct > 5 ? "#ef4444" : pct < -5 ? "#22c55e" : "#8890a8" }}>
                          {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
                        </span>
                      ) : <span style={{ color: "#3d425a" }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.06)" }}>
                <td className="px-5 py-4 font-bold text-xs tracking-widest" style={{ color: "#8890a8" }}>TOTAL GERAL</td>
                <td className="px-5 py-4 text-right"><span className="text-base font-bold" style={{ color: "#7585fd" }}>R$ {fmt(totalPlan)}</span></td>
                <td className="px-5 py-4 text-right"><span className="text-xs font-bold" style={{ color: "#5560f8" }}>{custoPlanTon > 0 ? `R$ ${fmt(custoPlanTon, 2)}/t` : "—"}</span></td>
                <td className="px-5 py-4 text-right"><span className="text-base font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalReal)}</span></td>
                <td className="px-5 py-4 text-right"><span className="text-xs font-bold" style={{ color: "#16a34a" }}>{custoRealTon > 0 ? `R$ ${fmt(custoRealTon, 2)}/t` : "—"}</span></td>
                <td className="px-5 py-4 text-right">
                  <span className="text-base font-bold" style={{ color: totalDiff > 0 ? "#ef4444" : totalDiff < 0 ? "#22c55e" : "#5a607a" }}>
                    {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  {totalPlan > 0 && totalReal > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: totalDiff > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: totalDiff > 0 ? "#ef4444" : "#22c55e" }}>
                      {totalDiff > 0 ? "+" : ""}{totalPlan > 0 ? ((totalDiff / totalPlan) * 100).toFixed(1) : 0}%
                    </span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
