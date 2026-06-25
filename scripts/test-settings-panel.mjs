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
  reason: "Mocked chat model for settings panel tests.",
  bestUse: "Settings deck smoke tests.",
  envExample: "OLLAMA_MODEL=gemma4:e4b",
  installed: true,
  installable: true,
  storePath: "F:\\AI_Models\\Ollama"
};

const idleRuntime = {
  status: "idle",
  activeModelId: null,
  activeModelName: null,
  runtime: null,
  endpoint: null,
  message: "No model loaded - local LLM runtimes unloaded",
  logs: ["[mock] runtime idle"]
};

const viewports = [
  { name: "settings-laptop-1280", width: 1280, height: 800, maxDeckHeight: 130 },
  { name: "settings-mobile-390", width: 390, height: 844, maxDeckHeight: 250 }
];

const browser = await chromium.launch({ headless: true });

try {
  const results = [];
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.width < 640 });
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
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(idleRuntime) });
    });
    await page.route("**/api/install/jobs", async (route) => {
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs: [] }) });
    });
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('textarea[aria-label="Chat message"]', { timeout: 30_000 });
    await page.locator('button[aria-label="Prompt and generation settings"]').click();
    await page.waitForSelector('[data-testid="settings-deck"]', { timeout: 10_000 });

    const state = await page.evaluate(() => {
      const deck = document.querySelector('[data-testid="settings-deck"]');
      const composer = document.querySelector('[data-testid="composer-shell"]');
      const deckRect = deck?.getBoundingClientRect();
      const composerRect = composer?.getBoundingClientRect();
      return {
        deckHeight: deckRect?.height ?? 0,
        deckVisible: Boolean(deckRect && deckRect.width > 0 && deckRect.height > 0),
        composerVisible: Boolean(composerRect && composerRect.top >= 0 && composerRect.bottom <= window.innerHeight + 2),
        hasSystemPrompt: deck?.textContent?.includes("System prompt") ?? false,
        hasTemperature: deck?.textContent?.includes("Temperature") ?? false,
        hasMaxTokens: deck?.textContent?.includes("Max tokens") ?? false,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
      };
    });

    if (!state.deckVisible || !state.hasSystemPrompt || !state.hasTemperature || !state.hasMaxTokens) {
      throw new Error(`Settings deck did not render controls for ${viewport.name}: ${JSON.stringify(state)}`);
    }
    if (state.deckHeight > viewport.maxDeckHeight) {
      throw new Error(`Settings deck too tall for ${viewport.name}: ${JSON.stringify(state)}`);
    }
    if (!state.composerVisible) throw new Error(`Composer hidden by settings deck for ${viewport.name}: ${JSON.stringify(state)}`);
    if (state.horizontalOverflow) throw new Error(`Settings deck introduced horizontal overflow for ${viewport.name}`);

    await page.screenshot({ path: path.join(outDir, `${viewport.name}.png`), fullPage: true });
    results.push({ viewport: viewport.name, state });
    await page.close();
  }

  console.log(JSON.stringify({ ok: true, results }, null, 2));
} finally {
  await browser.close();
}
