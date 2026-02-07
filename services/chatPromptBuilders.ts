export type ChatWatchPromptMode = 'signals' | 'digest' | 'live';

export const buildChartWatchPrompt = (mode: ChatWatchPromptMode, lastSummary: string): string => {
  const summary = lastSummary ? lastSummary : 'None';
  if (mode === 'signals') {
    return `
CHART WATCH (SIGNALS MODE)
You are being shown fresh chart screenshots (images attached). If multiple frames are provided, use top-down alignment: H4/H1 for bias/levels, 15m for entry trigger.

LAST_CONTEXT (if any):
${summary}

RULES:
- If there is NO clear, high-conviction trade setup: reply with exactly: NO_UPDATE
- If there IS a clear setup:
  - Call proposeTrade with entry/SL/TP.
  - Reply with 1-3 short lines max (no long analysis).
- Do NOT ask the user questions.
- Never call updateRiskSettings in Chart Watch.
    `.trim();
  }

  if (mode === 'digest') {
    return `
CHART WATCH (DIGEST MODE)
You are being shown fresh chart screenshots (images attached). If multiple frames are provided, summarize top-down (H4/H1) then what matters next (15m).

LAST_UPDATE (if any):
${summary}

RULES:
- If nothing material has changed since LAST_UPDATE: reply with exactly: NO_UPDATE
- Otherwise, post a concise update (3-7 short lines max):
  - market structure/bias + key levels
  - what to watch next + invalidation
- Do NOT ask the user questions.
- Only call proposeTrade if you have a clear setup with entry/SL/TP.
- Never call updateRiskSettings in Chart Watch.
      `.trim();
  }

  return `
CHART WATCH (LIVE MODE)
You are being shown fresh chart screenshots (images attached). If multiple frames are provided, use top-down alignment: H4/H1 context + 15m updates.

LAST_UPDATE (if any):
${summary}

RULES:
- If nothing material has changed since LAST_UPDATE, reply with exactly: NO_UPDATE
- Otherwise, post a concise update (3-7 short lines max)
- Do NOT ask the user questions.
- Only call proposeTrade if you have a clear setup with entry/SL/TP.
- Never call updateRiskSettings in Chart Watch.
  `.trim();
};
