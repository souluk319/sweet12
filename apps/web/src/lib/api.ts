import type { ChatMessage, InstallJob, ModelsResponse, RuntimeState } from "../types";

export async function fetchModels(): Promise<ModelsResponse> {
  const response = await fetch("/api/models");
  if (!response.ok) throw new Error("Failed to load models");
  return response.json() as Promise<ModelsResponse>;
}

export async function fetchRuntime(): Promise<RuntimeState> {
  const response = await fetch("/api/runtime/status");
  if (!response.ok) throw new Error("Failed to load runtime state");
  return response.json() as Promise<RuntimeState>;
}

export async function fetchInstallJobs(): Promise<InstallJob[]> {
  const response = await fetch("/api/install/jobs");
  if (!response.ok) throw new Error("Failed to load install jobs");
  const parsed = (await response.json()) as { jobs: InstallJob[] };
  return parsed.jobs;
}

export async function switchModel(modelId: string): Promise<RuntimeState> {
  const response = await fetch("/api/runtime/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId })
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(parsed.error ?? "Model switch failed");
  return parsed as RuntimeState;
}

export async function stopRuntime(): Promise<RuntimeState> {
  const response = await fetch("/api/runtime/stop", { method: "POST" });
  const parsed = await response.json();
  if (!response.ok) throw new Error(parsed.error ?? "Runtime stop failed");
  return parsed as RuntimeState;
}

export async function installModel(modelId: string): Promise<void> {
  const response = await fetch(`/api/models/${encodeURIComponent(modelId)}/install`, { method: "POST" });
  const parsed = await response.json();
  if (!response.ok) throw new Error(parsed.error ?? "Install failed");
}

export async function runBench(modelId: string): Promise<void> {
  const response = await fetch("/api/bench/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelId })
  });
  const parsed = await response.json();
  if (!response.ok) throw new Error(parsed.error ?? "Benchmark failed");
}

export async function streamChat(
  options: {
    messages: Array<{ role: "user" | "assistant"; content: string; images?: string[] }>;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
  },
  onToken: (token: string) => void,
  signal?: AbortSignal,
  onThinking?: (token: string) => void
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
    signal
  });
  if (!response.ok || !response.body) {
    throw new Error(await readErrorMessage(response, "Chat request failed"));
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.split(/\r?\n/).find((line) => line.startsWith("event: "))?.slice(7);
      const data = frame.split(/\r?\n/).find((line) => line.startsWith("data: "))?.slice(6);
      if (!event || !data) continue;
      const parsed = JSON.parse(data) as { text?: string; message?: string };
      if (event === "token" && parsed.text) onToken(parsed.text);
      if (event === "thinking" && parsed.text) onThinking?.(parsed.text);
      if (event === "error") throw new Error(parsed.message ?? "Streaming error");
    }
  }
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const parsed = (await response.json().catch(() => undefined)) as { error?: string; message?: string } | undefined;
    return parsed?.error ?? parsed?.message ?? fallback;
  }

  const raw = await response.text().catch(() => "");
  if (response.status === 413 || /PayloadTooLargeError|request entity too large/i.test(raw)) {
    return "첨부 이미지가 너무 큽니다. 이미지를 자동 압축한 뒤 다시 보내거나, 더 작은 이미지로 시도하세요.";
  }
  const cleaned = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, 360) : fallback;
}

export function apiMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string; images?: string[] }> {
  return messages.filter((message) => !message.error).map(({ role, content, attachments }) => {
    const images = attachments?.filter((attachment) => attachment.kind === "image" && attachment.base64).map((attachment) => attachment.base64!);
    return { role, content, ...(images?.length ? { images } : {}) };
  });
}
