"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  RotateCcw, Plus, Pencil, Save, X, Loader2,
  History, ChevronDown, ChevronUp, AlertCircle, Check
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface Material {
  id: string;
  nome: string;
  durabilidade_historica: number;
  custo_rolo: number;
  taxa_cambio: number;
}

interface Troca {
  id: string;
  material_id: string;
  data_troca: string;
  numero_rolo: string;
  desenho: string;
  custo: number;
  toneladas_produzidas: number | null;
  created_at: string;
}

interface HistoricoRow {
  id: string;
  troca_id: string | null;
  descricao_item: string;
  campo: string;
  valor_anterior: string;
  valor_novo: string;
  alterado_por: string;
  observacao: string;
  alterado_em: string;
}

interface Props { projetoId: string; }

type EstadoMaterial = "novo" | "salvo" | "editando";

const fmt = (v: number, d = 2) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const DEFAULTS: Record<string, { durabilidade_historica: number; custo_rolo: number; taxa_cambio: number }> = {
  "Material carbonoso": { durabilidade_historica: 6000, custo_rolo: 236000, taxa_cambio: 5.80 },
  "Material ferroso":   { durabilidade_historica: 8000, custo_rolo: 250000, taxa_cambio: 5.80 },
};

const TABS = ["Material carbonoso", "Material ferroso"];

