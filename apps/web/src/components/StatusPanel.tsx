import { Boxes, BrainCircuit, Copy, Database, Gamepad2, Gauge, HardDrive, MessageSquare, Paperclip, ShieldCheck, Sparkles, Terminal, User, Zap } from "lucide-react";
import type { ReactNode } from "react";
import type { ChatAttachment, ChatMessage, HomeServerState, InstallJob, ModelView, ModelsResponse, RuntimeState } from "../types";
import { cn } from "../lib/cn";
import { ModelScorePanel } from "./ModelScorePanel";

type TimelineState = "done" | "active" | "idle" | "warn" | "failed";

interface Props {
  data?: ModelsResponse;
  runtime: RuntimeState;
  jobs: InstallJob[];
  selectedModel?: ModelView;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  sending: boolean;
  loading?: boolean;
  onStop: () => void;
  homeServer?: HomeServerState;
  onStartHomeServer?: () => void;
  onStartHomeServerEmbedOnly?: () => void;
  onStopHomeServer?: () => void;
}

export function StatusPanel({ data, runtime, jobs, selectedModel, messages, attachments, sending, loading = false, onStop, homeServer, onStartHomeServer, onStartHomeServerEmbedOnly, onStopHomeServer }: Props) {
  const gpuUsed = data?.gpu.usedMb && data.gpu.totalMb ? Math.round((data.gpu.usedMb / data.gpu.totalMb) * 100) : undefined;
  const diskFree = data?.disk.freeGb ?? null;
  const benchLabel = selectedModel?.bench ? `${selectedModel.bench.avgTps.toFixed(0)} t/s` : selectedModel?.expectedTps ? `~${selectedModel.expectedTps}` : "-";
  const displayStatus = loading ? "scanning" : runtime.status;
  const stateDot =
    displayStatus === "ready" ? "bg-emerald-300 text-emerald-300" : displayStatus === "failed" ? "bg-rose-400 text-rose-400" : displayStatus === "idle" ? "bg-slate-500 text-slate-500" : displayStatus === "scanning" ? "bg-cyan-300 text-cyan-300" : "bg-amber-300 text-amber-300";
  const animatedState = loading || ["ready", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const mergedLogs = [...runtime.logs.map((line) => `[runtime] ${line}`), ...(homeServer?.logs ?? []).map((line) => `[home] ${line}`)].slice(-180);

  async function copyEnv() {
    if (selectedModel?.envExample) await navigator.clipboard?.writeText(selectedModel.envExample);
  }

  async function copyLogs() {
    await navigator.clipboard?.writeText(mergedLogs.join("\n"));
  }

  return (
    <aside className="surface-premium flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/78 backdrop-blur-xl">
      <section className="shrink-0 border-b border-white/10 bg-white/[0.025] p-3">
        <RuntimeCommandHeader
          runtime={runtime}
          selectedModel={selectedModel}
          displayStatus={displayStatus}
          stateDot={stateDot}
          animated={animatedState}
          loading={loading}
          gpuUsed={gpuUsed}
          diskFree={diskFree}
          diskLow={Boolean(data?.disk.lowSpace)}
        />
        <RuntimeCore runtime={runtime} stateDot={stateDot} animated={animatedState} loading={loading} />
        <GameModeDock runtime={runtime} selectedModel={selectedModel} gpuUsed={gpuUsed} loading={loading} onStop={onStop} />
        {homeServer && <HomeServerDock homeServer={homeServer} onStart={onStartHomeServer} onStartEmbedOnly={onStartHomeServerEmbedOnly} onStop={onStopHomeServer} />}
        {runtime.lastError && <div className="mt-2 max-h-20 overflow-auto rounded-md border border-rose-300/20 bg-rose-950/60 p-2 text-xs leading-5 text-rose-100">{runtime.lastError}</div>}
      </section>

      <section className="min-h-0 flex-1 overflow-y-auto p-3">
        <SessionTelemetry messages={messages} attachments={attachments} selectedModel={selectedModel} runtime={runtime} sending={sending} loading={loading} />
        <RuntimeTimeline runtime={runtime} selectedModel={selectedModel} loading={loading} displayStatus={displayStatus} />
        {loading && !selectedModel ? (
          <div className="mt-3">
            <ModelScanCard />
          </div>
        ) : selectedModel ? (
          <div className="mt-3">
            <ModelLoadout model={selectedModel} runtime={runtime} benchLabel={benchLabel} jobs={jobs} onCopyEnv={copyEnv} />
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-dashed border-white/10 bg-white/[0.025] p-3 text-sm text-slate-500">No model selected.</div>
        )}
      </section>

      <section className="shrink-0 border-t border-white/10 bg-[#050913] p-2.5" data-testid="runtime-log-console">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Terminal className="h-4 w-4" />
            Runtime Log
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{mergedLogs.length} events</span>
            <button type="button" onClick={() => void copyLogs()} disabled={mergedLogs.length === 0} className="inline-flex h-7 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35">
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </div>
        </div>
        <EventStream logs={mergedLogs} />
      </section>
    </aside>
  );
}

function RuntimeCommandHeader({
  runtime,
  selectedModel,
  displayStatus,
  stateDot,
  animated,
  loading,
  gpuUsed,
  diskFree,
  diskLow
}: {
  runtime: RuntimeState;
  selectedModel?: ModelView;
  displayStatus: string;
  stateDot: string;
  animated: boolean;
  loading: boolean;
  gpuUsed?: number;
  diskFree: number | null;
  diskLow: boolean;
}) {
  const statusTone =
    displayStatus === "ready"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : displayStatus === "failed"
        ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
        : displayStatus === "scanning"
          ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
          : displayStatus === "idle"
            ? "border-white/10 bg-white/[0.055] text-slate-300"
            : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  const target = loading ? "scanning stores" : runtime.activeModelName ?? selectedModel?.displayName ?? "no target";
  const engine = loading ? "scanner" : runtime.runtime ?? selectedModel?.runtime ?? "none";
  const disk = loading ? "scan" : diskFree === null ? "-" : `${diskFree}GB`;
  const speed = selectedModel?.bench?.avgTps ?? selectedModel?.expectedTps ?? 0;
  const speedLabel = selectedModel?.bench ? `${selectedModel.bench.avgTps.toFixed(0)} t/s` : selectedModel?.expectedTps ? `~${selectedModel.expectedTps}` : "-";
  const traceMode = loading ? "scan" : displayStatus === "ready" ? "live" : selectedModel?.installed ? "armed" : displayStatus;
  const stateLevel = displayStatus === "ready" ? 88 : ["starting", "warming", "benchmarking", "installing"].includes(displayStatus) ? 70 : displayStatus === "failed" ? 18 : selectedModel?.installed ? 48 : 28;
  const traceValues = [
    stateLevel,
    Math.max(14, Math.min(94, speed * 0.54 || stateLevel * 0.72)),
    loading ? 44 : gpuUsed ?? 18,
    diskFree === null ? 38 : Math.max(18, Math.min(94, diskFree / 2)),
    Math.max(16, Math.min(92, stateLevel * 0.82 + (selectedModel?.installed ? 12 : 0)))
  ];
  const tracePoints = traceValues.map((value, index) => `${10 + index * 37},${40 - value * 0.32}`).join(" ");

  return (
    <div
      className="command-console-surface relative overflow-hidden rounded-lg border p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid="runtime-command-console"
    >
      <div className="handoff-line pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-200/75 to-transparent" />
      </div>
      <div className="grid grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-2">
        <div className={cn("runtime-orb relative flex h-9 w-9 items-center justify-center rounded-lg border border-cyan-300/20 bg-slate-950/82 text-cyan-100", animated && "runtime-orb-active")}>
          <span className={cn("absolute h-1.5 w-1.5 rounded-full", stateDot, animated && "status-pulse")} />
          <Terminal className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">command console</div>
          <h2 className="truncate text-sm font-black text-white">Runtime Control Plane</h2>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em]", statusTone)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", stateDot, animated && "status-pulse")} />
          {displayStatus}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        <CommandSignal label="target" value={target} active={Boolean(target && target !== "no target")} />
        <CommandSignal label="engine" value={engine} active={engine !== "none"} />
        <CommandSignal label="disk" value={disk} active={loading || diskFree !== null} warn={diskLow} />
        <CommandSignal label="gpu" value={loading ? "scan" : gpuUsed === undefined ? "-" : `${gpuUsed}%`} active={loading || gpuUsed !== undefined} />
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_64px] items-end gap-2" data-testid="runtime-signal-trace">
        <div className="relative h-9 overflow-hidden rounded-md border border-cyan-300/12 bg-slate-950/42">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.055)_1px,transparent_1px)] bg-[length:22px_18px]" />
          <svg className="relative h-full w-full" viewBox="0 0 158 44" preserveAspectRatio="none" aria-hidden="true">
            <polyline points={tracePoints} fill="none" stroke="rgba(252,211,77,0.24)" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={tracePoints} fill="none" stroke="rgba(103,232,249,0.86)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-right">
          <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100/45">trace</div>
          <div className="truncate text-[11px] font-black text-white">{traceMode}</div>
          <div className="truncate text-[10px] font-bold text-slate-500">{speedLabel}</div>
        </div>
      </div>
    </div>
  );
}

