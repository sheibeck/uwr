export interface DialogueOptionSeed {
  npcName: string;
  optionKey: string;
  parentOptionKey: string | null;
  playerText: string;
  npcResponse: string;
  requiredAffinity: bigint;
  affinityChange: bigint;
  sortOrder: bigint;
}

export const NPC_DIALOGUE_OPTIONS: DialogueOptionSeed[] = [
  // === Marla the Guide (quest NPC) ===
  // Tier 0 - Stranger
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_greet',
    parentOptionKey: null,
    playerText: 'Tell me about this area.',
    npcResponse: 'The lands beyond Hollowmere are unforgiving. Ash jackals prowl the lowlands, and worse things lurk in the deep.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 1n,
  },
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_directions',
    parentOptionKey: null,
    playerText: 'Which way should I go?',
    npcResponse: 'Stick to the river paths if you value your skin. The Scorchlands will eat you alive unprepared.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 2n,
  },
  // Tier 25 - Acquaintance
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_past',
    parentOptionKey: null,
    playerText: 'How did you become a guide?',
    npcResponse: 'Lost my whole company to a bog wyrm three winters back. Only one who made it out. Figured I should learn the land better than it knows me.',
    requiredAffinity: 25n,
    affinityChange: 3n,
    sortOrder: 3n,
  },
  // Tier 50 - Friend
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_secret_path',
    parentOptionKey: null,
    playerText: 'Know any shortcuts through the wilds?',
    npcResponse: 'There is an old smuggler trail through the Thornveil. Dangerous, but it cuts the journey in half. I will mark it on your map.',
    requiredAffinity: 50n,
    affinityChange: 5n,
    sortOrder: 4n,
  },
  // Tier 75 - Close Friend
  {
    npcName: 'Marla the Guide',
    optionKey: 'marla_trust',
    parentOptionKey: null,
    playerText: 'What really happened to your company?',
    npcResponse: 'They were not just soldiers. They were family. Every name is carved into my belt. I will not lose anyone else if I can help it.',
    requiredAffinity: 75n,
    affinityChange: 5n,
    sortOrder: 5n,
  },

  // === Elder Soren (lore NPC) ===
  // Tier 0 - Stranger
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_greet',
    parentOptionKey: null,
    playerText: 'What can you tell me about Hollowmere?',
    npcResponse: 'This town has stood since before the Ashfall. We endure because we remember. Others forget and perish.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 1n,
  },
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_factions',
    parentOptionKey: null,
    playerText: 'Tell me about the factions.',
    npcResponse: 'Four powers carve this land between them. The Iron Compact trades in steel and coin. The Verdant Circle guards what green remains. The Ashen Order hoards forbidden knowledge. And the Free Blades sell their swords to whoever pays.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 2n,
  },
  // Tier 25 - Acquaintance
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_history',
    parentOptionKey: null,
    playerText: 'What was this land before the Ashfall?',
    npcResponse: 'Green. Impossibly green. Rivers ran clear and the sky did not taste of cinder. But that was before the Hollowed emerged from beneath.',
    requiredAffinity: 25n,
    affinityChange: 3n,
    sortOrder: 3n,
  },
  // Tier 50 - Friend
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_warning',
    parentOptionKey: null,
    playerText: 'You seem troubled, Elder.',
    npcResponse: 'The ground trembles more often now. The old seals are weakening. Something stirs beneath the Deephollow that should remain buried.',
    requiredAffinity: 50n,
    affinityChange: 5n,
    sortOrder: 4n,
  },
  // Tier 75 - Close Friend
  {
    npcName: 'Elder Soren',
    optionKey: 'soren_secret',
    parentOptionKey: null,
    playerText: 'What do you know about the sealed chambers?',
    npcResponse: 'I have the key to the Archive beneath the town hall. The records there... they speak of things the Iron Compact would rather stay forgotten. Come, I will show you.',
    requiredAffinity: 75n,
    affinityChange: 5n,
    sortOrder: 5n,
  },

  // === Quartermaster Jyn (vendor NPC) ===
  // Tier 0 - Stranger
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_greet',
    parentOptionKey: null,
    playerText: 'What do you have for sale?',
    npcResponse: 'Standard issue. Blades, armor, rations. Nothing fancy, but it will keep you breathing.',
    requiredAffinity: 0n,
    affinityChange: 1n,
    sortOrder: 1n,
  },
  // Tier 25 - Acquaintance
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_supply',
    parentOptionKey: null,
    playerText: 'Having trouble with supplies?',
    npcResponse: 'The southern caravans stopped running two weeks ago. Something on the road is hitting them hard. If you find out what, I would owe you one.',
    requiredAffinity: 25n,
    affinityChange: 3n,
    sortOrder: 2n,
  },
  // Tier 50 - Friend
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_discount',
    parentOptionKey: null,
    playerText: 'Any deals for a friend?',
    npcResponse: 'For you? I might have some stock set aside. The good stuff, not the rust-buckets I sell to strangers.',
    requiredAffinity: 50n,
    affinityChange: 3n,
    sortOrder: 3n,
  },
  // Tier 75 - Close Friend
  {
    npcName: 'Quartermaster Jyn',
    optionKey: 'jyn_confide',
    parentOptionKey: null,
    playerText: 'Something on your mind, Jyn?',
    npcResponse: 'My sister went north with a supply convoy. Three weeks, no word. The Compact says do not worry, but I know that silence. Help me find her?',
    requiredAffinity: 75n,
    affinityChange: 5n,
    sortOrder: 4n,
  },
];
