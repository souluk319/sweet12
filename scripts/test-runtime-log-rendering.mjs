import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";

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
  reason: "Mocked model for runtime log rendering tests.",
  bestUse: "Runtime log rendering smoke tests.",
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
  logs: [
    "[오전 4:20:01] time=2026-06-25T04:20:01+09:00 level=INFO source=runtime.ts msg=\"loading model weights\"",
    "[오전 4:20:02] srv llama_server: model loaded",
    "[오전 4:20:03] level=WARNING source=healthcheck msg=\"slow first token\"",
    "[오전 4:20:04] level=ERROR source=runtime.ts msg=\"transient probe failed\"",
    "[오전 4:20:05] [mock] runtime ready"
  ]
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
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/install/jobs", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs: [] }) });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="runtime-event-stream"]', { timeout: 30_000 });

  const result = await page.evaluate(() => {
    const stream = document.querySelector('[data-testid="runtime-event-stream"]');
    const consoleShell = document.querySelector('[data-testid="runtime-log-console"]');
    const text = stream?.textContent ?? "";
    return {
      hasInfo: text.includes("info"),
      hasWarn: text.includes("warn"),
      hasErr: text.includes("err"),
      hasSource: text.includes("runtime.ts") || text.includes("healthcheck") || text.includes("mock"),
      hasMessage: text.includes("loading model weights") && text.includes("transient probe failed"),
      hasConsoleShell: Boolean(consoleShell?.getClientRects().length),
      eventRows: stream?.children.length ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (!result.hasInfo || !result.hasWarn || !result.hasErr || !result.hasSource || !result.hasMessage || !result.hasConsoleShell || result.eventRows < 5 || result.horizontalOverflow) {
    throw new Error(JSON.stringify(result, null, 2));
  }

  await page.screenshot({ path: "test-artifacts/runtime-log-rendering-mock.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await browser.close();
}