function CommandSignal({ label, value, active, warn = false }: { label: string; value: string; active: boolean; warn?: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-md border px-2 py-1", warn ? "border-amber-300/20 bg-amber-300/10 text-amber-100" : active ? "border-cyan-300/18 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500")}>
      <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-55">{label}</div>
      <div className="truncate text-[11px] font-black">{value}</div>
    </div>
  );
}

function SessionTelemetry({
  messages,
  attachments,
  selectedModel,
  runtime,
  sending,
  loading
}: {
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  selectedModel?: ModelView;
  runtime: RuntimeState;
  sending: boolean;
  loading: boolean;
}) {
  const userTurns = messages.filter((message) => message.role === "user").length;
  const assistantTurns = messages.filter((message) => message.role === "assistant" && message.content.trim()).length;
  const messageAttachments = messages.reduce((count, message) => count + (message.attachments?.length ?? 0), 0);
  const stagedAttachments = attachments.length;
  const live = sending || runtime.status === "ready";
  const state = loading ? "scanning" : sending ? "streaming" : runtime.status === "ready" ? "linked" : selectedModel?.installed ? "standby" : "missing";
  const route = selectedModel ? `${selectedModel.runtime} / ${selectedModel.store ?? "local"}` : "none";
  const chips = [
    { label: "turns", value: String(userTurns), icon: <User className="h-3.5 w-3.5" />, active: userTurns > 0 },
    { label: "answers", value: String(assistantTurns), icon: <MessageSquare className="h-3.5 w-3.5" />, active: assistantTurns > 0 },
    { label: "files", value: String(messageAttachments + stagedAttachments), icon: <Paperclip className="h-3.5 w-3.5" />, active: messageAttachments + stagedAttachments > 0 },
    { label: "route", value: route, icon: <Zap className="h-3.5 w-3.5" />, active: Boolean(selectedModel?.installed) }
  ];

  return (
    <div data-testid="session-bus" className="overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(103,232,249,0.08),rgba(15,23,42,0.5)_48%,rgba(129,140,248,0.08))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Session Bus</h2>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/45">current chat route</div>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em]",
            live
              ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
              : state === "missing"
                ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                : "border-white/10 bg-white/[0.04] text-slate-300"
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-cyan-300 status-pulse" : state === "missing" ? "bg-amber-300" : "bg-slate-500")} />
          {state}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-[42px_minmax(0,1fr)_42px] items-center gap-2">
        <BusNode icon={<User className="h-4 w-4" />} label="you" active={userTurns > 0 || stagedAttachments > 0} />
        <div className="relative h-9 overflow-hidden rounded-full border border-white/10 bg-slate-950/42">
          <div className={cn("absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-300/20 via-emerald-300/30 to-cyan-300/20 transition-all", live ? "w-full" : selectedModel?.installed ? "w-2/3" : "w-1/3")} />
          <div className="handoff-line absolute inset-x-3 top-1/2 h-px -translate-y-1/2 overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-200/85 to-transparent" />
          </div>
          <div className="relative flex h-full items-center justify-center px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/70">
            {selectedModel?.displayName ?? "no target"}
          </div>
        </div>
        <BusNode icon={<Sparkles className="h-4 w-4" />} label="llm" active={Boolean(selectedModel)} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {chips.map((chip) => (
          <SessionChip key={chip.label} {...chip} />
        ))}
      </div>
    </div>
  );
}

