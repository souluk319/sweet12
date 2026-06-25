import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  ArrowDown,
  Bot,
  Boxes,
  BrainCircuit,
  Check,
  Clipboard,
  Code2,
  Copy,
  FileText,
  HardDrive,
  ImagePlus,
  Languages,
  MessageSquare,
  Mic,
  Paperclip,
  PencilLine,
  Plus,
  RotateCcw,
  Search,
  Send,
  Settings2,
  Sparkles,
  Square,
  User,
  X
} from "lucide-react";
import type { ChatAttachment, ChatMessage, ModelView, RuntimeState } from "../types";
import { cn } from "../lib/cn";
import { getModelScore, type ModelScore } from "../lib/modelScore";

interface Props {
  runtime: RuntimeState;
  selectedModel?: ModelView;
  loading?: boolean;
  messages: ChatMessage[];
  attachments: ChatAttachment[];
  input: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  sending: boolean;
  onInput: (value: string) => void;
  onAttachments: (value: ChatAttachment[]) => void;
  onSystemPrompt: (value: string) => void;
  onTemperature: (value: number) => void;
  onMaxTokens: (value: number) => void;
  onSend: () => void;
  onStopGenerating: () => void;
  onClear: () => void;
  onRegenerate: () => void;
}

const modeMap = {
  coding: {
    label: "Coding workspace",
    tone: "emerald",
    icon: Code2,
    header: "from-slate-950 via-slate-900 to-emerald-950",
    accent: "text-emerald-300",
    soft: "bg-emerald-300/10 text-emerald-100",
    bubble: "bg-slate-950 text-white"
  },
  reasoning: {
    label: "Reasoning mode",
    tone: "amber",
    icon: BrainCircuit,
    header: "from-slate-950 via-stone-950 to-amber-950",
    accent: "text-amber-300",
    soft: "bg-amber-300/10 text-amber-100",
    bubble: "bg-stone-950 text-white"
  },
  translation: {
    label: "Translation desk",
    tone: "cyan",
    icon: Languages,
    header: "from-slate-950 via-cyan-950 to-slate-900",
    accent: "text-cyan-300",
    soft: "bg-cyan-300/10 text-cyan-100",
    bubble: "bg-cyan-950 text-white"
  },
  embedding: {
    label: "Embedding indexer",
    tone: "zinc",
    icon: Search,
    header: "from-slate-950 via-zinc-950 to-slate-900",
    accent: "text-zinc-300",
    soft: "bg-zinc-300/10 text-zinc-100",
    bubble: "bg-zinc-950 text-white"
  },
  vision: {
    label: "Multimodal studio",
    tone: "teal",
    icon: ImagePlus,
    header: "from-slate-950 via-teal-950 to-indigo-950",
    accent: "text-teal-300",
    soft: "bg-teal-300/10 text-teal-100",
    bubble: "bg-indigo-950 text-white"
  },
  "stress-test": {
    label: "Stress bench",
    tone: "rose",
    icon: Boxes,
    header: "from-slate-950 via-rose-950 to-slate-900",
    accent: "text-rose-300",
    soft: "bg-rose-300/10 text-rose-100",
    bubble: "bg-rose-950 text-white"
  },
  chat: {
    label: "General chat",
    tone: "blue",
    icon: MessageSquare,
    header: "from-slate-950 via-slate-900 to-blue-950",
    accent: "text-blue-300",
    soft: "bg-blue-300/10 text-blue-100",
    bubble: "bg-blue-950 text-white"
  }
} as const;

const promptPresets: Record<string, string[]> = {
  coding: ["이 코드에서 먼저 손봐야 할 병목을 짚어줘", "테스트 전략과 리팩터링 순서를 잡아줘", "실제 수정 패치 기준으로 위험도를 분류해줘"],
  reasoning: ["이 결정을 장단점과 리스크로 나눠 판단해줘", "반례까지 포함해서 결론을 검토해줘", "가정이 틀렸을 때 어떻게 바뀌는지 봐줘"],
  translation: ["한국어/영어 개발 문서 톤으로 다듬어줘", "직역 말고 자연스러운 제품 문구로 바꿔줘", "전문 용어를 유지하면서 간결하게 번역해줘"],
  vision: ["첨부 이미지의 UI 문제를 우선순위로 찾아줘", "스크린샷을 보고 레이아웃 깨짐을 점검해줘", "이미지 속 정보를 표로 정리해줘"],
  "stress-test": ["짧은 고정 프롬프트로 응답 안정성을 확인해줘", "긴 컨텍스트에서 흔들릴 지점을 찾아줘", "응답 속도와 품질을 같이 평가해줘"],
  chat: ["현재 상황을 요약하고 다음 액션을 제안해줘", "내 요구사항을 체크리스트로 정리해줘", "결과물을 더 보기 좋게 다시 구성해줘"],
  embedding: []
};

type ModeTone = "emerald" | "amber" | "cyan" | "zinc" | "teal" | "rose" | "blue";

function modeToneClasses(tone: ModeTone) {
  return {
    emerald: {
      panel: "border-emerald-300/22 bg-emerald-300/[0.08] text-emerald-100",
      icon: "text-emerald-200/80",
      chip: "border-emerald-300/25 bg-emerald-300/10 text-emerald-100",
      line: "bg-emerald-200/30"
    },
    amber: {
      panel: "border-amber-300/22 bg-amber-300/[0.08] text-amber-100",
      icon: "text-amber-200/80",
      chip: "border-amber-300/25 bg-amber-300/10 text-amber-100",
      line: "bg-amber-200/30"
    },
    cyan: {
      panel: "border-cyan-300/22 bg-cyan-300/[0.08] text-cyan-100",
      icon: "text-cyan-200/80",
      chip: "border-cyan-300/25 bg-cyan-300/10 text-cyan-100",
      line: "bg-cyan-200/30"
    },
    zinc: {
      panel: "border-zinc-300/18 bg-zinc-300/[0.07] text-zinc-100",
      icon: "text-zinc-200/80",
      chip: "border-zinc-300/20 bg-zinc-300/10 text-zinc-100",
      line: "bg-zinc-200/25"
    },
    teal: {
      panel: "border-teal-300/22 bg-teal-300/[0.08] text-teal-100",
      icon: "text-teal-200/80",
      chip: "border-teal-300/25 bg-teal-300/10 text-teal-100",
      line: "bg-teal-200/30"
    },
    rose: {
      panel: "border-rose-300/22 bg-rose-300/[0.08] text-rose-100",
      icon: "text-rose-200/80",
      chip: "border-rose-300/25 bg-rose-300/10 text-rose-100",
      line: "bg-rose-200/30"
    },
    blue: {
      panel: "border-blue-300/22 bg-blue-300/[0.08] text-blue-100",
      icon: "text-blue-200/80",
      chip: "border-blue-300/25 bg-blue-300/10 text-blue-100",
      line: "bg-blue-200/30"
    }
  }[tone];
}

const MAX_IMAGE_EDGE = 1600;
const IMAGE_QUALITY_STEPS = [0.88, 0.8, 0.72, 0.64];
const MAX_COMPRESSED_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_ATTACHMENT_BYTES = 220 * 1024;

