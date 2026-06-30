import path from "node:path";
import { chromium } from "playwright";

const appUrl = process.env.LOCAL_LLM_LAB_URL ?? "http://127.0.0.1:5173/";
const imagePath =
  process.env.LOCAL_LLM_LAB_TEST_IMAGE ??
  "C:\\Users\\soulu\\AppData\\Local\\Temp\\codex-clipboard-47c465ae-b62a-4f83-80ae-17cff5e8e736.png";

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
  reason: "Mocked vision model for attachment UI smoke tests.",
  bestUse: "이미지 첨부, 스크린샷 분석, 문서화 테스트에 적합.",
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

const homeServerIdle = {
  status: "idle",
  message: "RCA/RAG backend is not running",
  chatModel: "gemma4:12b-it-qat",
  embedModel: "embeddinggemma:latest",
  chatEndpoint: "http://127.0.0.1:11434",
  embedEndpoint: "http://127.0.0.1:11435",
  apiKeyRequired: false,
  logs: []
};

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let chatPayload;

try {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        models: [visionModel],
        disk: { drive: "F:", freeGb: 160.3, lowSpace: false },
        gpu: { totalMb: 12288, usedMb: 1400, freeMb: 10888, utilization: 5 }
      })
    });
  });
  await page.route("**/api/runtime/status", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(readyRuntime) });
  });
  await page.route("**/api/home-server/status", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(homeServerIdle) });
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
      body: `${[
        'event: token\ndata: {"text":"| 항목 | 내용 |\\n"}',
        'event: token\ndata: {"text":"| --- | --- |\\n"}',
        'event: token\ndata: {"text":"| 제목 | 스윗스팟 모델 런처와 테스트 챗봇 |\\n"}',
        'event: token\ndata: {"text":"| 오류 | PayloadTooLargeError request entity too large |"}'
      ].join("\n\n")}\n\n`
    });
  });

  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  const composer = page.locator('textarea[aria-label="Chat message"]');
  await composer.waitFor({ timeout: 30_000 });

  await page.locator('input[accept="image/*"]').setInputFiles(path.resolve(imagePath));
  await page.waitForFunction(() => {
    const text = document.body.textContent ?? "";
    return text.includes(".png") || text.includes(".jpg") || text.includes(".jpeg") || text.includes("이미지 1개를 전송용으로 자동 압축했습니다");
  }, undefined, { timeout: 15_000 });

  await composer.fill("첨부된 스크린샷에서 보이는 제목과 오류 문구를 표로 정리해줘");
  const beforeSend = await composer.evaluate((element) => ({
    value: element.value,
    disabled: element.hasAttribute("disabled"),
    focused: document.activeElement === element,
    trayVisible: Boolean(document.querySelector('[data-testid="attachment-tray"]')),
    imagePreviewVisible: Boolean(document.querySelector('[data-testid="attachment-tray"] img'))
  }));
  if (beforeSend.disabled) throw new Error(`Composer disabled after attaching image: ${JSON.stringify(beforeSend)}`);
  if (!beforeSend.value.includes("표로 정리")) throw new Error(`Composer did not accept text: ${JSON.stringify(beforeSend)}`);
  if (!beforeSend.trayVisible || !beforeSend.imagePreviewVisible) throw new Error(`Attachment preview tray did not render image preview: ${JSON.stringify(beforeSend)}`);

  await composer.press("Enter");
  await page.waitForSelector(".markdown-message table", { timeout: 10_000 });

  const result = await page.evaluate(() => {
    const composer = document.querySelector('textarea[aria-label="Chat message"]');
    const table = document.querySelector(".markdown-message table");
    const lastAssistantText = document.querySelector(".markdown-message")?.textContent ?? "";
    return {
      focused: document.activeElement === composer,
      composerDisabled: composer?.hasAttribute("disabled") ?? true,
      tableRendered: Boolean(table),
      lastAssistantText
    };
  });

  if (!chatPayload?.messages?.at(-1)?.images?.length) throw new Error(`Image was not forwarded to /api/chat: ${JSON.stringify(chatPayload)}`);
  if (result.composerDisabled) throw new Error("Composer disabled after image send");
  if (!result.focused) throw new Error("Composer did not regain focus after image send");
  if (!result.tableRendered) throw new Error(`Markdown table did not render: ${JSON.stringify(result)}`);

  await page.screenshot({ path: path.resolve("test-artifacts", "attachment-flow-mock.png"), fullPage: true });
  console.log(JSON.stringify({ ok: true, imagePath, imageCount: chatPayload.messages.at(-1).images.length, result }, null, 2));
} finally {
  await browser.close();
}