function GameModeDock({
  runtime,
  selectedModel,
  gpuUsed,
  loading,
  onStop
}: {
  runtime: RuntimeState;
  selectedModel?: ModelView;
  gpuUsed?: number;
  loading: boolean;
  onStop: () => void;
}) {
  const runtimeLoaded = Boolean(runtime.activeModelId) || ["ready", "starting", "warming", "benchmarking"].includes(runtime.status);
  const switching = ["stopping", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const clear = !loading && !runtimeLoaded && runtime.status === "idle";
  const highVram = (gpuUsed ?? 0) > 35;
  const state = loading ? "checking" : switching ? "busy" : clear ? "clear" : highVram ? "watch" : "armed";
  const tone =
    state === "clear"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : state === "watch"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : state === "busy"
          ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
          : "border-white/10 bg-white/[0.04] text-slate-300";
  const label =
    state === "clear"
      ? "GPU clear"
      : state === "watch"
        ? "VRAM watch"
        : state === "busy"
          ? "handoff"
          : loading
            ? "checking"
            : "standby";
  const detail =
    state === "clear"
      ? "No local runtime is loaded. Games get priority."
      : state === "watch"
        ? "VRAM is still in use. Clear runtimes before a heavy game."
        : state === "busy"
          ? "Runtime is changing state. Wait for idle before launching a game."
          : loading
            ? "Scanning GPU/runtime state."
            : "Selected model is ready to load on demand.";

  return (
    <div
      className="mt-3 overflow-hidden rounded-lg border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(45,212,191,0.12),rgba(15,23,42,0.68)_48%,rgba(37,99,235,0.1))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid="game-mode-dock"
    >
      <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(45,212,191,0.12)]">
          <Gamepad2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-bold text-white">Game Mode Bay</div>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", tone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", state === "clear" ? "bg-emerald-300" : state === "busy" ? "bg-cyan-300 status-pulse" : state === "watch" ? "bg-amber-300" : "bg-slate-500")} />
              {label}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{detail}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
        <SignalCell label="target" value={runtime.activeModelName ?? selectedModel?.displayName ?? "none"} />
        <SignalCell label="vram" value={loading ? "scan" : `${gpuUsed ?? "-"}%`} />
      </div>
      <button
        type="button"
        onClick={onStop}
        className={cn(
          "mt-2 inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border text-sm font-bold transition",
          clear
            ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15"
            : "border-cyan-300/24 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/18"
        )}
      >
        <Gamepad2 className="h-4 w-4" />
        {clear ? "Already clear" : "Clear runtimes for game"}
      </button>
    </div>
  );
}

