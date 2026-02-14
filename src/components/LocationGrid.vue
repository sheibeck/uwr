<template>
  <div>
    <!-- Empty state -->
    <div
      v-if="
        enemySpawns.length === 0 &&
        resourceNodes.length === 0 &&
        npcsHere.length === 0 &&
        corpsesHere.length === 0
      "
      :style="styles.subtle"
    >
      Nothing of interest here.
    </div>

    <!-- Enemies -->
    <div v-if="enemySpawns.length > 0">
      <div :style="styles.gridSectionLabel">ENEMIES</div>
      <div :style="styles.gridWrap">
        <div
          v-for="enemy in enemySpawns"
          :key="enemy.id.toString()"
          :style="{
            ...styles.gridTile,
            ...(selectedEnemyId?.toString() === enemy.id.toString() ? styles.gridTileSelected : {}),
            flexDirection: 'column',
            alignItems: 'flex-start',
          }"
          @click="toggleSelectEnemy(enemy.id)"
          @contextmenu.prevent="openEnemyContextMenu($event, enemy)"
        >
          <div :style="{ display: 'flex', alignItems: 'center', gap: '0.3rem' }">
            <span :style="styles[enemy.conClass] ?? {}">
              {{ enemy.name }} (L{{ enemy.level }})
            </span>
            <span v-if="enemy.groupCount > 1n" :style="{ fontSize: '0.78rem', opacity: 0.8 }">
              x{{ enemy.groupCount }}
            </span>
          </div>
          <div
            v-if="enemy.isPulling && enemy.pullProgress > 0"
            :style="{
              width: '100%',
              height: '3px',
              background: 'rgba(217, 159, 52, 0.3)',
              borderRadius: '2px',
              overflow: 'hidden',
              marginTop: '0.2rem',
            }"
          >
            <div
              :style="{
                width: `${Math.round(enemy.pullProgress * 100)}%`,
                height: '100%',
                background: 'rgba(217, 159, 52, 0.8)',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Resources -->
    <div v-if="resourceNodes.length > 0">
      <div :style="styles.gridSectionLabel">RESOURCES</div>
      <div :style="styles.gridWrap">
        <div
          v-for="node in resourceNodes"
          :key="node.id.toString()"
          :style="{
            ...(node.state === 'depleted' ? styles.gridTileDepleted : styles.gridTile),
            flexDirection: 'column',
            alignItems: 'flex-start',
          }"
          @contextmenu.prevent="openResourceContextMenu($event, node)"
        >
          <span>{{ node.name }}</span>
          <div
            v-if="node.isGathering && node.progress > 0"
            :style="{
              width: '100%',
              height: '3px',
              background: 'rgba(76, 125, 240, 0.3)',
              borderRadius: '2px',
              overflow: 'hidden',
              marginTop: '0.2rem',
            }"
          >
            <div
              :style="{
                width: `${Math.round(node.progress * 100)}%`,
                height: '100%',
                background: 'rgba(76, 125, 240, 0.8)',
              }"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Characters -->
    <div>
      <div :style="styles.gridSectionLabel">PLAYERS ({{ charactersHere.length }})</div>
      <div v-if="charactersHere.length === 0" :style="{ fontSize: '0.85rem', opacity: 0.4, padding: '0.2rem 0' }">
        No other adventurers here.
      </div>
      <div v-else :style="styles.gridWrap">
        <div
          v-for="entry in charactersHere"
          :key="entry.character.id.toString()"
          :style="styles.gridTile"
          @click="handleCharacterClick(entry.character.id)"
          @contextmenu.prevent="handleCharacterClick(entry.character.id)"
        >
          <span>{{ entry.character.name }}</span>
          <span
            v-if="entry.disconnected"
            :style="styles.disconnectedDot"
            title="Disconnected"
          ></span>
        </div>
      </div>
    </div>

    <!-- NPCs -->
    <div v-if="npcsHere.length > 0">
      <div :style="styles.gridSectionLabel">NPCS</div>
      <div :style="styles.gridWrap">
        <div
          v-for="npc in npcsHere"
          :key="npc.id.toString()"
          :style="{
            ...styles.gridTileNpc,
            ...(selectedNpcId?.toString() === npc.id.toString() ? styles.gridTileNpcSelected : {}),
          }"
          @click="toggleSelectNpc(npc.id)"
          @contextmenu.prevent="openNpcContextMenu($event, npc)"
        >
          <div>{{ npc.name }}</div>
          <div v-if="npc.description" :style="{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.1rem' }">
            {{ npc.description }}
          </div>
        </div>
      </div>
    </div>

    <!-- Points of Interest (Corpses) -->
    <div v-if="corpsesHere.length > 0">
      <div :style="styles.gridSectionLabel">POINTS OF INTEREST</div>
      <div :style="styles.gridWrap">
        <div
          v-for="corpse in corpsesHere"
          :key="corpse.id.toString()"
          :style="{
            ...styles.gridTileCorpse,
            ...(selectedCorpseId?.toString() === corpse.id.toString() ? styles.gridTileSelected : {}),
          }"
          @click="toggleSelectCorpse(corpse.id)"
          @contextmenu.prevent="openCorpseContextMenu($event, corpse)"
        >
          <span>{{ corpse.characterName }}'s corpse</span>
          <span
            v-if="corpse.isOwn && corpse.itemCount > 0"
            :style="{ fontSize: '0.75rem', opacity: 0.6, marginLeft: '0.3rem' }"
          >
            ({{ corpse.itemCount }} items)
          </span>
        </div>
      </div>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :title="contextMenu.title"
      :subtitle="contextMenu.subtitle"
      :items="contextMenu.items"
      :styles="styles"
      @close="closeContextMenu"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { CharacterRow, NpcRow } from '../module_bindings';
