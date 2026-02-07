type MutableRef<T> = { current: T };

type TelegramUpdateOrchestratorInput = {
  update: any;
  signalTelegramCommandsEnabled: boolean;
  signalTelegramBotToken: string;
  signalTelegramChatId: string;
  telegramUpdateIdRef: MutableRef<number>;
  telegramCommandInFlightRef: MutableRef<Set<number>>;
  processUpdate: (update: any) => Promise<void>;
};

export async function runTelegramUpdateOrchestratorRuntime(input: TelegramUpdateOrchestratorInput): Promise<void> {
  if (!input.signalTelegramCommandsEnabled) return;
  if (!input.signalTelegramBotToken || !input.signalTelegramChatId) return;

  const updateId = Number(input.update?.update_id);
  if (Number.isFinite(updateId)) {
    if (updateId <= input.telegramUpdateIdRef.current) return;
    if (input.telegramCommandInFlightRef.current.has(updateId)) return;
    input.telegramUpdateIdRef.current = updateId;
    input.telegramCommandInFlightRef.current.add(updateId);
  }

  try {
    await input.processUpdate(input.update);
  } finally {
    if (Number.isFinite(updateId)) {
      input.telegramCommandInFlightRef.current.delete(updateId);
    }
  }
}