function HomeServerDock({
  homeServer,
  onStart,
  onStartEmbedOnly,
  onStop
}: {
  homeServer: HomeServerState;
  onStart?: () => void;
  onStartEmbedOnly?: () => void;
  onStop?: () => void;
}) {
  const ready = homeServer.status === "ready";
  const busy = ["stopping", "starting", "warming"].includes(homeServer.status);
  const failed = homeServer.status === "failed";
  const embedOnly = ready && Boolean(homeServer.embedPid) && !homeServer.chatPid;
  const vram = homeServer.vram?.usedMb && homeServer.vram.totalMb ? `${homeServer.vram.usedMb}/${homeServer.vram.totalMb}MiB` : "-";
  const chatPort = compactEndpoint(homeServer.chatEndpoint);
  const embedPort = compactEndpoint(homeServer.embedEndpoint);
  const tone =
    ready
      ? "border-emerald-300/24 bg-emerald-300/10 text-emerald-100"
      : failed
        ? "border-rose-300/24 bg-rose-300/10 text-rose-100"
        : busy
          ? "border-amber-300/24 bg-amber-300/10 text-amber-100"
          : "border-cyan-300/18 bg-cyan-300/8 text-cyan-100";
  const dot = ready ? "bg-emerald-300" : failed ? "bg-rose-300" : busy ? "bg-amber-300 status-pulse" : "bg-slate-500";
  const actionLabel = ready ? (embedOnly ? "Stop embedder" : "Stop RCA/RAG") : busy ? homeServer.status : "Start RCA/RAG";

  return (
    <div
      className="mt-3 overflow-hidden rounded-lg border border-emerald-300/16 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(15,23,42,0.7)_46%,rgba(14,165,233,0.1))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid="home-server-dock"
    >
      <div className="grid grid-cols-[42px_minmax(0,1fr)] gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
          <BrainCircuit className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate text-sm font-bold text-white">Home Server RCA/RAG</div>
            <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", tone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
              {homeServer.status}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{homeServer.message}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <SignalCell label="chat" value={embedOnly ? "off" : `${homeServer.chatModel} @ ${chatPort}`} />
        <SignalCell label="embed" value={`${homeServer.embedModel} @ ${embedPort}`} />
        <SignalCell label="task" value={homeServer.currentTask ?? "standby"} />
        <SignalCell label="vram" value={vram} />
      </div>

      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5 text-[11px]">
        <div className={cn("min-w-0 rounded-md border px-2 py-1.5", homeServer.apiKeyRequired ? "border-emerald-300/18 bg-emerald-300/10 text-emerald-100" : "border-amber-300/18 bg-amber-300/10 text-amber-100")}>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
            <ShieldCheck className="h-3 w-3" />
            gateway key
          </div>
          <div className="mt-0.5 truncate font-bold">{homeServer.apiKeyRequired ? "required" : "not set"}</div>
        </div>
        <div className={cn("min-w-0 rounded-md border px-2 py-1.5", homeServer.vram?.warning ? "border-rose-300/24 bg-rose-300/10 text-rose-100" : "border-white/10 bg-white/[0.035] text-slate-300")}>
          <div className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.12em] opacity-70">
            <Database className="h-3 w-3" />
            embed unload
          </div>
          <div className="mt-0.5 truncate font-bold">{homeServer.vram?.warning ? `over ${homeServer.vram.thresholdMb}MiB` : "auto guard"}</div>
        </div>
      </div>

      {homeServer.lastError && <div className="mt-2 max-h-16 overflow-auto rounded-md border border-rose-300/20 bg-rose-950/55 px-2 py-1.5 text-xs leading-5 text-rose-100">{homeServer.lastError}</div>}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={ready ? onStop : onStart}
          disabled={busy || (!ready && !onStart) || (ready && !onStop)}
          className={cn(
            "inline-flex h-8 items-center justify-center gap-2 rounded-md border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-45",
            ready ? "border-emerald-300/22 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/16" : "border-cyan-300/24 bg-cyan-300/12 text-cyan-100 hover:bg-cyan-300/18"
          )}
        >
          <BrainCircuit className={cn("h-4 w-4", busy && "animate-pulse")} />
          {actionLabel}
        </button>
        <button
          type="button"
          onClick={onStartEmbedOnly}
          disabled={busy || !onStartEmbedOnly}
          className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-emerald-300/22 bg-emerald-300/10 text-sm font-bold text-emerald-100 transition hover:bg-emerald-300/16 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Database className={cn("h-4 w-4", busy && "animate-pulse")} />
          Embed only
        </button>
      </div>
    </div>
  );
}

