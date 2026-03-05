import React from 'react';

type UseMt5TelemetryPollingArgs = {
  mt5TelemetryEnabled: boolean;
  fetchMt5: (path: string, opts?: any) => Promise<any>;
  fetchMt5AccountSpec: () => Promise<any>;
  loadMt5TelemetryControllerModule: () => Promise<any>;
  runtimeScheduler: any;
  setMt5PositionsCount: (value: number | null) => void;
  setMt5OrdersCount: (value: number | null) => void;
  setMt5PositionsUpdatedAtMs: (value: number | null) => void;
  setMt5OrdersUpdatedAtMs: (value: number | null) => void;
  setMt5SnapshotError: (value: string | null) => void;
  setMt5AccountSpec: (value: any) => void;
};

export const useMt5TelemetryPolling = (args: UseMt5TelemetryPollingArgs) => {
  const {
    mt5TelemetryEnabled,
    fetchMt5,
    fetchMt5AccountSpec,
    loadMt5TelemetryControllerModule,
    runtimeScheduler,
    setMt5PositionsCount,
    setMt5OrdersCount,
    setMt5PositionsUpdatedAtMs,
    setMt5OrdersUpdatedAtMs,
    setMt5SnapshotError,
    setMt5AccountSpec
  } = args;

  const mt5TelemetryInFlightRef = React.useRef(false);
  const mt5TelemetryBackoffRef = React.useRef(0);

  React.useEffect(() => {
    if (!mt5TelemetryEnabled) {
      setMt5PositionsCount(null);
      setMt5OrdersCount(null);
      setMt5PositionsUpdatedAtMs(null);
      setMt5OrdersUpdatedAtMs(null);
      setMt5SnapshotError(null);
      return;
    }
    let canceled = false;
    let stop: (() => void) | null = null;

    const poll = async () => {
      if (canceled) return;
      const now = Date.now();
      const nextAllowed = mt5TelemetryBackoffRef.current || 0;
      if (nextAllowed && now < nextAllowed) {
        return Math.max(2000, nextAllowed - now);
      }
      if (mt5TelemetryInFlightRef.current) {
        return 2000;
      }
      mt5TelemetryInFlightRef.current = true;
      try {
        const [positionsRes, ordersRes, spec] = await Promise.all([
          fetchMt5('/positions'),
          fetchMt5('/orders'),
          fetchMt5AccountSpec()
        ]);
        if (canceled) return;
        let hadSuccess = false;
        if (positionsRes?.ok && Array.isArray(positionsRes.data?.positions)) {
          setMt5PositionsCount(positionsRes.data.positions.length);
          setMt5PositionsUpdatedAtMs(Date.now());
          hadSuccess = true;
        }
        if (ordersRes?.ok && Array.isArray(ordersRes.data?.orders)) {
          setMt5OrdersCount(ordersRes.data.orders.length);
          setMt5OrdersUpdatedAtMs(Date.now());
          hadSuccess = true;
        }
        if (spec) {
          setMt5AccountSpec(spec);
          hadSuccess = true;
        }
        if (hadSuccess) {
          setMt5SnapshotError(null);
        } else {
          const err = positionsRes?.error || ordersRes?.error || 'MT5 telemetry unavailable.';
          setMt5SnapshotError(String(err));
          mt5TelemetryBackoffRef.current = Date.now() + 30_000;
        }
      } catch (err: any) {
        if (canceled) return;
        setMt5SnapshotError(err?.message ? String(err.message) : 'MT5 telemetry unavailable.');
        mt5TelemetryBackoffRef.current = Date.now() + 30_000;
      } finally {
        mt5TelemetryInFlightRef.current = false;
      }
      return 15_000;
    };
    void loadMt5TelemetryControllerModule().then((mod) => {
      if (canceled) return;
      const controller = mod.createMt5TelemetryController({
        defaultDelayMs: 15_000,
        schedulerIntervalMs: 1_000,
        tick: poll
      });
      controller.start({ scheduler: runtimeScheduler });
      stop = () => controller.stop();
    }).catch(() => {});
    return () => {
      canceled = true;
      stop?.();
    };
  }, [
    fetchMt5,
    fetchMt5AccountSpec,
    loadMt5TelemetryControllerModule,
    mt5TelemetryEnabled,
    runtimeScheduler,
    setMt5AccountSpec,
    setMt5OrdersCount,
    setMt5OrdersUpdatedAtMs,
    setMt5PositionsCount,
    setMt5PositionsUpdatedAtMs,
    setMt5SnapshotError
  ]);
};
