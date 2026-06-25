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
  reason: "Mocked chat model for composer shortcut tests.",
  bestUse: "Composer keyboard smoke tests.",
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
const chatPayloads = [];

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
  await page.route("**/api/runtime/switch", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/chat", async (route) => {
    chatPayloads.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: 'event: token\ndata: {"text":"shortcut ok"}\n\n'
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });

  await composer.fill("첫 줄");
  await composer.press("Shift+Enter");
  const afterShiftEnter = await composer.inputValue();
  if (afterShiftEnter !== "첫 줄\n") throw new Error(`Shift+Enter did not insert a newline: ${JSON.stringify(afterShiftEnter)}`);
  if (chatPayloads.length !== 0) throw new Error(`Shift+Enter submitted unexpectedly: ${chatPayloads.length}`);

  await composer.fill("엔터로 바로 전송");
  await composer.press("Enter");
  await page.waitForFunction(() => document.body.textContent?.includes("shortcut ok"), undefined, { timeout: 10_000 });

  const result = await page.evaluate(() => ({
    composerValue: document.querySelector('textarea[aria-label="Chat message"]')?.value ?? "",
    composerFocused: document.activeElement === document.querySelector('textarea[aria-label="Chat message"]'),
    assistantText: document.body.textContent ?? "",
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
  }));

  if (chatPayloads.length !== 1) throw new Error(`Enter did not submit exactly once: ${chatPayloads.length}`);
  if (chatPayloads[0]?.messages?.at(-1)?.content !== "엔터로 바로 전송") throw new Error(`Submitted payload mismatch: ${JSON.stringify(chatPayloads[0])}`);
  if (result.composerValue !== "") throw new Error(`Composer did not clear after submit: ${JSON.stringify(result)}`);
  if (!result.composerFocused) throw new Error("Composer did not regain focus after Enter submit");
  if (!result.assistantText.includes("shortcut ok")) throw new Error(`Assistant response missing: ${JSON.stringify(result)}`);
  if (result.horizontalOverflow) throw new Error("Composer shortcut flow introduced horizontal overflow");

  await page.screenshot({ path: "test-artifacts/composer-shortcuts-mock.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, submitted: chatPayloads.length, result }, null, 2));
} finally {
  await browser.close();
}
