<template>
  <div>
    <!-- Empty state -->
    <div
      v-if="
        enemySpawns.length === 0 &&
        resourceNodes.length === 0 &&
        charactersHere.length === 0 &&
        npcsHere.length === 0
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
          }"
          @click="toggleSelectEnemy(enemy.id)"
          @contextmenu.prevent="openEnemyContextMenu($event, enemy)"
        >
          <span :style="styles[enemy.conClass] ?? {}">
            {{ enemy.name }} (L{{ enemy.level }})
          </span>
          <span v-if="enemy.groupCount > 1n" :style="{ fontSize: '0.7rem', opacity: 0.8 }">
            x{{ enemy.groupCount }}
          </span>
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
          :style="node.state === 'depleted' ? styles.gridTileDepleted : styles.gridTile"
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
    <div v-if="charactersHere.length > 0">
      <div :style="styles.gridSectionLabel">CHARACTERS ({{ charactersHere.length }})</div>
      <div :style="styles.gridWrap">
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
          :style="styles.gridTileNpc"
          @contextmenu.prevent="openNpcContextMenu($event, npc)"
        >
          <div>{{ npc.name }}</div>
          <div v-if="npc.description" :style="{ fontSize: '0.65rem', opacity: 0.6, marginTop: '0.1rem' }">
            {{ npc.description }}
          </div>
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
};

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
  connActive: boolean;
  selectedCharacter: CharacterRow | null;
  charactersHere: { character: CharacterRow; disconnected: boolean }[];
  npcsHere: NpcRow[];
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
}>();

const selectedEnemyId = ref<bigint | null>(null);

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

const openEnemyContextMenu = (event: MouseEvent, enemy: EnemySummary) => {
  const items: Array<{ label: string; disabled?: boolean; action: () => void }> = [
    {
      label: 'Careful Pull',
      disabled: !props.canEngage,
      action: () => emit('pull', { enemyId: enemy.id, pullType: 'careful' }),
    },
    {
      label: 'Body Pull',
      disabled: !props.canEngage,
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

  contextMenu.value = {
    visible: true,
    x: event.clientX,
    y: event.clientY,
    title: npc.name,
    subtitle: npc.description ?? '',
    items,
  };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};
</script>
