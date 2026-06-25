import type { ModelView } from "../types";

export interface ModelScore {
  score: number;
  label: string;
  tone: "emerald" | "cyan" | "amber" | "slate";
  speedScore: number;
  footprintScore: number;
  readinessScore: number;
}

export function getModelScore(model: ModelView): ModelScore {
  const speed = model.bench?.avgTps ?? model.expectedTps ?? 0;
  const speedScore = clamp(Math.round((speed / 180) * 100));
  const footprintScore = model.sizeGb ? clamp(Math.round(110 - model.sizeGb * 6.5)) : 42;
  const readinessScore = model.installed ? 100 : model.installable ? 48 : 24;
  const priorityScore = clamp(model.priority * 8);
  const score = clamp(Math.round(speedScore * 0.34 + footprintScore * 0.24 + readinessScore * 0.3 + priorityScore * 0.12));
  const tone = score >= 82 ? "emerald" : score >= 66 ? "cyan" : score >= 48 ? "amber" : "slate";
  const label = score >= 82 ? "sweet spot" : score >= 66 ? "balanced" : score >= 48 ? "situational" : "manual";

  return { score, label, tone, speedScore, footprintScore, readinessScore };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
