import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";
const outDir = path.resolve("test-artifacts");
const filePath = path.join(outDir, "text-attachment-smoke.txt");
const marker = "local-llm-lab text attachment smoke marker";

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(filePath, `${marker}\nsecond line: composer must remain editable after file attach\n`, "utf8");

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
  reason: "Mocked chat model for text attachment UI smoke tests.",
  bestUse: "텍스트 파일 첨부와 일반 채팅 테스트에 적합.",
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
let chatPayload;

try {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        models: [chatModel],
        disk: { drive: "F:", freeGb: 160.3, lowSpace: false },
        gpu: { totalMb: 12288, usedMb: 1400, freeMb: 10888, utilization: 5 }
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
    chatPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      body: `${[`event: token\ndata: ${JSON.stringify({ text: `확인한 marker: ${marker}` })}`].join("\n\n")}\n\n`
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });

  await page.locator('input[type="file"]').last().setInputFiles(filePath);
  await page.waitForFunction(() => (document.body.textContent ?? "").includes("text-attachment-smoke.txt"), undefined, { timeout: 15_000 });

  await composer.fill("첨부한 텍스트 파일의 marker 줄을 그대로 말해줘");
  const beforeSend = await composer.evaluate((element) => ({
    value: element.value,
    disabled: element.hasAttribute("disabled"),
    focused: document.activeElement === element
  }));
  if (beforeSend.disabled) throw new Error(`Composer disabled after text file attach: ${JSON.stringify(beforeSend)}`);
  if (!beforeSend.value.includes("marker")) throw new Error(`Composer did not accept text after file attach: ${JSON.stringify(beforeSend)}`);

  await composer.press("Enter");
  await page.waitForFunction(
    (expectedMarker) => [...document.querySelectorAll(".markdown-message")].some((message) => (message.textContent ?? "").includes(expectedMarker)),
    marker,
    { timeout: 10_000 }
  );

  const result = await page.evaluate((expectedMarker) => {
    const composer = document.querySelector('textarea[aria-label="Chat message"]');
    const assistantMessages = [...document.querySelectorAll(".markdown-message")];
    const lastAssistantText = (assistantMessages.at(-1)?.textContent ?? "").trim();
    return {
      focused: document.activeElement === composer,
      composerDisabled: composer?.hasAttribute("disabled") ?? true,
      lastAssistantText,
      markerReturned: lastAssistantText.includes(expectedMarker)
    };
  }, marker);

  const lastMessageContent = chatPayload?.messages?.at(-1)?.content ?? "";
  if (!lastMessageContent.includes(marker)) throw new Error(`Text attachment content was not forwarded to /api/chat: ${JSON.stringify(chatPayload)}`);
  if (result.composerDisabled) throw new Error("Composer disabled after text file send");
  if (!result.focused) throw new Error("Composer did not regain focus after text file send");
  if (!result.markerReturned) throw new Error(`Mock assistant response did not render marker: ${JSON.stringify(result, null, 2)}`);

  await page.screenshot({ path: path.resolve(outDir, "text-file-flow-mock.png"), fullPage: true });
  console.log(JSON.stringify({ ok: true, filePath, result }, null, 2));
} finally {
  await browser.close();
}