function BusNode({ icon, label, active }: { icon: ReactNode; label: string; active: boolean }) {
  return (
    <div className={cn("flex h-11 min-w-0 flex-col items-center justify-center rounded-lg border", active ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500")}>
      {icon}
      <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.12em]">{label}</span>
    </div>
  );
}

function SessionChip({ label, value, icon, active }: { label: string; value: string; icon: ReactNode; active: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-md border px-2 py-1.5", active ? "border-cyan-300/18 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.03] text-slate-500")}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 opacity-75">{icon}</span>
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] opacity-65">{label}</span>
      </div>
      <div className="mt-1 truncate text-[11px] font-bold">{value}</div>
    </div>
  );
}

function RuntimeTimeline({
  runtime,
  selectedModel,
  loading,
  displayStatus
}: {
  runtime: RuntimeState;
  selectedModel?: ModelView;
  loading: boolean;
  displayStatus: string;
}) {
  const activeTarget = Boolean(selectedModel?.id && runtime.activeModelId === selectedModel.id);
  const failed = displayStatus === "failed";
  const switching = ["stopping", "starting"].includes(displayStatus);
  const warming = ["warming", "benchmarking", "installing"].includes(displayStatus);
  const ready = displayStatus === "ready" && activeTarget;
  const steps: Array<{ label: string; value: string; icon: ReactNode; state: TimelineState }> = [
    {
      label: "store",
      value: loading ? "scan" : selectedModel?.store ?? "none",
      icon: <HardDrive className="h-3.5 w-3.5" />,
      state: loading ? "active" : selectedModel?.installed ? "done" : selectedModel ? "warn" : "idle"
    },
    {
      label: "engine",
      value: selectedModel?.runtime ?? runtime.runtime ?? "none",
      icon: <Zap className="h-3.5 w-3.5" />,
      state: failed ? "failed" : switching ? "active" : activeTarget ? "done" : selectedModel?.installed ? "idle" : "idle"
    },
    {
      label: "warm",
      value: loading ? "scan" : warming ? displayStatus : ready ? "done" : "standby",
      icon: <Sparkles className="h-3.5 w-3.5" />,
      state: failed ? "failed" : loading || warming ? "active" : ready ? "done" : "idle"
    },
    {
      label: "chat",
      value: ready ? "ready" : failed ? "failed" : "standby",
      icon: <Terminal className="h-3.5 w-3.5" />,
      state: failed ? "failed" : ready ? "done" : "idle"
    }
  ];

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-white/[0.025] p-2 shadow-inner shadow-white/[0.025]">
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/55">launch path</div>
        <div className="truncate text-[11px] font-semibold text-slate-500">{selectedModel?.displayName ?? "no target"}</div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {steps.map((step) => (
          <TimelineCell key={step.label} {...step} />
        ))}
      </div>
    </div>
  );
}

