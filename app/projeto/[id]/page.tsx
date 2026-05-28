"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase, Projeto } from "@/lib/supabase";
import CustosDiretos from "@/components/CustosDiretos";
import Pessoas from "@/components/Pessoas";
import Rolo from "@/components/Rolo";
import SGA from "@/components/SGA";
import Resumo from "@/components/Resumo";
import Frete from "@/components/Frete";
import {
  ArrowLeft, BarChart3, Zap, Users, Briefcase, Wrench,
  Wind, Truck, RotateCcw, FlaskConical, MoreHorizontal,
  Package, Receipt, ChevronRight, PieChart,
} from "lucide-react";

const ABAS = [
  { id: "resumo", label: "Resumo", icon: PieChart },
  { id: "custos-diretos", label: "Custos Diretos", icon: BarChart3 },
  { id: "utilidades", label: "Utilidades", icon: Zap },
  { id: "pessoas", label: "Pessoas", icon: Users },
  { id: "sga", label: "SG&A", icon: Briefcase },
  { id: "manutencao", label: "Manutenção", icon: Wrench },
  { id: "secagem-mp", label: "Secagem de MP", icon: Wind },
  { id: "logistica-interna", label: "Logística Interna", icon: Truck },
  { id: "rolo", label: "Rolo", icon: RotateCcw },
  { id: "analise-lab", label: "Análise de Lab.", icon: FlaskConical },
  { id: "outros-custos", label: "Outros Custos", icon: MoreHorizontal },
  { id: "frete", label: "Frete", icon: Package },
  { id: "impostos", label: "Impostos", icon: Receipt },
];

export default function ProjetoPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [projeto, setProjeto] = useState<Projeto | null>(null);
  const [loading, setLoading] = useState(true);
  const [abaAtiva, setAbaAtiva] = useState("resumo");

  useEffect(() => {
    const fetchProjeto = async () => {
      const { data } = await supabase.from("projetos").select("*").eq("id", id).single();
      setProjeto(data);
      setLoading(false);
    };
    fetchProjeto();
  }, [id]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0f1117" }}>
      <div className="flex items-center gap-3" style={{ color: "#5a607a" }}>
        <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#5560f8", borderTopColor: "transparent" }} />
        <span className="text-sm">Carregando...</span>
      </div>
    </div>
  );

  if (!projeto) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: "#0f1117" }}>
      <p className="text-sm" style={{ color: "#5a607a" }}>Projeto não encontrado.</p>
      <button className="btn-primary" onClick={() => router.push("/")}><ArrowLeft size={14} />Voltar</button>
    </div>
  );

  const abaAtivaObj = ABAS.find((a) => a.id === abaAtiva)!;
  const AbaIcon = abaAtivaObj.icon;

  return (
    <div className="min-h-screen" style={{ background: "#0f1117" }}>
      <div className="fixed inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(85,96,248,0.08) 0%, transparent 70%)" }} />

      <header className="relative border-b border-white/5 sticky top-0 z-40" style={{ background: "rgba(15,17,23,0.9)", backdropFilter: "blur(20px)" }}>
        <div className="max-w-full px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.push("/")} className="flex items-center gap-1.5 text-sm transition-colors hover:text-white" style={{ color: "#5a607a" }}>
            <ArrowLeft size={15} /><span className="hidden sm:inline">Projetos</span>
          </button>
          <ChevronRight size={14} style={{ color: "#3d425a" }} />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.3)" }}>
              <div className="w-2 h-2 rounded-full" style={{ background: "#5560f8" }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>{projeto.nome}</h1>
              <p className="text-xs truncate" style={{ color: "#5a607a" }}>{projeto.produto} · {projeto.cliente}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        <aside className="w-56 flex-shrink-0 border-r overflow-y-auto hidden md:block" style={{ background: "rgba(255,255,255,0.015)", borderColor: "rgba(255,255,255,0.05)" }}>
          <div className="p-3 space-y-0.5">
            {ABAS.map((aba) => {
              const Icon = aba.icon;
              const isActive = aba.id === abaAtiva;
              return (
                <button key={aba.id} className="tab-item w-full text-left"
                  style={isActive ? { color: "#e8eaf0", background: "rgba(85,96,248,0.15)", border: "1px solid rgba(85,96,248,0.25)" } : {}}
                  onClick={() => setAbaAtiva(aba.id)}>
                  <Icon size={14} strokeWidth={isActive ? 2 : 1.5} />{aba.label}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 overflow-x-auto border-t" style={{ background: "rgba(15,17,23,0.95)", backdropFilter: "blur(20px)", borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex px-2 py-2 gap-1">
            {ABAS.map((aba) => {
              const Icon = aba.icon;
              const isActive = aba.id === abaAtiva;
              return (
                <button key={aba.id} onClick={() => setAbaAtiva(aba.id)} className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg flex-shrink-0 transition-all"
                  style={{ background: isActive ? "rgba(85,96,248,0.15)" : "transparent", color: isActive ? "#7585fd" : "#5a607a" }}>
                  <Icon size={14} /><span className="text-[10px] whitespace-nowrap">{aba.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-6">
          <div className="max-w-7xl mx-auto p-6">
            <div className="flex items-center gap-3 mb-6 animate-fadeIn">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(85,96,248,0.12)", border: "1px solid rgba(85,96,248,0.2)" }}>
                <AbaIcon size={16} style={{ color: "#7585fd" }} />
              </div>
              <div>
                <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-sora)", color: "#e8eaf0" }}>{abaAtivaObj.label}</h2>
                <p className="text-xs" style={{ color: "#5a607a" }}>{projeto.nome}</p>
              </div>
            </div>

            {abaAtiva === "resumo" ? <Resumo projetoId={id} />
            : abaAtiva === "custos-diretos" ? <CustosDiretos projetoId={id} />
            : abaAtiva === "pessoas" ? <Pessoas projetoId={id} />
            : abaAtiva === "sga" ? <SGA projetoId={id} />
            : abaAtiva === "rolo" ? <Rolo projetoId={id} />
            : abaAtiva === "frete" ? <Frete projetoId={id} />
            : (
              <div className="glass rounded-2xl p-12 flex flex-col items-center justify-center text-center" style={{ minHeight: "320px" }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.15)" }}>
                  <AbaIcon size={28} style={{ color: "#5560f8", opacity: 0.7 }} />
                </div>
                <h3 className="text-base font-medium mb-2" style={{ fontFamily: "var(--font-sora)", color: "#8890a8" }}>{abaAtivaObj.label}</h3>
                <p className="text-sm max-w-xs" style={{ color: "#5a607a" }}>Esta seção será configurada em breve.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
