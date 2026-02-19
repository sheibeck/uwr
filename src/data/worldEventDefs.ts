// Client-side event definition metadata
// Keys must match WORLD_EVENT_DEFINITIONS keys in spacetimedb/src/data/world_event_data.ts
export type ClientEventDef = {
  key: string;
  name: string;
  regionKey: string;
  isRecurring: boolean;
};

export const ADMIN_IDENTITY_HEX = 'c20006ce5893a0e7f3531d8cfc2bd561f78b60d08eb5137cc2ae3ca4ec060b80';

export const CLIENT_EVENT_DEFS: ClientEventDef[] = [
  {
    key: 'ashen_awakening',
    name: 'The Ashen Awakening',
    regionKey: 'Embermarch Depths',
    isRecurring: false,
  },
  {
    key: 'hollowmere_siege',
    name: 'The Hollowmere Siege',
    regionKey: 'Hollowmere Vale',
    isRecurring: false,
  },
  {
    key: 'hollowmere_rat_infestation',
    name: 'The Hollowmere Infestation',
    regionKey: 'Hollowmere Vale',
    isRecurring: true,
  },
];
