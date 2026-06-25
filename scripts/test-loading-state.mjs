import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";
const outDir = path.resolve("test-artifacts");

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

try {
  await page.route("**/api/models", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        models: [],
        disk: { drive: "F:", freeGb: 160.3, lowSpace: false },
        gpu: { usedMb: 0, totalMb: 12288, freeMb: 12288, utilization: 0 }
      })
    });
  });
  await page.route("**/api/runtime/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ status: "idle", message: "No model loaded", logs: [] })
    });
  });
  await page.route("**/api/install/jobs", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ jobs: [] }) });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("button, textarea, h1, h2, h3, p")].some(
        (element) => element.textContent?.includes("모델 저장소 스캔 중") && element.getClientRects().length > 0
      ),
    undefined,
    { timeout: 10_000 }
  );
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll("h1, h2, h3")].some(
        (element) => element.textContent?.includes("로컬 모델 스캔 중") && element.getClientRects().length > 0
      ),
    undefined,
    { timeout: 10_000 }
  );

  const state = await page.evaluate(() => {
    const text = document.body.textContent || "";
    const composer = [...document.querySelectorAll("textarea")].at(-1);
    return {
      hasScanning: text.includes("scanning"),
      hasLoadingTitle: text.includes("모델 저장소 스캔 중"),
      hasStageTitle: text.includes("로컬 모델 스캔 중"),
      hasPrematureMissing: text.includes("missing"),
      composerDisabled: composer?.hasAttribute("disabled") ?? true,
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 2
    };
  });

  await page.screenshot({ path: path.join(outDir, "dashboard-loading-scanning-1280x800.png"), fullPage: true });

  if (!state.hasScanning || !state.hasLoadingTitle || !state.hasStageTitle || state.hasPrematureMissing || !state.composerDisabled || state.horizontalOverflow) {
    throw new Error(JSON.stringify(state, null, 2));
  }

  console.log(JSON.stringify({ ok: true, state, screenshot: path.join(outDir, "dashboard-loading-scanning-1280x800.png") }, null, 2));
} finally {
  await browser.close();
}
