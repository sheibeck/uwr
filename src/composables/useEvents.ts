import { computed, ref, watch, type Ref } from 'vue';
import type {
  EventWorld,
  EventLocation,
  EventPrivate,
  EventGroup,
} from '../module_bindings/types';

export type EventItem = {
  id: bigint;
  createdAt: { microsSinceUnixEpoch: bigint };
  kind: string;
  message: string;
  scope: string;
};

type UseEventsArgs = {
  worldEvents: Ref<EventWorld[]>;
  locationEvents: Ref<EventLocation[]>;
  privateEvents: Ref<EventPrivate[]>;
  groupEvents: Ref<EventGroup[]>;
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

  const addLocalEvent = (kind: string, message: string, scope: string = 'client') => {
    const id = localEventIdCounter++;
    const createdAt = { microsSinceUnixEpoch: BigInt(Date.now() * 1000) };
    localEvents.value.push({ id, createdAt, kind, message, scope });
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
    // Scope ordering: world first, then location, private, group, client last
    const scopeOrder: Record<string, number> = { world: 0, location: 1, private: 2, group: 3, client: 4 };
    return items
      .sort((a, b) => {
        if (a.createdAt.microsSinceUnixEpoch !== b.createdAt.microsSinceUnixEpoch) {
          return a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 : -1;
        }
        const scopeDiff = (scopeOrder[a.scope] ?? 9) - (scopeOrder[b.scope] ?? 9);
        if (scopeDiff !== 0) return scopeDiff;
        return a.id > b.id ? 1 : -1;
      })
      .slice(-80);
  });

  return { combinedEvents, addLocalEvent };
};
