// FIFO queue for narrative sends typed while the Keeper is working (CON-06).
//
// At most QUEUE_MAX lines wait. A line is released one at a time, only when the gate is clear and
// no send is in flight. A line typed behind a non-empty queue or an in-flight send keeps its
// order. drop() returns every queued line so the caller can announce them: nothing is lost
// silently (T-47-11).
//
// The controller (47-09) watches `items` and `inFlight`; both are Vue refs.

import { ref, shallowRef } from 'vue';
import type { Ref, ShallowRef } from 'vue';

export const QUEUE_MAX = 3;

export interface QueuedLine {
  text: string;
  mode: 'narrative' | 'intent';
  /** Key of the local echo entry showing this line with its Queued suffix. */
  echoKey: string;
}

export interface NarrativeQueue {
  readonly items: Readonly<ShallowRef<readonly QueuedLine[]>>;
  readonly inFlight: Readonly<Ref<boolean>>;
  /** Gate active, a send in flight, or lines already waiting. */
  mustQueue(gateActive: boolean): boolean;
  /** False when the queue is full. */
  enqueue(line: QueuedLine): boolean;
  /** The head when the gate is clear and nothing is in flight; marks the send in flight. */
  takeNext(gateActive: boolean): QueuedLine | null;
  /** A direct (unqueued) narrative send is in flight. */
  beginDirect(): void;
  /** The in-flight send finished, resolved or rejected. */
  settle(): void;
  /** Empty the queue, clear inFlight, return the dropped lines in order. */
  drop(): QueuedLine[];
}

export function createNarrativeQueue(max: number = QUEUE_MAX): NarrativeQueue {
  const items = shallowRef<readonly QueuedLine[]>([]);
  const inFlight = ref(false);

  return {
    items,
    inFlight,
    mustQueue(gateActive) {
      return gateActive || inFlight.value || items.value.length > 0;
    },
    enqueue(line) {
      if (items.value.length >= max) return false;
      items.value = [...items.value, line];
      return true;
    },
    takeNext(gateActive) {
      if (gateActive || inFlight.value || items.value.length === 0) return null;
      const [head, ...rest] = items.value;
      items.value = rest;
      inFlight.value = true;
      return head;
    },
    beginDirect() {
      inFlight.value = true;
    },
    settle() {
      inFlight.value = false;
    },
    drop() {
      const dropped = [...items.value];
      items.value = [];
      inFlight.value = false;
      return dropped;
    },
  };
}
