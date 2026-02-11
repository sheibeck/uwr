<template>
    <div>
      <div v-if="!selectedCharacter" :style="styles.subtle">
        Select a character to view location.
      </div>
      <div v-else>
        <div v-if="activeResult">
          <div :style="{ ...styles.resultCard, minHeight: '200px', display: 'flex', flexDirection: 'column' }">
            <div :style="styles.resultHeading">{{ resultOutcome(activeResult.summary) }}</div>
            <div :style="styles.resultSummary">{{ stripFallen(activeResult.summary) }}</div>
            <div v-if="fallenList(activeResult.summary).length" :style="styles.resultRow">
              <span :style="styles.resultLabel">Fallen</span>
              <div :style="styles.resultList">
                <span
                  v-for="name in fallenList(activeResult.summary)"
                  :key="name"
                  :style="styles.resultTag"
                >
                  {{ name }}
                </span>
              </div>
            </div>
            <div v-if="activeLoot.length > 0" :style="styles.resultRow">
              <div :style="styles.resultList">
                <div
                  v-for="item in activeLoot"
                  :key="item.id.toString()"
                  :style="styles.rosterClickable"
                  @mouseenter="
                    $emit('show-tooltip', {
                      item,
                      x: $event.clientX,
                      y: $event.clientY,
                    })
                  "
                  @mousemove="$emit('move-tooltip', { x: $event.clientX, y: $event.clientY })"
                  @mouseleave="$emit('hide-tooltip')"
                >
                  <div :style="rarityStyle(item.rarity)">{{ item.name }}</div>
                  <div :style="styles.subtleSmall">
                    {{ item.rarity }} · Tier {{ item.tier }}
                  </div>
                  <button
                    type="button"
                    :style="styles.ghostButton"
                    @click="
                      $emit('hide-tooltip');
                      $emit('take-loot', item.id);
                    "
                  >
                    Take
                  </button>
                </div>
              </div>
            </div>
            <div :style="{ ...styles.panelFormInline, marginTop: 'auto' }">
              <button
                v-if="canDismissResults"
                type="button"
                :style="styles.primaryButton"
                @click="$emit('dismiss-results')"
              >
                Dismiss
              </button>
              <span v-else :style="styles.subtle">Waiting for the leader to dismiss.</span>
            </div>
          </div>
        </div>
        <details
          v-else
          :style="activeCombat ? styles.accordionCombat : styles.accordion"
          :open="accordionState.enemies"
          @toggle="
            $emit('accordion-toggle', {
              key: 'enemies',
              open: ($event.target as HTMLDetailsElement).open,
            })
          "
        >
          <summary :style="styles.accordionSummary">Enemies</summary>
          <div v-if="activeCombat" :style="styles.combatBlock">
            <div :style="styles.combatRow">
              <span :style="styles.combatLabel">Fighting</span>
              <span :style="styles.combatValue">Enemies engaged</span>
            </div>
            <div :style="styles.roster">
              <div v-if="combatEnemies.length === 0" :style="styles.subtle">
                No enemies are present.
              </div>
              <div v-else :style="styles.rosterList">
                <div
                  v-for="enemy in combatEnemies"
                  :key="enemy.id.toString()"
                  :style="{
                    ...styles.rosterClickable,
                    ...(enemy.isTarget ? styles.rosterTagActive : {}),
                  }"
                  @click="$emit('select-enemy', enemy.id)"
                >
                  <div :style="styles.combatRow">
                      <span :style="[styles.combatValue, styles[enemy.conClass] ?? {}]">
                        {{ enemy.name }} (L{{ enemy.level }})
                      </span>
                    <span
                      v-if="enemy.isTarget"
                      :style="styles.targetBadge"
                    >
                      Target
                    </span>
                  </div>
                  <div :style="styles.hpBar">
                    <div
                      :style="{
                        ...styles.hpFill,
                        width: `${percent(enemy.hp, enemy.maxHp)}%`,
                      }"
                    ></div>
                    <span :style="styles.barText">{{ enemy.hp }} / {{ enemy.maxHp }}</span>
                  </div>
                  <div v-if="enemy.effects.length > 0" :style="styles.effectRow">
                    <span
                      v-for="effect in enemy.effects"
                      :key="effect.id.toString()"
                      :style="effect.isNegative ? styles.effectBadgeNegative : styles.effectBadgePositive"
                    >
                      {{ effect.label }} {{ effect.seconds }}s
                    </span>
                  </div>
                  <div v-if="enemy.targetName" :style="styles.combatRow">
                    <span :style="styles.combatLabel">Targeting</span>
                    <span :style="styles.combatValue">{{ enemy.targetName }}</span>
                  </div>
                  <div v-if="enemy.castProgress > 0" :style="styles.enemyCastBar">
                    <div
                      :style="{
                        ...styles.enemyCastFill,
                        width: `${Math.round(enemy.castProgress * 100)}%`,
                      }"
                    ></div>
                    <span v-if="enemy.castLabel" :style="styles.barText">{{ enemy.castLabel }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div :style="styles.panelFormInline">
              <button
                type="button"
                :disabled="!connActive || !canAct"
                :style="styles.ghostButton"
                @click="$emit('flee')"
              >
                Flee
              </button>
            </div>
            <div v-if="!canAct" :style="styles.subtle">You are down and cannot act.</div>
          </div>
  <div v-else>
    <div :style="styles.subtle">Choose an enemy to pull.</div>
    <div v-if="!canEngage" :style="styles.subtle">
      Only the group puller can engage enemies.
    </div>
    <div v-if="enemySpawns.length === 0" :style="styles.subtle">
      No enemies are available right now.
    </div>
    <div :style="styles.buttonWrap">
      <div
        v-for="enemy in enemySpawns"
        :key="enemy.id.toString()"
        :style="styles.enemyGroupRow"
      >
        <span
          :style="styles[enemy.conClass] ?? {}"
          :title="enemy.memberNames.length > 0 ? enemy.memberNames.join(', ') : enemy.name"
        >
          {{ enemy.name }} (L{{ enemy.level
          }}<span v-if="enemy.groupCount > 1n" :style="styles.groupCountTag"
            > x{{ enemy.groupCount }}</span
          >)
        </span>
        <div :style="styles.panelFormInline">
          <button
            type="button"
            :style="[styles.ghostButton, !canEngage ? styles.disabledButton : {}]"
            :aria-disabled="!connActive"
            title="Take your time to isolate the target. Safer, quieter pull with a better chance to avoid adds."
            @click="$emit('pull', { enemyId: enemy.id, pullType: 'careful' })"
          >
            Careful Pull
          </button>
          <button
            type="button"
            :style="[styles.ghostButton, !canEngage ? styles.disabledButton : {}]"
            :aria-disabled="!connActive"
            title="Step in boldly to test reactions. Faster but more likely to bring extra enemies."
            @click="$emit('pull', { enemyId: enemy.id, pullType: 'body' })"
          >
            Body Pull
          </button>
        </div>
      </div>
    </div>
  </div>
        </details>
        <template v-if="!activeCombat && !activeResult">
          <details
            :style="styles.accordion"
            :open="accordionState.resources"
            @toggle="
              $emit('accordion-toggle', {
                key: 'resources',
                open: ($event.target as HTMLDetailsElement).open,
              })
            "
          >
            <summary :style="styles.accordionSummary">Resources</summary>
            <div :style="styles.roster">
              <div v-if="resourceNodes.length === 0" :style="styles.subtle">
                No resources are visible here.
              </div>
              <div v-else :style="styles.rosterList">
                <div
                  v-for="node in resourceNodes"
                  :key="node.id.toString()"
                  :style="styles.enemyGroupRow"
                >
                  <div :style="styles.combatRow">
                    <span :style="styles.combatValue">{{ node.name }}</span>
                  </div>
                  <div v-if="node.state === 'depleted'" :style="styles.subtleSmall">
                    Respawns in {{ node.respawnSeconds ?? 0 }}s
                  </div>
                  <div :style="styles.panelFormInline">
                    <button
                      type="button"
                      :disabled="!connActive || node.state !== 'available'"
                      :style="{
                        ...styles.ghostButton,
                        position: 'relative',
                        overflow: 'hidden',
                        width: '100%',
                      }"
                      @click="$emit('gather-resource', node.id)"
                    >
                      {{ node.state === 'harvesting' ? 'Gathering...' : 'Gather' }}
                      <div
                        v-if="node.progress > 0"
                        :style="{
                          ...styles.hotbarCastFill,
                          width: `${Math.round(node.progress * 100)}%`,
                        }"
                      ></div>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </details>
          <details
            :style="styles.accordion"
            :open="accordionState.characters"
            @toggle="
              $emit('accordion-toggle', {
                key: 'characters',
                open: ($event.target as HTMLDetailsElement).open,
              })
            "
          >
            <summary :style="styles.accordionSummary">Characters ({{ charactersHere.length }})</summary>
            <div :style="styles.roster">
              <div v-if="charactersHere.length === 0" :style="styles.subtle">
                Nobody else is around.
              </div>
              <div v-else :style="styles.rosterList">
                <span
                  v-for="entry in charactersHere"
                  :key="entry.character.id.toString()"
                  :style="styles.rosterClickable"
                  @click="$emit('character-action', entry.character.id)"
                >
                  <span :style="styles.rosterNameRow">
                    {{ entry.character.name }}
                    <span
                      v-if="entry.disconnected"
                      :style="styles.disconnectedDot"
                      title="Disconnected"
                    ></span>
                  </span>
                </span>
              </div>
            </div>
          </details>

          <details
            :style="styles.accordion"
            :open="accordionState.npcs"
            @toggle="
              $emit('accordion-toggle', {
                key: 'npcs',
                open: ($event.target as HTMLDetailsElement).open,
              })
            "
          >
            <summary :style="styles.accordionSummary">NPCs</summary>
            <div :style="styles.roster">
              <div v-if="npcsHere.length === 0" :style="styles.subtle">No NPCs here yet.</div>
              <div v-else :style="styles.rosterList">
                <div
                  v-for="npc in npcsHere"
                  :key="npc.id.toString()"
                  :style="styles.rosterClickable"
                  @click="
                    $emit('hail', npc.name);
                    if (npc.npcType === 'vendor') {
                      $emit('open-vendor', npc.id);
                    }
                  "
                >
                  <div>{{ npc.name }}</div>
                  <div v-if="npc.description" :style="styles.subtleSmall">{{ npc.description }}</div>
                </div>
              </div>
            </div>
          </details>
        </template>
      </div>
    </div>
