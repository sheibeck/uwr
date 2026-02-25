// Types
export type RewardSpec = {
  renown: number;
  gold: number;
  factionId: number | null;
  factionAmount: number;
  itemTemplateKey: string | null;
};

export type TierSpec = {
  threshold: number;       // contribution count needed for this tier
  success: RewardSpec;
  failure: RewardSpec;     // consolation reward for participants in failed event
};

export type WorldEventDefinition = {
  name: string;
  regionKey: string;              // region name for ID resolution at fire time
  isRecurring: boolean;
  failureConditionType: 'time' | 'threshold_race';
  durationMicros?: bigint;          // for time-based failure
  successThreshold?: bigint;        // for threshold_race
  failureThreshold?: bigint;
  successConsequenceType: string;
  successConsequencePayload: string;
  failureConsequenceType: string;
  failureConsequencePayload: string;
  consequenceTextStub?: string;     // Written to WorldEvent.consequenceText at fire time (REQ-034)
  rewardTiers: { bronze: TierSpec; silver: TierSpec; gold: TierSpec };
  contentLocations: Array<{
    locationKey: string;            // location name for ID resolution
    enemies: Array<{ enemyTemplateKey: string; count: number }>;
    items: Array<{ name: string; count: number }>;
  }>;
};

// Event definitions
export const WORLD_EVENT_DEFINITIONS: Record<string, WorldEventDefinition> = {
  ashen_awakening: {
    name: 'The Ashen Awakening',
    regionKey: 'Embermarch Depths',
    isRecurring: false,
    failureConditionType: 'time',
    durationMicros: 3_600_000_000n, // 1 hour
    successConsequenceType: 'race_unlock',
    successConsequencePayload: 'Hollowed',
    failureConsequenceType: 'enemy_composition_change',
    failureConsequencePayload: JSON.stringify({ regionKey: 'Embermarch Depths', note: 'Darker enemies spawn' }),
    consequenceTextStub: 'The ashen fires stir in Embermarch Depths. Heroes must quell the flames or darkness will consume the region.',
    rewardTiers: {
      bronze: {
        threshold: 1,
        success: { renown: 50, gold: 100, factionId: null, factionAmount: 0, itemTemplateKey: null },
        failure: { renown: 10, gold: 20, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      silver: {
        threshold: 5,
        success: { renown: 75, gold: 300, factionId: 3, factionAmount: 25, itemTemplateKey: null },
        failure: { renown: 12, gold: 50, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      gold: {
        threshold: 15,
        success: { renown: 150, gold: 750, factionId: 3, factionAmount: 75, itemTemplateKey: null },
        failure: { renown: 30, gold: 100, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
    },
    contentLocations: [
      {
        locationKey: 'Charred Basin',
        enemies: [{ enemyTemplateKey: 'Ash Jackal', count: 3 }],
        items: [{ name: 'Ashen Shard', count: 4 }],
      },
    ],
  },

  hollowmere_siege: {
    name: 'The Hollowmere Siege',
    regionKey: 'Hollowmere Vale',
    isRecurring: false,
    failureConditionType: 'threshold_race',
    successThreshold: 20n,   // players must kill 20 invaders
    failureThreshold: 10n,   // enemies kill 10 villagers (tracked via EventObjective)
    successConsequenceType: 'faction_standing_bonus',
    successConsequencePayload: JSON.stringify({ factionId: 1, amount: 50 }),
    failureConsequenceType: 'none',
    failureConsequencePayload: '',
    consequenceTextStub: 'Hollowmere Vale is under siege! Defend the villagers before the invaders overwhelm the settlement.',
    rewardTiers: {
      bronze: {
        threshold: 1,
        success: { renown: 30, gold: 75, factionId: 1, factionAmount: 10, itemTemplateKey: null },
        failure: { renown: 5, gold: 15, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      silver: {
        threshold: 8,
        success: { renown: 50, gold: 200, factionId: 1, factionAmount: 30, itemTemplateKey: null },
        failure: { renown: 8, gold: 30, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      gold: {
        threshold: 20,
        success: { renown: 100, gold: 500, factionId: 1, factionAmount: 75, itemTemplateKey: null },
        failure: { renown: 20, gold: 75, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
    },
    contentLocations: [
      {
        locationKey: 'Bogfen Hollow',
        enemies: [{ enemyTemplateKey: 'Bog Lurker', count: 4 }],
        items: [{ name: 'Siege Supply Crate', count: 3 }],
      },
    ],
  },

  hollowmere_rat_infestation: {
    name: 'The Hollowmere Infestation',
    regionKey: 'Hollowmere Vale',
    isRecurring: true,
    failureConditionType: 'time',
    durationMicros: 1_800_000_000n, // 30 minutes
    successConsequenceType: 'faction_standing_bonus',
    successConsequencePayload: JSON.stringify({ factionId: 1, amount: 25 }),
    failureConsequenceType: 'none',
    failureConsequencePayload: '',
    consequenceTextStub: 'Bog rats pour from the wetlands into Hollowmere. Drive them back before they overrun the settlement.',
    rewardTiers: {
      bronze: {
        threshold: 1,
        success: { renown: 20, gold: 50, factionId: null, factionAmount: 0, itemTemplateKey: null },
        failure: { renown: 5, gold: 10, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      silver: {
        threshold: 3,
        success: { renown: 35, gold: 120, factionId: 1, factionAmount: 10, itemTemplateKey: null },
        failure: { renown: 5, gold: 20, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
      gold: {
        threshold: 8,
        success: { renown: 60, gold: 300, factionId: 1, factionAmount: 30, itemTemplateKey: null },
        failure: { renown: 12, gold: 50, factionId: null, factionAmount: 0, itemTemplateKey: null },
      },
    },
    contentLocations: [
      {
        locationKey: 'Hollowmere',
        enemies: [{ enemyTemplateKey: 'Bog Rat', count: 5 }],
        items: [{ name: 'Rat Nest Token', count: 3 }],
      },
    ],
  },
};
