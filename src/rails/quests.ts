// Tracked quests for the context rail (47-UI-SPEC "Tracking", CON-04).
// my_quests holds the active character's rows. A row with `completed` and no `completedAt` is
// awaiting turn-in ('Ready'); a row with completedAt set is finished and no longer tracked
// (research "Quests": the hail_npc path leaves finished rows with completedAt set).
import { barFraction } from '../frame/vitals';

export interface TrackedQuest {
  id: bigint;
  name: string;
  progress: bigint;
  required: bigint;
  ready: boolean;
  /** A progress bar shows only when more than one step is required. */
  showBar: boolean;
  fraction: number;
  countText: string;
  /** Template description, shown instead of a bar when required is 1 or less. */
  description: string | null;
}

function compareBigint(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function trackedQuests(
  quests: readonly {
    id: bigint;
    characterId: bigint;
    questTemplateId: bigint;
    progress: bigint;
    completed: boolean;
    acceptedAt: { microsSinceUnixEpoch: bigint };
    completedAt?: { microsSinceUnixEpoch: bigint } | null;
  }[],
  templates: readonly {
    id: bigint;
    name: string;
    requiredCount: bigint;
    description?: string | null;
  }[],
  characterId: bigint | null,
): TrackedQuest[] {
  if (characterId === null) return [];
  const byId = new Map<bigint, (typeof templates)[number]>();
  for (const template of templates) byId.set(template.id, template);

  const active = quests.filter(
    (q) => q.characterId === characterId && (q.completedAt === undefined || q.completedAt === null),
  );
  active.sort((a, b) => {
    const accepted = compareBigint(a.acceptedAt.microsSinceUnixEpoch, b.acceptedAt.microsSinceUnixEpoch);
    return accepted !== 0 ? accepted : compareBigint(a.id, b.id);
  });

  const out: TrackedQuest[] = [];
  for (const q of active) {
    const template = byId.get(q.questTemplateId);
    if (!template) continue;
    const ready = q.completed;
    const showBar = !ready && template.requiredCount > 1n;
    const rawDescription = template.description == null ? '' : template.description.trim();
    out.push({
      id: q.id,
      name: template.name,
      progress: q.progress,
      required: template.requiredCount,
      ready,
      showBar,
      fraction: ready ? 1 : barFraction(q.progress, template.requiredCount),
      countText: ready ? 'Ready' : `${q.progress}/${template.requiredCount}`,
      description: template.requiredCount <= 1n && rawDescription.length > 0 ? rawDescription : null,
    });
  }
  return out;
}
