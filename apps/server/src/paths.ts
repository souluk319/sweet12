import path from "node:path";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export const labRoot = path.resolve(dirname, "../../..");
export const repoRoot = path.resolve(labRoot, "..");
export const registryPath = path.join(labRoot, "data", "model-registry.json");
export const benchResultsPath = path.join(labRoot, "data", "bench-results.json");
export const qwenRoot = "F:\\AI_Models\\Qwen";
export const qwenLogsPath = path.join(qwenRoot, "logs", "sweet12-vllm.log");
export const ollamaExe = "F:\\Apps\\Ollama\\cli\\ollama.exe";

export function windowsPathToWsl(input: string): string {
  const match = input.match(/^([A-Za-z]):\\(.*)$/);
  if (!match) return input.replaceAll("\\", "/");
  const drive = match[1].toLowerCase();
  const rest = match[2].replaceAll("\\", "/");
  return `/mnt/${drive}/${rest}`;
}
