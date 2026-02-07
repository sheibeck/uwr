<template>
  <div :style="styles.shell">
    <header :style="styles.header">
      <div>
        <div :style="styles.title">Unwritten Realms</div>
        <div :style="styles.subtle">
          Status:
          <span :style="conn.isActive ? styles.statusOnline : styles.statusOffline">
            {{ conn.isActive ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
      </div>
      <div :style="styles.headerRight">
        <div v-if="selectedCharacter" :style="styles.subtle">
          {{ selectedCharacter.name }} · Lv {{ selectedCharacter.level }} ·
          {{ selectedCharacter.race }} {{ selectedCharacter.className }}
        </div>
        <div v-else :style="styles.subtle">No character selected</div>
        <div v-if="currentLocation" :style="styles.subtle">
          Location: {{ currentLocation.name }}
        </div>
      </div>
    </header>

    <main :style="styles.main">
      <section :style="styles.log">
        <div v-if="!selectedCharacter" :style="styles.logEmpty">
          Select or create a character to begin.
        </div>
        <div v-else-if="filteredEvents.length === 0" :style="styles.logEmpty">
          No events yet. Try a command like "look" or "travel".
        </div>
        <div v-else :style="styles.logList">
          <div v-for="event in filteredEvents" :key="event.id.toString()" :style="styles.logItem">
            <span :style="styles.logTime">{{ formatTimestamp(event.createdAt) }}</span>
            <span :style="styles.logKind">[{{ event.kind }}]</span>
            <span :style="styles.logText">{{ event.message }}</span>
          </div>
        </div>
      </section>

      <aside :style="styles.panel" v-if="activePanel !== 'none'">
        <div :style="styles.panelHeader">
          <div>{{ panelTitle }}</div>
          <button @click="activePanel = 'none'" :style="styles.panelClose">Close</button>
        </div>

        <div v-if="activePanel === 'character'" :style="styles.panelBody">
          <div :style="styles.panelSectionTitle">Create Character</div>
          <form @submit.prevent="createCharacter" :style="styles.panelForm">
            <input
              type="text"
              placeholder="Name"
              v-model="newCharacter.name"
              :disabled="!conn.isActive"
              :style="styles.input"
            />
            <input
              type="text"
              placeholder="Race"
              v-model="newCharacter.race"
              :disabled="!conn.isActive"
              :style="styles.input"
            />
            <input
              type="text"
              placeholder="Class"
              v-model="newCharacter.className"
              :disabled="!conn.isActive"
              :style="styles.input"
            />
            <button
              type="submit"
              :disabled="!conn.isActive || !isCharacterFormValid"
              :style="styles.primaryButton"
            >
              Create
            </button>
          </form>

          <div :style="styles.panelSectionTitle">Characters</div>
          <div v-if="characters.length === 0" :style="styles.subtle">No characters yet.</div>
          <ul v-else :style="styles.list">
            <li v-for="character in characters" :key="character.id.toString()">
              <label :style="styles.radioRow">
                <input
                  type="radio"
                  name="character"
                  :value="character.id.toString()"
                  v-model="selectedCharacterId"
                />
                <span>
                  {{ character.name }} (Lv {{ character.level }}) —
                  {{ character.race }} {{ character.className }}
                </span>
              </label>
            </li>
          </ul>
        </div>

        <div v-else-if="activePanel === 'inventory'" :style="styles.panelBody">
          <div :style="styles.panelSectionTitle">Inventory</div>
          <div :style="styles.subtle">Inventory system coming soon.</div>
        </div>

        <div v-else-if="activePanel === 'stats'" :style="styles.panelBody">
          <div :style="styles.panelSectionTitle">Stats</div>
          <div v-if="!selectedCharacter" :style="styles.subtle">
            Select a character to view stats.
          </div>
          <div v-else :style="styles.statsGrid">
            <div>Level</div>
            <div>{{ selectedCharacter.level }}</div>
            <div>XP</div>
            <div>{{ selectedCharacter.xp }}</div>
            <div>HP</div>
            <div>{{ selectedCharacter.hp }} / {{ selectedCharacter.maxHp }}</div>
            <div>Mana</div>
            <div>{{ selectedCharacter.mana }} / {{ selectedCharacter.maxMana }}</div>
          </div>
        </div>

        <div v-else-if="activePanel === 'combat'" :style="styles.panelBody">
          <div :style="styles.panelSectionTitle">Combat</div>
          <div v-if="!selectedCharacter" :style="styles.subtle">
            Select a character to enter combat.
          </div>
          <div v-else>
            <div v-if="activeCombat">
              <div :style="styles.subtle">
                Fighting {{ activeCombat.enemyName }} (Lv {{ activeCombat.enemyLevel }})
              </div>
              <div :style="styles.subtle">
                Enemy HP: {{ activeCombat.enemyHp }} / {{ activeCombat.enemyMaxHp }}
              </div>
              <form @submit.prevent="attack" :style="styles.panelFormInline">
                <input
                  type="number"
                  min="1"
                  v-model="attackDamage"
                  :disabled="!conn.isActive"
                  :style="styles.smallInput"
                />
                <button type="submit" :disabled="!conn.isActive" :style="styles.primaryButton">
                  Attack
                </button>
                <button type="button" :disabled="!conn.isActive" @click="endCombat" :style="styles.ghostButton">
                  Flee
                </button>
              </form>
            </div>
            <div v-else>
              <div :style="styles.subtle">Choose an enemy to engage.</div>
              <div :style="styles.buttonWrap">
                <button
                  v-for="enemy in enemyTemplates"
                  :key="enemy.id.toString()"
                  @click="startCombat(enemy.id)"
                  :disabled="!conn.isActive"
                  :style="styles.ghostButton"
                >
                  {{ enemy.name }} (Lv {{ enemy.level }})
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activePanel === 'travel'" :style="styles.panelBody">
          <div :style="styles.panelSectionTitle">Travel</div>
          <div v-if="!selectedCharacter" :style="styles.subtle">
            Select a character to travel.
          </div>
          <div v-else :style="styles.buttonWrap">
            <button
              v-for="location in locations"
              :key="location.id.toString()"
              @click="moveTo(location.id)"
              :disabled="!conn.isActive || location.id === selectedCharacter.locationId"
              :style="styles.ghostButton"
            >
              {{ location.name }}
            </button>
          </div>
        </div>
      </aside>
    </main>

    <footer :style="styles.footer">
      <form @submit.prevent="submitCommand" :style="styles.commandBar">
        <input
          type="text"
          placeholder="Type a command..."
          v-model="commandText"
          :disabled="!conn.isActive || !selectedCharacter"
          :style="styles.commandInput"
        />
        <button
          type="submit"
          :disabled="!conn.isActive || !selectedCharacter || !commandText.trim()"
          :style="styles.primaryButton"
        >
          Send
        </button>
      </form>

      <div :style="styles.actionBar">
        <button @click="togglePanel('character')" :style="actionStyle('character')">
          Character
        </button>
        <button @click="togglePanel('inventory')" :style="actionStyle('inventory')">
          Inventory
        </button>
        <button @click="togglePanel('stats')" :style="actionStyle('stats')">
          Stats
        </button>
        <button @click="togglePanel('travel')" :style="actionStyle('travel')">
          Travel
        </button>
        <button @click="togglePanel('combat')" :style="actionStyle('combat')">
          Combat
        </button>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { tables, reducers } from './module_bindings';
import { useSpacetimeDB, useTable, useReducer } from 'spacetimedb/vue';

const conn = useSpacetimeDB();

const [characters] = useTable(tables.character);
const [locations] = useTable(tables.location);
const [enemyTemplates] = useTable(tables.enemyTemplate);
const [combats] = useTable(tables.combat);
const [eventLog] = useTable(tables.eventLog);

const setDisplayNameReducer = useReducer(reducers.setDisplayName);
const createCharacterReducer = useReducer(reducers.createCharacter);
const moveCharacterReducer = useReducer(reducers.moveCharacter);
const submitCommandReducer = useReducer(reducers.submitCommand);
const startCombatReducer = useReducer(reducers.startCombat);
const attackReducer = useReducer(reducers.attack);
const endCombatReducer = useReducer(reducers.endCombat);

const displayName = ref('');
const newCharacter = ref({ name: '', race: '', className: '' });
const selectedCharacterId = ref('');
const commandText = ref('');
const attackDamage = ref(6);
const activePanel = ref<'none' | 'character' | 'inventory' | 'stats' | 'travel' | 'combat'>(
  'none'
);

const selectedCharacter = computed(() => {
  if (!selectedCharacterId.value) return null;
  const id = BigInt(selectedCharacterId.value);
  return characters.find((row) => row.id === id) ?? null;
});

const currentLocation = computed(() => {
  if (!selectedCharacter.value) return null;
  return locations.find((row) => row.id === selectedCharacter.value?.locationId) ?? null;
});

const activeCombat = computed(() => {
  if (!selectedCharacter.value) return null;
  return (
    combats.find(
      (row) =>
        row.characterId === selectedCharacter.value?.id && row.status === 'active'
    ) ?? null
  );
});

const filteredEvents = computed(() => {
  if (!selectedCharacter.value) return [];
  return [...eventLog]
    .filter((row) => row.characterId === selectedCharacter.value?.id)
    .sort((a, b) => (a.id > b.id ? 1 : -1))
    .slice(-50);
});

const isCharacterFormValid = computed(() =>
  Boolean(
    newCharacter.value.name.trim() &&
      newCharacter.value.race.trim() &&
      newCharacter.value.className.trim()
  )
);

const panelTitle = computed(() => {
  switch (activePanel.value) {
    case 'character':
      return 'Character';
    case 'inventory':
      return 'Inventory';
    case 'stats':
      return 'Stats';
    case 'travel':
      return 'Travel';
    case 'combat':
      return 'Combat';
    default:
      return '';
  }
});

const togglePanel = (panel: typeof activePanel.value) => {
  activePanel.value = activePanel.value === panel ? 'none' : panel;
};

const setDisplayName = () => {
  if (!displayName.value.trim() || !conn.isActive) return;
  setDisplayNameReducer({ name: displayName.value.trim() });
};

const createCharacter = () => {
  if (!conn.isActive || !isCharacterFormValid.value) return;
  createCharacterReducer({
    name: newCharacter.value.name.trim(),
    race: newCharacter.value.race.trim(),
    className: newCharacter.value.className.trim(),
  });
  newCharacter.value = { name: '', race: '', className: '' };
};

const moveTo = (locationId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  moveCharacterReducer({ characterId: selectedCharacter.value.id, locationId });
};

const submitCommand = () => {
  if (!conn.isActive || !selectedCharacter.value || !commandText.value.trim()) return;
  submitCommandReducer({
    characterId: selectedCharacter.value.id,
    text: commandText.value.trim(),
  });
  commandText.value = '';
};

const startCombat = (enemyId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  startCombatReducer({ characterId: selectedCharacter.value.id, enemyId });
};

const attack = () => {
  if (!conn.isActive || !activeCombat.value) return;
  const damage = BigInt(Math.max(1, Number(attackDamage.value)));
  attackReducer({ combatId: activeCombat.value.id, damage });
};

const endCombat = () => {
  if (!conn.isActive || !activeCombat.value) return;
  endCombatReducer({ combatId: activeCombat.value.id, reason: 'fled' });
};

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};

const actionStyle = (panel: typeof activePanel.value) => ({
  ...styles.actionButton,
  ...(activePanel.value === panel ? styles.actionButtonActive : {}),
});

const styles = {
  shell: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(135deg, #0b0c10 0%, #141821 40%, #0d1117 100%)',
    color: '#e6e8ef',
    fontFamily: '"PT Serif", "Georgia", serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1.5rem 2rem',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  headerRight: {
    textAlign: 'right',
  },
  title: {
    fontSize: '1.75rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  subtle: {
    color: 'rgba(230,232,239,0.65)',
    fontSize: '0.9rem',
  },
  statusOnline: {
    color: '#7cf29a',
    marginLeft: '0.4rem',
  },
  statusOffline: {
    color: '#ff7d7d',
    marginLeft: '0.4rem',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr minmax(260px, 320px)',
    gap: '1.5rem',
    padding: '1.5rem 2rem',
  },
  log: {
    background: 'rgba(12, 15, 22, 0.75)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '1.5rem',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  logList: {
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    maxHeight: 'calc(100vh - 320px)',
    paddingRight: '0.5rem',
  },
  logItem: {
    display: 'flex',
    gap: '0.5rem',
    fontFamily: '"Source Code Pro", "Consolas", monospace',
    fontSize: '0.95rem',
  },
  logTime: {
    color: 'rgba(230,232,239,0.5)',
    minWidth: '72px',
  },
  logKind: {
    color: '#8bd3ff',
    textTransform: 'uppercase',
    fontSize: '0.75rem',
    letterSpacing: '0.12em',
    marginTop: '0.15rem',
  },
  logText: {
    flex: 1,
  },
  logEmpty: {
    color: 'rgba(230,232,239,0.6)',
    fontStyle: 'italic',
  },
  panel: {
    background: 'rgba(20,24,33,0.85)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    padding: '1rem',
    minHeight: '320px',
    display: 'flex',
    flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    fontSize: '0.8rem',
  },
  panelClose: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e6e8ef',
    padding: '0.3rem 0.6rem',
    borderRadius: '999px',
    cursor: 'pointer',
  },
  panelBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  panelSectionTitle: {
    fontSize: '0.85rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    color: 'rgba(230,232,239,0.7)',
  },
  panelForm: {
    display: 'grid',
    gap: '0.5rem',
  },
  panelFormInline: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  input: {
    background: '#0b0f16',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#e6e8ef',
    padding: '0.5rem 0.6rem',
    borderRadius: '8px',
  },
  smallInput: {
    background: '#0b0f16',
    border: '1px solid rgba(255,255,255,0.15)',
    color: '#e6e8ef',
    padding: '0.4rem 0.6rem',
    borderRadius: '8px',
    width: '90px',
  },
  list: {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.4rem',
  },
  radioRow: {
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'center',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.5rem 1rem',
    fontSize: '0.95rem',
  },
  buttonWrap: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  primaryButton: {
    background: '#4c7df0',
    border: 'none',
    color: '#0b0f16',
    padding: '0.5rem 0.9rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
  },
  ghostButton: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.25)',
    color: '#e6e8ef',
    padding: '0.4rem 0.8rem',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  footer: {
    padding: '1rem 2rem 1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(8,10,15,0.9)',
  },
  commandBar: {
    display: 'flex',
    gap: '0.75rem',
    marginBottom: '0.75rem',
  },
  commandInput: {
    flex: 1,
    background: '#0b0f16',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e6e8ef',
    padding: '0.7rem 0.8rem',
    borderRadius: '10px',
    fontFamily: '"Source Code Pro", "Consolas", monospace',
  },
  actionBar: {
    display: 'flex',
    gap: '0.6rem',
    flexWrap: 'wrap',
  },
  actionButton: {
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#e6e8ef',
    padding: '0.45rem 0.9rem',
    borderRadius: '999px',
    cursor: 'pointer',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    fontSize: '0.75rem',
  },
  actionButtonActive: {
    background: '#4c7df0',
    color: '#0b0f16',
    border: '1px solid #4c7df0',
  },
};
</script>