import ContextMenu from './ContextMenu.vue';

type EnemySummary = {
  id: bigint;
  name: string;
  level: bigint;
  groupCount: bigint;
  memberNames: string[];
  conClass: string;
  factionName: string;
  isPulling: boolean;
  pullProgress: number;
  pullType: string | null;
};

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  selectedNpcId: bigint | null;
  charactersHere: { character: CharacterRow; disconnected: boolean }[];
  npcsHere: NpcRow[];
  corpsesHere: Array<{
    id: bigint;
    characterName: string;
    characterId: bigint;
    isOwn: boolean;
    itemCount: number;
  }>;
  enemySpawns: EnemySummary[];
  resourceNodes: Array<{
    id: bigint;
    name: string;
    quantity: bigint;
    state: string;
    timeOfDay: string;
    isGathering: boolean;
    progress: number;
    respawnSeconds: number | null;
  }>;
  canEngage: boolean;
}>();

const emit = defineEmits<{
  (e: 'pull', value: { enemyId: bigint; pullType: 'careful' | 'body' }): void;
  (e: 'gather-resource', nodeId: bigint): void;
  (e: 'hail', npcName: string): void;
  (e: 'open-vendor', npcId: bigint): void;
  (e: 'character-action', characterId: bigint): void;
  (e: 'gift-npc', npcId: bigint): void;
  (e: 'loot-all-corpse', corpseId: bigint): void;
  (e: 'initiate-resurrect', corpseId: bigint): void;
  (e: 'initiate-corpse-summon', targetCharacterId: bigint): void;
  (e: 'select-npc', npcId: bigint | null): void;
  (e: 'talk-npc', npcId: bigint): void;
  (e: 'select-corpse', corpseId: bigint | null): void;
}>();

const selectedEnemyId = ref<bigint | null>(null);
const selectedCorpseId = ref<bigint | null>(null);

const contextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  title: string;
  subtitle: string;
  items: Array<{ label: string; disabled?: boolean; action: () => void }>;
}>({
  visible: false,
  x: 0,
  y: 0,
  title: '',
  subtitle: '',
  items: [],
});

const toggleSelectEnemy = (enemyId: bigint) => {
  if (selectedEnemyId.value?.toString() === enemyId.toString()) {
    selectedEnemyId.value = null;
  } else {
    selectedEnemyId.value = enemyId;
  }
};

