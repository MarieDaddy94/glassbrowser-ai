type BrokerRequestOptions = {
  brokerId?: string | null;
  symbol?: string | null;
  source?: string | null;
};

type BrokerRequestExecutor = (
  method: string,
  args?: any,
  opts?: BrokerRequestOptions
) => Promise<any>;

let executor: BrokerRequestExecutor | null = null;

export const registerBrokerRequestExecutor = (next: BrokerRequestExecutor | null) => {
  executor = typeof next === "function" ? next : null;
};

export const requestBrokerCoordinated = async (
  method: string,
  args?: any,
  opts?: BrokerRequestOptions
) => {
  if (!executor) {
    return { ok: false, error: "Broker request bridge unavailable." };
  }
  return executor(method, args, opts);
};

