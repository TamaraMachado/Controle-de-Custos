import { LucideIcon } from "lucide-react";

interface Props {
  tipo: "planejamento" | "realizado";
  icon?: LucideIcon;
  descricao?: string;
  totalLabel?: string;
  total?: number;
  children?: React.ReactNode;
}

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SectionHeader({ tipo, icon: Icon, descricao, totalLabel, total, children }: Props) {
  const isPlan = tipo === "planejamento";
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
          style={isPlan
            ? { background: "rgba(85,96,248,0.1)", border: "1px solid rgba(85,96,248,0.2)" }
            : { background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)" }}>
          <div className="w-2 h-2 rounded-full" style={{ background: isPlan ? "#5560f8" : "#22c55e" }} />
          <span className="text-xs font-bold tracking-wide" style={{ color: isPlan ? "#7585fd" : "#22c55e" }}>
            {isPlan ? "PLANEJAMENTO" : "CUSTO REAL"}
          </span>
        </div>
        {descricao && <span className="text-xs" style={{ color: "#5a607a" }}>{descricao}</span>}
      </div>
      <div className="flex items-center gap-3">
        {total !== undefined && (
          <span className="text-sm font-bold" style={{ color: isPlan ? "#7585fd" : "#22c55e" }}>
            {totalLabel ?? "Total:"} R$ {fmt(total)}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}
