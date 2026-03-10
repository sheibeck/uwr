// Event feed color map for NarrativeMessage.vue
// Exported separately so tests can import without requiring full Vue SFC transform.
//
// Color categories:
//   combat = red (#ff6b6b)
//   reward/narrative = gold (#ffd43b)
//   system/command = gray (#adb5bd)
//   social/ability = blue (#74c0fc)

export const KIND_COLORS: Record<string, string> = {
  damage: '#ff6b6b',
  heal: '#69db7c',
  whisper: '#74c0fc',
  narrative: '#ffd43b',
  llm: '#ffd43b',
  system: '#adb5bd',
  command: '#adb5bd',
  say: '#e9ecef',
  presence: '#868e96',
  reward: '#ffd43b',
  npc: '#da77f2',
  faction: '#ffd43b',
  avoid: '#adb5bd',
  blocked: '#ff6b6b',
  creation: '#ffd43b',
  creation_error: '#ff6b6b',
  creation_warning: '#ffa94d',
  look: '#c8ccd0',
  move: '#adb5bd',
  world: '#b197fc',
  combat_narration: '#ffd43b',    // gold/amber for LLM narration from The Keeper
  combat_prompt: '#e9ecef',       // white for action selection prompts
  combat_status: '#adb5bd',       // gray for round summary with HP bars
  combat_round_header: '#ffa94d', // orange for round headers (distinctive)
  combat_resolving: '#ffd43b',    // gold pulsing for resolving state
  buff: '#74c0fc',                // blue for buff application
  debuff: '#ffa94d',              // orange for debuff application
  social: '#74c0fc',              // blue for social-typed events
  ability: '#74c0fc',             // blue for ability use events
};
