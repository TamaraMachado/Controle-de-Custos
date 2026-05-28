"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3, Factory } from "lucide-react";

interface Props { projetoId: string; }
const fmt = (v: number, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtMes = (iso: string) => { try { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; } catch { return iso; } };

const DIAS_ESCALA: Record<string, number> = { "6x2": 30, "6x1": 26, "5x2": 25 };

interface CatData { label: string; planejado: number; real: number; aba: string; }

export default function Resumo({ projetoId }: Props) {
  const [loading, setLoading] = useState(true);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [categorias, setCategorias] = useState<CatData[]>([]);
  const [producaoPrevista, setProducaoPrevista] = useState(0);
  const [producaoRealTotal, setProducaoRealTotal] = useState(0);
  const [producaoRealMes, setProducaoRealMes] = useState(0);

  const load = useCallback(async (mes?: string) => {
    setLoading(true);

    // ── Produção ──────────────────────────────────────────────────────────
    const [{ data: prodPlan }, { data: pessoasPlano }, { data: prodReal }] = await Promise.all([
      supabase.from("producao_planejada").select("*").eq("projeto_id", projetoId).single(),
      supabase.from("projeto_pessoas_plano").select("escala_id, planta_id, pessoas_escalas(nome)").eq("projeto_id", projetoId).single(),
      supabase.from("producao_real_diaria").select("toneladas, data").eq("projeto_id", projetoId),
    ]);

    const escalaNome = (pessoasPlano?.pessoas_escalas as any)?.nome ?? "";
    const diasMes = DIAS_ESCALA[escalaNome] ?? 30;

    let prodMesPrevista = 0;
    if (prodPlan) {
      const prodDia = prodPlan.prod_hora * 24 * (prodPlan.disponibilidade / 100) * (1 - prodPlan.perda / 100) * (1 - prodPlan.umidade / 100);
      prodMesPrevista = prodDia * diasMes;
    }
    setProducaoPrevista(prodMesPrevista);

    const totalRealProd = (prodReal ?? []).reduce((s: number, r: any) => s + r.toneladas, 0);
    setProducaoRealTotal(totalRealProd);

    // ── Planejado ──────────────────────────────────────────────────────────
    const [
      { data: custosDiretos },
      { data: sgaPlan },
      { data: roloMats },
      { data: fretePlan },
    ] = await Promise.all([
      supabase.from("custos_diretos").select("receita, custo_unitario, custo_frete").eq("projeto_id", projetoId),
      supabase.from("sga_planejado").select("custo").eq("projeto_id", projetoId),
      supabase.from("rolo_materiais").select("custo_rolo").eq("projeto_id", projetoId),
      supabase.from("frete_planejado").select("custo_por_ton").eq("projeto_id", projetoId).single(),
    ]);

    // Custo direto planejado = receita% × produção prevista × custo_mp
    const planCustosDiretos = prodMesPrevista > 0
      ? (custosDiretos ?? []).reduce((s: number, r: any) => s + (r.receita / 100) * prodMesPrevista * (r.custo_unitario + r.custo_frete), 0)
      : (custosDiretos ?? []).reduce((s: number, r: any) => s + 0, 0); // zero se sem produção

    const planSGA = (sgaPlan ?? []).reduce((s: number, r: any) => s + r.custo, 0);
    const planRolo = (roloMats ?? []).reduce((s: number, r: any) => s + r.custo_rolo, 0);
    const planFrete = fretePlan?.custo_por_ton && prodMesPrevista > 0
      ? fretePlan.custo_por_ton * prodMesPrevista
      : 0;

    let planPessoas = 0;
    if (pessoasPlano) {
      const { data: template } = await supabase
        .from("pessoas_template")
        .select("quantidade, pessoas_funcoes(custo_unitario)")
        .eq("escala_id", pessoasPlano.escala_id)
        .eq("planta_id", pessoasPlano.planta_id);
      planPessoas = (template ?? []).reduce((s: number, r: any) => s + r.quantidade * r.pessoas_funcoes.custo_unitario, 0);
    }

    // ── Meses disponíveis ──────────────────────────────────────────────────
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

    // ── Real do mês selecionado ───────────────────────────────────────────
      let realCustosDiretos = 0;
      let realPessoas = 0;
      let realSGA = 0;
      let realFrete = 0;
      let prodRealDoMes = 0;

      if (mesAtivo) {
        const mesStart = mesAtivo + "-01";
        const mesEnd = mesAtivo + "-31";

        const [{ data: estReal }, { data: pessReal }, { data: sgaReal }, { data: prodMesReal }, { data: freteReal }] = await Promise.all([
          supabase.from("estoque_movimentacoes").select("custo_total").eq("projeto_id", projetoId)
            .eq("tipo", "CONSUMO").gte("data", mesStart).lte("data", mesEnd),
          supabase.from("pessoas_realizado").select("custo_total").eq("projeto_id", projetoId)
            .gte("mes", mesStart).lte("mes", mesEnd),
          supabase.from("sga_realizado").select("custo").eq("projeto_id", projetoId)
            .gte("mes", mesStart).lte("mes", mesEnd),
          supabase.from("producao_real_diaria").select("toneladas").eq("projeto_id", projetoId)
            .gte("data", mesStart).lte("data", mesEnd),
          supabase.from("frete_realizado").select("custo_cte").eq("projeto_id", projetoId)
            .gte("data_cte", mesStart).lte("data_cte", mesEnd),
        ]);

        realCustosDiretos = (estReal ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
        realPessoas = (pessReal ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
        realSGA = (sgaReal ?? []).reduce((s: number, r: any) => s + r.custo, 0);
        realFrete = (freteReal ?? []).reduce((s: number, r: any) => s + r.custo_cte, 0);
        prodRealDoMes = (prodMesReal ?? []).reduce((s: number, r: any) => s + r.toneladas, 0);
      }

    setProducaoRealMes(prodRealDoMes);

    setCategorias([
      { label: "Custos Diretos (MP)", planejado: planCustosDiretos, real: realCustosDiretos, aba: "custos-diretos" },
      { label: "Mão de Obra (Pessoas)", planejado: planPessoas, real: realPessoas, aba: "pessoas" },
      { label: "SG&A", planejado: planSGA, real: realSGA, aba: "sga" },
      { label: "Rolo", planejado: planRolo, real: 0, aba: "rolo" },
      { label: "Frete", planejado: planFrete, real: realFrete, aba: "frete" },
      { label: "Utilidades", planejado: 0, real: 0, aba: "utilidades" },
      { label: "Manutenção", planejado: 0, real: 0, aba: "manutencao" },
      { label: "Logística Interna", planejado: 0, real: 0, aba: "logistica-interna" },
      { label: "Impostos", planejado: 0, real: 0, aba: "impostos" },
      { label: "Outros Custos", planejado: 0, real: 0, aba: "outros-custos" },
    ]);

    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  const totalPlan = categorias.reduce((s, c) => s + c.planejado, 0);
  const totalReal = categorias.reduce((s, c) => s + c.real, 0);
  const totalDiff = totalReal - totalPlan;

  // Custo por tonelada
  const custoPlanPorTon = producaoPrevista > 0 ? totalPlan / producaoPrevista : 0;
  const custoRealPorTon = producaoRealMes > 0 ? totalReal / producaoRealMes : 0;

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando resumo...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Seletor de mês ── */}
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

      {/* ── Produção (referência) ── */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Factory size={15} style={{ color: "#7585fd" }} />
          <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Produção — Referência</span>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "#5a607a" }}>não soma no custo/ton</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Produção prevista/mês", value: producaoPrevista > 0 ? `${fmt(producaoPrevista, 1)} t` : "—", color: "#7585fd", bg: "rgba(85,96,248,0.1)", border: "rgba(85,96,248,0.2)" },
            { label: `Produção real ${mesSelecionado ? fmtMes(mesSelecionado) : ""}`, value: producaoRealMes > 0 ? `${fmt(producaoRealMes, 1)} t` : "—", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.2)" },
            { label: "Total real acumulado", value: producaoRealTotal > 0 ? `${fmt(producaoRealTotal, 1)} t` : "—", color: "#8890a8", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.1)" },
            { label: "Atingimento do mês",
              value: producaoPrevista > 0 && producaoRealMes > 0 ? `${fmt((producaoRealMes / producaoPrevista) * 100, 1)}%` : "—",
              color: producaoRealMes >= producaoPrevista ? "#22c55e" : "#ef4444",
              bg: producaoRealMes >= producaoPrevista ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              border: producaoRealMes >= producaoPrevista ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)" },
          ].map(item => (
            <div key={item.label} className="rounded-xl px-4 py-3" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
              <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
              <p className="text-xl font-bold" style={{ color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Cards de totais de custo ── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="glass rounded-2xl p-5 text-center" style={{ border: "1px solid rgba(85,96,248,0.2)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#5560f8" }} />
            <span className="text-xs font-bold" style={{ color: "#7585fd" }}>TOTAL PLANEJADO</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlan)}</p>
          {custoPlanPorTon > 0 && <p className="text-xs mt-1" style={{ color: "#7585fd" }}>R$ {fmt(custoPlanPorTon, 2)}/ton</p>}
        </div>
        <div className="glass rounded-2xl p-5 text-center" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span className="text-xs font-bold" style={{ color: "#22c55e" }}>TOTAL REAL {mesSelecionado ? fmtMes(mesSelecionado) : ""}</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalReal)}</p>
          {custoRealPorTon > 0 && <p className="text-xs mt-1" style={{ color: "#22c55e" }}>R$ {fmt(custoRealPorTon, 2)}/ton</p>}
        </div>
        <div className="glass rounded-2xl p-5 text-center" style={{ border: `1px solid ${totalDiff > 0 ? "rgba(239,68,68,0.2)" : totalDiff < 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}` }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            {totalDiff > 0 ? <TrendingUp size={14} style={{ color: "#ef4444" }} /> : totalDiff < 0 ? <TrendingDown size={14} style={{ color: "#22c55e" }} /> : <Minus size={14} style={{ color: "#5a607a" }} />}
            <span className="text-xs font-bold" style={{ color: totalDiff > 0 ? "#ef4444" : totalDiff < 0 ? "#22c55e" : "#5a607a" }}>DIFERENÇA</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>{totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}</p>
          {custoPlanPorTon > 0 && custoRealPorTon > 0 && (
            <p className="text-xs mt-1" style={{ color: totalDiff > 0 ? "#ef4444" : "#22c55e" }}>
              {totalDiff > 0 ? "+" : ""}R$ {fmt(custoRealPorTon - custoPlanPorTon, 2)}/ton
            </p>
          )}
        </div>
        {custoPlanPorTon > 0 && (
          <div className="glass rounded-2xl p-5 text-center" style={{ border: "1px solid rgba(245,158,11,0.2)" }}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-xs font-bold" style={{ color: "#f59e0b" }}>CUSTO/TON</span>
            </div>
            <p className="text-lg font-bold" style={{ color: "#f59e0b" }}>Plan: R$ {fmt(custoPlanPorTon, 2)}</p>
            {custoRealPorTon > 0 && <p className="text-lg font-bold" style={{ color: custoRealPorTon > custoPlanPorTon ? "#ef4444" : "#22c55e" }}>Real: R$ {fmt(custoRealPorTon, 2)}</p>}
          </div>
        )}
      </div>

      {/* ── Tabela por categoria ── */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <BarChart3 size={16} style={{ color: "#7585fd" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Detalhamento por Categoria</h3>
          {producaoPrevista > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(85,96,248,0.15)", color: "#7585fd" }}>
              Custos diretos calculados sobre {fmt(producaoPrevista, 1)} t previstas
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>Categoria</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#7585fd" }}>Planejado (R$/mês)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#7585fd" }}>Plan. (R$/ton)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#22c55e" }}>Real {mesSelecionado ? fmtMes(mesSelecionado) : "(R$)"}</th>
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
                const planTon = producaoPrevista > 0 && cat.planejado > 0 ? cat.planejado / producaoPrevista : 0;
                const realTon = producaoRealMes > 0 && cat.real > 0 ? cat.real / producaoRealMes : 0;
                return (
                  <tr key={cat.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-5 py-3">
                      <span className="text-sm font-medium" style={{ color: semDados ? "#3d425a" : "#e8eaf0" }}>{cat.label}</span>
                      {semDados && <span className="ml-2 text-xs" style={{ color: "#3d425a" }}>— não configurado</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-semibold" style={{ color: cat.planejado > 0 ? "#7585fd" : "#3d425a" }}>
                        {cat.planejado > 0 ? `R$ ${fmt(cat.planejado)}` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs" style={{ color: planTon > 0 ? "#5560f8" : "#3d425a" }}>
                        {planTon > 0 ? `R$ ${fmt(planTon, 2)}` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-sm font-semibold" style={{ color: cat.real > 0 ? "#22c55e" : "#3d425a" }}>
                        {cat.real > 0 ? `R$ ${fmt(cat.real)}` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className="text-xs" style={{ color: realTon > 0 ? "#16a34a" : "#3d425a" }}>
                        {realTon > 0 ? `R$ ${fmt(realTon, 2)}` : "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {!semDados && (cat.planejado > 0 || cat.real > 0) ? (
                        <span className="text-sm font-semibold flex items-center justify-end gap-1"
                          style={{ color: diff > 0 ? "#ef4444" : diff < 0 ? "#22c55e" : "#5a607a" }}>
                          {diff > 0 ? <TrendingUp size={12} /> : diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                          {diff > 0 ? "+" : ""}{fmt(diff)}
                        </span>
                      ) : <span style={{ color: "#3d425a" }}>—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {cat.planejado > 0 && cat.real > 0 ? (
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                          style={{ background: pct > 5 ? "rgba(239,68,68,0.15)" : pct < -5 ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.08)", color: pct > 5 ? "#ef4444" : pct < -5 ? "#22c55e" : "#8890a8" }}>
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
                <td className="px-5 py-4 text-right"><span className="text-xs font-bold" style={{ color: "#5560f8" }}>{custoPlanPorTon > 0 ? `R$ ${fmt(custoPlanPorTon, 2)}/t` : "—"}</span></td>
                <td className="px-5 py-4 text-right"><span className="text-base font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalReal)}</span></td>
                <td className="px-5 py-4 text-right"><span className="text-xs font-bold" style={{ color: "#16a34a" }}>{custoRealPorTon > 0 ? `R$ ${fmt(custoRealPorTon, 2)}/t` : "—"}</span></td>
                <td className="px-5 py-4 text-right">
                  <span className="text-base font-bold" style={{ color: totalDiff > 0 ? "#ef4444" : totalDiff < 0 ? "#22c55e" : "#5a607a" }}>
                    {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  {totalPlan > 0 && totalReal > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md"
                      style={{ background: totalDiff > 0 ? "rgba(239,68,68,0.15)" : "rgba(34,197,94,0.15)", color: totalDiff > 0 ? "#ef4444" : "#22c55e" }}>
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
