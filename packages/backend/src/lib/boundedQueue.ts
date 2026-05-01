/**
 * Single-consumer FIFO with a hard size cap.
 *
 * When the queue would exceed `max`, the oldest event is dropped and a
 * one-shot `overflowSentinel` is appended so the consumer learns it
 * fell behind and can refetch state. Subsequent overflows do not
 * duplicate the sentinel until the consumer drains.
 *
 * Used by the SSE handler to keep a slow client from holding unbounded
 * memory in the server.
 */
export interface BoundedQueue<T> {
  push(event: T): void;
  drain(): T[];
  size(): number;
}

export interface BoundedQueueOptions<T> {
  max: number;
  overflowSentinel: T;
}

export function createBoundedQueue<T>(
  opts: BoundedQueueOptions<T>,
): BoundedQueue<T> {
  const { max, overflowSentinel } = opts;
  const buffer: T[] = [];
  let overflowed = false;

  return {
    push(event: T) {
      if (buffer.length >= max) {
        buffer.shift();
        overflowed = true;
      }
      buffer.push(event);
    },
    drain() {
      const out = overflowed ? [...buffer, overflowSentinel] : buffer.slice();
      buffer.length = 0;
      overflowed = false;
      return out;
    },
    size() {
      return buffer.length + (overflowed ? 1 : 0);
    },
  };
}
