import { UploadedTextRef } from '../types';

type BuildPromptInput = {
  userInstruction: string;
  selectedFiles: Array<{ ref: UploadedTextRef; text: string }>;
  activeSymbol?: string | null;
  activeTimeframe?: string | null;
  mode?: 'create' | 'refine' | 'review';
  existingDraftJson?: string | null;
};

const jsonSchemaGuide = `Return ONLY JSON (no markdown fences) with this exact shape:
{
  "name": "string",
  "description": "string",
  "strategyText": "string",
  "watchSymbols": ["string"],
  "watchTimeframes": ["string"],
  "sessionWindows": ["Asia" | "London" | "NY" | "Custom"],
  "entryRules": ["string"],
  "exitRules": ["string"],
  "riskRules": ["string"],
  "confidencePolicy": {
    "minProbability": number,
    "maxProbability": number,
    "minRiskReward": number
  },
  "capabilities": {
    "trade": true|false,
    "tools": true|false,
    "broker": true|false,
    "autoExecute": true|false
  }
}`;

const sanitizeText = (text: string, maxChars: number) => {
  const normalized = String(text || '').replace(/\u0000/g, '').trim();
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}\n...[truncated]` : normalized;
};

export const buildAgentCreatorSystemPrompt = (input: BuildPromptInput) => {
  const symbol = String(input.activeSymbol || '').trim();
  const timeframe = String(input.activeTimeframe || '').trim();
  const scopeLine = symbol
    ? `Current active market context: symbol=${symbol}${timeframe ? ` timeframe=${timeframe}` : ''}.`
    : 'Current active market context is not set.';
  const mode = input.mode || 'create';

  return [
    'You are Agent Creator for GlassBrowser AI.',
    'Your only task is to build a structured trading agent profile from user intent and uploaded TXT strategy docs.',
    'Be conservative with permissions. Default to safe capabilities.',
    'Never enable broker/tools/autoExecute unless directly and explicitly requested.',
    'Use concise, deterministic rules. Avoid vague wording.',
    scopeLine,
    `Mode: ${mode}.`,
    jsonSchemaGuide
  ].join('\n');
};

export const buildAgentCreatorUserPrompt = (input: BuildPromptInput) => {
  const userInstruction = sanitizeText(input.userInstruction || '', 8_000);
  const fileSections = (input.selectedFiles || []).map(({ ref, text }, index) => {
    const body = sanitizeText(text, 16_000);
    return [
      `FILE ${index + 1}: ${ref.name} (${Math.round((ref.sizeBytes || 0) / 1024)}KB)`,
      body
    ].join('\n');
  });

  const baseParts = [
    'User instruction:',
    userInstruction || '(empty)',
    input.existingDraftJson ? `Existing draft JSON:\n${sanitizeText(input.existingDraftJson, 12_000)}` : '',
    fileSections.length > 0
      ? `Use these uploaded text files as source context:\n${fileSections.join('\n\n')}`
      : 'No uploaded files were provided.',
    'Output valid JSON only.'
  ].filter(Boolean);

  return baseParts.join('\n\n');
};

