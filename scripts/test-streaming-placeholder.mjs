import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";
const outDir = path.resolve("test-artifacts");

fs.mkdirSync(outDir, { recursive: true });

const chatModel = {
  id: "gemma4-e4b",
  displayName: "Gemma 4 E4B",
  runtime: "ollama",
  role: "chat",
  roles: ["chat", "coding", "documentation"],
  store: "primary",
  ollamaModel: "gemma4:e4b",
  sizeGb: 9.6,
  priority: 1,
  expectedTps: 107,
  reason: "Mocked chat model for streaming placeholder tests.",
  bestUse: "First-token waiting state smoke tests.",
  envExample: "OLLAMA_MODEL=gemma4:e4b",
  installed: true,
  installable: true,
  storePath: "F:\\AI_Models\\Ollama"
};

const readyRuntime = {
  status: "ready",
  activeModelId: chatModel.id,
  activeModelName: chatModel.displayName,
  runtime: "ollama",
  endpoint: "http://127.0.0.1:11434",
  message: "Mock runtime ready",
  startedAt: new Date().toISOString(),
  logs: ["[mock] runtime ready"]
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
let releaseChat;
const chatGate = new Promise((resolve) => {
  releaseChat = resolve;
});

try {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        models: [chatModel],
        disk: { drive: "F:", freeGb: 160.3, lowSpace: false },
        gpu: { totalMb: 12288, usedMb: 1200, freeMb: 11088, utilization: 3 }
      })
    });
  });
  await page.route("**/api/runtime/status", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/home-server/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: "idle",
        message: "RCA/RAG backend is not running",
        chatModel: "gemma4:12b-it-qat",
        embedModel: "embeddinggemma:latest",
        chatEndpoint: "http://127.0.0.1:11434",
        embedEndpoint: "http://127.0.0.1:11435",
        apiKeyRequired: false,
        logs: []
      })
    });
  });
  await page.route("**/api/install/jobs", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs: [] }) });
  });
  await page.route("**/api/runtime/switch", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/chat", async (route) => {
    await chatGate;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: 'event: token\ndata: {"text":"stream complete"}\n\n'
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });
  await composer.fill("스트리밍 대기 카드 보여줘");
  await composer.press("Enter");

  await page.waitForSelector('[data-testid="streaming-response-card"]', { timeout: 10_000 });
  const waitingState = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="streaming-response-card"]');
    const text = card?.textContent ?? "";
    const composerNode = document.querySelector('textarea[aria-label="Chat message"]');
    return {
      cardVisible: Boolean(card?.getClientRects().length),
      hasTitle: text.includes("Response stream"),
      hasModel: text.includes("Gemma 4 E4B"),
      hasStages: ["route", "warm", "decode"].every((stage) => text.includes(stage)),
      composerFocused: document.activeElement === composerNode,
      composerDisabled: composerNode?.hasAttribute("disabled") ?? true,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (!waitingState.cardVisible || !waitingState.hasTitle || !waitingState.hasModel || !waitingState.hasStages) {
    throw new Error(`Streaming placeholder did not render useful status: ${JSON.stringify(waitingState)}`);
  }
  if (!waitingState.composerFocused) throw new Error("Composer did not stay focused while waiting for the first token");
  if (waitingState.composerDisabled) throw new Error("Composer was disabled while waiting for the first token");
  if (waitingState.horizontalOverflow) throw new Error("Streaming placeholder introduced horizontal overflow");

  await page.screenshot({ path: path.join(outDir, "streaming-placeholder-mock.png"), fullPage: true });
  releaseChat();

  await page.waitForFunction(() => document.body.textContent?.includes("stream complete"), undefined, { timeout: 10_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="streaming-response-card"]'), undefined, { timeout: 10_000 });
  const completedState = await page.evaluate(() => ({
    finalTextVisible: document.body.textContent?.includes("stream complete") ?? false,
    placeholderGone: !document.querySelector('[data-testid="streaming-response-card"]'),
    composerFocused: document.activeElement === document.querySelector('textarea[aria-label="Chat message"]'),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
  }));

  if (!completedState.finalTextVisible || !completedState.placeholderGone) {
    throw new Error(`Streaming placeholder did not hand off to final response: ${JSON.stringify(completedState)}`);
  }
  if (!completedState.composerFocused) throw new Error("Composer did not regain focus after streaming completion");
  if (completedState.horizontalOverflow) throw new Error("Completed streaming response introduced horizontal overflow");

  console.log(JSON.stringify({ ok: true, waitingState, completedState }, null, 2));
} finally {
  await browser.close();
}
