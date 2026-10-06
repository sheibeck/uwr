import { describe, expect, it } from 'vitest';
import { QUEUE_MAX, createNarrativeQueue } from './narrativeQueue';
import type { QueuedLine } from './narrativeQueue';

function line(n: number): QueuedLine {
  return { text: `line ${n}`, mode: 'narrative', echoKey: `local:${n}` };
}

describe('createNarrativeQueue', () => {
  it('holds at most three lines', () => {
    expect(QUEUE_MAX).toBe(3);
    const q = createNarrativeQueue();
    expect(q.enqueue(line(1))).toBe(true);
    expect(q.enqueue(line(2))).toBe(true);
    expect(q.enqueue(line(3))).toBe(true);
    expect(q.enqueue(line(4))).toBe(false);
    expect(q.items.value.map((l) => l.echoKey)).toEqual(['local:1', 'local:2', 'local:3']);
  });

  it('mustQueue is false when empty and idle, true for gate, in flight or waiting lines', () => {
    const q = createNarrativeQueue();
    expect(q.mustQueue(false)).toBe(false);
    expect(q.mustQueue(true)).toBe(true);
    q.beginDirect();
    expect(q.mustQueue(false)).toBe(true);
    q.settle();
    expect(q.mustQueue(false)).toBe(false);
    q.enqueue(line(1));
    expect(q.mustQueue(false)).toBe(true);
  });

  it('takeNext waits for the gate and for the in-flight send', () => {
    const q = createNarrativeQueue();
    q.enqueue(line(1));
    q.enqueue(line(2));
    expect(q.takeNext(true)).toBeNull();
    expect(q.takeNext(false)?.echoKey).toBe('local:1');
    expect(q.inFlight.value).toBe(true);
    expect(q.takeNext(false)).toBeNull();
    q.settle();
    expect(q.inFlight.value).toBe(false);
    expect(q.takeNext(false)?.echoKey).toBe('local:2');
    q.settle();
    expect(q.takeNext(false)).toBeNull();
  });

  it('releases lines in order, one at a time', () => {
    const q = createNarrativeQueue();
    q.enqueue(line(1));
    q.enqueue(line(2));
    q.enqueue(line(3));
    const order: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const next = q.takeNext(false);
      expect(next).not.toBeNull();
      order.push(next!.echoKey);
      expect(q.takeNext(false)).toBeNull();
      q.settle();
    }
    expect(order).toEqual(['local:1', 'local:2', 'local:3']);
  });

  it('a direct send in flight forces later lines to queue', () => {
    const q = createNarrativeQueue();
    q.beginDirect();
    expect(q.inFlight.value).toBe(true);
    expect(q.mustQueue(false)).toBe(true);
    q.enqueue(line(1));
    expect(q.takeNext(false)).toBeNull();
    q.settle();
    expect(q.takeNext(false)?.echoKey).toBe('local:1');
  });

  it('drop returns every queued line in order and clears the state', () => {
    const q = createNarrativeQueue();
    q.beginDirect();
    q.enqueue(line(1));
    q.enqueue(line(2));
    const dropped = q.drop();
    expect(dropped.map((l) => l.echoKey)).toEqual(['local:1', 'local:2']);
    expect(q.items.value).toEqual([]);
    expect(q.inFlight.value).toBe(false);
    expect(q.drop()).toEqual([]);
  });

  it('honors a custom maximum', () => {
    const q = createNarrativeQueue(1);
    expect(q.enqueue(line(1))).toBe(true);
    expect(q.enqueue(line(2))).toBe(false);
  });
});
