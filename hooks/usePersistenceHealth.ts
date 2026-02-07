import { useEffect, useState } from "react";
import {
  getPersistenceHealthSnapshot,
  onPersistenceHealthChange,
  shouldUseLocalFallback,
  type PersistenceHealthSnapshot
} from "../services/persistenceHealth";

export const usePersistenceHealth = (domain: string) => {
  const [snapshot, setSnapshot] = useState<PersistenceHealthSnapshot>(() => getPersistenceHealthSnapshot());

  useEffect(() => {
    return onPersistenceHealthChange((next) => setSnapshot(next));
  }, []);

  const degraded = shouldUseLocalFallback(domain);
  return { snapshot, degraded };
};

