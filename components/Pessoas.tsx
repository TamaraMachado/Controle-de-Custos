"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Users, Factory, Check, Plus, X, Upload,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown,
  Minus, Loader2, AlertCircle, FileSpreadsheet, Trash2
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Escala { id: string; nome: string; }
interface Planta { id: string; nome: string; }
interface PlanoRow { funcao: string; quantidade: number; total: number; }
interface RealizadoRow {
  id: string; mes: string; funcao: string;
  quantidade: number; custo_total: number; horas_extras: number;
}
interface Props { projetoId: string; }

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtMes = (iso: string) => {
  const [y, m] = iso.split("-");
  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return `${meses[parseInt(m) - 1]}/${y}`;
};

// ─── Component ───────────────────────────────────────────────────────────────
export default function Pessoas({ projetoId }: Props) {
  const [escalas, setEscalas] = useState<Escala[]>([]);
  const [plantas, setPlantas] = useState<Planta[]>([]);
  const [escalaId, setEscalaId] = useState("");
  const [plantaId, setPlantaId] = useState("");
  const [plano, setPlano] = useState<PlanoRow[]>([]);
  const [realizado, setRealizado] = useState<RealizadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingPlano, setLoadingPlano] = useState(false);
  const [showNovaEscala, setShowNovaEscala] = useState(false);
  const [showNovaPlanta, setShowNovaPlanta] = useState(false);
  const [novaEscala, setNovaEscala] = useState("");
  const [novaPlanta, setNovaPlanta] = useState("");
  const [showRealizado, setShowRealizado] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load meta ─────────────────────────────────────────────────────────────
  const loadMeta = useCallback(async () => {
    const [{ data: e }, { data: p }] = await Promise.all([
      supabase.from("pessoas_escalas").select("*").order("nome"),
      supabase.from("pessoas_plantas").select("*").order("nome"),
    ]);
    setEscalas(e ?? []);
    setPlantas(p ?? []);
    setLoading(false);
  }, []);

  // ── Load planejado ────────────────────────────────────────────────────────
  const loadPlano = useCallback(async (eid: string, pid: string) => {
    if (!eid || !pid) { setPlano([]); return; }
    setLoadingPlano(true);
    // Join template → funcoes, custo unitário NÃO exposto ao cliente
    const { data } = await supabase
      .from("pessoas_template")
      .select("quantidade, ordem, pessoas_funcoes(nome, custo_unitario)")
      .eq("escala_id", eid)
      .eq("planta_id", pid)
      .order("ordem");

    if (data) {
      const rows: PlanoRow[] = data.map((r: any) => ({
        funcao: r.pessoas_funcoes.nome,
        quantidade: r.quantidade,
        total: r.quantidade * r.pessoas_funcoes.custo_unitario,
      }));
      setPlano(rows);
    } else {
      setPlano([]);
    }
    setLoadingPlano(false);
  }, []);

  // ── Load realizado ────────────────────────────────────────────────────────
  const loadRealizado = useCallback(async () => {
    const { data } = await supabase
      .from("pessoas_realizado")
      .select("*")
      .eq("projeto_id", projetoId)
      .order("mes", { ascending: false });
    setRealizado(data ?? []);
  }, [projetoId]);

  useEffect(() => { loadMeta(); loadRealizado(); }, [loadMeta, loadRealizado]);
  useEffect(() => { loadPlano(escalaId, plantaId); }, [escalaId, plantaId, loadPlano]);

  // ── Totais ────────────────────────────────────────────────────────────────
  const totalPlanejado = plano.reduce((s, r) => s + r.total, 0);
  const totalPessoas = plano.reduce((s, r) => s + r.quantidade, 0);

  // Agrupa realizado por mês
  const mesList = Array.from(new Set(realizado.map(r => r.mes))).sort((a, b) => b.localeCompare(a));
  const realizadoPorMes = (mes: string) => {
    const rows = realizado.filter(r => r.mes === mes);
    return {
      total: rows.reduce((s, r) => s + r.custo_total, 0),
      horas_extras: rows.reduce((s, r) => s + r.horas_extras, 0),
      pessoas: rows.reduce((s, r) => s + r.quantidade, 0),
    };
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

  // ── Upload Excel/CSV ──────────────────────────────────────────────────────
  // Formato esperado: Mês (YYYY-MM) | Função | Quantidade | Custo Total | Horas Extras
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setUploading(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) throw new Error("Arquivo vazio ou sem dados.");

      // Detectar separador
      const sep = lines[0].includes(";") ? ";" : ",";
      const rows: Omit<RealizadoRow, "id">[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ""));
        if (cols.length < 4) continue;
        const [mesRaw, funcao, qtdStr, custoStr, hextraStr] = cols;
        if (!mesRaw || !funcao) continue;

        // Normalizar mês: aceita YYYY-MM, MM/YYYY, Mês/YYYY
        let mes = mesRaw;
        if (/^\d{2}\/\d{4}$/.test(mes)) mes = `${mes.slice(3)}-${mes.slice(0,2)}-01`;
        else if (/^\d{4}-\d{2}$/.test(mes)) mes = `${mes}-01`;

        const custo = parseFloat(custoStr.replace(/\./g, "").replace(",", ".")) || 0;
        const hextra = parseFloat((hextraStr ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
        const qtd = parseInt(qtdStr) || 0;

        rows.push({
          projeto_id: projetoId,
          escala_id: escalaId || null,
          planta_id: plantaId || null,
          mes,
          funcao,
          quantidade: qtd,
          custo_total: custo,
          horas_extras: hextra,
        } as any);
      }

      if (rows.length === 0) throw new Error("Nenhuma linha válida encontrada. Verifique o formato.");

      const { error } = await supabase.from("pessoas_realizado").insert(rows);
      if (error) throw new Error("Erro ao salvar: " + error.message);

      await loadRealizado();
    } catch (err: any) {
      setUploadError(err.message ?? "Erro ao processar arquivo.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const deletarMes = async (mes: string) => {
    await supabase.from("pessoas_realizado")
      .delete().eq("projeto_id", projetoId).eq("mes", mes);
    setDeleteConfirm(null);
    await loadRealizado();
  };

  const escalaNome = escalas.find(e => e.id === escalaId)?.nome ?? "";
  const plantaNome = plantas.find(p => p.id === plantaId)?.nome ?? "";

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ══ SELETORES ════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Escala */}
        <div className="glass rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users size={14} style={{ color: "#7585fd" }} />
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
              <Factory size={14} style={{ color: "#7585fd" }} />
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

      {/* ══ PLANEJADO ════════════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.25)" }}>
              <TrendingUp size={15} style={{ color: "#7585fd" }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>Custo Planejado de MO</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>
                {escalaId && plantaId ? `${escalaNome} × ${plantaNome}` : "Selecione escala e planta"}
              </p>
            </div>
          </div>
          {plano.length > 0 && (
            <div className="text-right">
              <p className="text-xs" style={{ color: "#5a607a" }}>Total mensal</p>
              <p className="text-lg font-bold" style={{ color: "#7585fd" }}>R$ {fmt(totalPlanejado)}</p>
              <p className="text-xs" style={{ color: "#5a607a" }}>{totalPessoas} pessoas</p>
            </div>
          )}
        </div>

        {!escalaId || !plantaId ? (
          <div className="flex items-center justify-center py-10" style={{ color: "#5a607a" }}>
            <p className="text-sm">Selecione uma escala e uma planta acima</p>
          </div>
        ) : loadingPlano ? (
          <div className="flex items-center justify-center py-10" style={{ color: "#5a607a" }}>
            <Loader2 size={18} className="animate-spin mr-2" />Carregando planejamento...
          </div>
        ) : plano.length === 0 ? (
          <div className="flex items-center justify-center py-10 flex-col gap-2" style={{ color: "#5a607a" }}>
            <p className="text-sm">Sem template cadastrado para esta combinação.</p>
            <p className="text-xs">Configure a tabela <code style={{ color: "#7585fd" }}>pessoas_template</code> no banco de dados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th className="px-5 py-3 text-left text-xs font-semibold" style={{ color: "#8890a8" }}>Função / Cargo</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold" style={{ color: "#8890a8" }}>Quantidade</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold" style={{ color: "#8890a8" }}>Custo Mensal (R$)</th>
                </tr>
              </thead>
              <tbody>
                {plano.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <td className="px-5 py-2.5">
                      <span className="text-xs font-medium" style={{ color: r.quantidade === 0 ? "#3d425a" : "#e8eaf0" }}>{r.funcao}</span>
                    </td>
                    <td className="px-5 py-2.5 text-center">
                      <span className="text-xs font-bold" style={{ color: r.quantidade === 0 ? "#3d425a" : "#7585fd" }}>{r.quantidade}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <span className="text-xs" style={{ color: r.total === 0 ? "#3d425a" : "#e8eaf0" }}>
                        {r.total > 0 ? `R$ ${fmt(r.total)}` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid rgba(255,255,255,0.1)", background: "rgba(85,96,248,0.08)" }}>
                  <td className="px-5 py-3 text-xs font-bold tracking-widest" style={{ color: "#8890a8" }}>TOTAL</td>
                  <td className="px-5 py-3 text-center">
                    <span className="text-sm font-bold" style={{ color: "#7585fd" }}>{totalPessoas} pessoas</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-sm font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlanejado)}</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ══ EXECUTADO ════════════════════════════════════════════════════════ */}
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
              <p className="text-xs" style={{ color: "#5a607a" }}>Dados reais por mês (importação via CSV)</p>
            </div>
          </div>
          {showRealizado ? <ChevronUp size={15} style={{ color: "#5a607a" }} /> : <ChevronDown size={15} style={{ color: "#5a607a" }} />}
        </button>

        {showRealizado && (
          <div className="p-5 space-y-4">
            {/* Upload */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium" style={{ color: "#8890a8" }}>Importar arquivo CSV</p>
                <a href="#" onClick={e => { e.preventDefault(); }}
                  className="text-xs" style={{ color: "#5560f8" }}
                  title="Formato: Mês (YYYY-MM) | Função | Quantidade | Custo Total | Horas Extras">
                  Ver formato esperado
                </a>
              </div>

              {/* Formato esperado */}
              <div className="mb-3 px-3 py-2 rounded-xl text-xs font-mono" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", color: "#5a607a" }}>
                <p className="font-semibold mb-1" style={{ color: "#8890a8" }}>Formato CSV (separado por ; ou ,):</p>
                <p>Mês;Função;Quantidade;Custo Total;Horas Extras</p>
                <p>2026-05;Operador 2 - Aglo;4;45000,00;2500,00</p>
                <p>2026-05;Mecânico;4;48000,00;0</p>
              </div>

              <div className="flex items-center gap-3">
                <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="btn-primary py-2 px-4 text-xs"
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploading ? "Importando..." : "Carregar CSV"}
                </button>
                {uploadError && (
                  <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}>
                    <AlertCircle size={12} />{uploadError}
                  </div>
                )}
              </div>
            </div>

            {/* Tabela de meses */}
            {mesList.length === 0 ? (
              <div className="flex items-center justify-center py-8 flex-col gap-2" style={{ color: "#5a607a" }}>
                <FileSpreadsheet size={24} style={{ opacity: 0.4 }} />
                <p className="text-sm">Nenhum dado importado ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {mesList.map(mes => {
                  const real = realizadoPorMes(mes);
                  const diff = real.total - totalPlanejado;
                  const hasPlan = totalPlanejado > 0;
                  return (
                    <div key={mes} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                      {/* Cabeçalho do mês */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: "rgba(255,255,255,0.03)" }}>
                        <span className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>{fmtMes(mes)}</span>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs" style={{ color: "#5a607a" }}>Executado</p>
                            <p className="text-sm font-bold" style={{ color: "#22c55e" }}>R$ {fmt(real.total)}</p>
                          </div>
                          {hasPlan && (
                            <div className="text-right">
                              <p className="text-xs" style={{ color: "#5a607a" }}>vs Planejado</p>
                              <p className="text-sm font-bold flex items-center gap-1"
                                style={{ color: diff > 0 ? "#ef4444" : diff < 0 ? "#22c55e" : "#5a607a" }}>
                                {diff > 0 ? <TrendingUp size={12} /> : diff < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
                                {diff > 0 ? "+" : ""}{fmt(diff)}
                              </p>
                            </div>
                          )}
                          {real.horas_extras > 0 && (
                            <div className="text-right">
                              <p className="text-xs" style={{ color: "#5a607a" }}>Horas extras</p>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══ PAINEL COMPARATIVO ═══════════════════════════════════════════════ */}
      {plano.length > 0 && mesList.length > 0 && (
        <div className="glass rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: "#e8eaf0" }}>Painel Comparativo</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl p-4 text-center" style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }}>
              <p className="text-xs mb-1" style={{ color: "#7585fd" }}>PLANEJADO / MÊS</p>
              <p className="text-xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(totalPlanejado)}</p>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>{totalPessoas} pessoas · {escalaNome}</p>
            </div>
            {mesList.slice(0, 1).map(mes => {
              const real = realizadoPorMes(mes);
              const diff = real.total - totalPlanejado;
              const pct = totalPlanejado > 0 ? (diff / totalPlanejado) * 100 : 0;
              return (
                <>
                  <div key="real" className="rounded-xl p-4 text-center" style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <p className="text-xs mb-1" style={{ color: "#22c55e" }}>EXECUTADO · {fmtMes(mes)}</p>
                    <p className="text-xl font-bold" style={{ color: "#e8eaf0" }}>R$ {fmt(real.total)}</p>
                    {real.horas_extras > 0 && <p className="text-xs mt-1" style={{ color: "#f59e0b" }}>+R$ {fmt(real.horas_extras)} em H.E.</p>}
                  </div>
                  <div key="diff" className="rounded-xl p-4 text-center" style={{
                    background: diff > 0 ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)",
                    border: `1px solid ${diff > 0 ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
                  }}>
                    <p className="text-xs mb-1" style={{ color: diff > 0 ? "#ef4444" : "#22c55e" }}>DIFERENÇA</p>
                    <p className="text-xl font-bold" style={{ color: "#e8eaf0" }}>
                      {diff > 0 ? "+" : ""}{fmt(diff)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: diff > 0 ? "#ef4444" : "#22c55e" }}>
                      {diff > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% {diff > 0 ? "acima" : "abaixo"} do planejado
                    </p>
                  </div>
                </>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
