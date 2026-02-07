export type WorkerTaskEnvelope<TPayload = any> = {
  id: string;
  type: string;
  payload: TPayload;
  timeoutMs?: number;
};

export type WorkerTaskResult<TResult = any> = {
  ok: boolean;
  data?: TResult;
  error?: string;
};

type PendingTask = {
  resolve: (value: WorkerTaskResult<any>) => void;
  timeout: number | null;
};

type RouterStats = {
  pending: number;
  completed: number;
  timedOut: number;
  failed: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;

export class WorkerTaskRouter {
  private readonly pending = new Map<string, PendingTask>();
  private completed = 0;
  private timedOut = 0;
  private failed = 0;

  dispatch<TPayload, TResult>(
    worker: Worker,
    envelope: WorkerTaskEnvelope<TPayload>
  ): Promise<WorkerTaskResult<TResult>> {
    const id = String(envelope.id || "").trim();
    if (!id) {
      return Promise.resolve({ ok: false, error: "workerTaskRouter: envelope.id is required" });
    }
    if (this.pending.has(id)) {
      return Promise.resolve({ ok: false, error: `workerTaskRouter: duplicate task id ${id}` });
    }

    return new Promise((resolve) => {
      const timeoutMs = Number.isFinite(Number(envelope.timeoutMs))
        ? Math.max(250, Number(envelope.timeoutMs))
        : DEFAULT_TIMEOUT_MS;
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        this.timedOut += 1;
        resolve({ ok: false, error: `worker task timeout (${id})` });
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          if (timeout != null) window.clearTimeout(timeout);
          this.pending.delete(id);
          if (!value.ok) this.failed += 1;
          this.completed += 1;
          resolve(value);
        },
        timeout
      });

      worker.postMessage({
        id,
        type: envelope.type,
        payload: envelope.payload
      });
    });
  }

  handleWorkerMessage(message: any) {
    const id = String(message?.id || "").trim();
    if (!id) return false;
    const pending = this.pending.get(id);
    if (!pending) return false;
    pending.resolve({
      ok: message?.ok !== false,
      data: message?.data,
      error: message?.error ? String(message.error) : undefined
    });
    return true;
  }

  cancelAll(reason = "worker task canceled") {
    for (const [id, pending] of this.pending.entries()) {
      if (pending.timeout != null) window.clearTimeout(pending.timeout);
      pending.resolve({ ok: false, error: `${reason}: ${id}` });
      this.pending.delete(id);
    }
  }

  getStats(): RouterStats {
    return {
      pending: this.pending.size,
      completed: this.completed,
      timedOut: this.timedOut,
      failed: this.failed
    };
  }
}

