import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";

const visionModel = {
  id: "qwen25vl-7b",
  displayName: "Qwen2.5-VL 7B",
  runtime: "ollama",
  role: "vision",
  roles: ["vision", "chat", "documentation"],
  store: "primary",
  ollamaModel: "qwen2.5vl:7b",
  sizeGb: 6.1,
  priority: 1,
  expectedTps: 56,
  reason: "Mocked vision model for drag-drop UI tests.",
  bestUse: "이미지 첨부와 드래그 앤 드롭 테스트에 적합.",
  envExample: "OLLAMA_MODEL=qwen2.5vl:7b",
  installed: true,
  installable: true,
  storePath: "F:\\AI_Models\\Ollama"
};

const readyRuntime = {
  status: "ready",
  activeModelId: visionModel.id,
  activeModelName: visionModel.displayName,
  runtime: "ollama",
  endpoint: "http://127.0.0.1:11434",
  message: "Mock runtime ready",
  startedAt: new Date().toISOString(),
  logs: ["[mock] runtime ready"]
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        models: [visionModel],
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

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="chat-panel"] textarea', { timeout: 30_000 });

  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="chat-panel"]');
    if (!panel) throw new Error("chat panel missing");
    const file = new File(["drop overlay smoke"], "drop-overlay-smoke.txt", { type: "text/plain" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    panel.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await page.waitForSelector('[data-testid="drop-overlay"]', { timeout: 10_000 });
  const overlayText = await page.locator('[data-testid="drop-overlay"]').textContent();
  if (!overlayText?.includes("이미지와 파일")) throw new Error(`Unexpected drop overlay text: ${overlayText}`);
  await page.screenshot({ path: "test-artifacts/drop-overlay-active-mock.png", fullPage: true });

  await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="chat-panel"]');
    if (!panel) throw new Error("chat panel missing");
    const file = new File(["drop overlay smoke"], "drop-overlay-smoke.txt", { type: "text/plain" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    panel.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await page.waitForFunction(() => !document.querySelector('[data-testid="drop-overlay"]'), undefined, { timeout: 10_000 });
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("drop-overlay-smoke.txt"), undefined, { timeout: 10_000 });

  const result = await page.evaluate(() => {
    const composer = document.querySelector('textarea[aria-label="Chat message"]');
    return {
      composerFocused: document.activeElement === composer,
      composerDisabled: composer?.hasAttribute("disabled") ?? true,
      attachmentVisible: (document.body.textContent ?? "").includes("drop-overlay-smoke.txt"),
      trayVisible: Boolean(document.querySelector('[data-testid="attachment-tray"]')?.textContent?.includes("drop-overlay-smoke.txt")),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  if (!result.composerFocused || result.composerDisabled || !result.attachmentVisible || !result.trayVisible || result.horizontalOverflow) {
    throw new Error(JSON.stringify(result, null, 2));
  }

  await page.screenshot({ path: "test-artifacts/drop-overlay-after-drop-mock.png", fullPage: true });
  console.log(JSON.stringify({ ok: true, result }, null, 2));
} finally {
  await browser.close();
}
