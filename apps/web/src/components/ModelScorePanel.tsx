import { Gauge, HardDrive, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { ModelView } from "../types";
import { cn } from "../lib/cn";
import { getModelScore } from "../lib/modelScore";

export function ModelScorePanel({ model, compact = false }: { model: ModelView; compact?: boolean }) {
  const score = getModelScore(model);
  const tone = {
    emerald: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
    cyan: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
    amber: "border-amber-300/25 bg-amber-300/10 text-amber-100",
    slate: "border-white/10 bg-white/[0.04] text-slate-300"
  }[score.tone];
  const barTone = {
    emerald: "from-emerald-300 to-cyan-300",
    cyan: "from-cyan-300 to-sky-300",
    amber: "from-amber-300 to-orange-300",
    slate: "from-slate-400 to-slate-500"
  }[score.tone];

  if (compact) {
    return (
      <div className="mt-2 rounded-md border border-white/10 bg-slate-950/35 p-2" data-testid="compact-fit-score">
        <div className="grid grid-cols-[minmax(86px,auto)_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", tone)}>
              <Gauge className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-lg font-black leading-none text-white">{score.score}<span className="ml-0.5 text-[10px] font-bold text-slate-500">/100</span></div>
              <div className="truncate text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200/55">{score.label}</div>
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-3 gap-1.5">
            <ScoreBar icon={<Zap className="h-3 w-3" />} label="spd" value={score.speedScore} tone={barTone} compact />
            <ScoreBar icon={<HardDrive className="h-3 w-3" />} label="size" value={score.footprintScore} tone={barTone} compact />
            <ScoreBar icon={<Gauge className="h-3 w-3" />} label="ready" value={score.readinessScore} tone={barTone} compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-md border border-white/10 bg-slate-950/35 p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", tone)}>
            <Gauge className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-200/55">fit score</div>
            <div className="truncate text-xs font-bold text-slate-100">{score.label}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-black leading-none text-white">{score.score}</div>
          <div className="text-[10px] font-bold text-slate-500">/100</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <ScoreBar icon={<Zap className="h-3 w-3" />} label="speed" value={score.speedScore} tone={barTone} />
        <ScoreBar icon={<HardDrive className="h-3 w-3" />} label="size" value={score.footprintScore} tone={barTone} />
        <ScoreBar icon={<Gauge className="h-3 w-3" />} label="ready" value={score.readinessScore} tone={barTone} />
      </div>
    </div>
  );
}

function ScoreBar({ icon, label, value, tone, compact = false }: { icon: ReactNode; label: string; value: number; tone: string; compact?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded border border-white/10 bg-white/[0.025] px-2", compact ? "py-1" : "py-1.5")} title={`${label}: ${value}/100`}>
      <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-500">
        <span className="text-cyan-100/55">{icon}</span>
        <span className={compact ? "sr-only" : "truncate"}>{label}</span>
      </div>
      <div className={cn("mt-1 overflow-hidden rounded-full bg-white/[0.075]", compact ? "h-1" : "h-1.5")}>
        <div className={cn("h-full rounded-full bg-gradient-to-r", tone)} style={{ width: `${Math.max(4, value)}%` }} />
      </div>
    </div>
  );
}
