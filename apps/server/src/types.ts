export type RuntimeKind = "ollama" | "vllm";

export type RuntimeStatus =
  | "idle"
  | "stopping"
  | "starting"
  | "warming"
  | "ready"
  | "installing"
  | "benchmarking"
  | "failed";

export interface ModelRegistry {
  stores: Record<string, string>;
  models: ModelProfile[];
}

export interface ModelProfile {
  id: string;
  displayName: string;
  runtime: RuntimeKind;
  role: string;
  roles: string[];
  store?: string;
  ollamaModel?: string;
  manifestPath?: string;
  remoteTag?: string;
  modelDir?: string;
  servedModelName?: string;
  sizeGb?: number;
  priority: number;
  expectedTps?: number;
  reason: string;
  bestUse: string;
  envExample: string;
}

export interface ModelView extends ModelProfile {
  installed: boolean;
  installable: boolean;
  storePath?: string;
  bench?: BenchSummary;
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
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[];
}

export interface ChatRequest {
  messages: ChatMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

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

export interface InstallJob {
  id: string;
  modelId: string;
  status: "queued" | "running" | "done" | "failed";
  logs: string[];
  startedAt: string;
  finishedAt?: string;
  error?: string;
}