function TimelineCell({ label, value, icon, state }: { label: string; value: string; icon: ReactNode; state: TimelineState }) {
  const tone =
    state === "done"
      ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100"
      : state === "active"
        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        : state === "warn"
          ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
          : state === "failed"
            ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
            : "border-white/10 bg-white/[0.03] text-slate-500";
  const dot =
    state === "done"
      ? "bg-emerald-300"
      : state === "active"
        ? "bg-cyan-300 status-pulse"
        : state === "warn"
          ? "bg-amber-300"
          : state === "failed"
            ? "bg-rose-300"
            : "bg-slate-600";

  return (
    <div className={cn("relative min-w-0 overflow-hidden rounded-md border px-2 py-1.5", tone)}>
      <div className="flex items-center justify-between gap-1">
        <span className="shrink-0 opacity-80">{icon}</span>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
      </div>
      <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] opacity-60">{label}</div>
      <div className="truncate text-[11px] font-bold">{value}</div>
    </div>
  );
}

function ModelLoadout({
  model,
  runtime,
  benchLabel,
  jobs,
  onCopyEnv
}: {
  model: ModelView;
  runtime: RuntimeState;
  benchLabel: string;
  jobs: InstallJob[];
  onCopyEnv: () => Promise<void>;
}) {
  const active = runtime.activeModelId === model.id;
  const state = active ? runtime.status : model.installed ? "selected" : "missing";
  const stateTone =
    active && runtime.status === "ready"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : active
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : model.installed
          ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
          : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  const roleBadges = model.roles.slice(0, 4);
  const visibleJobs = jobs.slice(0, 2);

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Model Loadout</h2>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/45">selected target</div>
        </div>
        <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em]", stateTone)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-300" : model.installed ? "bg-cyan-300" : "bg-amber-300")} />
          {state}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border bg-slate-950/60", active ? "border-emerald-300/25 text-emerald-100" : "border-cyan-300/20 text-cyan-100")}>
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <h3 className="truncate text-sm font-bold text-white">{model.displayName}</h3>
              <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold", model.runtime === "ollama" ? "border-sky-300/25 bg-sky-300/10 text-sky-200" : "border-violet-300/25 bg-violet-300/10 text-violet-200")}>
                {model.runtime}
              </span>
              <span className="shrink-0 rounded border border-white/10 bg-white/[0.045] px-1.5 py-0.5 text-[10px] font-semibold text-slate-300">{model.store ?? "local"}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{model.bestUse}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {(roleBadges.length > 0 ? roleBadges : [model.role]).map((role) => (
            <span key={role} className="rounded border border-white/10 bg-slate-950/35 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
              {role}
            </span>
          ))}
        </div>

        <ModelScorePanel model={model} compact />

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <MiniMetric icon={<HardDrive className="h-3.5 w-3.5" />} label="size" value={model.sizeGb ? `${model.sizeGb}GB` : "-"} />
          <MiniMetric icon={<Gauge className="h-3.5 w-3.5" />} label="bench" value={benchLabel} />
          <MiniMetric icon={<Boxes className="h-3.5 w-3.5" />} label="role" value={model.role} />
          <MiniMetric icon={<Zap className="h-3.5 w-3.5" />} label="status" value={model.installed ? "installed" : "missing"} />
        </div>

        <details className="mt-3 rounded-md border border-white/10 bg-white/[0.03]">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 text-xs font-semibold text-slate-300">
            <span>.env launch profile</span>
            <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); void onCopyEnv(); }} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-semibold text-slate-200 hover:bg-white/[0.08]">
              <Copy className="h-3 w-3" />
              Copy
            </button>
          </summary>
          <pre className="max-h-24 overflow-auto border-t border-white/10 bg-black/35 p-2 text-[11px] leading-5 text-slate-100">{model.envExample}</pre>
        </details>

        {visibleJobs.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Install Jobs</h3>
            {visibleJobs.map((job) => (
              <div key={job.id} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs">
                <div className="flex justify-between gap-2 font-semibold text-slate-200">
                  <span className="truncate">{job.modelId}</span>
                  <span>{job.status}</span>
                </div>
                {job.error && <div className="mt-1 text-rose-300">{job.error}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ModelScanCard() {
  return (
    <div className="overflow-hidden rounded-lg border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(103,232,249,0.11),rgba(15,23,42,0.5)_42%,rgba(129,140,248,0.1))] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start gap-3">
        <div className="runtime-orb runtime-orb-active relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cyan-300/20 bg-slate-950/80 text-cyan-100">
          <span className="absolute h-2 w-2 rounded-full bg-cyan-300 status-pulse" />
          <Sparkles className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white">Model Inventory</h2>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-200/55">scanning local stores</div>
          <p className="mt-2 text-xs leading-5 text-slate-400">Primary / secondary Ollama manifest와 vLLM 후보를 읽어 장착 가능한 모델 목록을 구성하고 있습니다.</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px]">
        <SignalCell label="primary" value="scan" />
        <SignalCell label="secondary" value="scan" />
        <SignalCell label="vllm" value="scan" />
      </div>
    </div>
  );
}

function RuntimeCore({ runtime, stateDot, animated, loading }: { runtime: RuntimeState; stateDot: string; animated: boolean; loading: boolean }) {
  const endpoint = loading ? "local scan" : runtime.endpoint?.replace(/^https?:\/\//, "") ?? "offline";
  const message = loading ? "Scanning model registry and install state" : runtime.message || "No runtime event";
  const displayStatus = loading ? "scanning" : runtime.status;
  const active = loading || Boolean(runtime.activeModelId);
  const port = loading ? "-" : endpoint.includes(":") ? endpoint.split(":").pop() ?? "-" : "-";
  const engine = loading ? "scanner" : runtime.runtime ?? "none";
  const link = loading ? "scan" : runtime.endpoint ? "bound" : "clear";
  const coreTone =
    displayStatus === "ready"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : displayStatus === "failed"
        ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
        : displayStatus === "scanning"
          ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        : displayStatus === "idle"
          ? "border-white/10 bg-white/[0.035] text-slate-300"
          : "border-amber-300/25 bg-amber-300/10 text-amber-100";

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-slate-950/48 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="grid grid-cols-[48px_minmax(0,1fr)] gap-2.5">
        <div className={cn("runtime-orb relative flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-slate-950/80", animated && "runtime-orb-active")}>
          <span className={cn("absolute h-2 w-2 rounded-full", stateDot, animated && "status-pulse")} />
          <Zap className="h-4 w-4 text-cyan-100" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/60">runtime core</div>
          <div className="mt-1 truncate text-sm font-bold text-white">{loading ? "Scanning model stores" : runtime.activeModelName ?? "No model loaded"}</div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-400">{endpoint}</div>
          <div className={cn("mt-1 line-clamp-1 rounded border px-2 py-1 text-[11px] font-semibold leading-4", coreTone)}>{message}</div>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5 text-[11px]" data-testid="runtime-core-signal-rail">
        <RuntimePill label="state" value={displayStatus} tone={displayStatus === "ready" ? "emerald" : displayStatus === "failed" ? "rose" : displayStatus === "idle" ? "slate" : "amber"} />
        <RuntimePill label="link" value={link} tone={active ? "cyan" : "slate"} />
        <RuntimePill label="engine" value={engine} tone={engine === "vllm" ? "violet" : engine === "none" ? "slate" : "cyan"} />
        <RuntimePill label="port" value={port} tone={port === "-" ? "slate" : "emerald"} />
      </div>
    </div>
  );
}

function RuntimePill({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "amber" | "rose" | "violet" | "slate" }) {
  const toneClass = {
    cyan: "border-cyan-300/18 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/18 bg-amber-300/10 text-amber-100",
    rose: "border-rose-300/18 bg-rose-300/10 text-rose-100",
    violet: "border-violet-300/18 bg-violet-300/10 text-violet-100",
    slate: "border-white/10 bg-white/[0.035] text-slate-400"
  }[tone];

  return (
    <div className={cn("min-w-0 rounded border px-1.5 py-1 shadow-inner shadow-white/[0.018]", toneClass)}>
      <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-55">{label}</div>
      <div className="truncate text-[11px] font-black">{value}</div>
    </div>
  );
}

function SignalCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
      <div className="text-slate-500">{label}</div>
      <div className="truncate font-bold text-slate-100">{value}</div>
    </div>
  );
}

function compactEndpoint(endpoint: string): string {
  return endpoint.replace(/^https?:\/\//, "");
}

function MiniMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] p-2">
      <div className="flex items-center gap-1 text-[11px] text-slate-500">
        <span className="text-cyan-200/55">{icon}</span>
        {label}
      </div>
      <div className="truncate text-xs font-semibold text-slate-100">{value}</div>
    </div>
  );
}

