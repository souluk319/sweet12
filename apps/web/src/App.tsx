import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Boxes, BrainCircuit, ChevronDown, Code2, Download, Gamepad2, Gauge, HardDrive, Keyboard, Languages, MessageSquare, Play, Power, RefreshCcw, Search, Sparkles, TimerReset, X } from "lucide-react";
import { apiMessages, fetchInstallJobs, fetchModels, fetchRuntime, installModel, runBench, stopRuntime, streamChat, switchModel } from "./lib/api";
import { cn } from "./lib/cn";
import { getModelScore } from "./lib/modelScore";
import type { ChatAttachment, ChatMessage, InstallJob, ModelsResponse, ModelView, RuntimeState } from "./types";
import { ModelCard } from "./components/ModelCard";
import { ChatPanel } from "./components/ChatPanel";
import { StatusPanel } from "./components/StatusPanel";
import { ModelScorePanel } from "./components/ModelScorePanel";

const roles = [
  { id: "coding", label: "Coding", icon: Code2 },
  { id: "reasoning", label: "Reason", icon: BrainCircuit },
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "vision", label: "Vision", icon: Sparkles },
  { id: "translation", label: "Translate", icon: Languages },
  { id: "embedding", label: "Embed", icon: Search },
  { id: "stress-test", label: "Stress", icon: Boxes }
];

const emptyRuntime: RuntimeState = {
  status: "idle",
  message: "No model loaded",
  logs: []
};

