import { WorkerTaskRouter } from "./workerTaskRouter";
import { runWorkerTaskWithFallback } from "./workerFallbackPolicy";

type FrameSummary = {
  tf?: string;
  barsCount?: number;
};

type FrameGapInput = {
  frames: FrameSummary[] | null | undefined;
  timeframes: string[];
  minBarsByTimeframe: Record<string, number>;
  timeoutMs?: number;
};

export type FrameGapResult = {
  missing: string[];
  short: Array<{ tf: string; barsCount: number; minBars: number }>;
};

const router = new WorkerTaskRouter();
let workerRef: Worker | null = null;
let listenerBound = false;
let workerDisabled = false;

const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

const computeFrameGapsFallback = (input: FrameGapInput): FrameGapResult => {
  const list = Array.isArray(input.frames) ? input.frames : [];
  const missing: string[] = [];
  const short: Array<{ tf: string; barsCount: number; minBars: number }> = [];
  for (const timeframe of input.timeframes || []) {
    const key = normalize(timeframe);
    if (!key) continue;
    const frame = list.find((entry) => normalize(entry?.tf || "") === key);
    if (!frame) {
      missing.push(key);
      continue;
    }
    const minBars = Number(input.minBarsByTimeframe?.[key] || 1);
    const barsCount = Number(frame?.barsCount || 0);
    if (barsCount < minBars) {
      short.push({ tf: key, barsCount, minBars });
    }
  }
  return { missing, short };
};

const ensureWorker = () => {
  if (workerDisabled) return null;
  if (!workerRef) {
    try {
      workerRef = new Worker(new URL("../workers/signalAnalysis.worker.ts", import.meta.url), { type: "module" });
      listenerBound = false;
    } catch {
      workerDisabled = true;
      workerRef = null;
      return null;
    }
  }
  if (workerRef && !listenerBound) {
    workerRef.addEventListener("message", (event) => {
      router.handleWorkerMessage(event.data);
    });
    workerRef.addEventListener("error", () => {
      workerDisabled = true;
      try {
        workerRef?.terminate();
      } catch {
        // ignore
      }
      workerRef = null;
    });
    listenerBound = true;
  }
  return workerRef;
};

export const computeFrameGapWorker = async (input: FrameGapInput): Promise<FrameGapResult> => {
  const normalizedTimeframes = (input.timeframes || []).map((item) => normalize(item)).filter(Boolean);
  const normalizedFrames = (Array.isArray(input.frames) ? input.frames : []).map((frame) => ({
    tf: normalize(frame?.tf || ""),
    barsCount: Number(frame?.barsCount || 0)
  }));
  const normalizedMinBars: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(input.minBarsByTimeframe || {})) {
    const key = normalize(rawKey);
    if (!key) continue;
    normalizedMinBars[key] = Number(rawValue || 0);
  }

  const taskId = `frame_gap_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const workerRes = await runWorkerTaskWithFallback<{
    frames: Array<{ tf: string; barsCount: number }>;
    timeframes: string[];
    minBarsByTimeframe: Record<string, number>;
  }, FrameGapResult>({
    domain: "signal_frame_gap",
    router,
    ensureWorker,
    envelope: {
      id: taskId,
      type: "frameGapAnalysis",
      timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Number(input.timeoutMs) : 2_000,
      payload: {
        frames: normalizedFrames,
        timeframes: normalizedTimeframes,
        minBarsByTimeframe: normalizedMinBars
      }
    },
    fallback: () => computeFrameGapsFallback(input)
  });
  const result = workerRes.data;
  if (!result) return computeFrameGapsFallback(input);
  const missing = Array.isArray(result.missing) ? result.missing.map((item) => normalize(item)).filter(Boolean) : null;
  const short = Array.isArray(result.short)
    ? result.short
        .map((entry) => ({
          tf: normalize(entry?.tf || ""),
          barsCount: Number(entry?.barsCount || 0),
          minBars: Number(entry?.minBars || 0)
        }))
        .filter((entry) => entry.tf)
    : null;
  if (!missing || !short) return computeFrameGapsFallback(input);
  return { missing, short };
};
