import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { getGpuSnapshot } from "./registry.js";
import { ollamaExe } from "./paths.js";
import { delay, runCommand } from "./shell.js";
import type { ChatMessage, HomeServerState } from "./types.js";

const CHAT_ENDPOINT = "http://127.0.0.1:11434";
const EMBED_ENDPOINT = "http://127.0.0.1:11435";
const CHAT_MODEL = "gemma4:12b-it-qat";
const EMBED_MODEL = "embeddinggemma:latest";
const CHAT_STORE = "F:\\AI_Models\\Gemma-4\\.ollama-models";
const EMBED_STORE = "F:\\AI_Models\\Ollama";
const VRAM_WARNING_MB = 11500;

let chatProcess: ChildProcessWithoutNullStreams | undefined;
let embedProcess: ChildProcessWithoutNullStreams | undefined;
let homeQueue: Promise<unknown> = Promise.resolve();
let state: HomeServerState = {
  status: "idle",
  message: "RCA/RAG backend is not running",
  chatModel: CHAT_MODEL,
  embedModel: EMBED_MODEL,
  chatEndpoint: CHAT_ENDPOINT,
  embedEndpoint: EMBED_ENDPOINT,
  apiKeyRequired: Boolean(process.env.SWEET12_GATEWAY_API_KEY),
  logs: []
};

function pushLog(message: string): void {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  state.logs = [...state.logs.slice(-180), line];
}

function setState(next: Partial<HomeServerState>): void {
  state = { ...state, ...next, logs: next.logs ?? state.logs };
}

async function refreshGpuState(): Promise<void> {
  const gpu = await getGpuSnapshot();
  const usedMb = gpu.usedMb;
  setState({
    apiKeyRequired: Boolean(process.env.SWEET12_GATEWAY_API_KEY),
    vram: {
      ...gpu,
      warning: typeof usedMb === "number" && usedMb >= VRAM_WARNING_MB,
      thresholdMb: VRAM_WARNING_MB
    }
  });
}

export async function getHomeServerState(): Promise<HomeServerState> {
  await refreshGpuState().catch(() => undefined);
  return state;
}

function endpointEnv(host: string, storePath: string, keepAlive: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OLLAMA_HOST: host,
    OLLAMA_MODELS: storePath,
    OLLAMA_KEEP_ALIVE: keepAlive,
    OLLAMA_NUM_PARALLEL: "1",
    OLLAMA_MAX_LOADED_MODELS: "1",
    OLLAMA_VULKAN: "false"
  };
}

function attachLogs(child: ChildProcessWithoutNullStreams, name: string): void {
  child.stdout.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) pushLog(`${name}: ${text}`);
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text) pushLog(`${name}: ${text}`);
  });
  child.on("exit", (code) => pushLog(`${name} Ollama exited with code ${code}`));
}

async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const started = Date.now();
  let lastError = "";
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await delay(750);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function stopTrackedProcess(child: ChildProcessWithoutNullStreams | undefined): Promise<void> {
  if (!child || child.killed) return;
  child.kill();
  await delay(500);
}

async function stopAllOllamaProcesses(): Promise<void> {
  await Promise.all([stopTrackedProcess(chatProcess), stopTrackedProcess(embedProcess)]);
  chatProcess = undefined;
  embedProcess = undefined;
  for (const image of ["ollama.exe", "ollama app.exe", "llama-server.exe"]) {
    await runCommand("taskkill", ["/IM", image, "/F", "/T"], { timeoutMs: 10000 }).catch(() => undefined);
  }
}

function startOllamaProcess(name: string, host: string, storePath: string, keepAlive: string): ChildProcessWithoutNullStreams {
  pushLog(`Starting ${name} endpoint=${host} store=${storePath}`);
  const child = spawn(ollamaExe, ["serve"], {
    env: endpointEnv(host, storePath, keepAlive),
    windowsHide: true
  });
  attachLogs(child, name);
  return child;
}

