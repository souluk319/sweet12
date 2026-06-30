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
  reason: "Mocked chat model for mobile message action tests.",
  bestUse: "Mobile chat action smoke tests.",
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });

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
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: 'event: token\ndata: {"text":"mobile action ok"}\n\n'
    });
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (value) => {
          window.__copiedText = value;
        }
      },
      configurable: true
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });
  await composer.fill("모바일 액션 버튼 테스트");
  await composer.press("Enter");
  await page.waitForFunction(() => document.body.textContent?.includes("mobile action ok"), undefined, { timeout: 10_000 });

  const state = await page.evaluate(() => {
    const bars = [...document.querySelectorAll('[data-testid="message-action-bar"]')].map((bar) => {
      const rect = bar.getBoundingClientRect();
      const style = window.getComputedStyle(bar);
      return {
        text: bar.textContent ?? "",
        visible: rect.width > 0 && rect.height > 0 && Number(style.opacity) > 0.9,
        top: rect.top
      };
    });
    return {
      actionBars: bars,
      copyButtons: document.querySelectorAll('[data-testid="message-copy-action"]').length,
      draftButtons: document.querySelectorAll('[data-testid="message-draft-action"]').length,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (state.actionBars.length < 2 || !state.actionBars.every((bar) => bar.visible)) {
    throw new Error(`Mobile message actions are not persistently visible: ${JSON.stringify(state)}`);
  }
  if (state.copyButtons < 2 || state.draftButtons < 1) {
    throw new Error(`Mobile message actions missing buttons: ${JSON.stringify(state)}`);
  }
  if (state.horizontalOverflow) throw new Error("Mobile message actions introduced horizontal overflow");

  await page.locator('[data-testid="message-draft-action"]').first().click();
  await page.waitForFunction(() => document.querySelector('textarea[aria-label="Chat message"]')?.value.includes("모바일 액션 버튼 테스트"), undefined, { timeout: 5_000 });
  await page.locator('[data-testid="message-copy-action"]').last().click();
  const copiedText = await page.evaluate(() => window.__copiedText ?? "");
  if (!copiedText.includes("mobile action ok")) throw new Error(`Copy action did not copy assistant text: ${copiedText}`);

  await page.screenshot({ path: path.join(outDir, "mobile-message-actions-mock.png"), fullPage: true });
  console.log(JSON.stringify({ ok: true, state, copiedLength: copiedText.length }, null, 2));
} finally {
  await browser.close();
}