// ─── Component ───────────────────────────────────────────────────────────────
export default function Rolo({ projetoId }: Props) {
  const [materiais, setMateriais] = useState<Material[]>([]);
  const [trocas, setTrocas] = useState<Troca[]>([]);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabAtiva, setTabAtiva] = useState(TABS[0]);
  const [showHistorico, setShowHistorico] = useState(false);

  // Form do material (usado em novo e editando)
  const [form, setForm] = useState({ durabilidade_historica: "", custo_rolo: "", taxa_cambio: "" });
  const [estado, setEstado] = useState<EstadoMaterial>("novo");

  // Modal de salvar
  const [showSalvarModal, setShowSalvarModal] = useState(false);
  const [salvoPor, setSalvoPor] = useState("");
  const [salvarObs, setSalvarObs] = useState("");
  const [salvarError, setSalvarError] = useState("");
  const [saving, setSaving] = useState(false);

  // Nova troca
  const [showNovaTroca, setShowNovaTroca] = useState(false);
  const [novaTroca, setNovaTroca] = useState({
    data_troca: new Date().toISOString().split("T")[0],
    numero_rolo: "", desenho: "", custo: "", tons_anterior: ""
  });
  const [novaTrocaError, setNovaTrocaError] = useState("");
  const [savingTroca, setSavingTroca] = useState(false);
  const [novaTrocaWho, setNovaTrocaWho] = useState("");

  // Edição inline de troca
  const [editandoTroca, setEditandoTroca] = useState<string | null>(null);
  const [trocaForm, setTrocaForm] = useState<Partial<Troca>>({});
  const [trocaEditWho, setTrocaEditWho] = useState("");
  const [trocaEditObs, setTrocaEditObs] = useState("");
  const [showTrocaSaveModal, setShowTrocaSaveModal] = useState(false);
  const [savingTrocaEdit, setSavingTrocaEdit] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: mats }, { data: troc }, { data: hist }] = await Promise.all([
      supabase.from("rolo_materiais").select("*").eq("projeto_id", projetoId).order("nome"),
      supabase.from("rolo_trocas").select("*").eq("projeto_id", projetoId).order("data_troca", { ascending: false }),
      supabase.from("rolo_historico").select("*").eq("projeto_id", projetoId).order("alterado_em", { ascending: false }).limit(60),
    ]);
    setMateriais(mats ?? []);
    setTrocas(troc ?? []);
    setHistorico(hist ?? []);
    setLoading(false);
  }, [projetoId]);

  useEffect(() => { load(); }, [load]);

  // ── Quando muda a aba, define o estado e o form ───────────────────────────
  useEffect(() => {
    const mat = materiais.find(m => m.nome === tabAtiva);
    if (mat) {
      setEstado("salvo");
    } else {
      // Pré-preenche com defaults
      const d = DEFAULTS[tabAtiva] ?? { durabilidade_historica: 0, custo_rolo: 0, taxa_cambio: 5.80 };
      setForm({
        durabilidade_historica: String(d.durabilidade_historica),
        custo_rolo: String(d.custo_rolo),
        taxa_cambio: String(d.taxa_cambio),
      });
      setEstado("novo");
    }
  }, [tabAtiva, materiais]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const matAtual = materiais.find(m => m.nome === tabAtiva) ?? null;
  const trocasDaMat = matAtual
    ? trocas.filter(t => t.material_id === matAtual.id).sort((a, b) => new Date(b.data_troca).getTime() - new Date(a.data_troca).getTime())
    : [];

  const custoPorTon = (m: Material) =>
    m.durabilidade_historica > 0 ? m.custo_rolo / m.durabilidade_historica : 0;
  const custoPorTonUSD = (m: Material) =>
    m.taxa_cambio > 0 ? custoPorTon(m) / m.taxa_cambio : 0;
  const custoRealPorTon = (t: Troca) =>
    t.toneladas_produzidas && t.toneladas_produzidas > 0 ? t.custo / t.toneladas_produzidas : null;

  // Preview dos campos em edição
  const formDur = parseFloat(form.durabilidade_historica) || 0;
  const formCusto = parseFloat(form.custo_rolo) || 0;
  const formTaxa = parseFloat(form.taxa_cambio) || 5.80;
  const previewCustoTon = formDur > 0 ? formCusto / formDur : 0;
  const previewCustoTonUSD = formTaxa > 0 ? previewCustoTon / formTaxa : 0;

  // ── Iniciar edição ────────────────────────────────────────────────────────
  const iniciarEditar = () => {
    if (!matAtual) return;
    setForm({
      durabilidade_historica: String(matAtual.durabilidade_historica),
      custo_rolo: String(matAtual.custo_rolo),
      taxa_cambio: String(matAtual.taxa_cambio),
    });
    setEstado("editando");
  };

  const cancelarEdicao = () => setEstado("salvo");

  // ── Salvar material ───────────────────────────────────────────────────────
  const requestSalvar = () => {
    setSalvoPor(""); setSalvarObs(""); setSalvarError("");
    setShowSalvarModal(true);
  };

  const confirmarSalvar = async () => {
    if (!salvoPor.trim()) { setSalvarError("Informe quem está salvando."); return; }
    setSaving(true); setSalvarError("");

    const payload = {
      projeto_id: projetoId,
      nome: tabAtiva,
      durabilidade_historica: formDur,
      custo_rolo: formCusto,
      taxa_cambio: formTaxa,
      updated_at: new Date().toISOString(),
    };

    if (estado === "editando" && matAtual) {
      // Registrar histórico das mudanças
      const campos = [
        { key: "durabilidade_historica", label: "Durabilidade histórica (ton)", ant: matAtual.durabilidade_historica, nov: formDur },
        { key: "custo_rolo", label: "Custo do rolo (R$)", ant: matAtual.custo_rolo, nov: formCusto },
        { key: "taxa_cambio", label: "Taxa de câmbio", ant: matAtual.taxa_cambio, nov: formTaxa },
      ].filter(c => c.ant !== c.nov);

      if (campos.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const changes: any[] = campos.map(c => ({
          projeto_id: projetoId,
          troca_id: null,
          descricao_item: tabAtiva,
          campo: c.label,
          valor_anterior: fmt(c.ant),
          valor_novo: fmt(c.nov),
          alterado_por: salvoPor,
          observacao: salvarObs,
        }));
        await supabase.from("rolo_historico").insert(changes);
      }
      await supabase.from("rolo_materiais").update(payload).eq("id", matAtual.id);
    } else {
      // Novo
      await supabase.from("rolo_materiais").insert([payload]);
    }

    setShowSalvarModal(false);
    setSaving(false);
    await load();
  };

  // ── Nova troca ────────────────────────────────────────────────────────────
  const ultimaTroca = trocasDaMat[0] ?? null;

  const registrarTroca = async () => {
    if (!novaTroca.data_troca) { setNovaTrocaError("Informe a data."); return; }
    if (!novaTrocaWho.trim()) { setNovaTrocaError("Informe quem está registrando."); return; }
    if (!matAtual) return;
    setSavingTroca(true); setNovaTrocaError("");

    if (ultimaTroca && novaTroca.tons_anterior) {
      const tonsAnterior = parseFloat(novaTroca.tons_anterior) || 0;
      await supabase.from("rolo_historico").insert([{
        projeto_id: projetoId, troca_id: ultimaTroca.id,
        descricao_item: `Rolo ${ultimaTroca.numero_rolo || ultimaTroca.id.slice(0,8)}`,
        campo: "Toneladas produzidas",
        valor_anterior: ultimaTroca.toneladas_produzidas != null ? String(ultimaTroca.toneladas_produzidas) : "—",
        valor_novo: String(tonsAnterior),
        alterado_por: novaTrocaWho,
        observacao: `Preenchido ao registrar nova troca (${novaTroca.numero_rolo || "sem número"})`,
      }]);
      await supabase.from("rolo_trocas").update({ toneladas_produzidas: tonsAnterior }).eq("id", ultimaTroca.id);
    }

    const { data: nova } = await supabase.from("rolo_trocas").insert([{
      projeto_id: projetoId, material_id: matAtual.id,
      data_troca: novaTroca.data_troca, numero_rolo: novaTroca.numero_rolo,
      desenho: novaTroca.desenho, custo: parseFloat(novaTroca.custo) || 0,
      toneladas_produzidas: null,
    }]).select().single();

    if (nova) {
      await supabase.from("rolo_historico").insert([{
        projeto_id: projetoId, troca_id: nova.id,
        descricao_item: `Rolo ${novaTroca.numero_rolo || nova.id.slice(0,8)}`,
        campo: "Troca registrada", valor_anterior: "—",
        valor_novo: `${novaTroca.numero_rolo || "s/n"} · ${novaTroca.data_troca}`,
        alterado_por: novaTrocaWho, observacao: "",
      }]);
    }

    setNovaTroca({ data_troca: new Date().toISOString().split("T")[0], numero_rolo: "", desenho: "", custo: "", tons_anterior: "" });
    setNovaTrocaWho(""); setShowNovaTroca(false); setSavingTroca(false);
    await load();
  };

  // ── Editar troca ──────────────────────────────────────────────────────────
  const iniciarEditTroca = (t: Troca) => { setEditandoTroca(t.id); setTrocaForm({ ...t }); setTrocaEditWho(""); setTrocaEditObs(""); };
  const requestSalvarTroca = () => { setTrocaEditWho(""); setTrocaEditObs(""); setShowTrocaSaveModal(true); };

  const confirmarSalvarTroca = async () => {
    if (!trocaEditWho.trim() || !editandoTroca) return;
    setSavingTrocaEdit(true);
    const original = trocas.find(t => t.id === editandoTroca)!;
    const campos = [
      { key: "data_troca", label: "Data" },
      { key: "numero_rolo", label: "Nº Rolo" },
      { key: "desenho", label: "Desenho" },
      { key: "custo", label: "Custo (R$)" },
      { key: "toneladas_produzidas", label: "Toneladas produzidas" },
    ] as { key: keyof Troca; label: string }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const changes: any[] = [];
    for (const c of campos) {
      if (String(original[c.key] ?? "") !== String(trocaForm[c.key] ?? "")) {
        changes.push({
          projeto_id: projetoId, troca_id: editandoTroca,
          descricao_item: `Rolo ${original.numero_rolo || original.id.slice(0,8)}`,
          campo: c.label, valor_anterior: String(original[c.key] ?? "—"),
          valor_novo: String(trocaForm[c.key] ?? "—"),
          alterado_por: trocaEditWho, observacao: trocaEditObs,
        });
      }
    }
    if (changes.length > 0) await supabase.from("rolo_historico").insert(changes);
    await supabase.from("rolo_trocas").update({
      data_troca: trocaForm.data_troca, numero_rolo: trocaForm.numero_rolo,
      desenho: trocaForm.desenho, custo: trocaForm.custo,
      toneladas_produzidas: trocaForm.toneladas_produzidas ?? null,
    }).eq("id", editandoTroca);
    setEditandoTroca(null); setShowTrocaSaveModal(false); setSavingTrocaEdit(false);
    await load();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20" style={{ color: "#5a607a" }}>
      <Loader2 size={20} className="animate-spin mr-2" />Carregando...
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ══ TABS ═════════════════════════════════════════════════════════════ */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => {
          const salvo = !!materiais.find(m => m.nome === tab);
          return (
            <button key={tab} onClick={() => setTabAtiva(tab)}
              className="px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2"
              style={tabAtiva === tab
                ? { background: "rgba(85,96,248,0.2)", border: "1.5px solid rgba(85,96,248,0.5)", color: "#e8eaf0" }
                : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
              <RotateCcw size={11} />
              {tab}
              {salvo && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e" }} />}
            </button>
          );
        })}
      </div>

      {/* ══ CARD DO MATERIAL ════════════════════════════════════════════════ */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(85,96,248,0.12)", border: "1px solid rgba(85,96,248,0.2)" }}>
              <RotateCcw size={15} style={{ color: "#7585fd" }} />
            </div>
            <div>
              <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>{tabAtiva}</h3>
              <p className="text-xs" style={{ color: "#5a607a" }}>
                {estado === "novo" ? "Valores padrão — confirme para salvar" : estado === "editando" ? "Editando valores" : "Dados salvos para este projeto"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            {estado === "salvo" && (
              <button onClick={iniciarEditar} className="btn-primary py-1.5 px-3 text-xs">
                <Pencil size={12} />Editar
              </button>
            )}
            {estado === "editando" && (
              <>
                <button onClick={cancelarEdicao}
                  className="px-3 py-1.5 rounded-xl text-xs transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                  <X size={12} className="inline mr-1" />Cancelar
                </button>
                <button onClick={requestSalvar} className="btn-primary py-1.5 px-3 text-xs"
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  <Save size={12} />Salvar
                </button>
              </>
            )}
            {estado === "novo" && (
              <button onClick={requestSalvar} className="btn-primary py-2 px-4 text-xs"
                style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                <Save size={12} />Salvar planejamento
              </button>
            )}
          </div>
        </div>

        <div className="p-5">
          {/* Modo leitura */}
          {estado === "salvo" && matAtual && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Durabilidade histórica", value: `${fmt(matAtual.durabilidade_historica, 0)} ton`, color: "#e8eaf0" },
                { label: "Custo do rolo", value: `R$ ${fmt(matAtual.custo_rolo)}`, color: "#e8eaf0" },
                { label: "Custo R$/ton", value: `R$ ${fmt(custoPorTon(matAtual))}`, color: "#7585fd" },
                { label: "Custo US$/ton", value: `$ ${fmt(custoPorTonUSD(matAtual), 2)}`, color: "#22c55e" },
              ].map(item => (
                <div key={item.label} className="rounded-xl px-4 py-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs mb-1" style={{ color: "#5a607a" }}>{item.label}</p>
                  <p className="text-lg font-bold" style={{ color: item.color }}>{item.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Modo edição / novo */}
          {(estado === "novo" || estado === "editando") && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "Durabilidade histórica (ton)", key: "durabilidade_historica", placeholder: "0" },
                  { label: "Custo do rolo (R$)", key: "custo_rolo", placeholder: "0,00" },
                  { label: "Taxa de câmbio R$/US$", key: "taxa_cambio", placeholder: "5,80" },
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>{f.label}</label>
                    <input type="number" step="0.01"
                      value={(form as Record<string, string>)[f.key]}
                      onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                      className="input-field text-sm" placeholder={f.placeholder} />
                  </div>
                ))}
              </div>
              {/* Preview calculado */}
              {formDur > 0 && formCusto > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(85,96,248,0.08)", border: "1px solid rgba(85,96,248,0.15)" }}>
                    <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo R$/ton (calculado)</p>
                    <p className="text-lg font-bold" style={{ color: "#7585fd" }}>R$ {fmt(previewCustoTon)}</p>
                  </div>
                  <div className="rounded-xl px-4 py-3" style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }}>
                    <p className="text-xs mb-1" style={{ color: "#5a607a" }}>Custo US$/ton (calculado)</p>
                    <p className="text-lg font-bold" style={{ color: "#22c55e" }}>$ {fmt(previewCustoTonUSD, 2)}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ HISTÓRICO DE TROCAS (só aparece quando material está salvo) ══════ */}
      {estado === "salvo" && matAtual && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 className="text-sm font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
              Histórico de Trocas · {tabAtiva}
            </h3>
            <button onClick={() => setShowNovaTroca(true)} className="btn-primary py-2 px-4 text-xs">
              <Plus size={13} />Nova troca
            </button>
          </div>

          {/* Formulário nova troca */}
          {showNovaTroca && (
            <div className="p-5 space-y-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(85,96,248,0.04)" }}>
              <p className="text-xs font-semibold" style={{ color: "#7585fd" }}>Registrar nova troca de rolo</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Data da troca *</label>
                  <input type="date" value={novaTroca.data_troca} onChange={e => setNovaTroca(p => ({ ...p, data_troca: e.target.value }))}
                    className="input-field text-xs py-2" style={{ color: "#e8eaf0" }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Número do rolo</label>
                  <input value={novaTroca.numero_rolo} onChange={e => setNovaTroca(p => ({ ...p, numero_rolo: e.target.value }))}
                    className="input-field text-xs py-2" placeholder="Ex: R-001" style={{ color: "#e8eaf0" }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Desenho</label>
                  <input value={novaTroca.desenho} onChange={e => setNovaTroca(p => ({ ...p, desenho: e.target.value }))}
                    className="input-field text-xs py-2" placeholder="Ex: DES-4521" style={{ color: "#e8eaf0" }} />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Custo do rolo (R$)</label>
                  <input type="number" step="0.01" value={novaTroca.custo} onChange={e => setNovaTroca(p => ({ ...p, custo: e.target.value }))}
                    className="input-field text-xs py-2" placeholder="0,00" style={{ color: "#e8eaf0" }} />
                </div>
                {ultimaTroca && (
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: "#f59e0b" }}>
                      Toneladas produzidas pelo rolo anterior
                      {ultimaTroca.numero_rolo && <span style={{ color: "#5a607a" }}> ({ultimaTroca.numero_rolo})</span>}
                    </label>
                    <input type="number" step="0.01" value={novaTroca.tons_anterior} onChange={e => setNovaTroca(p => ({ ...p, tons_anterior: e.target.value }))}
                      className="input-field text-xs py-2" placeholder="ton — deixe em branco se não souber ainda"
                      style={{ color: "#f59e0b", borderColor: "rgba(245,158,11,0.3)" }} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "#8890a8" }}>Registrado por *</label>
                  <input value={novaTrocaWho} onChange={e => setNovaTrocaWho(e.target.value)}
                    className="input-field text-xs py-2" placeholder="Seu nome" style={{ color: "#e8eaf0" }} />
                </div>
              </div>
              {novaTrocaError && (
                <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}>
                  <AlertCircle size={12} />{novaTrocaError}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowNovaTroca(false); setNovaTrocaError(""); }}
                  className="px-4 py-2 rounded-xl text-xs font-medium"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>
                  <X size={12} className="inline mr-1" />Cancelar
                </button>
                <button onClick={registrarTroca} disabled={savingTroca}
                  className="btn-primary py-2 px-5 text-xs"
                  style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {savingTroca ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                  Registrar troca
                </button>
              </div>
            </div>
          )}

          {/* Tabela */}
          {trocasDaMat.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2" style={{ color: "#5a607a" }}>
              <RotateCcw size={24} style={{ opacity: 0.3 }} />
              <p className="text-sm">Nenhuma troca registrada.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {["Data","Nº Rolo","Desenho","Custo (R$)","Ton. Produzidas","Custo/ton (R$)","Custo/ton (US$)",""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold whitespace-nowrap" style={{ color: "#8890a8" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trocasDaMat.map((t, idx) => {
                    const isEditing = editandoTroca === t.id;
                    const isAtual = idx === 0;
                    const custoRealTon = custoRealPorTon(t);
                    const custoRealTonUSD = custoRealTon && matAtual.taxa_cambio > 0 ? custoRealTon / matAtual.taxa_cambio : null;
                    return (
                      <tr key={t.id} className="group"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isAtual ? "rgba(85,96,248,0.04)" : "transparent" }}
                        onMouseEnter={e => !isAtual && (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
                        onMouseLeave={e => !isAtual && (e.currentTarget.style.background = "transparent")}>
                        <td className="px-4 py-2.5">
                          {isEditing
                            ? <input type="date" value={trocaForm.data_troca} onChange={e => setTrocaForm(p => ({ ...p, data_troca: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-32" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs" style={{ color: "#e8eaf0" }}>
                                {new Date(t.data_troca + "T12:00:00").toLocaleDateString("pt-BR")}
                                {isAtual && <span className="ml-2 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(85,96,248,0.2)", color: "#7585fd" }}>Atual</span>}
                              </span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing
                            ? <input value={trocaForm.numero_rolo ?? ""} onChange={e => setTrocaForm(p => ({ ...p, numero_rolo: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-24" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs font-medium" style={{ color: "#e8eaf0" }}>{t.numero_rolo || "—"}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing
                            ? <input value={trocaForm.desenho ?? ""} onChange={e => setTrocaForm(p => ({ ...p, desenho: e.target.value }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded focus:bg-white/5 w-28" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs" style={{ color: "#8890a8" }}>{t.desenho || "—"}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing
                            ? <input type="number" step="0.01" value={trocaForm.custo ?? ""} onChange={e => setTrocaForm(p => ({ ...p, custo: parseFloat(e.target.value) || 0 }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5 w-28" style={{ color: "#e8eaf0" }} />
                            : <span className="text-xs" style={{ color: "#e8eaf0" }}>R$ {fmt(t.custo)}</span>}
                        </td>
                        <td className="px-4 py-2.5">
                          {isEditing
                            ? <input type="number" step="0.01" value={trocaForm.toneladas_produzidas ?? ""} onChange={e => setTrocaForm(p => ({ ...p, toneladas_produzidas: e.target.value ? parseFloat(e.target.value) : null }))} className="bg-transparent outline-none text-xs px-2 py-1 rounded text-right focus:bg-white/5 w-28" style={{ color: "#f59e0b" }} placeholder={isAtual ? "aguardando..." : "0"} />
                            : <span className="text-xs" style={{ color: isAtual ? "#3d425a" : "#f59e0b" }}>{t.toneladas_produzidas != null ? `${fmt(t.toneladas_produzidas, 2)} ton` : (isAtual ? "— aguardando" : "—")}</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-xs font-semibold" style={{ color: custoRealTon ? "#7585fd" : "#3d425a" }}>
                            {custoRealTon ? `R$ ${fmt(custoRealTon)}` : "—"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span className="text-xs font-semibold" style={{ color: custoRealTonUSD ? "#22c55e" : "#3d425a" }}>
                            {custoRealTonUSD ? `$ ${fmt(custoRealTonUSD, 2)}` : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button onClick={() => setEditandoTroca(null)} className="w-6 h-6 rounded flex items-center justify-center hover:bg-white/10" style={{ color: "#5a607a" }}><X size={11} /></button>
                              <button onClick={requestSalvarTroca} className="w-6 h-6 rounded flex items-center justify-center" style={{ background: "rgba(34,197,94,0.2)", color: "#22c55e" }}><Save size={11} /></button>
                            </div>
                          ) : (
                            <button onClick={() => iniciarEditTroca(t)} className="w-6 h-6 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all" style={{ color: "#7585fd" }}><Pencil size={11} /></button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ HISTÓRICO DE EDIÇÕES ════════════════════════════════════════════ */}
      {historico.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={() => setShowHistorico(v => !v)} className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors" style={{ background: "rgba(255,255,255,0.02)" }}>
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

      {/* ══ MODAL SALVAR MATERIAL ════════════════════════════════════════════ */}
      {showSalvarModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowSalvarModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>
                {estado === "editando" ? "Confirmar alteração" : "Salvar planejamento"}
              </h3>
              <p className="text-xs mt-1" style={{ color: "#5a607a" }}>
                {tabAtiva} · Durabilidade: {fmt(formDur, 0)} ton · Custo: R$ {fmt(formCusto)}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>{estado === "editando" ? "Alterado por *" : "Salvo por *"}</label>
                <input className="input-field" placeholder="Seu nome" value={salvoPor} onChange={e => setSalvoPor(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label>
                <textarea className="input-field resize-none" rows={2} placeholder={estado === "editando" ? "Motivo da alteração..." : "Referência, versão..."} value={salvarObs} onChange={e => setSalvarObs(e.target.value)} />
              </div>
              {salvarError && <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg" style={{ color: "#ff6b6b", background: "rgba(255,107,107,0.1)" }}><AlertCircle size={12} />{salvarError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowSalvarModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSalvar} disabled={saving} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)" }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {estado === "editando" ? "Confirmar" : "Salvar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL SALVAR EDIÇÃO TROCA ════════════════════════════════════════ */}
      {showTrocaSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }} onClick={e => e.target === e.currentTarget && setShowTrocaSaveModal(false)}>
          <div className="w-full max-w-md rounded-2xl animate-scaleIn" style={{ background: "#161822", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
            <div className="px-6 py-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <h3 className="text-base font-semibold" style={{ color: "#e8eaf0" }}>Confirmar edição da troca</h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Alterado por *</label>
                <input className="input-field" placeholder="Seu nome" value={trocaEditWho} onChange={e => setTrocaEditWho(e.target.value)} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "#8890a8" }}>Observação</label>
                <textarea className="input-field resize-none" rows={2} value={trocaEditObs} onChange={e => setTrocaEditObs(e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowTrocaSaveModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "#8890a8" }}>Cancelar</button>
                <button onClick={confirmarSalvarTroca} disabled={!trocaEditWho.trim() || savingTrocaEdit} className="flex-1 btn-primary justify-center py-2.5" style={{ background: "linear-gradient(135deg,#22c55e,#16a34a)", opacity: !trocaEditWho.trim() ? 0.5 : 1 }}>
                  {savingTrocaEdit ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
