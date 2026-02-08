import { computed, type Ref } from 'vue';
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
    return items
      .sort((a, b) =>
        a.createdAt.microsSinceUnixEpoch > b.createdAt.microsSinceUnixEpoch ? 1 : -1
      )
      .slice(-80);
  });

  return { combinedEvents };
};