export default function App() {
  const [modelsData, setModelsData] = useState<ModelsResponse>();
  const [runtime, setRuntime] = useState<RuntimeState>(emptyRuntime);
  const [jobs, setJobs] = useState<InstallJob[]>([]);
  const [role, setRole] = useState("coding");
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [mobileConsoleOpen, setMobileConsoleOpen] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("You are a pragmatic senior software engineering assistant. Keep answers concrete and useful.");
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(512);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string>();
  const abortRef = useRef<AbortController | null>(null);
  const selectorSearchRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const [models, currentRuntime, installJobs] = await Promise.all([fetchModels(), fetchRuntime(), fetchInstallJobs()]);
    setModelsData(models);
    setRuntime(currentRuntime);
    setJobs(installJobs);
  }

  useEffect(() => {
    void refresh().catch((error) => setToast(error.message));
    const interval = window.setInterval(() => {
      void refresh().catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSelectorOpen(true);
        return;
      }
      if (event.key === "Escape" && selectorOpen) {
        event.preventDefault();
        setSelectorOpen(false);
      }
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [selectorOpen]);

  useLayoutEffect(() => {
    if (!selectorOpen) return;
    let secondFrame = 0;
    const timers: number[] = [];
    const focusSearch = () => {
      selectorSearchRef.current?.focus();
      selectorSearchRef.current?.select();
    };
    focusSearch();
    const firstFrame = window.requestAnimationFrame(() => {
      focusSearch();
      secondFrame = window.requestAnimationFrame(focusSearch);
      timers.push(window.setTimeout(focusSearch, 40));
      timers.push(window.setTimeout(focusSearch, 120));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [selectorOpen]);

  const filteredModels = useMemo(() => {
    const models = modelsData?.models ?? [];
    const needle = query.trim().toLowerCase();
    return models.filter(
      (model) =>
        model.roles.includes(role) &&
        (!needle || `${model.displayName} ${model.reason} ${model.bestUse} ${model.ollamaModel ?? ""}`.toLowerCase().includes(needle))
    );
  }, [modelsData, role, query]);
  const deckSummary = useMemo(() => getDeckSummary(filteredModels), [filteredModels]);
  const spotlightModels = useMemo(() => getSpotlightModels(filteredModels), [filteredModels]);

  const selectedModel = useMemo(() => {
    const models = modelsData?.models ?? [];
    return models.find((model) => model.id === selectedModelId) ?? models.find((model) => model.id === runtime.activeModelId) ?? filteredModels[0] ?? models[0];
  }, [filteredModels, modelsData, runtime.activeModelId, selectedModelId]);
  const selectedScore = useMemo(() => (selectedModel ? getModelScore(selectedModel) : undefined), [selectedModel]);
  const selectedIsActive = Boolean(selectedModel?.id && runtime.activeModelId === selectedModel.id);
  const unloading = runtime.status === "stopping";
  const installing = runtime.status === "installing";
  const canUnload = !unloading && !installing;
  const busy = ["stopping", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const modelsLoading = !modelsData;
  const gpuUsed = modelsData?.gpu.usedMb && modelsData.gpu.totalMb ? Math.round((modelsData.gpu.usedMb / modelsData.gpu.totalMb) * 100) : undefined;
  const installedCount = modelsData?.models.filter((model) => model.installed).length ?? 0;
  const totalCount = modelsData?.models.length ?? 0;
  const diskFree = modelsData?.disk.freeGb ?? null;
  const diskGauge = diskFree === null ? undefined : Math.max(0, Math.min(100, Math.round((diskFree / 200) * 100)));
  const installedRatio = totalCount > 0 ? Math.round((installedCount / totalCount) * 100) : undefined;
  const roleLabel = roles.find((item) => item.id === role)?.label ?? "Models";
  const animatedRuntime = modelsLoading || ["ready", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const runtimeDot =
    runtime.status === "ready" ? "bg-emerald-300 text-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.7)]" : runtime.status === "failed" ? "bg-rose-400 text-rose-400" : runtime.status === "idle" ? "bg-slate-500 text-slate-500" : "bg-amber-300 text-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.55)]";
  const selectorDot = modelsLoading ? "bg-cyan-300 text-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.5)]" : selectedIsActive ? runtimeDot : selectedModel?.installed ? "bg-cyan-300 text-cyan-300 shadow-[0_0_16px_rgba(103,232,249,0.5)]" : "bg-amber-300 text-amber-300";
  const selectorStatus = modelsLoading ? "scanning" : selectedIsActive ? runtime.status : selectedModel?.installed ? "selected" : "missing";
  const selectorLabel = modelsLoading ? "모델 저장소 스캔 중" : selectedModel?.displayName ?? runtime.activeModelName ?? "LLM 선택";
  const scoreTone = selectedScore?.tone === "emerald" ? "emerald" : selectedScore?.tone === "amber" ? "amber" : selectedScore?.tone === "slate" ? "violet" : "cyan";
  const headerBenchLabel = selectedModel?.bench ? `${selectedModel.bench.avgTps.toFixed(0)} t/s` : selectedModel?.expectedTps ? `~${selectedModel.expectedTps}` : "-";

  async function action(work: () => Promise<unknown>) {
    try {
      setToast(undefined);
      await work();
      await refresh();
    } catch (error) {
      setToast(error instanceof Error ? error.message : String(error));
      await refresh().catch(() => undefined);
    }
  }

  async function send(promptOverride?: string, historyOverride = messages, attachmentOverride = attachments) {
    const prompt = (promptOverride ?? input).trim();
    if ((!prompt && attachmentOverride.length === 0) || sending) return;
    const targetModel = selectedModel;
    const hasImages = attachmentOverride.some((attachment) => attachment.kind === "image");
    const attachmentText = attachmentOverride
      .filter((attachment) => attachment.kind !== "image")
      .map((attachment) => {
        if (attachment.text) {
          return [
            `[file attached: ${attachment.name}, ${attachment.mimeType || "text/plain"}, ${attachment.truncated ? "truncated" : "full"}]`,
            "```",
            attachment.text,
            "```"
          ].join("\n");
        }
        return `[${attachment.kind} attached: ${attachment.name}, ${attachment.mimeType}. Content is not sent because this local runtime does not support that attachment type.]`;
      })
      .join("\n");
    const content = [prompt || (hasImages ? "Describe the attached image." : ""), attachmentText].filter(Boolean).join("\n\n");
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content, attachments: attachmentOverride };
    const assistantMessage: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const next = [...historyOverride, userMessage, assistantMessage];
    setMessages(next);
    if (!promptOverride) setInput("");
    if (!promptOverride) setAttachments([]);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!targetModel) throw new Error("먼저 모델을 선택하세요.");
      if (!targetModel.installed) throw new Error(`${targetModel.displayName} is not installed`);
      if (targetModel.role === "embedding") throw new Error("Embedding models are not chat targets");
      if (runtime.status !== "ready" || runtime.activeModelId !== targetModel.id) {
        const switched = await switchModel(targetModel.id);
        setRuntime(switched);
        if (switched.status !== "ready") throw new Error(switched.lastError ?? switched.message ?? "Model did not become ready");
      }
      await streamChat(
        {
          messages: apiMessages(next.slice(0, -1)),
          systemPrompt,
          temperature,
          maxTokens
        },
        (token) => {
          setMessages((current) => current.map((message) => (message.id === assistantMessage.id ? { ...message, content: message.content + token } : message)));
        },
        controller.signal,
        (token) => {
          setMessages((current) =>
            current.map((message) => (message.id === assistantMessage.id ? { ...message, reasoning: `${message.reasoning ?? ""}${token}` } : message))
          );
        }
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: "", error: error instanceof Error ? error.message : String(error) } : message
        )
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  function stopGenerating() {
    abortRef.current?.abort();
  }

  function newChat() {
    stopGenerating();
    setMessages([]);
    setAttachments([]);
    setInput("");
  }

  function unloadForGaming() {
    stopGenerating();
    setSelectorOpen(false);
    void action(stopRuntime);
  }

  async function regenerate() {
    const lastUserIndex = [...messages].reverse().findIndex((message) => message.role === "user");
    if (lastUserIndex < 0) return;
    const actualIndex = messages.length - 1 - lastUserIndex;
    const prompt = messages[actualIndex].content;
    const history = messages.slice(0, actualIndex);
    setMessages(history);
    await send(prompt, history, []);
  }

  return (
    <main className="lab-shell h-screen overflow-hidden text-slate-100">
      <div className="relative mx-auto flex h-full max-w-[1680px] flex-col px-3 py-3">
        <header className="surface-premium mb-3 grid shrink-0 grid-cols-1 items-center gap-3 overflow-hidden rounded-lg border border-white/10 bg-slate-950/72 p-2.5 backdrop-blur-xl xl:grid-cols-[minmax(300px,auto)_minmax(0,1fr)]">
          <div className="flex min-w-0 items-center gap-2 px-1">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-300 via-cyan-300 to-indigo-400 text-slate-950 shadow-[0_0_32px_rgba(45,212,191,0.28)]">
              <Sparkles className="h-4 w-4" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-300 ring-2 ring-slate-950" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-cyan-200/70">12GB VRAM Sweet Spot</div>
              <h1 className="truncate text-base font-bold tracking-normal text-white">SWEET12</h1>
            </div>
            <div className="ml-2 hidden min-w-0 items-center gap-1.5 sm:flex">
              <TopSignal icon={HardDrive} label="F:" value={modelsLoading ? "scan" : diskFree === null ? "-" : `${diskFree}GB`} meter={diskGauge} tone={modelsData?.disk.lowSpace ? "rose" : "cyan"} />
              <TopSignal icon={Gauge} label="VRAM" value={modelsLoading ? "scan" : gpuUsed === undefined ? "-" : `${gpuUsed}%`} meter={gpuUsed} tone={(gpuUsed ?? 0) > 85 ? "amber" : "emerald"} />
              <TopSignal icon={Boxes} label="MODELS" value={modelsLoading ? "scan" : `${installedCount}/${totalCount || "-"}`} meter={installedRatio} tone="violet" />
              <TopSignal icon={Sparkles} label="FIT" value={modelsLoading ? "scan" : selectedScore ? `${selectedScore.score}/100` : "-"} meter={selectedScore?.score} tone={scoreTone} />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open model selector"
              aria-keyshortcuts="Control+K Meta+K"
              onClick={() => setSelectorOpen((open) => !open)}
              className="group inline-flex h-11 min-w-0 flex-1 items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.055] px-3 text-sm font-semibold text-slate-100 shadow-inner shadow-white/[0.03] transition hover:border-cyan-300/35 hover:bg-white/[0.08]"
              data-testid="header-model-selector"
            >
              <span className="inline-flex min-w-0 items-center gap-2">
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", selectorDot, animatedRuntime && "status-pulse")} />
                <span className="min-w-0 truncate text-left">{selectorLabel}</span>
                {selectedModel && (
                  <span className="hidden min-w-0 items-center gap-1.5 xl:inline-flex" data-testid="header-loadout-strip">
                    <HeaderMeta value={selectedModel.runtime} tone={selectedModel.runtime === "vllm" ? "violet" : "cyan"} />
                    <HeaderMeta value={selectedModel.store ?? selectedModel.role} tone={selectedModel.installed ? "emerald" : "amber"} />
                    <HeaderMeta value={headerBenchLabel} tone="slate" />
                  </span>
                )}
              </span>
              <span className="inline-flex shrink-0 items-center gap-2 text-xs text-slate-400">
                <span
                  className={cn(
                    "hidden items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] md:inline-flex",
                    selectedScore?.tone === "emerald"
                      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                      : selectedScore?.tone === "amber"
                        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
                        : selectedScore?.tone === "slate"
                          ? "border-slate-300/20 bg-slate-300/10 text-slate-200"
                          : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
                  )}
                  data-testid="header-fit-pill"
                >
                  <Sparkles className="h-3 w-3" />
                  fit {modelsLoading ? "scan" : selectedScore?.score ?? "-"}
                </span>
                <span className="hidden h-6 w-6 items-center justify-center rounded border border-white/10 bg-slate-950/50 text-slate-500 transition group-hover:border-cyan-300/25 group-hover:text-cyan-100 md:inline-flex" title="Open model selector with Ctrl/Cmd+K" data-testid="selector-shortcut-affordance" aria-hidden="true">
                  <Keyboard className="h-3.5 w-3.5" />
                </span>
                <span className="hidden sm:inline">{selectorStatus}</span>
                <ChevronDown className="h-4 w-4 transition group-hover:text-cyan-200" />
              </span>
            </button>
            <button
              type="button"
              title="Unload local LLM runtimes and free GPU/VRAM for games"
              aria-label="Unload local LLM runtimes for gaming"
              disabled={!canUnload}
              onClick={unloadForGaming}
              className="game-mode-button inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md px-3 text-sm font-bold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">{unloading ? "Unloading" : "Game mode"}</span>
            </button>
            <button type="button" aria-label="Refresh status" title="Refresh status" onClick={() => void refresh()} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.055] text-slate-200 shadow-inner shadow-white/[0.03] transition hover:border-cyan-300/35 hover:bg-white/[0.08]">
              <RefreshCcw className="h-4 w-4" />
            </button>
          </div>
        </header>

        <MobileSignalRail
          loading={modelsLoading}
          disk={diskFree === null ? "-" : `${diskFree}GB`}
          diskMeter={diskGauge}
          diskLow={Boolean(modelsData?.disk.lowSpace)}
          vram={gpuUsed === undefined ? "-" : `${gpuUsed}%`}
          vramMeter={gpuUsed}
          fit={selectedScore ? `${selectedScore.score}` : "-"}
          fitMeter={selectedScore?.score}
          status={selectorStatus}
          onOpenConsole={() => setMobileConsoleOpen(true)}
        />

        {toast && <div className="mb-3 shrink-0 rounded-md border border-rose-400/25 bg-rose-950/70 px-4 py-2 text-sm font-semibold text-rose-100 shadow-lg shadow-rose-950/25">{toast}</div>}

        {selectorOpen && (
          <div className="fixed inset-0 z-40 bg-slate-950/95 px-3 py-3" onClick={() => setSelectorOpen(false)}>
            <section
              className="surface-premium mx-auto flex h-[min(760px,calc(100vh-24px))] max-w-[1180px] flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/95 ring-1 ring-cyan-300/10"
              onClick={(event) => event.stopPropagation()}
            >
              <SelectorTitleBar
                roleLabel={roleLabel}
                filteredCount={filteredModels.length}
                installedCount={installedCount}
                totalCount={totalCount}
                selectedModel={filteredModels.length === 0 ? undefined : selectedModel}
                selectedScore={filteredModels.length === 0 ? undefined : selectedScore?.score}
                selectorStatus={filteredModels.length === 0 ? "filtered" : selectorStatus}
                onClose={() => setSelectorOpen(false)}
              />

              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-h-0 overflow-y-auto scroll-py-4 px-3 pb-3">
                  <div className="sticky top-0 z-20 -mx-3 border-b border-white/10 bg-slate-950/94 px-3 pb-3 pt-3 shadow-[0_18px_36px_rgba(0,0,0,0.28)] backdrop-blur-xl" data-testid="selector-command-deck">
                    <DeckSummaryBar summary={deckSummary} />
                    <RoleRail role={role} onRole={setRole} />
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3">
                      <Search className="h-4 w-4 text-cyan-200/70" />
                      <input
                        ref={selectorSearchRef}
                        autoFocus
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Filter models"
                        data-testid="selector-search-input"
                        className="h-10 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
                      />
                      <span className="hidden shrink-0 rounded border border-white/10 bg-slate-950/48 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100/55 sm:inline" data-testid="selector-search-count">
                        {filteredModels.length} hit{filteredModels.length === 1 ? "" : "s"}
                      </span>
                      {query.trim().length > 0 && (
                        <button
                          type="button"
                          aria-label="Clear model filter"
                          onClick={() => {
                            setQuery("");
                            window.setTimeout(() => selectorSearchRef.current?.focus(), 0);
                          }}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-white/10 bg-slate-950/48 text-slate-400 transition hover:border-cyan-300/30 hover:text-cyan-100"
                          data-testid="selector-search-clear"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    <ModelSpotlight models={spotlightModels} selectedModelId={selectedModel?.id} onSelect={setSelectedModelId} />
                  </div>

                  {selectedModel && filteredModels.length > 0 && (
                    <div className="lg:hidden">
                      <ModelSelectorPreview
                        model={selectedModel}
                        runtime={runtime}
                        busy={busy}
                        onSwitch={(modelId) => {
                          setSelectedModelId(modelId);
                          setSelectorOpen(false);
                          void action(() => switchModel(modelId));
                        }}
                        onInstall={(modelId) => void action(() => installModel(modelId))}
                        onBench={(modelId) => void action(() => runBench(modelId))}
                        onStop={() => void action(stopRuntime)}
                      />
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    {filteredModels.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        runtime={runtime}
                        selected={selectedModel?.id === model.id}
                        onSelect={setSelectedModelId}
                        onSwitch={(modelId) => {
                          setSelectedModelId(modelId);
                          setSelectorOpen(false);
                          void action(() => switchModel(modelId));
                        }}
                        onInstall={(modelId) => void action(() => installModel(modelId))}
                        onBench={(modelId) => void action(() => runBench(modelId))}
                        onStop={() => void action(stopRuntime)}
                      />
                    ))}
                  </div>
                  {filteredModels.length === 0 && (
                    <SelectorEmptyState
                      query={query}
                      roleLabel={roleLabel}
                      onClear={() => {
                        setQuery("");
                        window.setTimeout(() => selectorSearchRef.current?.focus(), 0);
                      }}
                    />
                  )}
                </div>

                {selectedModel && (
                  <aside className="hidden min-h-0 overflow-y-auto border-l border-white/10 bg-white/[0.025] p-3 lg:block">
                    {filteredModels.length === 0 ? (
                      <SelectorPreviewEmpty query={query} roleLabel={roleLabel} onClear={() => {
                        setQuery("");
                        window.setTimeout(() => selectorSearchRef.current?.focus(), 0);
                      }} />
                    ) : (
                      <ModelSelectorPreview
                        model={selectedModel}
                        runtime={runtime}
                        busy={busy}
                        onSwitch={(modelId) => {
                          setSelectedModelId(modelId);
                          setSelectorOpen(false);
                          void action(() => switchModel(modelId));
                        }}
                        onInstall={(modelId) => void action(() => installModel(modelId))}
                        onBench={(modelId) => void action(() => runBench(modelId))}
                        onStop={() => void action(stopRuntime)}
                      />
                    )}
                  </aside>
                )}
              </div>
            </section>
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ChatPanel
            runtime={runtime}
            messages={messages}
            selectedModel={selectedModel}
            loading={modelsLoading}
            attachments={attachments}
            input={input}
            systemPrompt={systemPrompt}
            temperature={temperature}
            maxTokens={maxTokens}
            sending={sending}
            onInput={setInput}
            onAttachments={setAttachments}
            onSystemPrompt={setSystemPrompt}
            onTemperature={setTemperature}
            onMaxTokens={setMaxTokens}
            onSend={() => void send()}
            onStopGenerating={stopGenerating}
            onClear={newChat}
            onRegenerate={() => void regenerate()}
          />

          <div className="hidden min-h-0 lg:block">
            <StatusPanel
              data={modelsData}
              runtime={runtime}
              jobs={jobs}
              selectedModel={selectedModel}
              messages={messages}
              attachments={attachments}
              sending={sending}
              loading={modelsLoading}
              onStop={() => void action(stopRuntime)}
            />
          </div>
        </div>

        {mobileConsoleOpen && (
          <MobileConsoleDrawer
            data={modelsData}
            runtime={runtime}
            jobs={jobs}
            selectedModel={selectedModel}
            messages={messages}
            attachments={attachments}
            sending={sending}
            loading={modelsLoading}
            onStop={() => void action(stopRuntime)}
            onClose={() => setMobileConsoleOpen(false)}
          />
        )}
      </div>
    </main>
  );
}

function RoleRail({ role, onRole }: { role: string; onRole: (role: string) => void }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 lg:grid lg:grid-cols-[repeat(7,minmax(0,1fr))] lg:overflow-visible lg:pb-0" data-testid="selector-role-rail">
      {roles.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onRole(id)}
          className={cn(
            "inline-flex h-9 min-w-[112px] items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition lg:min-w-0",
            role === id ? "border-cyan-300/40 bg-cyan-300 text-slate-950 shadow-[0_0_22px_rgba(103,232,249,0.18)]" : "border-white/10 bg-white/[0.055] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]"
          )}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      ))}
    </div>
  );
}

function SelectorEmptyState({ query, roleLabel, onClear }: { query: string; roleLabel: string; onClear: () => void }) {
  const displayQuery = query.trim() || "current filter";

  return (
    <div
      className="mt-3 overflow-hidden rounded-lg border border-dashed border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,145,178,0.11),rgba(15,23,42,0.68)_46%,rgba(49,46,129,0.12))] p-4 shadow-inner shadow-white/[0.025]"
      data-testid="selector-empty-state"
    >
      <div className="grid gap-3 sm:grid-cols-[48px_minmax(0,1fr)_auto] sm:items-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-cyan-300/18 bg-cyan-300/10 text-cyan-100">
          <Search className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/55">No match in {roleLabel}</div>
          <h3 className="mt-1 truncate text-base font-black text-white">{displayQuery}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-400">Try another role deck or clear the model filter.</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-300/10 px-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/16"
          data-testid="selector-empty-clear"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-1.5 text-[11px]">
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <div className="text-slate-500">role</div>
          <div className="truncate font-bold text-slate-100">{roleLabel}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <div className="text-slate-500">query</div>
          <div className="truncate font-bold text-slate-100">{displayQuery}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <div className="text-slate-500">hits</div>
          <div className="font-bold text-slate-100">0</div>
        </div>
      </div>
    </div>
  );
}

function SelectorPreviewEmpty({ query, roleLabel, onClear }: { query: string; roleLabel: string; onClear: () => void }) {
  const displayQuery = query.trim() || "current filter";

  return (
    <div
      className="relative mt-3 overflow-hidden rounded-lg border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(15,23,42,0.86)_44%,rgba(45,212,191,0.08))] p-3 shadow-[0_20px_70px_rgba(8,47,73,0.14)]"
      data-testid="selector-preview-empty"
    >
      <div className="handoff-line pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
      </div>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/18 bg-cyan-300/10 text-cyan-100">
          <Search className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/50">No preview target</div>
          <h3 className="mt-1 truncate text-base font-black text-white">{displayQuery}</h3>
          <p className="mt-1 line-clamp-3 text-sm leading-6 text-slate-400">No model in {roleLabel} matches this filter. Clear it to restore loadout previews.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-cyan-300 px-3 text-sm font-bold text-slate-950 shadow-[0_0_24px_rgba(103,232,249,0.16)] transition hover:brightness-110"
      >
        <X className="h-4 w-4" />
        Clear filter
      </button>
      <div className="mt-3 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <div className="text-slate-500">role</div>
          <div className="truncate font-bold text-slate-100">{roleLabel}</div>
        </div>
        <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5">
          <div className="text-slate-500">hits</div>
          <div className="font-bold text-slate-100">0</div>
        </div>
      </div>
    </div>
  );
}

function SelectorTitleBar({
  roleLabel,
  filteredCount,
  installedCount,
  totalCount,
  selectedModel,
  selectedScore,
  selectorStatus,
  onClose
}: {
  roleLabel: string;
  filteredCount: number;
  installedCount: number;
  totalCount: number;
  selectedModel?: ModelView;
  selectedScore?: number;
  selectorStatus: string;
  onClose: () => void;
}) {
  const statusTone =
    selectorStatus === "ready"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : selectorStatus === "missing"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : selectorStatus === "failed"
          ? "border-rose-300/25 bg-rose-300/10 text-rose-100"
          : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  const statusDot =
    selectorStatus === "ready"
      ? "bg-emerald-300"
      : selectorStatus === "missing"
        ? "bg-amber-300"
        : selectorStatus === "failed"
          ? "bg-rose-300"
          : "bg-cyan-300";

  return (
    <div
      className="relative shrink-0 overflow-hidden border-b border-white/10 bg-[linear-gradient(135deg,rgba(8,47,73,0.5),rgba(15,23,42,0.88)_48%,rgba(49,46,129,0.3))] p-3"
      data-testid="selector-title-bar"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(103,232,249,0.18),transparent_32%),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:auto,32px_32px]" />
      <div className="relative grid items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)_40px]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_32px_rgba(103,232,249,0.16)]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-black text-white">LLM 선택</h2>
              <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", statusTone)}>
                <span className={cn("h-1.5 w-1.5 rounded-full", statusDot)} />
                {selectorStatus}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold text-slate-400">{roleLabel} deck · {filteredCount} shown · {installedCount}/{totalCount || "-"} installed</p>
          </div>
        </div>

        <div className="hidden min-w-0 rounded-lg border border-white/10 bg-slate-950/42 p-2 shadow-inner shadow-white/[0.025] md:block">
          <div className="grid grid-cols-[minmax(0,1fr)_64px_82px] items-center gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/50">selected target</div>
              <div className="mt-0.5 truncate text-sm font-black text-white">{selectedModel?.displayName ?? "No model selected"}</div>
            </div>
            <div className="rounded-md border border-cyan-300/18 bg-cyan-300/10 px-2 py-1 text-center">
              <div className="text-sm font-black text-white">{selectedScore ?? "-"}</div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100/50">fit</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 text-center">
              <div className="truncate text-sm font-black text-white">{selectedModel?.runtime ?? "-"}</div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">engine</div>
            </div>
          </div>
        </div>

        <button type="button" aria-label="Close model selector" onClick={onClose} className="absolute right-0 top-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/[0.08] md:relative">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ModelSelectorPreview({
  model,
  runtime,
  busy,
  onSwitch,
  onInstall,
  onBench,
  onStop
}: {
  model: ModelView;
  runtime: RuntimeState;
  busy: boolean;
  onSwitch: (modelId: string) => void;
  onInstall: (modelId: string) => void;
  onBench: (modelId: string) => void;
  onStop: () => void;
}) {
  const active = runtime.activeModelId === model.id;
  const isEmbedding = model.role === "embedding";
  const speed = model.bench ? `${model.bench.avgTps.toFixed(0)} t/s` : model.expectedTps ? `~${model.expectedTps}` : "-";
  const canStop = active && runtime.status !== "idle" && !busy;
  const roleText = model.roles.slice(0, 3).join(" / ");
  const score = getModelScore(model);
  const stateLabel = active ? runtime.status : model.installed ? "selected" : model.installable ? "installable" : "manual";

  return (
    <div
      data-testid="model-selector-preview"
      className="relative mt-3 overflow-hidden rounded-lg border border-cyan-300/20 bg-[linear-gradient(135deg,rgba(14,165,233,0.13),rgba(15,23,42,0.86)_42%,rgba(45,212,191,0.1))] p-3 shadow-[0_20px_70px_rgba(8,47,73,0.16)]"
    >
      <div className="handoff-line pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
        <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-200/70 to-transparent" />
      </div>
      <SelectorPreviewHero
        model={model}
        active={active}
        status={stateLabel}
        score={score}
        speed={speed}
        roleText={roleText || model.role}
      />

      <SelectorLoadoutPath model={model} active={active} busy={busy} speed={speed} runtimeStatus={runtime.status} />

      <SelectorDecisionDeck model={model} score={score} active={active} speed={speed} />

      <div className="mt-3 grid gap-2" data-testid="selector-preview-actions">
        <button
          type="button"
          disabled={!model.installed || busy}
          onClick={() => onSwitch(model.id)}
          className="inline-flex h-10 min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-cyan-300 px-3 text-sm font-black text-slate-950 shadow-[0_0_24px_rgba(103,232,249,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
          data-testid="selector-preview-primary-action"
        >
          <Play className="h-4 w-4" />
          <span>{active ? "재장착" : isEmbedding ? "준비" : "장착"}</span>
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            disabled={!model.installable || model.installed || busy}
            onClick={() => onInstall(model.id)}
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.055] px-2 text-xs font-bold text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Download className="h-3.5 w-3.5" />
            <span>설치</span>
          </button>
          <button
            type="button"
            disabled={!model.installed || busy || isEmbedding}
            onClick={() => onBench(model.id)}
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.055] px-2 text-xs font-bold text-slate-200 transition hover:border-cyan-300/30 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <TimerReset className="h-3.5 w-3.5" />
            <span>벤치</span>
          </button>
          <button
            type="button"
            disabled={!canStop}
            onClick={onStop}
            className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-white/10 bg-white/[0.055] px-2 text-xs font-bold text-slate-200 transition hover:border-rose-300/30 hover:bg-rose-400/10 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <Power className="h-3.5 w-3.5" />
            <span>해제</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function SelectorPreviewHero({
  model,
  active,
  status,
  score,
  speed,
  roleText
}: {
  model: ModelView;
  active: boolean;
  status: string;
  score: ReturnType<typeof getModelScore>;
  speed: string;
  roleText: string;
}) {
  const statusTone = active
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : model.installed
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : "border-amber-300/25 bg-amber-300/10 text-amber-100";
  const scoreTone =
    score.tone === "emerald"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : score.tone === "amber"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : score.tone === "slate"
          ? "border-white/10 bg-white/[0.035] text-slate-300"
          : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";

  return (
    <div
      className="selector-preview-hero-surface relative overflow-hidden rounded-lg border border-white/10 p-2.5 shadow-inner shadow-white/[0.025]"
      data-testid="selector-preview-hero"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent" />
      <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2.5">
        <div className={cn("flex h-16 min-w-0 flex-col items-center justify-center rounded-lg border text-center", scoreTone)}>
          <div className="text-2xl font-black leading-none text-white">{score.score}</div>
          <div className="mt-0.5 text-[9px] font-black uppercase tracking-[0.12em] opacity-60">fit</div>
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className={cn("inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", statusTone)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-300" : model.installed ? "bg-cyan-300" : "bg-amber-300")} />
              {status}
            </span>
            <span className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-300">{model.runtime}</span>
            <span className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-300">{model.store ?? model.role}</span>
          </div>
          <h3 data-testid="selector-preview-title" className="mt-1.5 truncate text-base font-black text-white sm:text-lg">{model.displayName}</h3>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-300">{model.bestUse}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <PreviewChip icon={HardDrive} label="size" value={model.sizeGb ? `${model.sizeGb}GB` : "-"} />
        <PreviewChip icon={Gauge} label="speed" value={speed} />
        <PreviewChip icon={Boxes} label="role" value={roleText} />
      </div>
      <div className="mt-2 rounded-md border border-white/10 bg-slate-950/35 px-2 py-1.5">
        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100/45">decision</div>
        <div className="mt-0.5 truncate text-xs font-black text-white">{score.label}</div>
      </div>
    </div>
  );
}

function SelectorLoadoutPath({
  model,
  active,
  busy,
  speed,
  runtimeStatus
}: {
  model: ModelView;
  active: boolean;
  busy: boolean;
  speed: string;
  runtimeStatus: string;
}) {
  const hasVision = model.roles.includes("vision") || /vision|image|multimodal/i.test(`${model.role} ${model.bestUse} ${model.reason}`);
  const input = model.role === "embedding" ? "index" : hasVision ? "text + image" : "text + files";
  const route = model.runtime === "vllm" ? "openai api" : "ollama api";
  const store = model.store ?? "local";
  const outcome = !model.installed ? "install first" : busy ? "handoff" : active ? runtimeStatus : "load on send";
  const steps = [
    { label: "input", value: input, icon: MessageSquare, active: model.installed || model.installable },
    { label: "runtime", value: route, icon: Gauge, active: model.installed },
    { label: "store", value: store, icon: HardDrive, active: model.installed },
    { label: "response", value: speed === "-" ? outcome : `${outcome} · ${speed}`, icon: Sparkles, active: active || model.installed }
  ];

  return (
    <div
      className="mt-3 overflow-hidden rounded-lg border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,145,178,0.11),rgba(15,23,42,0.74)_46%,rgba(79,70,229,0.1))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      data-testid="selector-loadout-path"
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/55">loadout path</div>
            <div className="truncate text-xs font-bold text-slate-200">{model.displayName} route map</div>
          </div>
        </div>
        <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", active ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : model.installed ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100")}>
          {active ? "mounted" : model.installed ? "ready" : "missing"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {steps.map(({ label, value, icon: Icon, active: stepActive }, index) => (
          <div
            key={label}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-md border px-2 py-1.5",
              stepActive ? "border-cyan-300/18 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.025] text-slate-500"
            )}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 shrink-0 opacity-75" />
              <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-65">{label}</span>
              <span className={cn("ml-auto h-1.5 w-1.5 shrink-0 rounded-full", stepActive ? "bg-current" : "bg-slate-600")} />
            </div>
            <div className="mt-1 truncate text-[11px] font-black">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SelectorDecisionDeck({
  model,
  score,
  active,
  speed
}: {
  model: ModelView;
  score: ReturnType<typeof getModelScore>;
  active: boolean;
  speed: string;
}) {
  const capabilities = getCapabilityChips(model);
  const gameState = active ? "loaded" : model.installed ? "clear" : "download";
  const gameTone = active ? "amber" : model.installed ? "emerald" : "slate";
  const runSignal = speed === "-" ? gameState : `${gameState} / ${speed}`;

  return (
    <div
      className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(15,23,42,0.72),rgba(2,6,23,0.45)_52%,rgba(20,184,166,0.08))] p-2 shadow-inner shadow-white/[0.025]"
      data-testid="selector-decision-deck"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100/50">decision signals</div>
          <div className="mt-0.5 truncate text-xs font-black text-white">{score.label}</div>
        </div>
        <DecisionMetric label="game" value={runSignal} tone={gameTone} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {capabilities.map((capability) => (
          <DecisionChip key={capability.label} label={capability.label} value={capability.value} tone={capability.tone} />
        ))}
      </div>
    </div>
  );
}

function getCapabilityChips(model: ModelView): Array<{ label: string; value: string; tone: "cyan" | "emerald" | "amber" | "violet" | "slate" }> {
  const haystack = `${model.role} ${model.roles.join(" ")} ${model.bestUse} ${model.reason}`.toLowerCase();
  const chips: Array<{ label: string; value: string; tone: "cyan" | "emerald" | "amber" | "violet" | "slate" }> = [];
  chips.push({ label: "text", value: model.role === "embedding" ? "embed" : "chat", tone: model.role === "embedding" ? "violet" : "cyan" });
  chips.push({ label: "files", value: model.role === "embedding" ? "index" : "attach", tone: "emerald" });
  chips.push({ label: "vision", value: haystack.match(/vision|image|multimodal/) ? "on" : "off", tone: haystack.match(/vision|image|multimodal/) ? "cyan" : "slate" });
  chips.push({ label: "audio", value: haystack.match(/audio|voice|speech/) ? "on" : "off", tone: haystack.match(/audio|voice|speech/) ? "amber" : "slate" });
  return chips;
}

function DecisionChip({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "amber" | "violet" | "slate" }) {
  const toneClass = {
    cyan: "border-cyan-300/18 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/18 bg-amber-300/10 text-amber-100",
    violet: "border-violet-300/18 bg-violet-300/10 text-violet-100",
    slate: "border-white/10 bg-white/[0.035] text-slate-400"
  }[tone];

  return (
    <span className={cn("inline-flex min-w-0 items-center justify-between gap-1.5 rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em]", toneClass)}>
      <span className="opacity-55">{label}</span>
      <span className="text-white/90">{value}</span>
    </span>
  );
}

function DecisionMetric({ label, value, tone }: { label: string; value: string; tone: "cyan" | "emerald" | "amber" | "slate" }) {
  const toneClass = {
    cyan: "border-cyan-300/18 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/18 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/18 bg-amber-300/10 text-amber-100",
    slate: "border-white/10 bg-white/[0.035] text-slate-400"
  }[tone];

  return (
    <div className={cn("min-w-0 rounded-md border px-2 py-1.5", toneClass)}>
      <div className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-55">{label}</div>
      <div className="mt-0.5 truncate text-[11px] font-black">{value}</div>
    </div>
  );
}

interface DeckSummary {
  topFit: string;
  topScore: string;
  fastest: string;
  lightest: string;
  ready: string;
}

function getDeckSummary(models: ModelView[]): DeckSummary {
  if (models.length === 0) {
    return { topFit: "-", topScore: "-", fastest: "-", lightest: "-", ready: "0/0" };
  }
  const scored = models.map((model) => ({ model, score: getModelScore(model) }));
  const top = [...scored].sort((a, b) => b.score.score - a.score.score)[0];
  const fastest = [...models].sort((a, b) => (b.bench?.avgTps ?? b.expectedTps ?? 0) - (a.bench?.avgTps ?? a.expectedTps ?? 0))[0];
  const lightest = [...models].filter((model) => model.sizeGb).sort((a, b) => (a.sizeGb ?? Infinity) - (b.sizeGb ?? Infinity))[0];
  const installed = models.filter((model) => model.installed).length;
  return {
    topFit: top?.model.displayName ?? "-",
    topScore: top ? `${top.score.score}` : "-",
    fastest: fastest ? `${fastest.displayName}${fastest.expectedTps ? ` · ~${fastest.expectedTps}` : ""}` : "-",
    lightest: lightest ? `${lightest.displayName} · ${lightest.sizeGb}GB` : "-",
    ready: `${installed}/${models.length}`
  };
}

function getSpotlightModels(models: ModelView[]): ModelView[] {
  return [...models]
    .sort((a, b) => {
      const scoreDiff = getModelScore(b).score - getModelScore(a).score;
      if (scoreDiff !== 0) return scoreDiff;
      return (b.expectedTps ?? 0) - (a.expectedTps ?? 0);
    })
    .slice(0, 3);
}

function ModelSpotlight({
  models,
  selectedModelId,
  onSelect
}: {
  models: ModelView[];
  selectedModelId?: string;
  onSelect: (modelId: string) => void;
}) {
  if (models.length === 0) return null;

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(103,232,249,0.07),rgba(15,23,42,0.62)_45%,rgba(129,140,248,0.06))] p-2" data-testid="model-spotlight">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/65">
          <Sparkles className="h-3.5 w-3.5" />
          Spotlight picks
        </div>
        <div className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-400">ranked by fit</div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {models.map((model, index) => {
          const score = getModelScore(model);
          const selected = selectedModelId === model.id;
          const speed = model.bench ? `${model.bench.avgTps.toFixed(0)} t/s` : model.expectedTps ? `~${model.expectedTps}` : "-";
          return (
            <button
              key={model.id}
              type="button"
              onClick={() => onSelect(model.id)}
              className={cn(
                "group grid min-w-0 grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-2 rounded-md border px-2 py-2 text-left transition",
                selected ? "border-cyan-300/45 bg-cyan-300/12 text-cyan-50" : "border-white/10 bg-white/[0.035] text-slate-300 hover:border-cyan-300/30 hover:bg-white/[0.065]"
              )}
            >
              <span className={cn("flex h-7 w-7 items-center justify-center rounded border text-[11px] font-black", selected ? "border-cyan-300/40 bg-cyan-300 text-slate-950" : "border-white/10 bg-slate-950/50 text-cyan-100/75")}>{index + 1}</span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-black text-white" data-testid="spotlight-title">{model.displayName}</span>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-500">{model.runtime} / {model.store ?? model.role} / {speed}</span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-black text-white">{score.score}</span>
                <span className="block text-[9px] font-bold uppercase tracking-[0.1em] text-cyan-100/50">fit</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DeckSummaryBar({ summary }: { summary: DeckSummary }) {
  return (
    <div className="mb-3 hidden grid-cols-2 gap-1.5 sm:grid lg:grid-cols-4" data-testid="deck-summary">
      <DeckSignal icon={Sparkles} label="top fit" value={summary.topFit} meta={summary.topScore === "-" ? "-" : `${summary.topScore}/100`} tone="cyan" />
      <DeckSignal icon={Gauge} label="fastest" value={summary.fastest} meta="tok/s" tone="emerald" />
      <DeckSignal icon={HardDrive} label="lightest" value={summary.lightest} meta="disk" tone="violet" />
      <DeckSignal icon={Boxes} label="ready" value={summary.ready} meta="installed" tone="amber" />
    </div>
  );
}

function DeckSignal({
  icon: Icon,
  label,
  value,
  meta,
  tone
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  meta: string;
  tone: "cyan" | "emerald" | "violet" | "amber";
}) {
  const toneClass = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100"
  }[tone];

  return (
    <div className="min-w-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.035] p-2 shadow-inner shadow-white/[0.02]">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <span className="ml-auto shrink-0 text-[10px] font-bold text-cyan-100/60">{meta}</span>
      </div>
      <div className="mt-1 truncate text-xs font-bold text-slate-100">{value}</div>
    </div>
  );
}

function PreviewChip({ icon: Icon, label, value }: { icon: typeof HardDrive; label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-slate-950/35 px-2 py-1.5">
      <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
        <Icon className="h-3 w-3 shrink-0 text-cyan-200/60" />
        {label}
      </div>
      <div className="mt-0.5 truncate text-[11px] font-black text-slate-100">{value}</div>
    </div>
  );
}

function MobileConsoleDrawer({
  data,
  runtime,
  jobs,
  selectedModel,
  messages,
  attachments,
  sending,
  loading,
  onStop,
  onClose
}: {
  data?: ModelsResponse;
  runtime: RuntimeState;
  jobs: InstallJob[];
  selectedModel?: ModelView;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  sending: boolean;
  loading: boolean;
  onStop: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-[#050913] p-3 lg:hidden"
      data-testid="mobile-console-drawer"
      data-surface="solid"
      onClick={onClose}
    >
      <section className="mx-auto flex h-full max-w-[430px] flex-col gap-2" onClick={(event) => event.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-[linear-gradient(135deg,rgba(8,145,178,0.14),rgba(15,23,42,0.92)_48%,rgba(79,70,229,0.12))] px-3 py-2 shadow-[0_20px_70px_rgba(0,0,0,0.36)]">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/55">mobile console</div>
            <h2 className="text-sm font-bold text-white">Runtime Dashboard</h2>
          </div>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.045] text-slate-200 transition hover:bg-white/[0.08]" aria-label="Close mobile console" data-testid="mobile-console-close" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <StatusPanel data={data} runtime={runtime} jobs={jobs} selectedModel={selectedModel} messages={messages} attachments={attachments} sending={sending} loading={loading} onStop={onStop} />
        </div>
      </section>
    </div>
  );
}

function MobileSignalRail({
  loading,
  disk,
  diskMeter,
  diskLow,
  vram,
  vramMeter,
  fit,
  fitMeter,
  status,
  onOpenConsole
}: {
  loading: boolean;
  disk: string;
  diskMeter?: number;
  diskLow: boolean;
  vram: string;
  vramMeter?: number;
  fit: string;
  fitMeter?: number;
  status: string;
  onOpenConsole: () => void;
}) {
  return (
    <div className="mb-3 grid shrink-0 grid-cols-4 gap-1.5 sm:hidden" data-testid="mobile-signal-rail">
      <MobileSignal icon={HardDrive} label="F:" value={loading ? "scan" : disk} meter={diskMeter} tone={diskLow ? "rose" : "cyan"} />
      <MobileSignal icon={Gauge} label="VRAM" value={loading ? "scan" : vram} meter={vramMeter} tone={(vramMeter ?? 0) > 85 ? "amber" : "emerald"} />
      <MobileSignal icon={Sparkles} label="FIT" value={loading ? "scan" : fit} meter={fitMeter} tone="cyan" />
      <MobileSignal icon={Boxes} label="STATE" value={status} meter={status === "ready" ? 100 : status === "selected" ? 68 : status === "missing" ? 34 : 18} tone={status === "missing" ? "amber" : status === "ready" ? "emerald" : "violet"} onClick={onOpenConsole} testId="mobile-console-button" />
    </div>
  );
}

function MobileSignal({
  icon: Icon,
  label,
  value,
  meter,
  tone,
  onClick,
  testId
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  meter?: number;
  tone: "cyan" | "emerald" | "amber" | "rose" | "violet";
  onClick?: () => void;
  testId?: string;
}) {
  const width = meter === undefined ? 0 : Math.max(4, Math.min(100, meter));
  const color = {
    cyan: "from-cyan-300 to-sky-300",
    emerald: "from-emerald-300 to-cyan-300",
    amber: "from-amber-300 to-orange-300",
    rose: "from-rose-300 to-red-300",
    violet: "from-violet-300 to-cyan-300"
  }[tone];

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-1">
        <Icon className="h-3 w-3 shrink-0 text-cyan-100/70" />
        <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] font-black text-white">{value}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.075]">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all", color)} style={{ width: `${width}%` }} />
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} data-testid={testId} className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/68 px-2 py-1.5 text-left shadow-inner shadow-white/[0.025] transition hover:border-cyan-300/35 hover:bg-white/[0.055]">
        {content}
      </button>
    );
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-white/10 bg-slate-950/68 px-2 py-1.5 shadow-inner shadow-white/[0.025]">
      {content}
    </div>
  );
}