const toggleSelectNpc = (npcId: bigint) => {
  // Always select the NPC
  emit('select-npc', npcId);
  // Trigger talk action (opens Journal + calls hailNpc)
  emit('talk-npc', npcId);
};

const toggleSelectCorpse = (corpseId: bigint) => {
  if (selectedCorpseId.value?.toString() === corpseId.toString()) {
    selectedCorpseId.value = null;
    emit('select-corpse', null);
  } else {
    selectedCorpseId.value = corpseId;
    emit('select-corpse', corpseId);
  }
};

const openEnemyContextMenu = (event: MouseEvent, enemy: EnemySummary) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [
    {
      label: 'Careful Pull',
      disabled: !props.canEngage || enemy.isPulling,
      action: () => emit('pull', { enemyId: enemy.id, pullType: 'careful' }),
    },
    {
      label: 'Aggressive Pull',
      disabled: !props.canEngage || enemy.isPulling,
      action: () => emit('pull', { enemyId: enemy.id, pullType: 'body' }),
    },
  ];

  if (enemy.memberNames && enemy.memberNames.length > 0) {
    items.push({
      label: `Members: ${enemy.memberNames.join(', ')}`,
      disabled: true,
      action: () => {},
    });
  }

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: enemy.name,
    subtitle: `L${enemy.level}${enemy.groupCount > 1n ? ' x' + enemy.groupCount : ''} · ${enemy.factionName}`,
    items,
  };
};

const openResourceContextMenu = (
  event: MouseEvent,
  node: {
    id: bigint;
    name: string;
    state: string;
    respawnSeconds: number | null;
  }
) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [
    {
      label: node.state === 'harvesting' ? 'Gathering...' : 'Gather',
      disabled: !props.connActive || node.state !== 'available',
      action: () => emit('gather-resource', node.id),
    },
  ];

  if (node.state === 'depleted' && node.respawnSeconds !== null) {
    items.push({
      label: `Respawns in ${node.respawnSeconds}s`,
      disabled: true,
      action: () => {},
    });
  }

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: node.name,
    subtitle: '',
    items,
  };
};

const handleCharacterClick = (characterId: bigint) => {
  emit('character-action', characterId);
};

const openNpcContextMenu = (event: MouseEvent, npc: NpcRow) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [
    {
      label: 'Talk',
      action: () => emit('hail', npc.name),
    },
  ];

  if (npc.npcType === 'vendor') {
    items.push({
      label: 'Open Store',
      action: () => {
        emit('hail', npc.name);
        emit('open-vendor', npc.id);
      },
    });
  }

  items.push({
    label: 'Give Gift',
    action: () => emit('gift-npc', npc.id),
  });

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: npc.name,
    subtitle: npc.description ?? '',
    items,
  };
};

const openCorpseContextMenu = (event: MouseEvent, corpse: { id: bigint; characterName: string; isOwn: boolean; itemCount: number; characterId: bigint }) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [];

  if (corpse.isOwn && corpse.itemCount > 0) {
    items.push({
      label: 'Loot All',
      action: () => emit('loot-all-corpse', corpse.id),
    });
  } else if (!corpse.isOwn) {
    // Check if viewer is cleric level 6+ for resurrect
    const viewerIsCleric = props.selectedCharacter && props.selectedCharacter.className === 'cleric';
    const viewerLevel = props.selectedCharacter ? Number(props.selectedCharacter.level) : 0;
    const canResurrect = viewerIsCleric && viewerLevel >= 6;

    if (canResurrect) {
      items.push({
        label: 'Resurrect',
        action: () => emit('initiate-resurrect', corpse.id),
      });
    }
  }

  // If no items, add a disabled "Examine" option
  if (items.length === 0) {
    items.push({
      label: 'Examine',
      disabled: true,
      action: () => {},
    });
  }

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: `${corpse.characterName}'s corpse`,
    subtitle: '',
    items,
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};
</script>
