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
  reason: "Mocked chat model for markdown rendering tests.",
  bestUse: "Markdown rendering smoke tests.",
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
let clipboardValue = "";

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
      body: `${[
        'event: token\ndata: {"text":"## 결과\\n"}',
        'event: token\ndata: {"text":"| 항목 | 값 |\\n| --- | --- |\\n| 상태 | ready |\\n\\n"}',
        'event: token\ndata: {"text":"```ts\\nconst status = \\"ready\\";\\nconsole.log(status);\\n```"}'
      ].join("\n\n")}\n\n`
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
  await composer.fill("마크다운 표와 코드 블록으로 답해줘");
  await composer.press("Enter");

  await page.waitForSelector(".markdown-message table", { timeout: 10_000 });
  await page.waitForSelector(".markdown-code-block", { timeout: 10_000 });
  await page.locator(".markdown-code-block button", { hasText: "Copy" }).click();
  clipboardValue = await page.evaluate(() => window.__copiedText ?? "");

  const result = await page.evaluate(() => ({
    heading: document.querySelector(".markdown-message h2")?.textContent?.trim() ?? "",
    tableRendered: Boolean(document.querySelector(".markdown-message table")),
    codeBlockRendered: Boolean(document.querySelector(".markdown-code-block")),
    languageLabel: document.querySelector(".markdown-code-block")?.textContent ?? "",
    assistantCardWidth: Math.round(document.querySelector('[data-message-role="assistant"]')?.getBoundingClientRect().width ?? 0),
    composerFocused: document.activeElement === document.querySelector('textarea[aria-label="Chat message"]'),
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
  }));

  if (result.heading !== "결과") throw new Error(`Heading did not render: ${JSON.stringify(result)}`);
  if (!result.tableRendered) throw new Error(`Table did not render: ${JSON.stringify(result)}`);
  if (!result.codeBlockRendered || !result.languageLabel.includes("ts")) throw new Error(`Code block chrome did not render: ${JSON.stringify(result)}`);
  if (result.assistantCardWidth < 520) throw new Error(`Assistant response card is too narrow: ${JSON.stringify(result)}`);
  if (!clipboardValue.includes('const status = "ready";')) throw new Error(`Code copy failed: ${clipboardValue}`);
  if (!result.composerFocused) throw new Error("Composer did not regain focus after markdown response");
  if (result.horizontalOverflow) throw new Error("Markdown rendering introduced horizontal overflow");

  await page.screenshot({ path: "test-artifacts/markdown-rendering-mock.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, result, copiedLength: clipboardValue.length }, null, 2));
} finally {
  await browser.close();
}