</template>

<script setup lang="ts">
import type {
  CharacterRow,
  CombatEncounterRow,
  CombatEnemyRow,
  CombatResultRow,
  NpcRow,
} from '../module_bindings';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
  groupCount: bigint;
  memberNames: string[];
  conClass: string;
};

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  charactersHere: { character: CharacterRow; disconnected: boolean }[];
  npcsHere: NpcRow[];
  activeCombat: CombatEncounterRow | null;
  combatEnemies: {
    id: bigint;
    name: string;
    level: bigint;
    hp: bigint;
    maxHp: bigint;
    conClass: string;
    isTarget: boolean;
    effects: { id: bigint; label: string; seconds: number; isNegative: boolean }[];
    castProgress: number;
    castLabel: string;
    targetName: string | null;
  }[];
  activeLoot: {
    id: bigint;
    name: string;
    rarity: string;
    tier: bigint;
    description: string;
    stats: { label: string; value: string }[];
  }[];
  activeEnemySpawn: { id: bigint } | null;
  enemySpawns: EnemySummary[];
  resourceNodes: {
    id: bigint;
    name: string;
    quantity: bigint;
    state: string;
    timeOfDay: string;
    isGathering: boolean;
    progress: number;
    respawnSeconds: number | null;
  }[];
  activeResult: CombatResultRow | null;
  canEngage: boolean;
  canDismissResults: boolean;
  canAct: boolean;
  accordionState: {
    enemies: boolean;
    resources: boolean;
    characters: boolean;
    npcs: boolean;
  };
}>();

