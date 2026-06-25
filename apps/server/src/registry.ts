import fs from "node:fs";
import path from "node:path";
import { benchResultsPath, registryPath } from "./paths.js";
import type { BenchSummary, ModelProfile, ModelRegistry, ModelView } from "./types.js";
import { runCommand } from "./shell.js";

export function loadRegistry(): ModelRegistry {
  return JSON.parse(fs.readFileSync(registryPath, "utf8")) as ModelRegistry;
}

export function getModel(modelId: string): ModelProfile | undefined {
  return loadRegistry().models.find((model) => model.id === modelId);
}

export function getStorePath(model: ModelProfile): string | undefined {
  if (!model.store) return undefined;
  return loadRegistry().stores[model.store];
}

function manifestExists(model: ModelProfile): boolean {
  const storePath = getStorePath(model);
  if (!storePath || !model.manifestPath) return false;
  return fs.existsSync(path.join(storePath, "manifests", model.manifestPath));
}

function vllmModelExists(model: ModelProfile): boolean {
  return Boolean(model.modelDir && fs.existsSync(path.join(model.modelDir, "config.json")));
}

export function isInstalled(model: ModelProfile): boolean {
  if (model.runtime === "ollama") return manifestExists(model);
  if (model.runtime === "vllm") return vllmModelExists(model);
  return false;
}

export function loadBenchResults(): Record<string, BenchSummary> {
  if (!fs.existsSync(benchResultsPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(benchResultsPath, "utf8")) as Record<string, BenchSummary>;
  } catch {
    return {};
  }
}

export function saveBenchResult(modelId: string, summary: BenchSummary): void {
  const all = loadBenchResults();
  all[modelId] = summary;
  fs.writeFileSync(benchResultsPath, JSON.stringify(all, null, 2));
}

export function listModels(): ModelView[] {
  const registry = loadRegistry();
  const bench = loadBenchResults();
  return registry.models
    .map((model) => ({
      ...model,
      installed: isInstalled(model),
      installable: Boolean(model.remoteTag),
      storePath: model.store ? registry.stores[model.store] : undefined,
      bench: bench[model.id]
    }))
    .sort((a, b) => b.priority - a.priority || a.displayName.localeCompare(b.displayName));
}

export async function getDiskFreeGb(drive = "F"): Promise<number | null> {
  try {
    const result = await runCommand(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `[math]::Round((Get-PSDrive ${drive}).Free / 1GB, 1)`
      ],
      { timeoutMs: 5000 }
    );
    const parsed = Number.parseFloat(result.stdout.trim());
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function getGpuSnapshot(): Promise<{ usedMb?: number; freeMb?: number; totalMb?: number; utilization?: number }> {
  try {
    const result = await runCommand(
      "nvidia-smi",
      ["--query-gpu=memory.total,memory.used,memory.free,utilization.gpu", "--format=csv,noheader,nounits"],
      { timeoutMs: 5000 }
    );
    const [total, used, free, utilization] = result.stdout
      .trim()
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    return { totalMb: total, usedMb: used, freeMb: free, utilization };
  } catch {
    return {};
  }
}