export function ChatPanel({
  runtime,
  selectedModel,
  loading = false,
  messages,
  attachments,
  input,
  systemPrompt,
  temperature,
  maxTokens,
  sending,
  onInput,
  onAttachments,
  onSystemPrompt,
  onTemperature,
  onMaxTokens,
  onSend,
  onStopGenerating,
  onClear,
  onRegenerate
}: Props) {
  const loadingModels = Boolean(loading && !selectedModel);
  const role = selectedModel?.roles.includes("vision") ? "vision" : selectedModel?.role ?? "chat";
  const skin = modeMap[role as keyof typeof modeMap] ?? modeMap.chat;
  const ModeIcon = skin.icon;
  const supportsVision = Boolean(selectedModel?.roles.includes("vision"));
  const supportsAudio = false;
  const supportsFiles = Boolean(selectedModel && selectedModel.role !== "embedding");
  const isEmbedding = selectedModel?.role === "embedding";
  const canDraft = !isEmbedding && !loadingModels;
  const selectedIsActive = Boolean(selectedModel?.id && selectedModel.id === runtime.activeModelId);
  const ready = runtime.status === "ready" && selectedIsActive && !isEmbedding;
  const runtimeBusy = ["stopping", "starting", "warming", "installing", "benchmarking"].includes(runtime.status);
  const showRuntimeHud = runtimeBusy || runtime.status === "failed";
  const canLoadForSend = Boolean(selectedModel?.installed && !isEmbedding && !runtimeBusy);
  const panelStatus = loadingModels ? "scanning" : selectedIsActive ? runtime.status : selectedModel?.installed ? "selected" : "missing";
  const panelSubtext = loadingModels ? "Primary / secondary Ollama store와 vLLM 후보를 읽는 중입니다." : selectedIsActive && runtime.endpoint ? runtime.endpoint : selectedModel?.bestUse ?? "Load a model to begin";
  const quickPrompts = useMemo(() => promptPresets[role] ?? promptPresets.chat, [role]);
  const showComposerPromptRail = messages.length === 0 && quickPrompts.length > 0 && input.trim().length === 0 && attachments.length === 0 && !loadingModels;
  const capabilities = useMemo(
    () => [
      { label: "Text", active: canDraft, value: canDraft ? "ready" : "off" },
      { label: "Files", active: supportsFiles, value: supportsFiles ? "attach" : "blocked" },
      { label: "Vision", active: supportsVision, value: supportsVision ? "image" : "off" },
      { label: "Audio", active: supportsAudio, value: supportsAudio ? "voice" : "off" }
    ],
    [canDraft, supportsAudio, supportsFiles, supportsVision]
  );
  const [stickToBottom, setStickToBottom] = useState(true);
  const [copiedId, setCopiedId] = useState<string>();
  const [attachmentNotice, setAttachmentNotice] = useState<string>();
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const canSend = canDraft && (ready || canLoadForSend) && (input.trim().length > 0 || attachments.length > 0) && !sending && !attachmentBusy;
  const composerState = loadingModels ? "scanning" : isEmbedding ? "blocked" : attachmentBusy ? "preparing" : sending ? "streaming" : canSend ? "armed" : selectedModel?.installed ? "draft" : "missing";
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputEl = inputRef.current;
    if (!inputEl) return;
    inputEl.style.height = "56px";
    inputEl.style.height = `${Math.min(inputEl.scrollHeight, 150)}px`;
  }, [input, attachments.length]);

  useEffect(() => {
    if (!canDraft || sending || attachmentBusy || settingsOpen) return;
    const activeElement = document.activeElement;
    const typingElsewhere =
      activeElement instanceof HTMLInputElement ||
      (activeElement instanceof HTMLTextAreaElement && activeElement !== inputRef.current) ||
      activeElement?.getAttribute("contenteditable") === "true";
    if (typingElsewhere) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [attachmentBusy, canDraft, sending, settingsOpen, messages.length, selectedModel?.id]);

  useEffect(() => {
    if (!stickToBottom && !sending) return;
    const frame = window.requestAnimationFrame(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, sending, stickToBottom]);

  useEffect(() => {
    if (!copiedId) return;
    const timeout = window.setTimeout(() => setCopiedId(undefined), 1400);
    return () => window.clearTimeout(timeout);
  }, [copiedId]);

  useEffect(() => {
    function handleWindowKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && sending) onStopGenerating();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [sending, onStopGenerating]);

  async function addFiles(files: FileList | File[] | null) {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    setAttachmentNotice(undefined);
    setAttachmentBusy(true);
    try {
      await nextFrame();
      const next = (await Promise.all(list.map(fileToAttachment))).filter((attachment) => {
        if (attachment.kind === "image") return supportsVision;
        if (attachment.kind === "audio") return supportsAudio;
        return supportsFiles;
      });
      if (next.length > 0) {
        onAttachments([...attachments, ...next]);
        const compressed = next.filter((attachment) => attachment.originalSizeBytes && attachment.originalSizeBytes > attachment.sizeBytes);
        if (compressed.length > 0) {
          setAttachmentNotice(
            `이미지 ${compressed.length}개를 전송용으로 자동 압축했습니다. ${compressed
              .map((attachment) => `${formatBytes(attachment.originalSizeBytes ?? 0)} -> ${formatBytes(attachment.sizeBytes)}`)
              .join(", ")}`
          );
        }
      } else if (list.length > 0) {
        setAttachmentNotice("현재 선택한 모델 입력 방식에서 사용할 수 없는 첨부입니다.");
      }
    } catch (error) {
      setAttachmentNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setAttachmentBusy(false);
    }
    focusComposer();
  }

  function handleFileInputChange(inputElement: HTMLInputElement) {
    const files = inputElement.files;
    void addFiles(files).finally(() => {
      inputElement.value = "";
    });
  }

  function focusComposer() {
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function removeAttachment(id: string) {
    onAttachments(attachments.filter((attachment) => attachment.id !== id));
    setAttachmentNotice(undefined);
    focusComposer();
  }

  function submit() {
    if (!canSend) return;
    setAttachmentNotice(undefined);
    onSend();
    focusComposer();
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "ArrowUp" && input.trim().length === 0 && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
      if (lastUserMessage) {
        event.preventDefault();
        onInput(lastUserMessage.content);
      }
      return;
    }

    const nativeEvent = event.nativeEvent as KeyboardEvent<HTMLTextAreaElement>["nativeEvent"] & { isComposing?: boolean };
    const composing = event.nativeEvent.isComposing || nativeEvent.isComposing || event.keyCode === 229;
    const sendShortcut = event.key === "Enter" && !composing && (!event.shiftKey || event.metaKey || event.ctrlKey);
    if (!sendShortcut) return;
    event.preventDefault();
    if (canSend) submit();
  }

  function useDraft(content: string) {
    onInput(content);
    focusComposer();
  }

  async function copyMessage(message: ChatMessage) {
    await navigator.clipboard.writeText(message.error ? `Request failed: ${sanitizeChatError(message.error)}` : message.content);
    setCopiedId(message.id);
    focusComposer();
  }

  function updateStickToBottom() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distance = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    setStickToBottom(distance < 72);
  }

  function scrollToLatest() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
    setStickToBottom(true);
    focusComposer();
  }

  function supportsDraggedPayload(event: DragEvent<HTMLElement>) {
    if (!supportsFiles && !supportsVision) return false;
    return Array.from(event.dataTransfer.types).includes("Files");
  }

  return (
    <section
      data-testid="chat-panel"
      className="surface-premium relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950/78 backdrop-blur-xl"
      onDragEnter={(event) => {
        if (!supportsDraggedPayload(event)) return;
        event.preventDefault();
        setDragActive(true);
      }}
      onDragOver={(event) => {
        if (!supportsDraggedPayload(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setDragActive(true);
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (!supportsDraggedPayload(event)) return;
        event.preventDefault();
        setDragActive(false);
        void addFiles(event.dataTransfer.files);
      }}
    >
      {dragActive && <DropOverlay supportsVision={supportsVision} supportsFiles={supportsFiles} role={role} />}
      <div className={cn("shrink-0 border-b border-white/10 bg-gradient-to-r px-4 py-3 text-white", skin.header)} data-testid="chat-header">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-white/15">
              <ModeIcon className={cn("h-5 w-5", skin.accent)} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <h2 className="min-w-0 truncate text-base font-semibold">{selectedModel?.displayName ?? "Select a model"}</h2>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className="rounded border border-white/10 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/85">{skin.label}</span>
                  <span
                    className={cn(
                      "rounded border px-2 py-0.5 text-[11px] font-semibold",
                      ready
                        ? "border-emerald-300/20 bg-emerald-400/15 text-emerald-200"
                        : panelStatus === "selected"
                          ? "border-cyan-300/20 bg-cyan-400/15 text-cyan-100"
                          : panelStatus === "scanning"
                            ? "border-cyan-300/20 bg-cyan-400/15 text-cyan-100"
                          : panelStatus === "missing"
                            ? "border-amber-300/20 bg-amber-400/15 text-amber-100"
                            : "border-white/10 bg-white/10 text-white/75"
                    )}
                  >
                    {panelStatus}
                  </span>
                  <HeaderCapabilityPips capabilities={capabilities} />
                </div>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-white/70 sm:truncate">{panelSubtext}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              type="button"
              title="Prompt and generation settings"
              aria-label="Prompt and generation settings"
              onClick={() => setSettingsOpen((open) => !open)}
              className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/10 text-white transition hover:bg-white/15", settingsOpen && "bg-cyan-300/20 text-cyan-100")}
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {sending ? (
              <button type="button" aria-label="Stop generating" onClick={onStopGenerating} className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/15 px-2.5 text-xs font-semibold text-white">
                <Square className="h-3.5 w-3.5 fill-current" />
                <span className="hidden sm:inline">Stop</span>
              </button>
            ) : (
              <button type="button" aria-label="Regenerate response" onClick={onRegenerate} disabled={!ready || messages.length < 2} className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/10 px-2.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:opacity-35">
                <RotateCcw className="h-4 w-4" />
                <span className="hidden sm:inline">Regenerate</span>
              </button>
            )}
            <button
              type="button"
              aria-label="Start a new chat"
              onClick={() => {
                onClear();
                focusComposer();
              }}
              className="inline-flex h-8 items-center gap-2 rounded-md border border-white/10 bg-white/10 px-2.5 text-xs font-semibold text-white transition hover:bg-white/15"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>
        <SessionStrip selectedModel={selectedModel} status={panelStatus} mode={skin.label} temperature={temperature} maxTokens={maxTokens} ready={ready} loading={loadingModels} />
      </div>

      {settingsOpen && (
        <div className="shrink-0 border-b border-white/10 bg-slate-950/72 p-2" data-testid="settings-deck">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]">
            <label className="grid gap-1 rounded-lg border border-white/10 bg-white/[0.035] p-2 text-xs font-semibold text-slate-300 shadow-inner shadow-white/[0.025]">
              <span className="flex items-center justify-between gap-2">
                <span className="font-bold uppercase tracking-[0.14em] text-cyan-200/60">System prompt</span>
                <span className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-400">{systemPrompt.length} chars</span>
              </span>
              <textarea
                value={systemPrompt}
                onChange={(event) => onSystemPrompt(event.target.value)}
                className="h-10 resize-none rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-normal leading-5 text-slate-100 outline-none shadow-inner shadow-black/20 focus:border-cyan-300/45 sm:h-12"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <TuningControl label="Temperature" value={temperature} min={0} max={2} step={0.1} suffix="" onChange={onTemperature} />
              <TuningControl label="Max tokens" value={maxTokens} min={32} max={4096} step={32} suffix="" onChange={onMaxTokens} />
            </div>
          </div>
        </div>
      )}

      <div ref={scrollRef} onScroll={updateStickToBottom} className={cn("control-grid relative min-h-0 flex-1 space-y-3 overflow-y-auto p-4", `control-grid-theme-${role}`)}>
        {showRuntimeHud && <RuntimeHandoff runtime={runtime} selectedModel={selectedModel} />}
        {messages.length === 0 && (
          <ModelLaunchStage
            selectedModel={selectedModel}
            skin={skin}
            role={role}
            icon={ModeIcon}
            capabilities={capabilities}
            quickPrompts={quickPrompts}
            ready={ready}
            status={panelStatus}
            loading={loadingModels}
            onPrompt={useDraft}
          />
        )}
        {messages.map((message) => (
          <div key={message.id} className={cn("group flex gap-3", message.role === "user" ? "justify-end" : "justify-start")}>
            {message.role === "assistant" && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-cyan-100 shadow-[0_0_28px_rgba(103,232,249,0.12)]">
                <Bot className="h-4 w-4" />
              </div>
            )}
            <div
              className={cn(
                "min-w-0",
                message.role === "user"
                  ? "max-w-[86%] sm:max-w-[64%]"
                  : "w-full max-w-[92%] sm:max-w-[760px] lg:max-w-[820px]"
              )}
              data-message-role={message.role}
            >
              <div
                className={cn(
                  "overflow-hidden rounded-lg text-sm leading-6 shadow-sm",
                  message.role === "user"
                    ? cn("whitespace-pre-wrap", skin.bubble, "ring-1 ring-white/10")
                    : "border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(2,6,23,0.88))] text-slate-100 shadow-[0_18px_50px_rgba(0,0,0,0.24)]"
                )}
              >
                <MessageMeta role={message.role} modelName={selectedModel?.displayName} streaming={message.role === "assistant" && sending && message.content.length === 0 && !message.error} failed={Boolean(message.error)} />
                <div className="px-4 py-3">
                {message.attachments?.length ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {message.attachments.map((attachment) => (
                      <AttachmentChip key={attachment.id} attachment={attachment} />
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" && message.reasoning ? <ReasoningBlock content={message.reasoning} /> : null}
                {message.role === "assistant" ? (
                  message.error ? (
                    <ErrorResponseCard error={message.error} onRegenerate={onRegenerate} />
                  ) : sending && message.content.length === 0 ? (
                    <StreamingResponseCard modelName={selectedModel?.displayName} />
                  ) : (
                    <MarkdownMessage content={message.content || " "} />
                  )
                ) : message.content || " "}
                </div>
              </div>
              <div
                className={cn(
                  "mt-1 flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100",
                  message.role === "user" ? "justify-end" : "justify-start"
                )}
                data-testid="message-action-bar"
              >
                <button type="button" onClick={() => void copyMessage(message)} className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-slate-950/70 px-2 text-[11px] font-semibold text-slate-300 shadow-sm hover:text-white" data-testid="message-copy-action">
                  {copiedId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedId === message.id ? "Copied" : "Copy"}
                </button>
                {message.role === "user" && (
                  <button type="button" onClick={() => useDraft(message.content)} className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-slate-950/70 px-2 text-[11px] font-semibold text-slate-300 shadow-sm hover:text-white" data-testid="message-draft-action">
                    <PencilLine className="h-3.5 w-3.5" />
                    Draft
                  </button>
                )}
              </div>
            </div>
            {message.role === "user" && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.06] text-slate-200">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        {!stickToBottom && (
          <button type="button" onClick={scrollToLatest} className="sticky bottom-2 left-1/2 z-10 mx-auto flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-slate-950 text-slate-100 shadow-md">
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 bg-slate-950/88 p-3">
        {attachments.length > 0 && <AttachmentPreviewTray attachments={attachments} onRemove={removeAttachment} />}

        {(attachmentBusy || attachmentNotice) && (
          <div className={cn("mb-2 rounded-md border px-3 py-2 text-xs font-semibold", attachmentBusy ? "border-sky-300/25 bg-sky-300/10 text-sky-100" : "border-amber-300/25 bg-amber-300/10 text-amber-100")}>
            {attachmentBusy ? "첨부 파일을 전송용으로 준비하는 중입니다. 메시지는 계속 입력할 수 있습니다." : attachmentNotice}
          </div>
        )}

        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => handleFileInputChange(event.currentTarget)} />
        <input ref={audioInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={(event) => handleFileInputChange(event.currentTarget)} />
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(event) => handleFileInputChange(event.currentTarget)} />

        <div
          className={cn(
            "relative overflow-hidden rounded-xl border bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_55px_rgba(0,0,0,0.22)] transition",
            canSend ? "border-cyan-300/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_18px_55px_rgba(8,145,178,0.18)]" : "border-white/10"
          )}
          data-testid="composer-shell"
        >
          <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent", canSend && "via-cyan-200/70")} />
          {showComposerPromptRail && <ComposerPromptRail prompts={quickPrompts} onPrompt={useDraft} skin={skin.soft} />}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ToolbarButton label={attachmentBusy ? "Preparing" : "Image"} icon={<ImagePlus className="h-4 w-4" />} enabled={supportsVision && !attachmentBusy} onClick={() => imageInputRef.current?.click()} skin={skin.soft} />
              <ToolbarButton label="Audio" icon={<Mic className="h-4 w-4" />} enabled={supportsAudio && !attachmentBusy} onClick={() => audioInputRef.current?.click()} skin={skin.soft} />
              <ToolbarButton label={role === "coding" ? "Code file" : "File"} icon={<Paperclip className="h-4 w-4" />} enabled={supportsFiles && !attachmentBusy} onClick={() => fileInputRef.current?.click()} skin={skin.soft} />
              <button type="button" disabled={!input && attachments.length === 0} onClick={() => { onInput(""); onAttachments([]); setAttachmentNotice(undefined); focusComposer(); }} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.035] px-2.5 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-35">
                <Clipboard className="h-4 w-4" />
                <span className="hidden sm:inline">Clear draft</span>
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {attachments.length > 0 && <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[11px] font-bold text-cyan-100">{attachments.length}<span className="hidden sm:inline"> attached</span></span>}
              <ComposerStateBadge state={composerState} />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              aria-label="Chat message"
              value={input}
              onChange={(event) => onInput(event.target.value)}
              onPaste={(event) => {
                if (event.clipboardData.files.length > 0) void addFiles(event.clipboardData.files);
              }}
              onKeyDown={handleComposerKeyDown}
              placeholder={loadingModels ? "모델 저장소를 스캔하는 중입니다" : isEmbedding ? "Embedding 모델은 채팅 대신 인덱싱 용도입니다" : sending ? "다음 질문을 미리 입력할 수 있습니다" : "Message the selected local model..."}
              className="max-h-[150px] min-h-14 flex-1 resize-none rounded-lg border border-white/10 bg-[#0b111b] px-3 py-3 text-sm text-slate-100 outline-none shadow-inner shadow-black/20 placeholder:text-slate-500 focus:border-cyan-300/45 disabled:bg-white/[0.025]"
              disabled={!canDraft}
            />
            <button
              type="button"
              aria-label={sending ? "Stop generating" : "Send message"}
              disabled={sending ? false : !canSend}
              onClick={sending ? onStopGenerating : submit}
              className={cn(
                "relative inline-flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-[0_14px_36px_rgba(0,0,0,0.28)] ring-1 ring-white/10 transition hover:brightness-110 disabled:cursor-not-allowed",
                sending
                  ? "bg-slate-700 text-white"
                  : canSend
                    ? "bg-gradient-to-br from-cyan-300 via-sky-300 to-violet-300 text-slate-950 shadow-[0_16px_42px_rgba(103,232,249,0.28)]"
                    : "bg-white/[0.055] text-slate-500 opacity-80"
              )}
            >
              {canSend && !sending && <span className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-slate-950/30" />}
              {sending ? <Square className="h-5 w-5 fill-current" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ComposerPromptRail({ prompts, onPrompt, skin }: { prompts: string[]; onPrompt: (prompt: string) => void; skin: string }) {
  return (
    <div className="mb-2 sm:hidden" data-testid="prompt-action-dock" data-rail="composer">
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/60">
          <Sparkles className="h-3 w-3" />
          Quick actions
        </div>
        <span className="rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">draft</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {prompts.slice(0, 3).map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt(prompt)}
            className={cn("group grid min-h-[54px] w-[176px] shrink-0 grid-cols-[24px_minmax(0,1fr)] items-start gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-left text-[11px] font-bold leading-4 text-slate-300 shadow-inner shadow-white/[0.025] transition hover:border-cyan-300/35 hover:text-cyan-50", skin)}
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-cyan-300/20 bg-cyan-300/10 text-[10px] font-black text-cyan-100 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
              {index + 1}
            </span>
            <span className="line-clamp-3 block min-w-0">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolbarButton({ label, icon, enabled, onClick, skin }: { label: string; icon: ReactNode; enabled: boolean; onClick: () => void; skin: string }) {
  return (
    <button
      type="button"
      disabled={!enabled}
      onClick={onClick}
      className={cn("inline-flex h-8 w-10 items-center justify-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-slate-500 sm:w-auto", enabled ? cn("border-white/10", skin) : "")}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function AttachmentPreviewTray({ attachments, onRemove }: { attachments: ChatAttachment[]; onRemove: (id: string) => void }) {
  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-white/10 bg-[linear-gradient(135deg,rgba(103,232,249,0.075),rgba(15,23,42,0.62)_48%,rgba(129,140,248,0.06))] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" data-testid="attachment-tray">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/65">
          <Paperclip className="h-3.5 w-3.5" />
          Attachment deck
        </div>
        <div className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-400">{attachments.length} staged</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {attachments.map((attachment) => (
          <AttachmentPreviewCard key={attachment.id} attachment={attachment} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

function AttachmentPreviewCard({ attachment, onRemove }: { attachment: ChatAttachment; onRemove: (id: string) => void }) {
  const compressed = attachment.originalSizeBytes && attachment.originalSizeBytes > attachment.sizeBytes;
  const sizeLabel = compressed ? `${formatBytes(attachment.originalSizeBytes ?? 0)} -> ${formatBytes(attachment.sizeBytes)}` : formatBytes(attachment.sizeBytes);
  const kindLabel = attachment.kind === "image" ? "image input" : attachment.kind === "audio" ? "audio input" : attachment.text ? "text context" : "file input";

  return (
    <div className="group relative grid w-[250px] shrink-0 grid-cols-[64px_minmax(0,1fr)] gap-2 overflow-hidden rounded-lg border border-white/10 bg-slate-950/64 p-2 shadow-[0_14px_36px_rgba(0,0,0,0.2)]">
      <div className="relative h-16 w-16 overflow-hidden rounded-md border border-white/10 bg-white/[0.045]">
        {attachment.kind === "image" && attachment.dataUrl ? (
          <img src={attachment.dataUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-cyan-100/80">
            <AttachmentIcon kind={attachment.kind} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/55 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-[0.1em] text-white/75">{attachment.kind}</div>
      </div>
      <div className="min-w-0 pr-6">
        <div className="truncate text-xs font-bold text-slate-100" title={attachment.name}>{attachment.name}</div>
        <div className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-cyan-100/55">{kindLabel}</div>
        <div className="mt-2 truncate text-[11px] font-semibold text-slate-400">{sizeLabel}</div>
        {attachment.truncated && <div className="mt-1 inline-flex rounded border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">truncated</div>}
      </div>
      <button
        type="button"
        aria-label={`Remove ${attachment.name}`}
        onClick={() => onRemove(attachment.id)}
        className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/35 text-slate-300 opacity-80 transition hover:border-rose-300/30 hover:bg-rose-400/10 hover:text-rose-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DropOverlay({ supportsVision, supportsFiles, role }: { supportsVision: boolean; supportsFiles: boolean; role: string }) {
  const title = supportsVision ? "이미지와 파일을 여기에 놓으세요" : "파일을 여기에 놓으세요";
  const detail = supportsVision
    ? "스크린샷은 전송용으로 자동 압축되고, 텍스트 파일은 메시지 컨텍스트에 붙습니다."
    : supportsFiles
      ? "코드와 문서 파일은 텍스트 컨텍스트로 첨부됩니다."
      : "현재 모델은 첨부 입력을 지원하지 않습니다.";

  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/72 p-4 backdrop-blur-sm" data-testid="drop-overlay">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-300/30 bg-[linear-gradient(135deg,rgba(8,47,73,0.92),rgba(15,23,42,0.92)_48%,rgba(49,46,129,0.78))] p-5 text-center shadow-[0_30px_110px_rgba(8,47,73,0.42)] ring-1 ring-cyan-200/10">
        <div className="handoff-line pointer-events-none absolute inset-x-0 top-0 h-px overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent" />
        </div>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-[0_0_48px_rgba(103,232,249,0.18)]">
          {supportsVision ? <ImagePlus className="h-7 w-7" /> : <Paperclip className="h-7 w-7" />}
        </div>
        <div className="mt-4 text-lg font-bold text-white">{title}</div>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-300">{detail}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-left">
          <DropSignal label="mode" value={role} active />
          <DropSignal label="image" value={supportsVision ? "ready" : "off"} active={supportsVision} />
          <DropSignal label="file" value={supportsFiles ? "ready" : "off"} active={supportsFiles} />
        </div>
      </div>
    </div>
  );
}

function DropSignal({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={cn("min-w-0 rounded-lg border px-3 py-2", active ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500")}>
      <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-1 truncate text-xs font-bold">{value}</div>
    </div>
  );
}

function ComposerStateBadge({ state }: { state: string }) {
  const tone =
    state === "armed"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : state === "streaming"
        ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : state === "preparing"
        ? "border-sky-300/25 bg-sky-300/10 text-sky-100"
        : state === "scanning"
          ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
          : state === "blocked" || state === "missing"
            ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
            : "border-white/10 bg-white/[0.04] text-slate-300";
  const dot =
    state === "armed"
      ? "bg-emerald-300"
      : state === "streaming"
        ? "bg-cyan-300"
        : state === "preparing"
          ? "bg-sky-300"
          : state === "scanning"
            ? "bg-cyan-300 status-pulse"
            : state === "blocked" || state === "missing"
              ? "bg-amber-300"
              : "bg-slate-500";

  return (
    <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] font-bold uppercase tracking-[0.12em]", tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      {state}
    </span>
  );
}

function TuningControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  const percent = Math.round(((value - min) / (max - min)) * 100);

  return (
    <label className="rounded-lg border border-white/10 bg-white/[0.035] p-1.5 text-xs font-semibold text-slate-300 shadow-inner shadow-white/[0.025] sm:p-2">
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-bold uppercase tracking-[0.12em] text-cyan-200/60 sm:tracking-[0.14em]">{label}</span>
        <span className="rounded border border-white/10 bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-100 sm:px-2 sm:text-[11px]">
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-2 w-full accent-cyan-300"
        style={{ background: `linear-gradient(90deg, rgba(103,232,249,0.8) 0%, rgba(103,232,249,0.8) ${percent}%, rgba(255,255,255,0.1) ${percent}%, rgba(255,255,255,0.1) 100%)` }}
      />
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 h-6 w-full rounded-md border border-white/10 bg-slate-950/70 px-2 text-xs text-slate-100 outline-none focus:border-cyan-300/45 sm:h-7"
      />
    </label>
  );
}

function MessageMeta({ role, modelName, streaming, failed }: { role: ChatMessage["role"]; modelName?: string; streaming: boolean; failed?: boolean }) {
  const assistant = role === "assistant";
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b px-4 py-2 text-[11px] font-bold uppercase tracking-[0.12em]",
        failed ? "border-rose-300/15 bg-rose-300/10 text-rose-100/85" : assistant ? "border-white/10 bg-white/[0.035] text-cyan-100/75" : "border-white/10 bg-white/[0.055] text-white/70"
      )}
    >
      <span className="min-w-0 truncate">{assistant ? modelName ?? "Local model" : "You"}</span>
      <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5", failed ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : assistant ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.06] text-white/75")}>
        <span className={cn("h-1.5 w-1.5 rounded-full", failed ? "bg-rose-300" : streaming ? "bg-cyan-300 status-pulse" : assistant ? "bg-emerald-300" : "bg-slate-300")} />
        {failed ? "failed" : streaming ? "streaming" : assistant ? "response" : "request"}
      </span>
    </div>
  );
}

function ModelLaunchStage({
  selectedModel,
  skin,
  role,
  icon: Icon,
  capabilities,
  quickPrompts,
  ready,
  status,
  loading,
  onPrompt
}: {
  selectedModel?: ModelView;
  skin: (typeof modeMap)[keyof typeof modeMap];
  role: string;
  icon: typeof Sparkles;
  capabilities: Array<{ label: string; value: string; active: boolean }>;
  quickPrompts: string[];
  ready: boolean;
  status: string;
  loading?: boolean;
  onPrompt: (prompt: string) => void;
}) {
  const speed = selectedModel?.bench ? `${selectedModel.bench.avgTps.toFixed(0)} t/s` : selectedModel?.expectedTps ? `~${selectedModel.expectedTps}` : "-";
  const roleBadges = loading ? ["scan", "ollama", "vllm"] : selectedModel?.roles.slice(0, 3) ?? [];
  const statusClass = ready
    ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
    : status === "scanning"
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
    : status === "selected"
      ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
      : status === "missing"
        ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
        : "border-white/10 bg-white/[0.055] text-slate-300";
  const title = loading ? "로컬 모델 스캔 중" : selectedModel ? `${selectedModel.displayName} 테스트 스테이지` : "LLM 테스트 스테이지";
  const description = loading ? "Primary / secondary Ollama store와 vLLM 후보를 읽어서 장착 가능한 모델 목록을 구성하고 있습니다." : selectedModel?.bestUse ?? "상단 LLM 선택 버튼에서 모델을 고르면 채팅창 스킨과 입력 도구가 바뀝니다.";
  const score = selectedModel ? getModelScore(selectedModel) : undefined;

  return (
    <div className="mx-auto mt-2 max-w-4xl sm:mt-3">
      <div className={cn("surface-premium model-stage-shell relative overflow-hidden rounded-xl border border-white/10 bg-slate-950/68 p-3 ring-1 ring-cyan-300/10 sm:p-4", `model-stage-shell-${role}`)}>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(103,232,249,0.08),transparent_34%,rgba(129,140,248,0.08)_68%,transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
        <MobileStageCapsule
          title={title}
          description={description}
          status={status}
          statusClass={statusClass}
          roleBadges={roleBadges}
          selectedModel={selectedModel}
          score={score}
          skin={skin}
          icon={Icon}
          loading={loading}
          ready={ready}
        />
        <MobileRoutePanel
          selectedModel={selectedModel}
          capabilities={capabilities}
          speed={speed}
          ready={ready}
          status={status}
          loading={loading}
          tone={skin.tone}
        />
        <div className="relative hidden gap-3 sm:grid md:grid-cols-[176px_minmax(0,1fr)]">
          <div className="rounded-lg border border-white/10 bg-black/20 p-2 text-left shadow-inner shadow-white/[0.025] sm:p-3 sm:text-center">
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-3 sm:block">
              <div className={cn("model-stage-core mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-cyan-300/20 bg-slate-950/85 text-cyan-100 sm:h-20 sm:w-20", (ready || loading) && "model-stage-core-active")}>
                <Icon className={cn("h-5 w-5 sm:h-8 sm:w-8", skin.accent)} />
              </div>
              <div className="min-w-0">
                <div className={cn("inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] sm:mt-2", statusClass)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-300" : status === "scanning" ? "bg-cyan-300 status-pulse" : status === "selected" ? "bg-cyan-300" : status === "missing" ? "bg-amber-300" : "bg-slate-400")} />
                  {status}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 sm:justify-center">
                  {(roleBadges.length > 0 ? roleBadges : ["no-role"]).map((role) => (
                    <span key={role} className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                      {role}
                    </span>
                  ))}
                </div>
                {score && (
                  <div className="mt-2 flex items-center gap-2 rounded-md border border-cyan-300/18 bg-cyan-300/[0.08] p-2 text-left">
                    <FitDial score={score.score} tone={score.tone} />
                    <div className="min-w-0">
                      <div className="truncate text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100/55">sweet spot</div>
                      <div className="truncate text-xs font-black text-white">{score.label}</div>
                    </div>
                  </div>
                )}
                <SignalEqualizer active={ready || Boolean(loading)} variant={ready ? "ready" : loading ? "scan" : status === "missing" ? "warn" : "idle"} seed={selectedModel?.id ?? status} />
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className={cn("rounded border px-2 py-0.5 text-[11px] font-semibold", skin.soft, "border-white/10")}>{loading ? "scanner" : selectedModel?.runtime ?? "runtime"}</span>
              <span className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[11px] font-semibold text-slate-300">{loading ? "local stores" : selectedModel?.store ?? "local"}</span>
            </div>
            <h3 className="mt-1.5 truncate text-base font-bold text-white sm:text-lg">{title}</h3>
            <p className="mt-1 line-clamp-1 text-sm leading-6 text-slate-400 sm:line-clamp-2">
              {description}
            </p>

            <CapabilityRunway capabilities={capabilities} tone={skin.tone} />

            <AgentRouteBoard
              selectedModel={selectedModel}
              capabilities={capabilities}
              speed={speed}
              ready={ready}
              status={status}
              loading={loading}
              tone={skin.tone}
            />

            {!loading && quickPrompts.length > 0 && <PromptActionDock prompts={quickPrompts} onPrompt={onPrompt} compact />}

          </div>
        </div>
      </div>
    </div>
  );
}

function MobileRoutePanel({
  selectedModel,
  capabilities,
  speed,
  ready,
  status,
  loading,
  tone
}: {
  selectedModel?: ModelView;
  capabilities: Array<{ label: string; value: string; active: boolean }>;
  speed: string;
  ready: boolean;
  status: string;
  loading?: boolean;
  tone: ModeTone;
}) {
  const toneClass = modeToneClasses(tone);
  const input = capabilities
    .filter((capability) => capability.active)
    .map((capability) => capability.label.toLowerCase())
    .slice(0, 2)
    .join(" + ");
  const route = loading ? "scan stores" : selectedModel ? `${selectedModel.runtime} / ${selectedModel.store ?? "local"}` : "no target";
  const load = loading ? "profiling" : selectedModel?.sizeGb ? `${selectedModel.sizeGb}GB / ${speed}` : speed;
  const answer = ready ? "stream ready" : status === "selected" ? "on send" : status === "missing" ? "install first" : loading ? "mapping" : "draft";
  const cells: Array<{ label: string; value: string; meta: string; icon: ReactNode; active: boolean }> = [
    {
      label: "input",
      value: input || "blocked",
      meta: capabilities.map((capability) => `${capability.label.toLowerCase()}:${capability.value}`).join(" · "),
      icon: <Paperclip className="h-3.5 w-3.5" />,
      active: Boolean(input)
    },
    {
      label: "route",
      value: route,
      meta: `load ${load || "-"} · answer ${answer}`,
      icon: <MessageSquare className="h-3.5 w-3.5" />,
      active: Boolean(selectedModel?.installed || loading)
    }
  ];

  return (
    <div className="relative mt-2 grid grid-cols-2 gap-1.5 sm:hidden" data-testid="mobile-route-panel" data-tone={tone}>
      {cells.map((cell) => (
        <div
          key={cell.label}
          className={cn(
            "grid min-h-[58px] min-w-0 grid-cols-[18px_minmax(0,1fr)] gap-x-1.5 rounded-lg border px-2 py-1.5 shadow-inner shadow-white/[0.02]",
            cell.active ? toneClass.panel : "border-white/10 bg-white/[0.025] text-slate-500"
          )}
        >
          <span className={cn("row-span-2 mt-0.5 shrink-0", cell.active ? toneClass.icon : "text-slate-600")}>{cell.icon}</span>
          <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-65">{cell.label}</span>
          <span className="truncate text-[11px] font-black">{cell.value}</span>
          <span className="col-span-2 mt-0.5 truncate text-[9px] font-bold uppercase tracking-[0.08em] opacity-55">{cell.meta}</span>
        </div>
      ))}
    </div>
  );
}

function MobileStageCapsule({
  title,
  description,
  status,
  statusClass,
  roleBadges,
  selectedModel,
  score,
  skin,
  icon: Icon,
  loading,
  ready
}: {
  title: string;
  description: string;
  status: string;
  statusClass: string;
  roleBadges: string[];
  selectedModel?: ModelView;
  score?: ModelScore;
  skin: (typeof modeMap)[keyof typeof modeMap];
  icon: typeof Sparkles;
  loading?: boolean;
  ready: boolean;
}) {
  return (
    <div className="relative sm:hidden" data-testid="mobile-stage-capsule">
      <div className="grid grid-cols-[52px_minmax(0,1fr)_58px] items-center gap-2 rounded-lg border border-white/10 bg-slate-950/38 p-2 shadow-inner shadow-white/[0.025]">
        <div className={cn("model-stage-core flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300/20 bg-slate-950/85 text-cyan-100", (ready || loading) && "model-stage-core-active")}>
          <Icon className={cn("h-5 w-5", skin.accent)} />
        </div>
        <div className="min-w-0">
          <div className={cn("inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]", statusClass)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-emerald-300" : status === "scanning" ? "bg-cyan-300 status-pulse" : status === "selected" ? "bg-cyan-300" : status === "missing" ? "bg-amber-300" : "bg-slate-400")} />
            {status}
          </div>
          <h3 className="mt-1 truncate text-base font-black text-white">{title}</h3>
          <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-slate-400">{description}</p>
        </div>
        <div className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2 py-1.5 text-center shadow-[0_0_28px_rgba(103,232,249,0.12)]">
          <div className="text-lg font-black text-white">{score?.score ?? "-"}</div>
          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-cyan-100/55">fit</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className={cn("rounded border px-2 py-0.5 text-[10px] font-bold", skin.soft, "border-white/10")}>{loading ? "scanner" : selectedModel?.runtime ?? "runtime"}</span>
        <span className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-300">{loading ? "local stores" : selectedModel?.store ?? "local"}</span>
        {(roleBadges.length > 0 ? roleBadges : ["no-role"]).map((role) => (
          <span key={role} className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-semibold text-slate-300">
            {role}
          </span>
        ))}
      </div>
    </div>
  );
}

function CapabilityRunway({ capabilities, tone, compact = false }: { capabilities: Array<{ label: string; value: string; active: boolean }>; tone: ModeTone; compact?: boolean }) {
  const iconMap: Record<string, ReactNode> = {
    Text: <MessageSquare className="h-3.5 w-3.5" />,
    Files: <Paperclip className="h-3.5 w-3.5" />,
    Vision: <ImagePlus className="h-3.5 w-3.5" />,
    Audio: <Mic className="h-3.5 w-3.5" />
  };
  const toneClass = modeToneClasses(tone);

  return (
    <div
      className={cn(
        "grid gap-1.5",
        compact ? "mt-2 grid-cols-4" : "mt-2 grid-cols-4"
      )}
      data-testid="capability-runway"
      data-tone={tone}
    >
      {capabilities.map((capability) => (
        <div
          key={capability.label}
          className={cn(
            "min-w-0 rounded-md border px-2 shadow-inner shadow-white/[0.02]",
            compact ? "py-1" : "py-1.5",
            capability.active
              ? toneClass.panel
              : "border-white/10 bg-white/[0.025] text-slate-500"
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn("shrink-0", capability.active ? toneClass.icon : "text-slate-600")}>{iconMap[capability.label] ?? <Sparkles className="h-3.5 w-3.5" />}</span>
            <span className="truncate text-[9px] font-black uppercase tracking-[0.12em] opacity-65">{capability.label}</span>
          </div>
          <div className={cn("mt-0.5 truncate font-black", compact ? "text-[10px]" : "text-[11px]")}>{capability.value}</div>
        </div>
      ))}
    </div>
  );
}

function AgentRouteBoard({
  selectedModel,
  capabilities,
  speed,
  ready,
  status,
  loading,
  tone
}: {
  selectedModel?: ModelView;
  capabilities: Array<{ label: string; value: string; active: boolean }>;
  speed: string;
  ready: boolean;
  status: string;
  loading?: boolean;
  tone: ModeTone;
}) {
  const toneClass = modeToneClasses(tone);
  const inputSuite = capabilities
    .filter((capability) => capability.active)
    .map((capability) => capability.label.toLowerCase())
    .join(" + ");
  const route = loading ? "store scan" : selectedModel ? `${selectedModel.runtime} / ${selectedModel.store ?? "local"}` : "no target";
  const memory = loading ? "profiling" : selectedModel?.sizeGb ? `${selectedModel.sizeGb}GB` : "unknown";
  const output = ready ? "stream ready" : status === "selected" ? "loads on send" : status === "missing" ? "install first" : loading ? "mapping" : "standby";
  const cells: Array<{ label: string; value: string; icon: ReactNode; active: boolean }> = [
    { label: "input", value: inputSuite || "blocked", icon: <Paperclip className="h-3.5 w-3.5" />, active: Boolean(inputSuite) },
    { label: "route", value: route, icon: <MessageSquare className="h-3.5 w-3.5" />, active: Boolean(selectedModel?.installed) || Boolean(loading) },
    { label: "load", value: `${memory} / ${speed}`, icon: <HardDrive className="h-3.5 w-3.5" />, active: Boolean(selectedModel?.sizeGb || loading) },
    { label: "answer", value: output, icon: <Bot className="h-3.5 w-3.5" />, active: ready || status === "selected" || Boolean(loading) }
  ];

  return (
    <div
      className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-slate-950/44 p-2 shadow-inner shadow-white/[0.025]"
      data-testid="agent-route-board"
      data-tone={tone}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border", toneClass.chip)}>
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <div className={cn("text-[10px] font-black uppercase tracking-[0.16em]", toneClass.icon)}>Agent route</div>
            <div className="truncate text-xs font-bold text-slate-200">{selectedModel?.displayName ?? "local model"} command path</div>
          </div>
        </div>
        <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]", ready ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : loading ? toneClass.chip : "border-white/10 bg-white/[0.04] text-slate-400")}>
          {ready ? "live" : loading ? "scan" : "draft"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((cell, index) => (
          <div
            key={cell.label}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-md border px-2 py-1.5",
              cell.active ? toneClass.panel : "border-white/10 bg-white/[0.025] text-slate-500"
            )}
          >
            {index > 0 && <span className={cn("absolute -left-1 top-1/2 h-px w-2 -translate-y-1/2", toneClass.line)} />}
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 opacity-75">{cell.icon}</span>
              <span className="truncate text-[10px] font-black uppercase tracking-[0.12em] opacity-65">{cell.label}</span>
            </div>
            <div className="mt-1 truncate text-[11px] font-bold">{cell.value}</div>
          </div>
        ))}
      </div>
      <RouteTrace
        selectedModel={selectedModel}
        capabilities={capabilities}
        ready={ready}
        loading={loading}
        status={status}
        tone={tone}
      />
    </div>
  );
}

function RouteTrace({
  selectedModel,
  capabilities,
  ready,
  loading,
  status,
  tone
}: {
  selectedModel?: ModelView;
  capabilities: Array<{ label: string; value: string; active: boolean }>;
  ready: boolean;
  loading?: boolean;
  status: string;
  tone: ModeTone;
}) {
  const toneClass = modeToneClasses(tone);
  const activeInputs = capabilities.filter((capability) => capability.active).length;
  const installed = Boolean(selectedModel?.installed);
  const flowState = ready ? "stream" : loading ? "scan" : status === "missing" ? "install" : installed ? "armed" : "draft";
  const steps: Array<{ label: string; value: string; icon: ReactNode; active: boolean }> = [
    {
      label: "context",
      value: activeInputs > 0 ? `${activeInputs} inputs` : "blocked",
      icon: <Paperclip className="h-3.5 w-3.5" />,
      active: activeInputs > 0
    },
    {
      label: "runtime",
      value: loading ? "scan" : selectedModel ? selectedModel.runtime : "none",
      icon: <HardDrive className="h-3.5 w-3.5" />,
      active: loading || installed
    },
    {
      label: "reply",
      value: ready ? "live" : status === "selected" ? "on send" : flowState,
      icon: <Bot className="h-3.5 w-3.5" />,
      active: ready || loading || status === "selected"
    }
  ];
  const summary = steps.map((step) => `${step.label}: ${step.value}`).join(" / ");

  return (
    <div
      className="route-trace-surface mt-2 grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 overflow-hidden rounded-md border border-white/10 bg-black/18 px-2 py-1.5"
      data-testid="route-trace"
      data-tone={tone}
    >
      <span className={cn("flex h-5 w-5 items-center justify-center rounded border text-[10px]", toneClass.chip)}>
        <Sparkles className="h-3 w-3" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="route-trace-track relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.055]">
            <span className={cn("absolute inset-y-0 left-0 rounded-full transition-all", toneClass.line, ready ? "w-full" : loading ? "w-2/3" : installed ? "w-1/2" : "w-1/4")} />
            {(ready || loading) && <span className={cn("route-trace-sweep absolute inset-y-0 w-1/4 rounded-full", toneClass.line)} />}
          </div>
          <span className="hidden shrink-0 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 md:inline">trace</span>
        </div>
        <div className="mt-0.5 truncate text-[10px] font-black uppercase tracking-[0.1em] text-slate-300/82">
          {summary}
        </div>
      </div>
      <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em]", ready ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : loading ? toneClass.chip : installed ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.04] text-slate-400")}>
        {flowState}
      </span>
    </div>
  );
}

function PromptActionDock({ prompts, onPrompt, compact = false }: { prompts: string[]; onPrompt: (prompt: string) => void; compact?: boolean }) {
  if (compact) {
    return (
      <div className="mt-2 grid grid-cols-[108px_minmax(0,1fr)_58px] items-center gap-2" data-testid="prompt-action-dock">
        <div className="flex min-w-0 items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100/65">
          <Sparkles className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Quick actions</span>
        </div>
        <div className="flex min-w-0 gap-2 overflow-hidden">
          {prompts.map((prompt, index) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className="group grid min-h-[38px] min-w-0 flex-1 grid-cols-[26px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-2 py-1 text-left text-[11px] font-semibold leading-4 text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-50"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-[10px] font-black text-cyan-100 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
                {index + 1}
              </span>
              <span className="line-clamp-2 min-w-0">{prompt}</span>
            </button>
          ))}
        </div>
        <div className="rounded border border-white/10 bg-white/[0.045] px-2 py-1 text-center text-[10px] font-bold text-slate-400">draft only</div>
      </div>
    );
  }

  return (
    <div className="mt-3" data-testid="prompt-action-dock">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/65">
          <Sparkles className="h-3.5 w-3.5" />
          Quick actions
        </div>
        <div className="rounded border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-bold text-slate-400">draft only</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0">
        {prompts.map((prompt, index) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPrompt(prompt)}
            className="group grid min-h-[58px] w-[230px] shrink-0 grid-cols-[30px_minmax(0,1fr)] items-center gap-2 rounded-lg border border-white/10 bg-white/[0.045] px-3 py-2 text-left text-xs font-semibold leading-5 text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-50 sm:w-auto"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-300/10 text-[11px] font-black text-cyan-100 transition group-hover:bg-cyan-300 group-hover:text-slate-950">
              {index + 1}
            </span>
            <span className="line-clamp-2 min-w-0">{prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FitDial({ score, tone }: { score: number; tone: ModelScore["tone"] }) {
  const color = {
    emerald: "#6ee7b7",
    cyan: "#67e8f9",
    amber: "#fcd34d",
    slate: "#94a3b8"
  }[tone];

  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full p-[3px] shadow-[0_0_28px_rgba(103,232,249,0.14)] sm:mx-auto"
      style={{ background: `conic-gradient(${color} ${score * 3.6}deg, rgba(255,255,255,0.08) 0deg)` }}
    >
      <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-950 text-sm font-black text-white">
        {score}
      </div>
    </div>
  );
}

function SignalEqualizer({ active, variant, seed }: { active: boolean; variant: "ready" | "scan" | "warn" | "idle"; seed: string }) {
  const seedValue = seed.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const bars = Array.from({ length: 14 }, (_, index) => {
    const wave = (seedValue + index * 17) % 38;
    return 28 + wave + (active && index % 3 === 0 ? 20 : 0);
  });
  const tone =
    variant === "ready"
      ? "from-emerald-300 via-cyan-200 to-cyan-400"
      : variant === "scan"
        ? "from-cyan-200 via-sky-300 to-violet-300"
        : variant === "warn"
          ? "from-amber-200 via-orange-300 to-rose-300"
          : "from-slate-500 via-slate-400 to-slate-600";

  return (
    <div className="mt-3 hidden h-10 items-end gap-1 rounded-md border border-white/10 bg-slate-950/55 px-2 py-2 shadow-inner shadow-black/25 sm:flex">
      {bars.map((height, index) => (
        <span
          key={`${seed}-${index}`}
          className={cn("signal-equalizer-bar min-w-0 flex-1 rounded-full bg-gradient-to-t opacity-80", tone, active && "signal-equalizer-bar-active")}
          style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }}
        />
      ))}
    </div>
  );
}

function HeaderCapabilityPips({ capabilities }: { capabilities: Array<{ label: string; value: string; active: boolean }> }) {
  const iconMap: Record<string, ReactNode> = {
    Text: <MessageSquare className="h-3 w-3" />,
    Files: <Paperclip className="h-3 w-3" />,
    Vision: <ImagePlus className="h-3 w-3" />,
    Audio: <Mic className="h-3 w-3" />
  };

  return (
    <div className="hidden min-w-0 items-center gap-1 lg:flex" data-testid="header-capability-pips">
      {capabilities.map((capability) => (
        <span
          key={capability.label}
          title={`${capability.label}: ${capability.value}`}
          className={cn(
            "inline-flex h-6 min-w-0 items-center gap-1 rounded border px-1.5 text-[10px] font-black uppercase tracking-[0.08em]",
            capability.active
              ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-100"
              : "border-white/10 bg-white/[0.055] text-white/45"
          )}
        >
          <span className="shrink-0 opacity-75">{iconMap[capability.label] ?? <Sparkles className="h-3 w-3" />}</span>
          <span className="truncate">{capability.label.slice(0, 4)}</span>
          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", capability.active ? "bg-current" : "bg-slate-500")} />
        </span>
      ))}
    </div>
  );
}

function SessionStrip({
  selectedModel,
  status,
  mode,
  temperature,
  maxTokens,
  ready,
  loading
}: {
  selectedModel?: ModelView;
  status: string;
  mode: string;
  temperature: number;
  maxTokens: number;
  ready: boolean;
  loading: boolean;
}) {
  const signals = [
    { label: "target", value: loading ? "scanning" : selectedModel?.store ?? "local", icon: <Sparkles className="h-3.5 w-3.5" />, active: Boolean(selectedModel) || loading },
    { label: "mode", value: mode, icon: <MessageSquare className="h-3.5 w-3.5" />, active: ready || status === "selected" || status === "scanning" },
    { label: "temp", value: temperature.toFixed(1), icon: <Settings2 className="h-3.5 w-3.5" />, active: true },
    { label: "max", value: maxTokens.toLocaleString(), icon: <FileText className="h-3.5 w-3.5" />, active: true }
  ];

  return (
    <div className="mt-2 hidden grid-cols-4 gap-1.5 md:grid">
      {signals.map((signal) => (
        <div
          key={signal.label}
          className={cn(
            "group relative min-w-0 overflow-hidden rounded-md border bg-white/[0.045] px-2 py-1.5 shadow-inner shadow-white/[0.02]",
            signal.active ? "border-cyan-300/18 text-slate-100" : "border-white/10 text-slate-500"
          )}
        >
          <div className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/60 to-transparent opacity-0 transition", signal.active && "opacity-100")} />
          <div className="flex min-w-0 items-center gap-1.5">
            <span className={cn("shrink-0", signal.active ? "text-cyan-100/80" : "text-slate-600")}>{signal.icon}</span>
            <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{signal.label}</span>
            <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-45" />
          </div>
          <div className="mt-0.5 truncate text-xs font-bold">{signal.value}</div>
        </div>
      ))}
    </div>
  );
}

function RuntimeHandoff({ runtime, selectedModel }: { runtime: RuntimeState; selectedModel?: ModelView }) {
  const failed = runtime.status === "failed";
  const activeLabel = {
    stopping: "Releasing GPU",
    starting: "Booting runtime",
    warming: "Loading weights",
    installing: "Installing model",
    benchmarking: "Running bench",
    failed: "Needs attention",
    idle: "Idle",
    ready: "Ready"
  }[runtime.status];
  const steps = [
    { label: "release", active: ["stopping", "starting", "warming", "benchmarking"].includes(runtime.status), done: ["starting", "warming", "benchmarking", "ready"].includes(runtime.status) },
    { label: "load", active: ["starting", "warming", "installing"].includes(runtime.status), done: ["warming", "benchmarking", "ready"].includes(runtime.status) },
    { label: "health", active: ["warming", "benchmarking"].includes(runtime.status), done: runtime.status === "ready" },
    { label: "chat", active: runtime.status === "ready", done: runtime.status === "ready" }
  ];

  return (
    <div className={cn("mx-auto max-w-3xl overflow-hidden rounded-lg border p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)]", failed ? "border-rose-300/25 bg-rose-950/45" : "border-cyan-300/20 bg-slate-950/72")} data-testid="runtime-handoff-card">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={cn("text-[11px] font-bold uppercase tracking-[0.16em]", failed ? "text-rose-200/80" : "text-cyan-200/75")}>Runtime handoff</div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-white">{selectedModel?.displayName ?? runtime.activeModelName ?? "Selected model"}</span>
            <span className={cn("rounded border px-2 py-0.5 text-[11px] font-semibold", failed ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100")}>{activeLabel}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{runtime.lastError ?? runtime.message ?? runtime.endpoint ?? "Waiting for the local runtime to settle."}</p>
        </div>
        <div className={cn("hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg border sm:flex", failed ? "border-rose-300/25 bg-rose-300/10 text-rose-100" : "border-cyan-300/25 bg-cyan-300/10 text-cyan-100")}>
          <Sparkles className="h-5 w-5" />
        </div>
      </div>
      {!failed && (
        <>
          <div className="handoff-line mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-cyan-300 via-emerald-300 to-cyan-300" />
          </div>
          <div className="mt-2 grid grid-cols-4 gap-1.5" data-testid="runtime-handoff-steps">
            {steps.map((step) => (
              <div key={step.label} className={cn("relative overflow-hidden rounded-md border px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em]", step.done ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100" : step.active ? "border-cyan-300/25 bg-cyan-300/10 text-cyan-100" : "border-white/10 bg-white/[0.035] text-slate-500")}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{step.label}</span>
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", step.done ? "bg-emerald-300" : step.active ? "bg-cyan-300 status-pulse" : "bg-slate-600")} />
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className={cn("h-full rounded-full transition-all", step.done ? "w-full bg-emerald-300" : step.active ? "w-2/3 bg-cyan-300" : "w-1/5 bg-slate-600")} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const markdownComponents: Components = {
  h1: ({ children, ...props }) => (
    <h1 className="mb-3 mt-1 border-b border-white/10 pb-2 text-xl font-bold leading-tight text-white" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="mb-2 mt-5 text-lg font-bold leading-tight text-white first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="mb-2 mt-4 text-base font-semibold leading-tight text-slate-100 first:mt-0" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }) => (
    <p className="my-2 leading-6 text-slate-200 first:mt-0 last:mb-0" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }) => (
    <ul className="my-2 list-disc space-y-1 pl-5 text-slate-200" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5 text-slate-200" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li className="pl-1 leading-6" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote className="my-3 border-l-4 border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-slate-200" {...props}>
      {children}
    </blockquote>
  ),
  a: ({ children, ...props }) => (
    <a className="font-semibold text-cyan-200 underline decoration-cyan-300/40 underline-offset-2 hover:text-cyan-100" target="_blank" rel="noreferrer" {...props}>
      {children}
    </a>
  ),
  hr: (props) => <hr className="my-4 border-white/10" {...props} />,
  table: ({ children }) => (
    <div className="my-3 overflow-hidden rounded-lg border border-white/10 bg-black/20 shadow-[0_14px_44px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.045] px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/75">
          <Boxes className="h-3.5 w-3.5" />
          table
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/70" />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">{children}</table>
      </div>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-white/[0.07] text-xs uppercase tracking-normal text-cyan-100/75" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-white/10 bg-slate-950/55" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="align-top" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="border-r border-white/10 px-3 py-2 font-semibold last:border-r-0" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="border-r border-white/10 px-3 py-2 text-slate-200 last:border-r-0" {...props}>
      {children}
    </td>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const isBlock = Boolean(className) || String(children).includes("\n");
    if (isBlock) {
      const language = className?.replace(/^language-/, "") || "text";
      return <CodeBlock code={String(children).replace(/\n$/, "")} language={language} />;
    }
    return (
      <code className="rounded border border-white/10 bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-cyan-100" {...props}>
        {children}
      </code>
    );
  }
};

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="markdown-code-block my-3 overflow-hidden rounded-lg border border-white/10 bg-[#050913] shadow-[0_18px_56px_rgba(0,0,0,0.28)]">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.045] px-3 py-2">
        <span className="inline-flex min-w-0 items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-100/75">
          <Code2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{language || "text"}</span>
        </span>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void copyCode()}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.045] px-2 text-[11px] font-semibold text-slate-300 transition hover:border-cyan-300/30 hover:bg-cyan-300/10 hover:text-cyan-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto p-3 text-xs leading-5 text-slate-100">
        <code className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
}

function sanitizeChatError(error: string) {
  const cleaned = error
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[A-Z]:\\[^\s<>"']+/gi, "local path")
    .replace(/\bat\s+[^\n\r]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 260 ? `${cleaned.slice(0, 260).trim()}...` : cleaned || "The local runtime did not return a usable response.";
}

function ErrorResponseCard({ error, onRegenerate }: { error: string; onRegenerate: () => void }) {
  const detail = sanitizeChatError(error);
  const tooLarge = /첨부|too large|PayloadTooLarge|request entity too large/i.test(error);

  return (
    <div className="overflow-hidden rounded-lg border border-rose-300/20 bg-[linear-gradient(135deg,rgba(127,29,29,0.36),rgba(15,23,42,0.74)_48%,rgba(88,28,135,0.22))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" data-testid="chat-error-card">
      <div className="flex items-start gap-3 p-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-300/25 bg-rose-300/10 text-rose-100 shadow-[0_0_28px_rgba(251,113,133,0.12)]">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-100/65">{tooLarge ? "Payload blocked" : "Request failed"}</div>
          <p className="mt-1 text-sm leading-6 text-rose-50">{detail}</p>
        </div>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-rose-300/15 bg-black/18 p-2">
        <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.035] px-2 py-1.5 text-[11px]">
          <div className="font-bold uppercase tracking-[0.13em] text-rose-100/45">status</div>
          <div className="truncate font-bold text-rose-50">{tooLarge ? "input too large" : "runtime rejected"}</div>
        </div>
        <button
          type="button"
          onClick={onRegenerate}
          className="inline-flex h-full min-h-10 items-center justify-center gap-2 rounded-md border border-rose-300/20 bg-rose-300/10 px-3 text-sm font-bold text-rose-50 transition hover:bg-rose-300/16"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </div>
  );
}

function StreamingResponseCard({ modelName }: { modelName?: string }) {
  const pulses = ["route", "warm", "decode"];

  return (
    <div
      className="overflow-hidden rounded-lg border border-cyan-300/18 bg-[linear-gradient(135deg,rgba(8,145,178,0.16),rgba(15,23,42,0.76)_46%,rgba(79,70,229,0.16))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
      data-testid="streaming-response-card"
    >
      <div className="flex items-start gap-3 p-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/24 bg-cyan-300/10 text-cyan-100 shadow-[0_0_32px_rgba(103,232,249,0.16)]">
          <Sparkles className="h-5 w-5" />
          <span className="status-pulse absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-cyan-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100/60">Response stream</div>
              <div className="mt-1 truncate text-sm font-black text-white">{modelName ?? "Local model"}</div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-cyan-100">
              <span className="status-pulse h-1.5 w-1.5 rounded-full bg-cyan-300" />
              live
            </span>
          </div>
          <div className="handoff-line mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-transparent via-cyan-200 to-transparent" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {pulses.map((pulse, index) => (
              <div key={pulse} className="min-w-0 rounded-md border border-cyan-300/16 bg-cyan-300/[0.08] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100/55">{pulse}</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-300/80" style={{ animationDelay: `${index * 120}ms` }} />
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.08]">
                  <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-violet-300" style={{ width: `${44 + index * 18}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="markdown-message">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function ReasoningBlock({ content }: { content: string }) {
  return (
    <details className="mb-3 rounded-md border border-amber-300/20 bg-amber-300/10 text-amber-100">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold">
        <BrainCircuit className="h-4 w-4" />
        Reasoning trace
      </summary>
      <div className="max-h-52 overflow-auto whitespace-pre-wrap border-t border-amber-300/15 px-3 py-2 text-xs leading-5 text-amber-50/85">
        {content}
      </div>
    </details>
  );
}

function AttachmentChip({ attachment }: { attachment: ChatAttachment }) {
  if (attachment.kind === "image") {
    return <img src={attachment.dataUrl} alt={`${attachment.name} (${formatBytes(attachment.sizeBytes)})`} title={`${attachment.name} (${formatBytes(attachment.sizeBytes)})`} className="h-16 w-16 rounded-md object-cover ring-1 ring-white/30" />;
  }
  return (
    <span className="inline-flex max-w-[220px] items-center gap-2 rounded-md bg-black/10 px-2 py-1 text-xs font-semibold">
      <AttachmentIcon kind={attachment.kind} />
      <span className="truncate">{attachment.name} ({formatBytes(attachment.sizeBytes)})</span>
    </span>
  );
}

function AttachmentIcon({ kind }: { kind: ChatAttachment["kind"] }) {
  if (kind === "image") return <ImagePlus className="h-4 w-4" />;
  if (kind === "audio") return <Mic className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.type.startsWith("image/")) return imageFileToAttachment(file);
  const kind: ChatAttachment["kind"] = file.type.startsWith("audio/") ? "audio" : "file";
  const text = kind === "file" && isTextLikeFile(file) ? await readTextAttachment(file) : undefined;
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind,
    mimeType: file.type || "application/octet-stream",
    text,
    truncated: Boolean(text && file.size > MAX_TEXT_ATTACHMENT_BYTES),
    sizeBytes: file.size
  };
}

async function imageFileToAttachment(file: File): Promise<ChatAttachment> {
  const compressed = await compressImage(file);
  if (compressed.sizeBytes > MAX_COMPRESSED_IMAGE_BYTES) {
    throw new Error(`이미지가 너무 큽니다. 압축 후에도 ${formatBytes(compressed.sizeBytes)}입니다. ${formatBytes(MAX_COMPRESSED_IMAGE_BYTES)} 이하 이미지로 다시 시도하세요.`);
  }
  return {
    id: crypto.randomUUID(),
    name: file.name,
    kind: "image",
    mimeType: compressed.mimeType,
    dataUrl: compressed.dataUrl,
    base64: compressed.dataUrl.split(",", 2)[1] ?? "",
    sizeBytes: compressed.sizeBytes,
    originalSizeBytes: file.size
  };
}

async function compressImage(file: File): Promise<{ dataUrl: string; mimeType: string; sizeBytes: number }> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      const dataUrl = await readFileAsDataUrl(file);
      return { dataUrl, mimeType: file.type || "image/png", sizeBytes: file.size };
    }

    context.drawImage(image, 0, 0, width, height);
    await nextFrame();

    let best: { dataUrl: string; mimeType: string; sizeBytes: number } | undefined;
    for (const quality of IMAGE_QUALITY_STEPS) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const sizeBytes = dataUrlBytes(dataUrl);
      best = { dataUrl, mimeType: "image/jpeg", sizeBytes };
      if (sizeBytes <= MAX_COMPRESSED_IMAGE_BYTES) break;
      await nextFrame();
    }

    if (best && (best.sizeBytes <= file.size || file.size > MAX_COMPRESSED_IMAGE_BYTES)) return best;
    const originalDataUrl = await readFileAsDataUrl(file);
    return { dataUrl: originalDataUrl, mimeType: file.type || "image/png", sizeBytes: file.size };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = src;
  });
}

function isTextLikeFile(file: File): boolean {
  if (file.type.startsWith("text/")) return true;
  return /\.(c|cc|cpp|cs|css|csv|env|go|h|hpp|html|ini|java|js|json|jsx|log|md|mdx|php|ps1|py|rb|rs|sh|sql|toml|ts|tsx|txt|xml|yaml|yml)$/i.test(file.name);
}

async function readTextAttachment(file: File): Promise<string> {
  const text = await file.slice(0, MAX_TEXT_ATTACHMENT_BYTES).text();
  if (file.size <= MAX_TEXT_ATTACHMENT_BYTES) return text;
  return `${text}\n\n[truncated: showing first ${formatBytes(MAX_TEXT_ATTACHMENT_BYTES)} of ${formatBytes(file.size)}]`;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}