type ParsedLogEntry = {
  time: string;
  level: string;
  source: string;
  message: string;
  dotClass: string;
  badgeClass: string;
};

function EventStream({ logs }: { logs: string[] }) {
  const visible = logs.slice(-12).reverse().map(parseLogLine);
  if (visible.length === 0) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-white/10 bg-white/[0.025] px-3 py-3 text-xs font-semibold text-slate-500">
        No runtime events yet.
      </div>
    );
  }

  return (
    <div className="mt-2 max-h-16 space-y-1 overflow-auto rounded-md border border-white/10 bg-black/32 p-1.5 pr-1" data-testid="runtime-event-stream">
      {visible.map((entry, index) => (
        <div key={`${entry.time}-${index}`} className="grid grid-cols-[38px_34px_minmax(0,1fr)] items-center gap-2 rounded px-1.5 py-1 text-[11px] leading-4 transition hover:bg-white/[0.035]">
          <div className="min-w-0 font-mono text-[10px] font-semibold text-slate-500">{entry.time}</div>
          <div className="min-w-0">
            <span className={cn("inline-flex w-full items-center justify-center rounded border px-1 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em]", entry.badgeClass)}>{entry.level}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", entry.dotClass)} />
            <span className="max-w-[72px] shrink-0 truncate text-[10px] font-bold uppercase tracking-[0.1em] text-cyan-100/55">{entry.source}</span>
            <span className="min-w-0 truncate font-mono text-[11px] text-slate-300">{entry.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function parseLogLine(line: string): ParsedLogEntry {
  const match = line.match(/^\[([^\]]+)\]\s*(.*)$/);
  const rawBody = (match?.[2] ?? line).replace(/\s+/g, " ").trim();
  const kv = Object.fromEntries(
    [...rawBody.matchAll(/(\w+)=("[^"]*"|\S+)/g)].map(([, key, value]) => [key, value.replace(/^"|"$/g, "")])
  );
  const source = detectLogSource(rawBody, kv.source);
  const message = cleanLogMessage(rawBody, kv.msg, source);
  const level = normalizeLogLevel(kv.level ?? rawBody);
  const tone = logTone(level, message);

  return {
    time: compactLogTime(match?.[1]),
    level,
    source,
    message: message || rawBody || "runtime event",
    dotClass: tone.dotClass,
    badgeClass: tone.badgeClass
  };
}

function detectLogSource(rawBody: string, explicitSource?: string): string {
  if (explicitSource) return explicitSource.replace(/^.*[\\/]/, "");
  if (rawBody.startsWith("[mock]")) return "mock";
  if (rawBody.startsWith("[GIN]")) return "gin";

  const sourceMatch = rawBody.match(/^([A-Za-z0-9_.:-]+)\s+/);
  const candidate = sourceMatch?.[1] ?? "";
  if (/^(srv|slot|llama|ollama|vllm|runtime|healthcheck|server|bench)$/i.test(candidate)) {
    return candidate.replace(/^.*[\\/]/, "").toLowerCase();
  }

  return "runtime";
}

function cleanLogMessage(rawBody: string, explicitMessage: string | undefined, source: string): string {
  const sourcePrefix = source !== "runtime" && source !== "mock" && source !== "gin" ? new RegExp(`^${escapeRegExp(source)}\\s+`, "i") : null;
  return (explicitMessage ?? rawBody)
    .replace(/^\[mock\]\s*/, "")
    .replace(/^\[GIN\]\s*/, "http ")
    .replace(/\btime=\S+\s*/g, "")
    .replace(/\blevel=\S+\s*/g, "")
    .replace(/\bsource=\S+\s*/g, "")
    .replace(/\bmsg="([^"]+)"/g, "$1")
    .replace(sourcePrefix ?? /^$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLogLevel(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes("error") || lower.includes("failed")) return "err";
  if (lower.includes("warn")) return "warn";
  if (lower.includes("debug") || lower.includes("trace")) return "trace";
  if (lower.includes("ready") || lower.includes("start") || lower.includes("load")) return "info";
  return "log";
}

function compactLogTime(time?: string): string {
  if (!time) return "--:--";
  const match = time.match(/(\d{1,2}:\d{2})(?::\d{2})?/);
  return match?.[1] ?? time.slice(0, 5);
}

function logTone(level: string, message: string): { dotClass: string; badgeClass: string } {
  const lower = message.toLowerCase();
  if (level === "err" || lower.includes("error") || lower.includes("failed")) {
    return { dotClass: "bg-rose-300", badgeClass: "border-rose-300/25 bg-rose-300/10 text-rose-100" };
  }
  if (level === "warn" || lower.includes("warning")) {
    return { dotClass: "bg-amber-300", badgeClass: "border-amber-300/25 bg-amber-300/10 text-amber-100" };
  }
  if (level === "info" || lower.includes("ready") || lower.includes("start") || lower.includes("load")) {
    return { dotClass: "bg-cyan-300", badgeClass: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" };
  }
  if (level === "trace") {
    return { dotClass: "bg-violet-300", badgeClass: "border-violet-300/25 bg-violet-300/10 text-violet-100" };
  }
  return { dotClass: "bg-slate-500", badgeClass: "border-white/10 bg-white/[0.04] text-slate-400" };
}
