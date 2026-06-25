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
  reason: "Mocked chat model for error card tests.",
  bestUse: "Error rendering smoke tests.",
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

const rawHtmlError = `<!DOCTYPE html>
<html><head><title>Error</title></head><body>
<pre>PayloadTooLargeError: request entity too large<br>
&nbsp;&nbsp;at readStream (F:\\AI_Models\\llmfit\\SWEET12\\node_modules\\raw-body\\index.js:163:17)<br>
&nbsp;&nbsp;at jsonParser (F:\\AI_Models\\llmfit\\SWEET12\\node_modules\\body-parser\\lib\\types\\json.js:138:5)</pre>
</body></html>`;

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
  await page.route("**/api/runtime/switch", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/chat", async (route) => {
    await route.fulfill({
      status: 413,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: rawHtmlError
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });
  await composer.fill("이 요청은 실패 카드로 표시되어야 해");
  await composer.press("Enter");

  await page.waitForSelector('[data-testid="chat-error-card"]', { timeout: 10_000 });
  const result = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="chat-error-card"]');
    const text = card?.textContent ?? "";
    return {
      cardVisible: Boolean(card),
      hasFriendlyStatus: /Payload blocked|Request failed|input too large|runtime rejected/i.test(text),
      hidesHtml: !/<!DOCTYPE|<html|<pre>|<\/html>/i.test(text),
      hidesLocalStack: !/node_modules|raw-body|body-parser|F:\\AI_Models/i.test(text),
      composerFocused: document.activeElement === document.querySelector('textarea[aria-label="Chat message"]'),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (!result.cardVisible || !result.hasFriendlyStatus) throw new Error(`Error card did not render friendly status: ${JSON.stringify(result)}`);
  if (!result.hidesHtml || !result.hidesLocalStack) throw new Error(`Error card leaked raw failure details: ${JSON.stringify(result)}`);
  if (!result.composerFocused) throw new Error("Composer did not regain focus after failed chat response");
  if (result.horizontalOverflow) throw new Error("Error card introduced horizontal overflow");

  await page.screenshot({ path: "test-artifacts/chat-error-card-mock.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await browser.close();
}
