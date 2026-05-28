"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Loader2, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";

interface Props { projetoId: string; }
const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMes = (iso: string) => { try { const [y,m]=iso.split("-"); const ms=["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]; return `${ms[parseInt(m)-1]}/${y}`; } catch { return iso; } };

interface CatData { label: string; planejado: number; real: number; aba: string; }

export default function Resumo({ projetoId }: Props) {
  const [loading, setLoading] = useState(true);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesSelecionado, setMesSelecionado] = useState("");
  const [categorias, setCategorias] = useState<CatData[]>([]);

  const load = useCallback(async (mes?: string) => {
    setLoading(true);

    // ── Planejado ─────────────────────────────────────────────────────────
    const [
      { data: custosDiretos },
      { data: sgaPlan },
      { data: pessoasPlano },
      { data: roloMats },
    ] = await Promise.all([
      supabase.from("custos_diretos").select("quantidade, custo_unitario, custo_frete").eq("projeto_id", projetoId),
      supabase.from("sga_planejado").select("custo").eq("projeto_id", projetoId),
      supabase.from("projeto_pessoas_plano").select("escala_id, planta_id").eq("projeto_id", projetoId).single(),
      supabase.from("rolo_materiais").select("custo_rolo").eq("projeto_id", projetoId),
    ]);

    const planCustosDiretos = (custosDiretos ?? []).reduce((s: number, r: any) => s + r.quantidade * (r.custo_unitario + r.custo_frete), 0);
    const planSGA = (sgaPlan ?? []).reduce((s: number, r: any) => s + r.custo, 0);
    const planRolo = (roloMats ?? []).reduce((s: number, r: any) => s + r.custo_rolo, 0);

    // Pessoas: buscar template
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
    const [{ data: estMes }, { data: pessMes }, { data: sgaMes }] = await Promise.all([
      supabase.from("estoque_movimentacoes").select("created_at").eq("projeto_id", projetoId),
      supabase.from("pessoas_realizado").select("mes").eq("projeto_id", projetoId),
      supabase.from("sga_realizado").select("mes").eq("projeto_id", projetoId),
    ]);

    const allMeses = new Set<string>();
    (estMes ?? []).forEach((r: any) => allMeses.add(r.created_at.slice(0,7)));
    (pessMes ?? []).forEach((r: any) => allMeses.add(r.mes.slice(0,7)));
    (sgaMes ?? []).forEach((r: any) => allMeses.add(r.mes.slice(0,7)));
    const mesesList = Array.from(allMeses).sort((a,b) => b.localeCompare(a));
    setMeses(mesesList);

    const mesAtivo = mes || mesesList[0] || "";
    if (!mes && mesesList[0]) setMesSelecionado(mesesList[0]);

    // ── Real do mês ───────────────────────────────────────────────────────
    let realCustosDiretos = 0;
    let realPessoas = 0;
    let realSGA = 0;

    if (mesAtivo) {
      const mesStart = mesAtivo + "-01";
      const mesEnd = mesAtivo + "-31";

      const [{ data: estReal }, { data: pessReal }, { data: sgaReal }] = await Promise.all([
        supabase.from("estoque_movimentacoes").select("custo_total, tipo").eq("projeto_id", projetoId)
          .in("tipo", ["CONSUMO","PERDA"]).gte("data", mesStart).lte("data", mesEnd),
        supabase.from("pessoas_realizado").select("custo_total").eq("projeto_id", projetoId)
          .gte("mes", mesStart).lte("mes", mesEnd),
        supabase.from("sga_realizado").select("custo").eq("projeto_id", projetoId)
          .gte("mes", mesStart).lte("mes", mesEnd),
      ]);

      realCustosDiretos = (estReal ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
      realPessoas = (pessReal ?? []).reduce((s: number, r: any) => s + r.custo_total, 0);
      realSGA = (sgaReal ?? []).reduce((s: number, r: any) => s + r.custo, 0);
    }

    setCategorias([
      { label: "Custos Diretos (MP)", planejado: planCustosDiretos, real: realCustosDiretos, aba: "custos-diretos" },
      { label: "Mão de Obra (Pessoas)", planejado: planPessoas, real: realPessoas, aba: "pessoas" },
      { label: "SG&A", planejado: planSGA, real: realSGA, aba: "sga" },
      { label: "Rolo", planejado: planRolo, real: 0, aba: "rolo" },
      { label: "Utilidades", planejado: 0, real: 0, aba: "utilidades" },
      { label: "Manutenção", planejado: 0, real: 0, aba: "manutencao" },
      { label: "Logística Interna", planejado: 0, real: 0, aba: "logistica-interna" },
      { label: "Frete", planejado: 0, real: 0, aba: "frete" },
      { label: "Impostos", planejado: 0, real: 0, aba: "impostos" },
      { label: "Outros Custos", planejado: 0, real: 0, aba: "outros-custos" },
    ]);

    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  const totalPlan = categorias.reduce((s, c) => s + c.planejado, 0);
  const totalReal = categorias.reduce((s, c) => s + c.real, 0);
  const totalDiff = totalReal - totalPlan;

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando resumo...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Seletor de mês */}
      <div>
        <p className="text-xs font-semibold mb-3" style={{ color: "#8890a8" }}>MÊS DE REFERÊNCIA PARA CUSTO REAL</p>
        {meses.length === 0 ? (
          <p className="text-sm" style={{ color: "#5a607a" }}>Nenhum custo real registrado ainda. Os valores de planejamento já aparecem abaixo.</p>
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

      {/* Cards de totais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5 text-center" style={{ border: "1px solid rgba(85,96,248,0.2)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#5560f8" }} />
            <span className="text-xs font-bold" style={{ color: "#7585fd" }}>TOTAL PLANEJADO</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlan)}</p>
          <p className="text-xs mt-1" style={{ color: "#5a607a" }}>custo mensal estimado</p>
        </div>
        <div className="glass rounded-2xl p-5 text-center" style={{ border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "#22c55e" }} />
            <span className="text-xs font-bold" style={{ color: "#22c55e" }}>TOTAL REAL {mesSelecionado ? fmtMes(mesSelecionado) : ""}</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalReal)}</p>
          <p className="text-xs mt-1" style={{ color: "#5a607a" }}>{mesSelecionado ? "custo real do mês" : "selecione um mês"}</p>
        </div>
        <div className="glass rounded-2xl p-5 text-center" style={{ border: `1px solid ${totalDiff > 0 ? "rgba(239,68,68,0.2)" : totalDiff < 0 ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.07)"}` }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            {totalDiff > 0 ? <TrendingUp size={14} style={{ color: "#ef4444" }} /> : totalDiff < 0 ? <TrendingDown size={14} style={{ color: "#22c55e" }} /> : <Minus size={14} style={{ color: "#5a607a" }} />}
            <span className="text-xs font-bold" style={{ color: totalDiff > 0 ? "#ef4444" : totalDiff < 0 ? "#22c55e" : "#5a607a" }}>DIFERENÇA</span>
          </div>
          <p className="text-2xl font-bold" style={{ color: "#e8eaf0" }}>
            {totalDiff > 0 ? "+" : ""}{fmt(totalDiff)}
          </p>
          <p className="text-xs mt-1" style={{ color: totalDiff > 0 ? "#ef4444" : totalDiff < 0 ? "#22c55e" : "#5a607a" }}>
            {totalDiff > 0 ? "▲ acima do planejado" : totalDiff < 0 ? "▼ abaixo do planejado" : "dentro do planejado"}
          </p>
        </div>
      </div>

      {/* Tabela por categoria */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <BarChart3 size={16} style={{ color: "#7585fd" }} />
          <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>Detalhamento por Categoria</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>Categoria</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#7585fd" }}>Planejado (R$/mês)</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#22c55e" }}>Real {mesSelecionado ? fmtMes(mesSelecionado) : "(R$)"}</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>Diferença</th>
                <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>% Variação</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map(cat => {
                const diff = cat.real - cat.planejado;
                const pct = cat.planejado > 0 ? (diff / cat.planejado) * 100 : 0;
                const semDados = cat.planejado === 0 && cat.real === 0;
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
                      <span className="text-sm font-semibold" style={{ color: cat.real > 0 ? "#22c55e" : "#3d425a" }}>
                        {cat.real > 0 ? `R$ ${fmt(cat.real)}` : "—"}
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
                <td className="px-5 py-4 text-right"><span className="text-base font-bold" style={{ color: "#22c55e" }}>R$ {fmt(totalReal)}</span></td>
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
