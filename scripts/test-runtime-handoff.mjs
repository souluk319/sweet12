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
  reason: "Mocked chat model for runtime handoff tests.",
  bestUse: "Runtime transition smoke tests.",
  envExample: "OLLAMA_MODEL=gemma4:e4b",
  installed: true,
  installable: true,
  storePath: "F:\\AI_Models\\Ollama"
};

const warmingRuntime = {
  status: "warming",
  activeModelId: chatModel.id,
  activeModelName: chatModel.displayName,
  runtime: "ollama",
  endpoint: "http://127.0.0.1:11434",
  message: "Loading weights and checking the local endpoint",
  startedAt: new Date().toISOString(),
  logs: ["[mock] warming runtime"]
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(warmingRuntime) });
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

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="runtime-handoff-card"]', { timeout: 30_000 });

  const result = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="runtime-handoff-card"]');
    const steps = document.querySelector('[data-testid="runtime-handoff-steps"]');
    const text = card?.textContent ?? "";
    return {
      visible: Boolean(card?.getClientRects().length),
      hasTitle: text.includes("Runtime handoff"),
      hasModel: text.includes("Gemma 4 E4B"),
      hasState: text.includes("Loading weights"),
      hasSteps: ["release", "load", "health", "chat"].every((step) => steps?.textContent?.includes(step)),
      stepCount: steps?.children.length ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (!result.visible || !result.hasTitle || !result.hasModel || !result.hasState || !result.hasSteps || result.stepCount !== 4 || result.horizontalOverflow) {
    throw new Error(`Runtime handoff card failed: ${JSON.stringify(result, null, 2)}`);
  }

  await page.screenshot({ path: path.join(outDir, "runtime-handoff-warming-mock.png"), fullPage: true });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await browser.close();
}
