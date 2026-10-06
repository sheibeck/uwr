// Enemy wind-up copy (48-UI-SPEC Copywriting "Wind-up row and feed warning", CMB-03).
//
// One helper builds the sentence for both the rail row and the feed warning block. The two
// surfaces differ only in how N is derived (RESEARCH Pitfall 6):
//   rail row: N = landsAtRound - currentRound + 1 (counts down as rounds pass)
//   feed:     N = landsAtRound - announcedRound   (fixed at announcement)
// Both are clamped to at least 1, so a cast whose row has not been deleted yet reads
// 'lands this round', never 0 or a negative count. Strings are built by concatenation only;
// components render them as text nodes.

export interface WindupParts {
  /** Text before the ability name, 'Rotfang winds up '. */
  lead: string;
  /** The ability name, emphasised by the feed block. */
  ability: string;
  /** Text after the ability name, ' → you · lands in 2 rounds'. */
  tail: string;
  /** lead + ability + tail. */
  text: string;
}

const ONE = 1n;

function atLeastOne(n: bigint): bigint {
  return n < ONE ? ONE : n;
}

/** Rounds until the cast lands, counted from the open round (rail row). */
export function landsInLive(landsAtRound: bigint, currentRound: bigint): bigint {
  return atLeastOne(landsAtRound - currentRound + ONE);
}

/** Rounds until the cast lands, counted from the round it was announced in (feed block). */
export function landsInAtAnnouncement(cast: { announcedRound: bigint; landsAtRound: bigint }): bigint {
  return atLeastOne(cast.landsAtRound - cast.announcedRound);
}

/** Who the cast is aimed at: 'you', a member name, a pet name, or 'the party'. */
export function windupTarget(input: {
  targetCharacterId?: bigint | null;
  targetPetId?: bigint | null;
  selfId: bigint | null;
  characterNames: ReadonlyMap<bigint, string>;
  petNames: ReadonlyMap<bigint, string>;
}): string {
  const { targetCharacterId, targetPetId, selfId, characterNames, petNames } = input;
  if (targetCharacterId !== null && targetCharacterId !== undefined) {
    if (selfId !== null && targetCharacterId === selfId) return 'you';
    const name = characterNames.get(targetCharacterId);
    return name !== undefined && name !== '' ? name : 'the party';
  }
  if (targetPetId !== null && targetPetId !== undefined) {
    const name = petNames.get(targetPetId);
    return name !== undefined && name !== '' ? name : 'the party';
  }
  return 'the party';
}

/** '{enemy} winds up {ability} → {target} · lands in {N} rounds' split around the ability name. */
export function windupParts(input: {
  enemy: string;
  ability: string;
  target: string;
  rounds: bigint;
}): WindupParts {
  const landing = input.rounds <= ONE ? 'lands this round' : `lands in ${input.rounds} rounds`;
  const lead = `${input.enemy} winds up `;
  const tail = ` → ${input.target} · ${landing}`;
  return { lead, ability: input.ability, tail, text: lead + input.ability + tail };
}

/** Ability display name by template id and key; falls back to the key in words. */
export function enemyAbilityName(
  abilities: readonly { enemyTemplateId: bigint; abilityKey: string; name: string }[],
  enemyTemplateId: bigint,
  abilityKey: string,
): string {
  for (const ability of abilities) {
    if (ability.enemyTemplateId === enemyTemplateId && ability.abilityKey === abilityKey) {
      return ability.name;
    }
  }
  return abilityKey.split('_').join(' ');
}
