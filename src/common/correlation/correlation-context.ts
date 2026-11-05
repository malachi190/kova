import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

interface CorrelationStore {
  correlationId: string;
}

const correlationStorage = new AsyncLocalStorage<CorrelationStore>();
const processCorrelationId = randomUUID();

export function runWithCorrelationId<T>(
  correlationId: string,
  callback: () => T,
): T {
  return correlationStorage.run({ correlationId }, callback);
}

export function getCorrelationId(): string {
  return correlationStorage.getStore()?.correlationId ?? processCorrelationId;
}
