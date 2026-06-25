export type RuntimeKind = "ollama" | "vllm";
export type RuntimeStatus = "idle" | "stopping" | "starting" | "warming" | "ready" | "installing" | "benchmarking" | "failed";

export interface BenchRun {
  outputTokens: number;
  totalMs: number;
  tps: number;
  ttftMs?: number;
}

export interface BenchSummary {
  updatedAt: string;
  runs: BenchRun[];
  avgTps: number;
  avgTotalMs: number;
  avgOutputTokens: number;
  warning?: string;
}

export interface ModelView {
  id: string;
  displayName: string;
  runtime: RuntimeKind;
  role: string;
  roles: string[];
  store?: string;
  ollamaModel?: string;
  remoteTag?: string;
  modelDir?: string;
  servedModelName?: string;
  sizeGb?: number;
  priority: number;
  expectedTps?: number;
  reason: string;
  bestUse: string;
  envExample: string;
  installed: boolean;
  installable: boolean;
  storePath?: string;
  bench?: BenchSummary;
}

export interface ModelsResponse {
  models: ModelView[];
  disk: {
    drive: string;
    freeGb: number | null;
    lowSpace: boolean;
  };
  gpu: {
    totalMb?: number;
    usedMb?: number;
    freeMb?: number;
    utilization?: number;
  };
}

export interface RuntimeState {
  status: RuntimeStatus;
  activeModelId?: string;
  activeModelName?: string;
  runtime?: RuntimeKind;
  endpoint?: string;
  message: string;
  startedAt?: string;
  lastError?: string;
  logs: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: string;
  reasoning?: string;
  attachments?: ChatAttachment[];
}

export interface ChatAttachment {
  id: string;
  name: string;
  kind: "image" | "audio" | "file";
  mimeType: string;
  dataUrl?: string;
  base64?: string;
  text?: string;
  truncated?: boolean;
  sizeBytes: number;
  originalSizeBytes?: number;
}

export interface InstallJob {
  id: string;
  modelId: string;
  status: "queued" | "running" | "done" | "failed";
  logs: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
