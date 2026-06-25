import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import { getDiskFreeGb, getGpuSnapshot, listModels } from "./registry.js";
import { getInstallJobs, getRuntimeState, installModel, runBench, stopRuntime, streamChat, switchRuntime } from "./runtime.js";

const app = express();
const port = Number(process.env.LOCAL_LLM_LAB_PORT ?? 8788);

app.use(cors({ origin: true }));
app.use(express.json({ limit: "64mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/models", async (_req, res) => {
  const [freeGb, gpu] = await Promise.all([getDiskFreeGb("F"), getGpuSnapshot()]);
  res.json({
    models: listModels(),
    disk: { drive: "F", freeGb, lowSpace: freeGb !== null && freeGb < 40 },
    gpu
  });
});

app.get("/api/runtime/status", (_req, res) => {
  res.json(getRuntimeState());
});

app.post("/api/runtime/switch", async (req, res) => {
  try {
    const modelId = String(req.body?.modelId ?? "");
    res.json(await switchRuntime(modelId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error), state: getRuntimeState() });
  }
});

app.post("/api/runtime/stop", async (_req, res) => {
  try {
    await stopRuntime();
    res.json(getRuntimeState());
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : String(error), state: getRuntimeState() });
  }
});

app.post("/api/models/:id/install", async (req, res) => {
  try {
    res.json(await installModel(req.params.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/install/jobs", (_req, res) => {
  res.json({ jobs: getInstallJobs() });
});

app.post("/api/chat", async (req, res) => {
  await streamChat(req.body, res);
});

app.post("/api/bench/run", async (req, res) => {
  try {
    const modelId = String(req.body?.modelId ?? "");
    res.json(await runBench(modelId));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : String(error), state: getRuntimeState() });
  }
});

app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const parsed = error as { message?: string; status?: number; type?: string };
  if (parsed.status === 413 || parsed.type === "entity.too.large") {
    res.status(413).json({
      error: "첨부 이미지/요청 본문이 너무 큽니다. 이미지는 전송 전에 자동 압축되며, 그래도 실패하면 더 작은 이미지로 다시 시도하세요."
    });
    return;
  }
  res.status(parsed.status && parsed.status >= 400 ? parsed.status : 500).json({
    error: parsed.message ?? "Unexpected server error"
  });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`SWEET12 server listening on http://127.0.0.1:${port}`);
});
