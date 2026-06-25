import { Activity, Boxes, Download, Gauge, HardDrive, Play, Power, Sparkles, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import type { ModelView, RuntimeState } from "../types";
import { cn } from "../lib/cn";
import { ModelScorePanel } from "./ModelScorePanel";

interface Props {
  model: ModelView;
  runtime: RuntimeState;
  selected: boolean;
  onSelect: (modelId: string) => void;
  onSwitch: (modelId: string) => void;
  onInstall: (modelId: string) => void;
  onBench: (modelId: string) => void;
  onStop: () => void;
}

export function ModelCard({ model, runtime, selected, onSelect, onSwitch, onInstall, onBench, onStop }: Props) {
  const active = runtime.activeModelId === model.id;
  const busy = ["stopping", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const bench = model.bench;
  const canStop = active && runtime.status !== "idle" && !busy;
  const isEmbedding = model.role === "embedding";
  const speed = bench ? `${bench.avgTps.toFixed(0)} t/s` : model.expectedTps ? `~${model.expectedTps}` : "-";
  const state = active ? runtime.status : selected ? "selected" : model.installed ? "installed" : "missing";
  const stateTone =
    active
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : selected
        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        : model.installed
          ? "border-slate-300/15 bg-white/[0.045] text-slate-300"
          : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  const roleBadges = model.roles.slice(0, 3);

  return (
    <article
      role="button"
      tabIndex={0}
      data-model-id={model.id}
      onClick={() => onSelect(model.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(model.id);
        }
      }}
      className={cn(
        "model-card-premium group relative scroll-mt-[430px] cursor-pointer overflow-hidden rounded-lg border p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition",
        selected ? "border-cyan-300/55 bg-cyan-300/[0.035] ring-1 ring-cyan-300/25" : "border-white/10 hover:border-white/20 hover:bg-white/[0.055]",
        active && "border-emerald-300/60 bg-emerald-300/[0.035] ring-1 ring-emerald-300/25"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r", active ? "from-emerald-300/0 via-emerald-300/75 to-cyan-300/0" : selected ? "from-cyan-300/0 via-cyan-300/75 to-violet-300/0" : "from-white/0 via-white/18 to-white/0")} />
      <div className={cn("absolute inset-y-3 left-0 w-1 rounded-r-full transition", active ? "bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.55)]" : selected ? "bg-cyan-300 shadow-[0_0_18px_rgba(103,232,249,0.5)]" : "bg-transparent")} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {active ? <Activity className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : <Sparkles className={cn("h-3.5 w-3.5 shrink-0", selected ? "text-cyan-200" : "text-slate-500")} />}
            <h3 className="truncate text-sm font-semibold text-white">{model.displayName}</h3>
            <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold", model.runtime === "ollama" ? "border-sky-300/25 bg-sky-300/10 text-sky-200" : "border-violet-300/25 bg-violet-300/10 text-violet-200")}>
              {model.runtime}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{model.reason}</p>
        </div>
        <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]", stateTone)}>
          {state}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="min-w-0 rounded-md border border-white/10 bg-slate-950/35 px-2 py-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-200/55">
            <Boxes className="h-3.5 w-3.5 shrink-0" />
            <span className="shrink-0">Use</span>
            <span className="truncate text-[11px] normal-case tracking-normal text-slate-300">{model.bestUse}</span>
          </div>
        </div>
        <div className="hidden min-w-0 items-center gap-1.5 md:flex">
          {(roleBadges.length > 0 ? roleBadges : [model.role]).map((role) => (
            <span key={role} className="rounded border border-white/10 bg-slate-950/35 px-2 py-1 text-[10px] font-semibold text-slate-300">
              {role}
            </span>
          ))}
        </div>
      </div>

      <ModelScorePanel model={model} compact />

      <div className="mt-2 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-1.5 text-xs">
        <Metric icon={<HardDrive className="h-3.5 w-3.5" />} label="size" value={model.sizeGb ? `${model.sizeGb}GB` : "-"} />
        <Metric icon={<Boxes className="h-3.5 w-3.5" />} label="role" value={model.role} />
        <Metric icon={<Gauge className="h-3.5 w-3.5" />} label="speed" value={speed} />
      </div>

      <div className="mt-2 grid gap-2" onClick={(event) => event.stopPropagation()} data-testid="model-card-actions">
        <button
          type="button"
          title={active ? "Reload model" : isEmbedding ? "Prepare embedding endpoint" : "Load model"}
          aria-label={active ? "Reload model" : isEmbedding ? "Prepare embedding endpoint" : "Load model"}
          disabled={!model.installed || busy}
          onClick={() => onSwitch(model.id)}
          className={cn("inline-flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-bold text-slate-950 shadow-[0_0_18px_rgba(103,232,249,0.18)] disabled:cursor-not-allowed disabled:opacity-35", active ? "bg-emerald-300" : "bg-cyan-300")}
        >
          <Play className="h-3.5 w-3.5" />
          {active ? "Reload" : isEmbedding ? "Prepare" : "Load"}
        </button>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            title="Unload runtime and free GPU"
            aria-label="Unload runtime and free GPU"
            disabled={!canStop}
            onClick={onStop}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Power className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Unload</span>
          </button>
          <button
            type="button"
            title="Install model"
            aria-label="Install model"
            disabled={!model.installable || model.installed || busy}
            onClick={() => onInstall(model.id)}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Download className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Install</span>
          </button>
          <button
            type="button"
            title={isEmbedding ? "Embedding benchmark is not a generation tok/s test" : "Run benchmark"}
            aria-label={isEmbedding ? "Embedding benchmark unavailable" : "Run benchmark"}
            disabled={!model.installed || busy || isEmbedding}
            onClick={() => onBench(model.id)}
            className="inline-flex h-8 min-w-0 items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.035] px-2 text-xs font-semibold text-slate-300 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <TimerReset className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">Bench</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <span className="text-cyan-200/55">{icon}</span>
        {label}
      </div>
      <div className="truncate text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}
