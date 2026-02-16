export interface DialogueOptionSeed {
  npcName: string;
  optionKey: string;
  parentOptionKey: string | null;
  playerText: string;  // Single keyword that triggers this
  npcResponse: string; // Can contain [keywords] for further conversation
  requiredAffinity: bigint;
  affinityChange: bigint;
  sortOrder: bigint;
  questTemplateName: string | null;  // Quest name instead of ID (looked up at runtime)
  affinityHint: string | null;
  isAffinityLocked: boolean;
}

export const NPC_DIALOGUE_OPTIONS: DialogueOptionSeed[] = [
  // === Marla the Guide ===
  // Root greeting - shows available [topics]
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_root',
    parentOptionKey: null,
    playerText: '',  // Root node, no keyword needed
    npcResponse: 'The [lands] beyond are harsh. I can help you understand the [dangers] or guide you on the best [paths].',
    requiredAffinity: 0n,
    affinityChange: 0n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },

  // First tier - available to strangers
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_lands',
    parentOptionKey: 'marla_root',
    playerText: 'lands',
    npcResponse: 'The lands beyond Hollowmere are unforgiving. Bog rats infest the wetlands, and worse things lurk deeper.',
    requiredAffinity: 0n,
    affinityChange: 2n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: 'Continue talking with me to earn my trust.',
    isAffinityLocked: false,
  },
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_dangers',
    parentOptionKey: 'marla_root',
    playerText: 'dangers',
    npcResponse: 'Bog rats are spreading disease in the wetlands. I need someone to thin their numbers. Can you help?',
    requiredAffinity: 0n,
    affinityChange: 2n,
    sortOrder: 2n,
    questTemplateName: 'Bog Rat Cleanup',  // Offers quest by name
    affinityHint: 'Hunt bog rats to prove yourself.',
    isAffinityLocked: false,
  },
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_paths',
    parentOptionKey: 'marla_root',
    playerText: 'paths',
    npcResponse: 'Stick to the river paths if you value your skin. The Scorchlands will eat you alive unprepared.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 3n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },

  // Second tier - deeper conversation after affinity 25+
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_past',
    parentOptionKey: 'marla_root',
    playerText: 'past',
    npcResponse: '',  // Locked message shown instead
    requiredAffinity: 25n,
    affinityChange: 0n,
    sortOrder: 4n,
    questTemplateName: null,
    affinityHint: 'Complete my quest and we can talk more.',
    isAffinityLocked: true,
  },
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_past_unlocked',
    parentOptionKey: null,  // New root option when affinity reaches 25
    playerText: 'past',
    npcResponse: 'Lost my whole company to a bog wyrm three winters back. Only one who made it out. I learned the land better than it knows me.',
    requiredAffinity: 25n,
    affinityChange: 3n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },

  // Third tier - Friend level (50+)
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_shortcuts',
    parentOptionKey: null,
    playerText: 'shortcuts',
    npcResponse: 'There is an old smuggler trail through the Thornveil. Dangerous, but it cuts the journey in half.',
    requiredAffinity: 50n,
    affinityChange: 5n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },

  // === Elder Soren ===
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_root',
    parentOptionKey: null,
    playerText: '',
    npcResponse: 'This town has stood since before the Ashfall. Ask me about [Hollowmere], the [factions], or the [history].',
    requiredAffinity: 0n,
    affinityChange: 0n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_hollowmere',
    parentOptionKey: 'soren_root',
    playerText: 'Hollowmere',
    npcResponse: 'We endure because we remember. Others forget and perish. The old ways keep us alive.',
    requiredAffinity: 0n,
    affinityChange: 2n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: 'Show respect by listening to my stories.',
    isAffinityLocked: false,
  },
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_factions',
    parentOptionKey: 'soren_root',
    playerText: 'factions',
    npcResponse: 'Four powers carve this land. The Iron Compact trades in steel. The Verdant Circle guards the green. The Ashen Order hoards knowledge. The Free Blades sell their swords.',
    requiredAffinity: 0n,
    affinityChange: 2n,
    sortOrder: 2n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_history',
    parentOptionKey: 'soren_root',
    playerText: 'history',
    npcResponse: 'Green. Impossibly green. Rivers ran clear before the Ashfall. But that was before the Hollowed emerged.',
    requiredAffinity: 0n,
    affinityChange: 2n,
    sortOrder: 3n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },

  // === Quartermaster Jyn ===
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_root',
    parentOptionKey: null,
    playerText: '',
    npcResponse: 'Need [supplies]? I have blades, armor, rations. Or we can talk about the [caravans] if you are interested.',
    requiredAffinity: 0n,
    affinityChange: 0n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: null,
    isAffinityLocked: false,
  },
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_supplies',
    parentOptionKey: 'jyn_root',
    playerText: 'supplies',
    npcResponse: 'Standard issue. Nothing fancy, but it will keep you breathing. Right-click me to open the store.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 1n,
    questTemplateName: null,
    affinityHint: 'Buy from my store to support me.',
    isAffinityLocked: false,
  },
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_caravans',
    parentOptionKey: 'jyn_root',
    playerText: 'caravans',
    npcResponse: 'The southern caravans stopped running two weeks ago. Something on the road is hitting them hard. Maybe we can talk more about this later.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 2n,
    questTemplateName: null,
    affinityHint: 'Buy from my store and I will trust you with more information.',
    isAffinityLocked: true,
  },
];