function TopSignal({
  icon: Icon,
  label,
  value,
  meter,
  tone
}: {
  icon: typeof HardDrive;
  label: string;
  value: string;
  meter?: number;
  tone: "cyan" | "emerald" | "amber" | "rose" | "violet";
}) {
  const width = meter === undefined ? 0 : Math.max(4, Math.min(100, meter));
  const color = {
    cyan: "from-cyan-300 to-sky-300",
    emerald: "from-emerald-300 to-cyan-300",
    amber: "from-amber-300 to-orange-300",
    rose: "from-rose-300 to-red-300",
    violet: "from-violet-300 to-cyan-300"
  }[tone];

  return (
    <div className="group min-w-[76px] overflow-hidden rounded-md border border-white/10 bg-white/[0.045] px-2 py-1.5 shadow-inner shadow-white/[0.025] transition hover:border-cyan-300/25 hover:bg-white/[0.065]">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-200/70" />
        <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      </div>
      <div className="mt-0.5 truncate text-xs font-bold text-slate-100">{value}</div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]">
        <div className={cn("h-full rounded-full bg-gradient-to-r transition-all group-hover:brightness-125", color)} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function HeaderMeta({ value, tone }: { value: string; tone: "cyan" | "emerald" | "amber" | "violet" | "slate" }) {
  const toneClass = {
    cyan: "border-cyan-300/20 bg-cyan-300/10 text-cyan-100",
    emerald: "border-emerald-300/20 bg-emerald-300/10 text-emerald-100",
    amber: "border-amber-300/20 bg-amber-300/10 text-amber-100",
    violet: "border-violet-300/20 bg-violet-300/10 text-violet-100",
    slate: "border-white/10 bg-slate-950/42 text-slate-300"
  }[tone];

  return (
    <span className={cn("max-w-[86px] truncate rounded border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]", toneClass)}>
      {value}
    </span>
  );
}
