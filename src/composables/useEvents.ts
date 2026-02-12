import { computed, ref, watch, type Ref } from 'vue';
import type {
  EventWorldRow,
  EventLocationRow,
  EventPrivateRow,
  EventGroupRow,
} from '../module_bindings';

export type EventItem = {
  id: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
  kind: string;
  message: string;
  scope: string;
};

type UseEventsArgs = {
  worldEvents: Ref<EventWorldRow[]>;
  locationEvents: Ref<EventLocationRow[]>;
  privateEvents: Ref<EventPrivateRow[]>;
  groupEvents: Ref<EventGroupRow[]>;
  sessionStartedAt: Ref<{ microsSinceUnixEpoch: bigint } | null>;
};

export const useEvents = ({
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
  sessionStartedAt,
}: UseEventsArgs) => {
  const localEvents = ref<EventItem[]>([]);
  let localEventIdCounter = 9000000000n;

  const addLocalEvent = (kind: string, message: string) => {
    const id = localEventIdCounter++;
    const createdAt = { microsSinceUnixEpoch: BigInt(Date.now() * 1000) };
    localEvents.value.push({
      id,
      createdAt,
      kind,
      message,
      scope: 'client',
    });
  };

  // Trim local events older than 2 minutes to prevent unbounded growth
  watch(
    () => localEvents.value.length,
    () => {
      const nowMicros = BigInt(Date.now() * 1000);
      const twoMinutesAgo = nowMicros - 120_000_000n;
      localEvents.value = localEvents.value.filter(
        (event) => event.createdAt.microsSinceUnixEpoch >= twoMinutesAgo
      );
    }
  );

  const combinedEvents = computed<EventItem[]>(() => {
    const items: EventItem[] = [];
    const sessionMicros = sessionStartedAt.value?.microsSinceUnixEpoch ?? null;
    const isInSession = (micros: bigint) => sessionMicros == null || micros >= sessionMicros;

    for (const row of worldEvents.value) {
      if (!isInSession(row.createdAt.microsSinceUnixEpoch)) continue;
      items.push({
        id: row.id,
        createdAt: row.createdAt,
        kind: row.kind,
        message: row.message,
        scope: 'world',
      });
    }
    for (const row of locationEvents.value) {
      if (!isInSession(row.createdAt.microsSinceUnixEpoch)) continue;
      items.push({
        id: row.id,
        createdAt: row.createdAt,
        kind: row.kind,
        message: row.message,
        scope: 'location',
      });
    }
    for (const row of privateEvents.value) {
      if (!isInSession(row.createdAt.microsSinceUnixEpoch)) continue;
      items.push({
        id: row.id,
        createdAt: row.createdAt,
        kind: row.kind,
        message: row.message,
        scope: 'private',
      });
    }
    for (const row of groupEvents.value) {
      if (!isInSession(row.createdAt.microsSinceUnixEpoch)) continue;
      items.push({
        id: row.id,
        createdAt: row.createdAt,
        kind: row.kind,
        message: row.message,
        scope: 'group',
      });
    }
    // Add local events - they skip the isInSession filter as they are always current
    for (const event of localEvents.value) {
      items.push(event);
    }
    return items
      .sort((a, b) => {
        if (a.createdAt.microsSinceUnixEpoch === b.createdAt.microsSinceUnixEpoch) {
          return a.id > b.id ? 1 : -1;
        }
        return a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 : -1;
      })
      .slice(-80);
  });

  return { combinedEvents, addLocalEvent };
};
