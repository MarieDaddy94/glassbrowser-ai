self.onmessage = (evt: MessageEvent) => {
  const envelope = evt?.data || {};
  const id = String(envelope?.id || "");
  const type = String(envelope?.type || "");
  try {
    if (type === "frameGapAnalysis") {
      const payload = envelope?.payload || {};
      const frames = Array.isArray(payload?.frames) ? payload.frames : [];
      const timeframes = Array.isArray(payload?.timeframes) ? payload.timeframes : [];
      const minBarsByTimeframe = payload?.minBarsByTimeframe && typeof payload.minBarsByTimeframe === "object"
        ? payload.minBarsByTimeframe
        : {};
      const normalize = (value: unknown) => String(value || "").trim().toLowerCase();
      const missing: string[] = [];
      const short: Array<{ tf: string; barsCount: number; minBars: number }> = [];
      for (const timeframe of timeframes) {
        const tf = normalize(timeframe);
        if (!tf) continue;
        const frame = frames.find((entry: any) => normalize(entry?.tf || "") === tf);
        if (!frame) {
          missing.push(tf);
          continue;
        }
        const minBars = Number(minBarsByTimeframe?.[tf] || 1);
        const barsCount = Number(frame?.barsCount || 0);
        if (barsCount < minBars) {
          short.push({ tf, barsCount, minBars });
        }
      }
      (self as any).postMessage({
        id,
        ok: true,
        data: {
          missing,
          short,
          ready: missing.length === 0 && short.length === 0
        }
      });
      return;
    }
    (self as any).postMessage({ id, ok: false, error: `Unsupported worker task: ${type}` });
  } catch (err: any) {
    (self as any).postMessage({
      id,
      ok: false,
      error: err?.message ? String(err.message) : "signalAnalysis worker failed"
    });
  }
};

export {};