async function unloadEmbedModelIfNeeded(): Promise<void> {
  await refreshGpuState();
  if (!state.vram?.warning) return;
  pushLog(`VRAM ${state.vram.usedMb}MiB exceeds ${VRAM_WARNING_MB}MiB; requesting EmbeddingGemma unload`);
  await fetch(`${EMBED_ENDPOINT}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: "release",
      keep_alive: "0s"
    })
  }).catch((error) => pushLog(`Embed unload warning: ${error instanceof Error ? error.message : String(error)}`));
  await delay(1000);
  await refreshGpuState();
}

export async function startHomeServerProfile(): Promise<HomeServerState> {
  setState({ status: "stopping", message: "Resetting Ollama runtimes for RCA/RAG profile", lastError: undefined, currentTask: "maintenance" });
  await stopAllOllamaProcesses();
  try {
    setState({
      status: "starting",
      message: "Starting Gemma 4 12B QAT and EmbeddingGemma endpoints",
      startedAt: new Date().toISOString(),
      currentTask: "maintenance",
      lastError: undefined
    });
    chatProcess = startOllamaProcess("chat", "127.0.0.1:11434", CHAT_STORE, "30m");
    embedProcess = startOllamaProcess("embed", "127.0.0.1:11435", EMBED_STORE, "30s");
    setState({ chatPid: chatProcess.pid, embedPid: embedProcess.pid });

    await Promise.all([waitForUrl(`${CHAT_ENDPOINT}/api/tags`, 30000), waitForUrl(`${EMBED_ENDPOINT}/api/tags`, 30000)]);

    setState({ status: "warming", message: "Warming embedding endpoint", currentTask: "embedding" });
    await generateEmbedding("health check", { keepAlive: "30s", skipQueue: true });

    setState({ status: "warming", message: "Warming Gemma 4 12B with thinking disabled", currentTask: "chat" });
    await chatOnce([{ role: "user", content: "Reply with OK." }], { maxTokens: 16, skipQueue: true });

    setState({ status: "ready", message: "RCA/RAG backend ready", currentTask: undefined });
    await unloadEmbedModelIfNeeded();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushLog(message);
    await stopAllOllamaProcesses().catch((stopError) => pushLog(`Cleanup warning: ${stopError instanceof Error ? stopError.message : String(stopError)}`));
    setState({
      status: "failed",
      message: "RCA/RAG backend start failed",
      chatPid: undefined,
      embedPid: undefined,
      lastError: message,
      currentTask: undefined
    });
  }
  return getHomeServerState();
}

export async function stopHomeServerProfile(): Promise<HomeServerState> {
  setState({ status: "stopping", message: "Stopping RCA/RAG backend", currentTask: "maintenance" });
  await stopAllOllamaProcesses();
  setState({
    status: "idle",
    message: "RCA/RAG backend is not running",
    chatPid: undefined,
    embedPid: undefined,
    startedAt: undefined,
    lastError: undefined,
    currentTask: undefined
  });
  return getHomeServerState();
}

function enqueueHomeTask<T>(task: HomeServerState["currentTask"], work: () => Promise<T>): Promise<T> {
  const run = homeQueue.then(async () => {
    setState({ currentTask: task });
    try {
      return await work();
    } finally {
      setState({ currentTask: undefined });
    }
  });
  homeQueue = run.catch(() => undefined);
  return run;
}

function assertReady(): void {
  if (state.status !== "ready") throw new Error("RCA/RAG backend is not ready");
}

async function generateEmbedding(
  input: string | string[],
  options: { dimensions?: number; keepAlive?: string; skipQueue?: boolean } = {}
): Promise<unknown> {
  const work = async () => {
    const body: Record<string, unknown> = {
      model: EMBED_MODEL,
      input,
      keep_alive: options.keepAlive ?? "30s"
    };
    if (options.dimensions) body.dimensions = options.dimensions;
    const response = await fetch(`${EMBED_ENDPOINT}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`EmbeddingGemma failed: ${response.status} ${await response.text()}`);
    const parsed = await response.json();
    await unloadEmbedModelIfNeeded();
    return parsed;
  };
  return options.skipQueue ? work() : enqueueHomeTask("embedding", work);
}

async function chatOnce(
  messages: ChatMessage[],
  options: { systemPrompt?: string; temperature?: number; maxTokens?: number; skipQueue?: boolean } = {}
): Promise<unknown> {
  const work = async () => {
    const normalized = options.systemPrompt?.trim() ? [{ role: "system", content: options.systemPrompt.trim() }, ...messages] : messages;
    const response = await fetch(`${CHAT_ENDPOINT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        messages: normalized,
        stream: false,
        think: false,
        keep_alive: "30m",
        options: {
          num_ctx: 4096,
          num_predict: options.maxTokens ?? 768,
          temperature: options.temperature ?? 0.2
        }
      })
    });
    if (!response.ok) throw new Error(`Gemma 4 12B chat failed: ${response.status} ${await response.text()}`);
    const parsed = await response.json();
    await unloadEmbedModelIfNeeded();
    return parsed;
  };
  return options.skipQueue ? work() : enqueueHomeTask("chat", work);
}

export async function embedForHomeServer(input: string | string[], options: { dimensions?: number; bulk?: boolean } = {}): Promise<unknown> {
  assertReady();
  return generateEmbedding(input, { dimensions: options.dimensions, keepAlive: options.bulk ? "5s" : "30s" });
}

export async function chatForHomeServer(request: {
  messages?: ChatMessage[];
  prompt?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<unknown> {
  assertReady();
  const messages = request.messages?.length ? request.messages : [{ role: "user" as const, content: request.prompt ?? "" }];
  return chatOnce(messages, { systemPrompt: request.systemPrompt, temperature: request.temperature, maxTokens: request.maxTokens });
}

export async function ragQueryForHomeServer(request: {
  query: string;
  contexts?: string[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<unknown> {
  assertReady();
  if (!request.contexts?.length) throw new Error("RAG query requires contexts until a vector database is connected");
  const contextBlock = request.contexts.map((context, index) => `[context ${index + 1}]\n${context}`).join("\n\n");
  return enqueueHomeTask("rag", () =>
    chatOnce(
      [
        {
          role: "user",
          content: `질문:\n${request.query}\n\n검색된 근거:\n${contextBlock}\n\n근거에 기반해서 RCA/AIOps 관점으로 답해.`
        }
      ],
      { systemPrompt: request.systemPrompt, temperature: request.temperature, maxTokens: request.maxTokens, skipQueue: true }
    )
  );
}