const rarityStyle = (rarity: string) => {
  const key = (rarity ?? 'common').toLowerCase();
  const map: Record<string, string> = {
    common: 'rarityCommon',
    uncommon: 'rarityUncommon',
    rare: 'rarityRare',
    epic: 'rarityEpic',
    legendary: 'rarityLegendary',
  };
  return (props.styles as any)[map[key] ?? 'rarityCommon'] ?? {};
};

const percent = (value: bigint, max: bigint) => {
  if (!max || max === 0n) return 0;
  return Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100));
};

const fallenList = (summary: string) => {
  const match = summary.match(/Fallen:\s*([^.]*)/i);
  if (!match) return [] as string[];
  return match[1]
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
};

const stripFallen = (summary: string) => summary.replace(/\s*Fallen:.*$/i, '').trim();

const resultOutcome = (summary: string) => {
  const lowered = summary.toLowerCase();
  if (lowered.startsWith('victory')) return 'Victory';
  if (lowered.startsWith('defeat')) return 'Defeat';
  return 'Combat Results';
};

defineEmits<{
  (e: 'pull', value: { enemyId: bigint; pullType: 'careful' | 'body' }): void;
  (e: 'flee'): void;
  (e: 'select-enemy', enemyId: bigint): void;
  (e: 'dismiss-results'): void;
  (e: 'hail', npcName: string): void;
  (e: 'take-loot', lootId: bigint): void;
  (e: 'gather-resource', nodeId: bigint): void;
  (e: 'show-tooltip', value: { item: any; x: number; y: number }): void;
  (e: 'move-tooltip', value: { x: number; y: number }): void;
  (e: 'hide-tooltip'): void;
  (e: 'open-vendor', npcId: bigint): void;
  (e: 'accordion-toggle', value: { key: 'enemies' | 'resources' | 'characters' | 'npcs'; open: boolean }): void;
  (e: 'character-action', characterId: bigint): void;
}>();
</script>
