<template>
  <div :style="styles.shell">
    <AppHeader
      :styles="styles"
      :conn-active="conn.isActive"
      :selected-character="selectedCharacter"
      :current-location="currentLocation"
      :is-logged-in="isLoggedIn"
      :logged-in-email="userEmail"
      :auth-message="authMessage"
      :auth-error="authError"
      @login="login"
      @logout="logout"
    />

  <main :style="[styles.main, showRightPanel ? {} : styles.mainWide]">
    <div :style="styles.logStage">
      <div :style="styles.logStack">
        <div :style="styles.logOverlay">
          <div v-if="onboardingHint" :style="styles.onboardingHint">
            <div>{{ onboardingHint }}</div>
            <button type="button" :style="styles.onboardingDismiss" @click="dismissOnboarding">
              Dismiss tour
            </button>
          </div>
          <LogWindow
            :styles="styles"
            :selected-character="selectedCharacter"
            :combined-events="combinedEvents"
            :format-timestamp="formatTimestamp"
          />
        </div>
      </div>
    </div>

    <div
      v-if="selectedCharacter"
      :style="{
        ...styles.hotbarFloating,
        left: `${hotbarPos.x}px`,
        top: `${hotbarPos.y}px`,
      }"
    >
      <div :style="styles.hotbarHandle" @mousedown="startHotbarDrag">Hotbar</div>
      <div :style="styles.hotbarDock">
        <button
          v-for="slot in hotbarDisplay"
          :key="slot.slot"
          type="button"
          :disabled="
            !conn.isActive ||
            !slot.abilityKey ||
            isCasting ||
            slot.cooldownRemaining > 0 ||
            (activeCombat && !canActInCombat && slot.kind !== 'utility')
          "
          :style="[
            styles.hotbarSlot,
            slot.abilityKey === castingState?.castingAbilityKey ? styles.hotbarSlotActive : {},
            hotbarPulseKey === slot.abilityKey ? styles.hotbarSlotActive : {},
            !slot.abilityKey ? styles.hotbarSlotEmpty : {},
          ]"
          @click="slot.abilityKey && onHotbarClick(slot)"
          @mouseenter="
            slot.abilityKey &&
            showTooltip({
              item: hotbarTooltipItem(slot),
              x: $event.currentTarget?.getBoundingClientRect().right ?? $event.clientX,
              y: $event.currentTarget?.getBoundingClientRect().top ?? $event.clientY,
              anchor: 'right',
            })
          "
          @mousemove="slot.abilityKey && moveTooltip({ x: $event.clientX, y: $event.clientY })"
          @mouseleave="slot.abilityKey && hideTooltip()"
        >
          <div
            v-if="isCasting && slot.abilityKey === activeCastKey"
            :style="{
              ...styles.hotbarCastFill,
              width: `${Math.round(castProgress * 100)}%`,
            }"
          ></div>
          <div
            v-if="slot.cooldownRemaining > 0"
            :style="{
              ...styles.hotbarCooldownFill,
              width: `${Math.round(
                (slot.cooldownRemaining / Math.max(1, Number(slot.cooldownSeconds))) * 100
              )}%`,
            }"
          ></div>
          <span v-if="slot.cooldownRemaining > 0" :style="styles.hotbarCooldown">
            {{ slot.cooldownRemaining }}
          </span>
          <span :style="styles.hotbarSlotText">{{ slot.slot }}</span>
          <span :style="styles.hotbarSlotText">{{ slot.name }}</span>
        </button>
      </div>
    </div>

    <div
      v-if="activePanel !== 'none'"
      :style="{
        ...styles.floatingPanel,
        ...(activePanel === 'journal' ||
        activePanel === 'inventory' ||
        activePanel === 'vendor' ||
        activePanel === 'quests' ||
        activePanel === 'crafting' ||
        activePanel === 'stats' ||
        activePanel === 'trade'
          ? styles.floatingPanelWide
          : {}),
        left: `${panelPos.x}px`,
        top: `${panelPos.y}px`,
      }"
    >
        <div :style="styles.floatingPanelHeader" @mousedown="startPanelDrag">
          <div>{{ panelTitle }}</div>
          <button type="button" :style="styles.panelClose" @click="closePanel">
            ×
          </button>
        </div>
        <div :style="styles.floatingPanelBody">
        <CharacterPanel
          v-if="activePanel === 'character'"
          :styles="styles"
          :conn-active="conn.isActive"
          :new-character="newCharacter"
          :is-character-form-valid="isCharacterFormValid"
          :create-error="createError"
          :my-characters="myCharacters"
          :selected-character-id="selectedCharacterId"
          :races="races"
          :selected-race-row="selectedRaceRow"
          :filtered-class-options="filteredClassOptions"
          @update:newCharacter="newCharacter = $event"
          @create="createCharacter"
          @delete="deleteCharacter"
          @select="
            selectedCharacterId = $event;
            activePanel = 'none';
          "
        />
        <InventoryPanel
          v-else-if="activePanel === 'inventory'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :equipped-slots="equippedSlots"
          :inventory-items="inventoryItems"
          :inventory-count="inventoryCount"
          :max-inventory-slots="maxInventorySlots"
          :combat-locked="lockInventoryEdits"
          @equip="equipItem"
          @unequip="unequipItem"
          @use-item="useItem"
          @eat-food="eatFood"
          @delete-item="deleteItem"
          @show-tooltip="showTooltip"
          @move-tooltip="moveTooltip"
          @hide-tooltip="hideTooltip"
        />
        <HotbarPanel
          v-else-if="activePanel === 'hotbar'"
          :styles="styles"
          :selected-character="selectedCharacter"
          :available-abilities="availableAbilities"
          :hotbar="hotbarAssignments"
          :combat-locked="lockHotbarEdits"
          @set-hotbar="setHotbarSlot"
        />
        <FriendsPanel
          v-else-if="activePanel === 'friends'"
          :styles="styles"
          :conn-active="conn.isActive"
          :is-logged-in="isLoggedIn"
          :friend-email="friendEmail"
          :incoming-requests="incomingRequests"
          :outgoing-requests="outgoingRequests"
          :friends="myFriends"
          :email-by-user-id="emailByUserId"
          @update:friendEmail="friendEmail = $event"
          @send-request="sendRequest"
          @accept="acceptRequest"
          @reject="rejectRequest"
          @remove="removeFriend"
        />
        <GroupPanel
          v-else-if="activePanel === 'group'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :current-group="currentGroup"
          :group-members="groupCharacterMembers"
          :character-effects="characterEffects"
          :combat-pets="combatPetsForGroup"
          :invite-summaries="inviteSummaries"
          :leader-id="leaderId"
          :puller-id="pullerId"
          :is-leader="isLeader"
          :follow-leader="followLeader"
          :selected-target-id="defensiveTargetId"
          :now-micros="nowMicros"
          @leave="leaveGroup"
          @accept="acceptInvite"
          @reject="rejectInvite"
          @kick="kickMember"
          @set-puller="setPuller"
          @toggle-follow="setFollowLeader"
          @character-action="openCharacterActions"
        />
        <div v-else-if="activePanel === 'stats'">
          <StatsPanel
            :styles="styles"
            :selected-character="selectedCharacter"
            :stat-bonuses="equippedStatBonuses"
            :locations="locations"
            :regions="regions"
          />
          <HungerBar
            v-if="selectedCharacter"
            :hunger="activeHunger"
            :styles="styles"
            :style="{ marginTop: '1rem' }"
          />
        </div>
        <CraftingPanel
          v-else-if="activePanel === 'crafting'"
          :styles="styles"
          :selected-character="selectedCharacter"
          :crafting-available="currentLocationCraftingAvailable"
          :combat-locked="lockCrafting"
          :recipes="craftingRecipes"
          @research="onResearchRecipes"
          @craft="onCraftRecipe"
        />
        <CharacterActionsPanel
          v-else-if="activePanel === 'characterActions'"
          :styles="styles"
          :target="actionTargetCharacter"
          :is-friend="actionTargetIsFriend"
          :is-in-group="actionTargetInGroup"
          :is-leader="isLeader"
          :target-is-leader="actionTargetIsLeader"
          @invite="inviteToGroup"
          @kick="kickMember"
          @friend="sendFriendRequest"
          @promote="promoteLeader"
          @trade="startTrade"
          @message="sendWhisperTo"
        />
        <TradePanel
          v-else-if="activePanel === 'trade'"
          :styles="styles"
          :trade="activeTrade"
          :inventory="tradeInventory"
          :my-offer="myOffer"
          :other-offer="otherOffer"
          :my-offer-locked="myOfferLocked"
          :other-offer-locked="otherOfferLocked"
          @add-item="addTradeItem"
          @remove-item="removeTradeItem"
          @offer="offerTrade"
          @cancel="cancelTrade"
        />
        <NpcDialogPanel
          v-else-if="activePanel === 'journal'"
          :styles="styles"
          :npc-dialogs="npcDialogs"
          :npcs="npcs"
          :locations="locations"
          :regions="regions"
        />
        <VendorPanel
          v-else-if="activePanel === 'vendor'"
          :styles="styles"
          :selected-character="selectedCharacter"
          :vendor="activeVendor"
          :vendor-items="vendorItems"
          :inventory-items="inventoryItems"
          @buy="buyItem"
          @sell="sellItem"
          @sell-all-junk="sellAllJunk"
          @show-tooltip="showTooltip"
          @move-tooltip="moveTooltip"
          @hide-tooltip="hideTooltip"
        />
        <QuestPanel
          v-else-if="activePanel === 'quests'"
          :styles="styles"
          :quest-instances="questInstances"
          :quest-templates="questTemplates"
          :npcs="npcs"
          :locations="locations"
          :regions="regions"
        />
        <RenownPanel
          v-else-if="activePanel === 'renown'"
          :styles="styles"
          :factions="factions"
          :faction-standings="factionStandings"
          :selected-character="selectedCharacter"
        />
        <TrackPanel
          v-else-if="activePanel === 'track'"
          :styles="styles"
          :options="trackOptions"
          @select="selectTrackedTarget"
        />
        <CombatPanel
          v-else-if="activePanel === 'combat'"
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :characters-here="charactersHere"
          :npcs-here="npcsHere"
          :active-combat="activeCombat"
          :active-enemy-spawn="activeEnemySpawn"
          :active-loot="activeLoot"
          :combat-enemies="combatEnemiesList"
          :enemy-spawns="availableEnemies"
          :resource-nodes="resourceNodesHere"
          :active-result="activeResult"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
          :can-dismiss-results="canDismissResults"
          :can-act="canActInCombat"
          :accordion-state="accordionState"
          @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
          @select-enemy="setCombatTarget"
          @flee="flee"
          @dismiss-results="dismissResults"
          @take-loot="takeLoot"
          @gather-resource="startGather"
          @show-tooltip="showTooltip"
          @move-tooltip="moveTooltip"
          @hide-tooltip="hideTooltip"
          @hail="hailNpc"
          @open-vendor="openVendor"
          @accordion-toggle="updateAccordionState"
            @character-action="openCharacterActions"
        />
        </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        left: `${travelPanelPos.x}px`,
        top: `${travelPanelPos.y}px`,
      }"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startTravelDrag">
        <div :style="styles.panelHeaderStack">
        <div :style="styles.panelHeaderLocationRow">
          <div :style="styles.panelHeaderLocation">{{ currentLocationName }}</div>
          <div
            v-if="currentLocation?.bindStone"
            :style="styles.bindStoneIcon"
            title="Bind here"
            @click="bindLocation"
          ></div>
          <div
            v-if="currentLocation?.craftingAvailable"
            :style="styles.craftingIcon"
            title="Crafting stations available"
          ></div>
        </div>
        <div :style="styles.panelHeaderRegion">
          <span :style="currentRegionConStyle">{{ currentRegionName }}</span>
          <span :style="currentRegionConStyle"> L{{ currentRegionLevel }}</span>
        </div>
        <div :style="styles.panelHeaderTypes">{{ currentTypeLine }}</div>
        </div>
        <div
          :style="[styles.timeIndicator, isNight ? styles.timeIndicatorNight : null]"
          :title="timeTooltip"
        />
      </div>
      <div :style="activeCombat || activeResult ? styles.floatingPanelBodyCombat : styles.floatingPanelBody">
        <template v-if="activeCombat || activeResult">
          <CombatPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
            :characters-here="charactersHere"
            :npcs-here="npcsHere"
            :active-combat="activeCombat"
            :active-enemy-spawn="activeEnemySpawn"
            :active-loot="activeLoot"
            :combat-enemies="combatEnemiesList"
            :enemy-spawns="availableEnemies"
            :resource-nodes="resourceNodesHere"
            :active-result="activeResult"
            :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
            :can-dismiss-results="canDismissResults"
            :can-act="canActInCombat"
            :accordion-state="accordionState"
            @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
            @select-enemy="setCombatTarget"
            @flee="flee"
            @dismiss-results="dismissResults"
            @take-loot="takeLoot"
            @gather-resource="startGather"
            @show-tooltip="showTooltip"
            @move-tooltip="moveTooltip"
            @hide-tooltip="hideTooltip"
            @hail="hailNpc"
            @open-vendor="openVendor"
            @accordion-toggle="updateAccordionState"
            @character-action="openCharacterActions"
          />
        </template>
        <template v-else>
        <details
          :style="styles.accordion"
          :open="accordionState.travel"
          @toggle="onTravelAccordionToggle"
        >
          <summary :style="styles.accordionSummary">Travel</summary>
          <TravelPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
              :locations="connectedLocations"
              :regions="regions"
              @move="moveTo"
            />
          </details>
          <CombatPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
            :characters-here="charactersHere"
            :npcs-here="npcsHere"
            :active-combat="activeCombat"
            :active-enemy-spawn="activeEnemySpawn"
            :active-loot="activeLoot"
            :combat-enemies="combatEnemiesList"
            :enemy-spawns="availableEnemies"
            :resource-nodes="resourceNodesHere"
            :active-result="activeResult"
            :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
            :can-dismiss-results="canDismissResults"
            :can-act="canActInCombat"
            :accordion-state="accordionState"
            @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
            @select-enemy="setCombatTarget"
            @flee="flee"
            @dismiss-results="dismissResults"
            @take-loot="takeLoot"
            @gather-resource="startGather"
            @show-tooltip="showTooltip"
            @move-tooltip="moveTooltip"
            @hide-tooltip="hideTooltip"
            @hail="hailNpc"
            @accordion-toggle="updateAccordionState"
            @character-action="openCharacterActions"
          />
        </template>
      </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelCompact,
        left: `${groupPanelPos.x}px`,
        top: `${groupPanelPos.y}px`,
      }"
    >
      <div
        :style="styles.floatingPanelHeader"
        @mousedown="startGroupDrag"
      >
        Group
      </div>
      <div :style="styles.floatingPanelBody">
        <GroupPanel
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :current-group="currentGroup"
          :group-members="groupCharacterMembers"
          :character-effects="characterEffects"
          :combat-pets="combatPetsForGroup"
          :invite-summaries="inviteSummaries"
          :leader-id="leaderId"
          :puller-id="pullerId"
          :is-leader="isLeader"
          :follow-leader="followLeader"
          :selected-target-id="defensiveTargetId"
          :now-micros="nowMicros"
          @leave="leaveGroup"
          @accept="acceptInvite"
          @reject="rejectInvite"
          @kick="kickMember"
          @set-puller="setPuller"
          @toggle-follow="setFollowLeader"
          @target="setDefensiveTarget"
          @character-action="openCharacterActions"
        />
      </div>
    </div>
  </main>

  <div v-if="showDeathModal" :style="styles.deathOverlay">
    <div :style="styles.deathModal">
      <div :style="styles.deathTitle">You have died.</div>
      <pre :style="styles.deathArt">{{ tombstoneArt }}</pre>
      <button :style="styles.primaryButton" @click="respawnCharacter">Respawn</button>
    </div>
  </div>

    <footer :style="styles.footer">
      <CommandBar
        :styles="styles"
        :conn-active="conn.isActive"
        :has-character="hasCharacter"
        :command-text="commandText"
        @update:commandText="commandText = $event"
        @submit="submitCommand"
      />

    <ActionBar
      :styles="styles"
      :active-panel="activePanel"
      :has-active-character="Boolean(selectedCharacter)"
          :combat-locked="lockHotbarEdits"
      :highlight-inventory="highlightInventory"
      :highlight-hotbar="highlightHotbar"
      @toggle="togglePanel"
    />
    </footer>
    <div
      v-if="tooltip.visible"
      :style="{
        ...styles.tooltip,
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
      }"
    >
      <div :style="styles.tooltipTitle">{{ tooltip.item?.name ?? 'Item' }}</div>
      <div v-if="tooltip.item?.description" :style="styles.tooltipLine">
        {{ tooltip.item.description }}
      </div>
      <div v-if="tooltip.item?.stats?.length" :style="styles.tooltipLine">
        <div v-for="stat in tooltip.item.stats" :key="stat.label">
          {{ stat.label }}: {{ stat.value }}
        </div>
      </div>
      <div v-if="tooltip.item?.allowedClasses && tooltip.item.allowedClasses !== 'any'" :style="styles.tooltipLine">
        Classes: {{ tooltip.item.allowedClasses }}
      </div>
      <div v-if="tooltip.item?.armorType && tooltip.item.armorType !== 'none'" :style="styles.tooltipLine">
        Armor: {{ tooltip.item.armorType.charAt(0).toUpperCase() + tooltip.item.armorType.slice(1) }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useReducer } from 'spacetimedb/vue';
import { styles } from './ui/styles';
import AppHeader from './components/AppHeader.vue';
import LogWindow from './components/LogWindow.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import InventoryPanel from './components/InventoryPanel.vue';
import GroupPanel from './components/GroupPanel.vue';
import FriendsPanel from './components/FriendsPanel.vue';
import StatsPanel from './components/StatsPanel.vue';
import CraftingPanel from './components/CraftingPanel.vue';
import HotbarPanel from './components/HotbarPanel.vue';
import CombatPanel from './components/CombatPanel.vue';
import TravelPanel from './components/TravelPanel.vue';
import CharacterActionsPanel from './components/CharacterActionsPanel.vue';
import TradePanel from './components/TradePanel.vue';
import CommandBar from './components/CommandBar.vue';
import ActionBar from './components/ActionBar.vue';
import NpcDialogPanel from './components/NpcDialogPanel.vue';
import QuestPanel from './components/QuestPanel.vue';
import VendorPanel from './components/VendorPanel.vue';
import TrackPanel from './components/TrackPanel.vue';
import HungerBar from './components/HungerBar.vue';
import RenownPanel from './components/RenownPanel.vue';
import { useGameData } from './composables/useGameData';
import { useCharacters } from './composables/useCharacters';
import { useEvents } from './composables/useEvents';
import { useCharacterCreation } from './composables/useCharacterCreation';
import { useCommands } from './composables/useCommands';
import { useCombat } from './composables/useCombat';
import { useGroups } from './composables/useGroups';
import { useMovement } from './composables/useMovement';
import { usePlayer } from './composables/usePlayer';
import { useAuth } from './composables/useAuth';
import { useFriends } from './composables/useFriends';
import { reducers } from './module_bindings';
import { useInventory } from './composables/useInventory';
import { useCrafting } from './composables/useCrafting';
import { useHotbar } from './composables/useHotbar';
import { useTrade } from './composables/useTrade';
import { useCombatLock } from './composables/useCombatLock';

const {
  conn,
  characters,
  regions,
  locationConnections,
  itemTemplates,
  itemInstances,
  recipeTemplates,
  recipeDiscovered,
  itemCooldowns,
  locations,
  npcs,
  vendorInventory,
  enemyTemplates,
  enemyRoleTemplates,
  enemyAbilities,
  enemySpawns,
  enemySpawnMembers,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatPets,
  combatEnemyEffects,
  combatEnemyCasts,
  aggroEntries,
  combatResults,
  combatLoot,
  groups,
  characterEffects,
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
  players,
  myPlayer,
  users,
  friends,
  friendRequests,
  groupInvites,
  groupMembers: groupMemberRows,
  npcDialogs,
  questTemplates,
  questInstances,
  hotbarSlots,
  abilityTemplates,
  abilityCooldowns,
  characterCasts,
  worldState,
  resourceNodes,
  resourceGathers,
  characterLogoutTicks,
  tradeSessions,
  tradeItems,
  races,
  myHunger,
  factions,
  factionStandings,
} = useGameData();

const { player, userId, userEmail, sessionStartedAt } = usePlayer({ myPlayer, users });

const { isLoggedIn, login, logout, authMessage, authError } = useAuth({
  connActive: computed(() => conn.isActive),
  player,
});

const nowMicros = ref(Date.now() * 1000);
let uiTimer: number | undefined;

const {
  selectedCharacterId,
  myCharacters,
  selectedCharacter,
  currentLocation,
  charactersHere,
  currentGroup,
  groupMembers: groupCharacterMembers,
  deleteCharacter,
  bindLocation,
  respawnCharacter,
} = useCharacters({
  connActive: computed(() => conn.isActive),
  characters,
  locations,
  groups,
  players,
  userId,
  characterLogoutTicks,
  nowMicros,
});

const npcsHere = computed(() => {
  if (!currentLocation.value) return [];
  const locationId = currentLocation.value.id.toString();
  return npcs.value.filter((npc) => npc.locationId.toString() === locationId);
});

const activeVendorId = ref<bigint | null>(null);
const activeVendor = computed(() => {
  if (!activeVendorId.value) return null;
  return npcs.value.find((npc) => npc.id.toString() === activeVendorId.value?.toString()) ?? null;
});
const vendorItems = computed(() => {
  if (!activeVendorId.value) return [];
  return vendorInventory.value
    .filter((row) => row.npcId.toString() === activeVendorId.value?.toString())
    .map((row) => {
      const template = itemTemplates.value.find(
        (item) => item.id.toString() === row.itemTemplateId.toString()
      );
      const description =
        [
          template?.rarity,
          template?.armorType,
          template?.slot,
          template?.tier ? `Tier ${template.tier}` : null,
        ]
          .filter((value) => value && value.length > 0)
          .join(' • ') ?? '';
      const stats = [
        template?.armorClassBonus ? { label: 'Armor Class', value: `+${template.armorClassBonus}` } : null,
        template?.weaponBaseDamage ? { label: 'Weapon Damage', value: `${template.weaponBaseDamage}` } : null,
        template?.weaponDps ? { label: 'Weapon DPS', value: `${template.weaponDps}` } : null,
        template?.strBonus ? { label: 'STR', value: `+${template.strBonus}` } : null,
        template?.dexBonus ? { label: 'DEX', value: `+${template.dexBonus}` } : null,
        template?.chaBonus ? { label: 'CHA', value: `+${template.chaBonus}` } : null,
        template?.wisBonus ? { label: 'WIS', value: `+${template.wisBonus}` } : null,
        template?.intBonus ? { label: 'INT', value: `+${template.intBonus}` } : null,
        template?.hpBonus ? { label: 'HP', value: `+${template.hpBonus}` } : null,
        template?.manaBonus ? { label: 'Mana', value: `+${template.manaBonus}` } : null,
        row.price ? { label: 'Price', value: `${row.price} gold` } : null,
      ].filter(Boolean) as { label: string; value: string }[];
      return {
        id: row.id,
        templateId: row.itemTemplateId,
        price: row.price,
        name: template?.name ?? 'Unknown',
        rarity: template?.rarity ?? 'Common',
        tier: template?.tier ?? 1n,
        slot: template?.slot ?? 'misc',
        armorType: template?.armorType ?? 'none',
        allowedClasses: template?.allowedClasses ?? 'any',
        description,
        stats,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

const fallbackCombatRoster = computed(() => {
  if (currentGroup.value) return groupCharacterMembers.value;
  return selectedCharacter.value ? [selectedCharacter.value] : [];
});

const { combinedEvents, addLocalEvent } = useEvents({
  worldEvents,
  locationEvents,
  privateEvents,
  groupEvents,
  sessionStartedAt,
});

const {
  newCharacter,
  isCharacterFormValid,
  createCharacter,
  hasCharacter,
  createError,
  creationToken,
  selectedRaceRow,
  filteredClassOptions,
} = useCharacterCreation({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    selectedCharacterId,
    userId,
    characters,
    races,
  });

const onboardingStep = ref<'inventory' | 'hotbar' | null>(null);
const onboardingHint = computed(() => {
  if (onboardingStep.value === 'inventory') {
    return 'New character created! Open Inventory to equip your starter gear.';
  }
  if (onboardingStep.value === 'hotbar') {
    return 'Next, open Hotbar to assign your abilities.';
  }
  return '';
});
const highlightInventory = computed(() => onboardingStep.value === 'inventory');
const highlightHotbar = computed(() => onboardingStep.value === 'hotbar');
const dismissOnboarding = () => {
  onboardingStep.value = null;
};

watch(
  () => creationToken.value,
  (token, prev) => {
    if (token && token !== prev) {
      onboardingStep.value = 'inventory';
    }
  }
);

const worldStateRow = computed(() => worldState.value[0] ?? null);
const isNight = computed(() => worldStateRow.value?.isNight ?? false);
const timeIconLabel = computed(() => (isNight.value ? 'Moon' : 'Sun'));
const timeTooltip = computed(() => {
  const nextAt = worldStateRow.value?.nextTransitionAtMicros ?? 0n;
  const remainingMicros = Number(nextAt) - nowMicros.value;
  const remainingSeconds = Math.max(0, Math.floor(remainingMicros / 1_000_000));
  const minutes = Math.floor(remainingSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
  return `${isNight.value ? 'Nighttime' : 'Daytime'} · ${minutes}:${seconds} remaining`;
});

const trackOptions = computed(() => {
  if (!currentLocation.value) return [];
  const terrain = (currentLocation.value.terrainType ?? '').trim().toLowerCase();
  if (!terrain) return [];
  return enemyTemplates.value
    .filter((template) => {
      const allowed = (template.terrainTypes ?? '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0);
      if (allowed.length === 0) return true;
      return allowed.includes(terrain);
    })
    .filter((template) => {
      const pref = (template.timeOfDay ?? '').trim().toLowerCase();
      if (!pref || pref === 'any') return true;
      return isNight.value ? pref === 'night' : pref === 'day';
    })
    .sort((a, b) => (a.name > b.name ? 1 : a.name < b.name ? -1 : 0));
});


const {
  activeCombat,
  activeEnemy,
  activeEnemySpawn,
  combatEnemiesList,
  availableEnemies,
  combatRoster,
  activeResult,
  activeLoot,
  hasAnyLootForResult,
  hasOtherLootForResult,
  startCombat,
  startPull,
  startTrackedCombat,
  setCombatTarget,
  flee,
  dismissResults,
  takeLoot,
} = useCombat({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  combatPets,
  combatEnemyEffects,
  combatEnemyCasts,
  combatLoot,
  itemTemplates,
  combatResults,
  fallbackRoster: fallbackCombatRoster,
  enemySpawns,
  enemyTemplates,
  enemyRoleTemplates,
  enemySpawnMembers,
  enemyAbilities,
  nowMicros,
  characters,
  factions,
});

const {
  canActInCombat,
  combatLocked,
  lockInventoryEdits,
  lockHotbarEdits,
  lockCrafting,
} = useCombatLock({
  selectedCharacter,
  activeCombat,
  activeResult,
  combatRoster,
});

const showDeathModal = computed(() => {
  return Boolean(selectedCharacter.value && selectedCharacter.value.hp === 0n && !activeCombat.value);
});
const tombstoneArt = ` _____
 /     \\\\
 |  RIP ||
 |      ||
 |______||`;

const combatPetsForGroup = computed(() => {
  if (!activeCombat.value) return [];
  const combatId = activeCombat.value.id.toString();
  return combatPets.value.filter((pet) => pet.combatId.toString() === combatId);
});

const lastResultId = ref<string | null>(null);
const lastLevelUpEventId = ref<string | null>(null);
const lastAutoDismissCombatId = ref<string | null>(null);
const audioCtxRef = ref<AudioContext | null>(null);

const getAudioContext = () => {
  if (!audioCtxRef.value) {
    audioCtxRef.value = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtxRef.value;
};

const playTone = (
  frequency: number,
  durationMs: number,
  startAt: number,
  envelope: { start: number; end: number }
) => {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(envelope.start, now + startAt);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, envelope.end),
    now + startAt + durationMs / 1000
  );
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now + startAt);
  osc.stop(now + startAt + durationMs / 1000);
};

const playVictorySound = () => {
  playTone(392, 160, 0, { start: 0.18, end: 0.03 });
  playTone(494, 160, 0.18, { start: 0.18, end: 0.03 });
  playTone(587, 520, 0.36, { start: 0.2, end: 0.008 });
};

const playDefeatSound = () => {
  playTone(330, 220, 0, { start: 0.12, end: 0.02 });
  playTone(262, 240, 0.25, { start: 0.12, end: 0.02 });
  playTone(196, 260, 0.55, { start: 0.12, end: 0.02 });
};

const playLevelUpSound = () => {
  playTone(880, 900, 0, { start: 0.16, end: 0.005 });
  playTone(1100, 700, 0.08, { start: 0.12, end: 0.004 });
};

watch(
  () => activeResult.value,
  (result) => {
    if (!result) return;
    const id = result.id.toString();
    if (lastResultId.value === id) return;
    lastResultId.value = id;
    const summary = result.summary.toLowerCase();
    if (summary.startsWith('victory')) {
      playVictorySound();
    } else if (summary.startsWith('defeat')) {
      playDefeatSound();
    }
  }
);


watch(
  () => combinedEvents.value,
  (events) => {
    if (!events || events.length === 0) return;
    const last = events[events.length - 1];
    const id = last.id.toString();
    if (lastLevelUpEventId.value === id) return;
    if (last.kind === 'system' && /you reached level/i.test(last.message)) {
      lastLevelUpEventId.value = id;
      playLevelUpSound();
    }
  },
  { deep: true }
);

onBeforeUnmount(() => {
  if (audioCtxRef.value) {
    audioCtxRef.value.close();
  }
});

const {
  leaveGroup,
  inviteSummaries,
  acceptInvite,
  rejectInvite,
  leaderId,
  pullerId,
  isLeader,
  kickMember,
  promoteLeader,
  setPuller,
  followLeader,
  setFollowLeader,
} = useGroups({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  groups,
  groupInvites,
  characters,
  groupMembers: groupMemberRows,
});

const canDismissResults = computed(
  () => Boolean(selectedCharacter.value && (!selectedCharacter.value.groupId || isLeader.value))
);

watch(
  () => [activeResult.value, hasAnyLootForResult.value, canDismissResults.value] as const,
  ([result, anyLoot, canDismiss]) => {
    if (!result || !canDismiss) return;
    // In groups, this client only sees `myCombatLoot`; server handles authoritative
    // auto-dismiss when combat-wide loot is actually empty.
    if (selectedCharacter.value?.groupId) return;
    if (anyLoot) return;
    const summary = result.summary?.toLowerCase() ?? '';
    if (!summary.startsWith('victory')) return;
    const id = result.id.toString();
    if (lastAutoDismissCombatId.value === id) return;
    lastAutoDismissCombatId.value = id;
    dismissResults();
  }
);

const { commandText, submitCommand } = useCommands({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  inviteSummaries,
  npcsHere,
  onNpcHail: (npc) => {
    if (npc.npcType === 'vendor') {
      activePanel.value = 'vendor';
      activeVendorId.value = npc.id;
    }
  },
});

const openCharacterActions = (characterId: bigint) => {
  actionTargetCharacterId.value = characterId;
  activePanel.value = 'characterActions';
};

const inviteToGroup = (targetName: string) => {
  if (!selectedCharacter.value || !conn.isActive) return;
  inviteToGroupReducer({ characterId: selectedCharacter.value.id, targetName });
};

const sendFriendRequest = (targetName: string) => {
  if (!selectedCharacter.value || !conn.isActive) return;
  friendRequestReducer({ characterId: selectedCharacter.value.id, targetName });
};

const sendWhisperTo = (targetName: string) => {
  commandText.value = `/w ${targetName} `;
};

const closePanel = () => {
  if (activePanel.value === 'trade') {
    cancelTrade();
  }
  activePanel.value = 'none';
};

const openVendor = (npcId: bigint) => {
  activePanel.value = 'vendor';
  activeVendorId.value = npcId;
};

const buyItem = (itemTemplateId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value || !activeVendorId.value) return;
  buyReducer({
    characterId: selectedCharacter.value.id,
    npcId: activeVendorId.value,
    itemTemplateId,
  });
};

const sellItem = (itemInstanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  sellReducer({
    characterId: selectedCharacter.value.id,
    itemInstanceId,
  });
};

const sellAllJunk = () => {
  if (!conn.isActive || !selectedCharacter.value) return;
  sellAllReducer({ characterId: selectedCharacter.value.id });
};

const hailNpcReducer = useReducer(reducers.hailNpc);
const hailNpc = (npcName: string) => {
  if (!selectedCharacter.value) return;
  const npc = npcsHere.value.find((row) => row.name === npcName);
  if (npc?.npcType === 'vendor') {
    openVendor(npc.id);
  }
  hailNpcReducer({ characterId: selectedCharacter.value.id, npcName });
};

const {
  friendEmail,
  incomingRequests,
  outgoingRequests,
  myFriends,
  emailByUserId,
  sendRequest,
  acceptRequest,
  rejectRequest,
  removeFriend,
} = useFriends({
  connActive: computed(() => conn.isActive),
  userId,
  friends,
  friendRequests,
  users,
});

const { moveTo } = useMovement({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
});

const connectedLocations = computed(() => {
  if (!selectedCharacter.value) return [];
  const currentId = selectedCharacter.value.locationId.toString();
  const connectedIds = new Set(
    locationConnections.value
      .filter((row) => row.fromLocationId.toString() === currentId)
      .map((row) => row.toLocationId.toString())
  );
  return locations.value.filter((loc) => connectedIds.has(loc.id.toString()));
});

const activeEnemyTargetName = computed(() => {
  if (!activeCombat.value) return '';
  const combatId = activeCombat.value.id.toString();
  const activeIds = new Set(
    combatParticipants.value
      .filter((row) => row.combatId.toString() === combatId && row.status === 'active')
      .map((row) => row.characterId.toString())
  );
  if (!activeIds.size) return '';
  let topEntry: (typeof aggroEntries.value)[number] | null = null;
  for (const entry of aggroEntries.value) {
    if (entry.combatId.toString() !== combatId) continue;
    if (!activeIds.has(entry.characterId.toString())) continue;
    if (!topEntry || entry.value > topEntry.value) topEntry = entry;
  }
  if (topEntry) {
    const target = characters.value.find(
      (row) => row.id.toString() === topEntry!.characterId.toString()
    );
    return target?.name ?? '';
  }
  const fallback = combatParticipants.value.find(
    (row) => row.combatId.toString() === combatId && row.status === 'active'
  );
  if (!fallback) return '';
  const target = characters.value.find((row) => row.id.toString() === fallback.characterId.toString());
  return target?.name ?? '';
});

const currentRegionName = computed(() => {
  if (!currentLocation.value) return 'Unknown Region';
  const region = regions.value.find(
    (row) => row.id.toString() === currentLocation.value?.regionId.toString()
  );
  return region?.name ?? 'Unknown Region';
});

const currentLocationName = computed(() => {
  if (!currentLocation.value) return 'Unknown';
  return currentLocation.value.name ?? 'Unknown';
});

const conStyleForDiff = (diff: number) => {
  if (diff <= -5) return styles.conGray;
  if (diff <= -3) return styles.conLightGreen;
  if (diff <= -1) return styles.conBlue;
  if (diff === 0) return styles.conWhite;
  if (diff <= 2) return styles.conYellow;
  if (diff <= 4) return styles.conOrange;
  return styles.conRed;
};

const currentRegionLevel = computed(() => {
  if (!currentLocation.value) return 1;
  const region = regions.value.find(
    (row) => row.id.toString() === currentLocation.value?.regionId.toString()
  );
  if (!region) return 1;
  const multiplier = Number(region.dangerMultiplier ?? 100n);
  const scaled = Math.floor((1 * multiplier) / 100);
  const offset = Number(currentLocation.value.levelOffset ?? 0n);
  return Math.max(1, scaled + offset);
});

const currentRegionConStyle = computed(() => {
  if (!selectedCharacter.value) return styles.conWhite;
  const diff = currentRegionLevel.value - Number(selectedCharacter.value.level);
  return conStyleForDiff(diff);
});

const currentTypeLine = computed(() => {
  if (!currentLocation.value) return 'Unknown Region · Unknown Location';
  const region = regions.value.find(
    (row) => row.id.toString() === currentLocation.value?.regionId.toString()
  );
  const regionType = region?.regionType
    ? `${region.regionType[0].toUpperCase()}${region.regionType.slice(1)}`
    : 'Unknown';
  const locationType = currentLocation.value.terrainType
    ? `${currentLocation.value.terrainType[0].toUpperCase()}${currentLocation.value.terrainType.slice(1)}`
    : 'Unknown';
  return `${regionType} · ${locationType}`;
});

const { equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, equipItem, unequipItem, useItem } =
  useInventory({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    itemInstances,
    itemTemplates,
  });

const deleteItem = (itemInstanceId: bigint) => {
  if (!selectedCharacter.value || !conn.isActive) return;
  if (!window.confirm('Delete this item? This cannot be undone.')) return;
  deleteItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
};

const startGatherReducer = useReducer(reducers.startGatherResource);
const deleteItemReducer = useReducer(reducers.deleteItem);
const inviteToGroupReducer = useReducer(reducers.inviteToGroup);
const friendRequestReducer = useReducer(reducers.sendFriendRequestToCharacter);

const { recipes: craftingRecipes, research: researchRecipes, craft: craftRecipe } = useCrafting({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  itemInstances,
  itemTemplates,
  recipeTemplates,
  recipeDiscovered,
});

const onResearchRecipes = () => {
  if (lockCrafting.value) return;
  researchRecipes();
};

const onCraftRecipe = (recipeId: bigint) => {
  if (lockCrafting.value) return;
  craftRecipe(recipeId);
};

const actionTargetCharacterId = ref<bigint | null>(null);
const actionTargetCharacter = computed(() => {
  if (!actionTargetCharacterId.value) return null;
  return characters.value.find(
    (row) => row.id.toString() === actionTargetCharacterId.value?.toString()
  ) ?? null;
});
const actionTargetIsFriend = computed(() => {
  if (!actionTargetCharacter.value) return false;
  return friends.value.some(
    (row) => row.friendUserId === actionTargetCharacter.value?.ownerUserId
  );
});
const actionTargetInGroup = computed(() => {
  if (!actionTargetCharacter.value) return false;
  if (!currentGroup.value) return false;
  return groupCharacterMembers.value.some(
    (row) => row.id.toString() === actionTargetCharacter.value?.id.toString()
  );
});
const actionTargetIsLeader = computed(() => {
  if (!actionTargetCharacter.value || !leaderId.value) return false;
  return actionTargetCharacter.value.id.toString() === leaderId.value.toString();
});

const tradeOtherCharacter = computed(() => {
  if (!otherCharacterId.value) return null;
  return characters.value.find(
    (row) => row.id.toString() === otherCharacterId.value?.toString()
  ) ?? null;
});

const {
  activeTrade,
  otherCharacterId,
  myItems: tradeInventory,
  myOffer,
  otherOffer,
  myOfferLocked,
  otherOfferLocked,
  startTrade,
  addItem: addTradeItem,
  removeItem: removeTradeItem,
  offerTrade,
  cancelTrade,
} = useTrade({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  itemInstances,
  itemTemplates,
  tradeSessions,
  tradeItems,
});

watch(
  () => activeTrade.value,
  (trade) => {
    if (trade) {
      activePanel.value = 'trade';
    } else if (activePanel.value === 'trade') {
      activePanel.value = 'none';
    }
  }
);

const currentLocationCraftingAvailable = computed(
  () => currentLocation.value?.craftingAvailable ?? false
);

const activeResourceGather = computed(() => {
  if (!selectedCharacter.value) return null;
  return resourceGathers.value.find(
    (row) => row.characterId.toString() === selectedCharacter.value?.id.toString()
  );
});

const resourceNodesHere = computed(() => {
  if (!currentLocation.value) return [];
  const gather = activeResourceGather.value;
  const now = nowMicros.value;
  return resourceNodes.value
    .filter((node) => node.locationId.toString() === currentLocation.value?.id.toString())
    .filter((node) => node.state === 'available' || node.state === 'harvesting')
    .map((node) => {
      const local = localGather.value?.nodeId?.toString() === node.id.toString();
      const isGathering = local || gather?.nodeId?.toString() === node.id.toString();
      const castMicros = 8_000_000;
      const endsAt = local
        ? localGather.value!.startMicros + castMicros
        : isGathering
          ? Number(gather?.endsAtMicros ?? 0n)
          : 0;
      const startAt = endsAt - castMicros;
      const progress =
        isGathering && castMicros > 0
          ? Math.max(0, Math.min(1, (now - startAt) / castMicros))
          : 0;
      const respawnSeconds =
        node.respawnAtMicros != null
          ? Math.max(0, Math.ceil((Number(node.respawnAtMicros) - now) / 1_000_000))
          : null;
      return {
        id: node.id,
        name: node.name,
        quantity: node.quantity,
        state: node.state,
        timeOfDay: node.timeOfDay,
        isGathering,
        progress,
        respawnSeconds,
      };
    });
});

const startGather = (nodeId: bigint) => {
  if (!selectedCharacter.value || !conn.isActive) return;
  localGather.value = {
    nodeId,
    startMicros: nowMicros.value,
    durationMicros: 8_000_000,
  };
  startGatherReducer({ characterId: selectedCharacter.value.id, nodeId });
};

const buyReducer = useReducer(reducers.buyItem);
const sellReducer = useReducer(reducers.sellItem);
const sellAllReducer = useReducer(reducers.sellAllJunk);

const defensiveTargetId = ref<bigint | null>(null);
const setDefensiveTarget = (characterId: bigint) => {
  defensiveTargetId.value = characterId;
};

const {
  hotbarAssignments,
  availableAbilities,
  hotbarDisplay,
  hotbarTooltipItem,
  setHotbarSlot,
  useAbility,
  onHotbarClick,
  hotbarPulseKey,
  castingState,
  activeCastKey,
  isCasting,
  castProgress,
} = useHotbar({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  hotbarSlots,
  abilityTemplates,
  abilityCooldowns,
  characterCasts,
  nowMicros,
  activeCombat,
  canActInCombat,
  defensiveTargetId,
  onTrackRequested: () => {
    activePanel.value = 'track';
  },
  addLocalEvent,
});

const activeHunger = computed(() => {
  if (!selectedCharacter.value || !myHunger.value.length) return null;
  return myHunger.value.find(
    (h: any) => h.characterId.toString() === selectedCharacter.value?.id.toString()
  ) ?? null;
});

const eatFoodReducer = useReducer(reducers.eatFood);
const eatFood = (itemInstanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  eatFoodReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
};

const equippedStatBonuses = computed(() => {
  if (!selectedCharacter.value) {
    return { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
  }
  const bonus = { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
  for (const instance of itemInstances.value) {
    if (instance.ownerCharacterId.toString() !== selectedCharacter.value.id.toString()) continue;
    if (!instance.equippedSlot) continue;
    const template = itemTemplates.value.find(
      (row) => row.id.toString() === instance.templateId.toString()
    );
    if (!template) continue;
    bonus.str += template.strBonus ?? 0n;
    bonus.dex += template.dexBonus ?? 0n;
    bonus.cha += template.chaBonus ?? 0n;
    bonus.wis += template.wisBonus ?? 0n;
    bonus.int += template.intBonus ?? 0n;
  }
  return bonus;
});


const selectTrackedTarget = (templateId: bigint) => {
  if (!selectedCharacter.value) return;
  useAbility('ranger_track', selectedCharacter.value.id);
  startTrackedCombat(templateId);
  activePanel.value = 'none';
};

const offensiveTargetEnemyId = ref<bigint | null>(null);
watch(
  () => activeEnemy.value?.id,
  (id) => {
    if (id != null) offensiveTargetEnemyId.value = id;
  },
  { immediate: true }
);

const activePanel = ref<
  | 'none'
  | 'character'
  | 'inventory'
  | 'hotbar'
  | 'friends'
  | 'group'
  | 'stats'
  | 'crafting'
  | 'journal'
  | 'quests'
  | 'renown'
  | 'vendor'
  | 'characterActions'
  | 'trade'
  | 'track'
  | 'travel'
  | 'combat'
>('none');

type AccordionKey = 'travel' | 'enemies' | 'resources' | 'characters' | 'npcs';

const accordionState = reactive<Record<AccordionKey, boolean>>({
  travel: true,
  enemies: true,
  resources: true,
  characters: true,
  npcs: true,
});

const loadAccordionState = () => {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem('accordionState');
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<AccordionKey, boolean>>;
    (Object.keys(accordionState) as AccordionKey[]).forEach((key) => {
      if (typeof parsed[key] === 'boolean') {
        accordionState[key] = parsed[key] as boolean;
      }
    });
  } catch {
    // ignore malformed state
  }
};

const persistAccordionState = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem('accordionState', JSON.stringify(accordionState));
};

const updateAccordionState = (payload: { key: AccordionKey; open: boolean }) => {
  accordionState[payload.key] = payload.open;
  persistAccordionState();
};

const onTravelAccordionToggle = (event: Event) => {
  const target = event.target as HTMLDetailsElement | null;
  if (!target) return;
  updateAccordionState({ key: 'travel', open: target.open });
};

watch(
  () => activePanel.value,
  (panel) => {
    if (onboardingStep.value === 'inventory' && panel === 'inventory') {
      onboardingStep.value = 'hotbar';
    } else if (onboardingStep.value === 'hotbar' && panel === 'hotbar') {
      onboardingStep.value = null;
    }
  }
);

onMounted(() => {
  loadAccordionState();
});

const showCombatStack = computed(() => combatLocked.value);
const showRightPanel = computed(() => false);

const localGather = ref<{ nodeId: bigint; startMicros: number; durationMicros: number } | null>(
  null
);

watch(
  () => selectedCharacter.value?.id,
  (id) => {
    if (id) defensiveTargetId.value = id;
    localGather.value = null;
  },
  { immediate: true }
);

watch(
  () => nowMicros.value,
  (now) => {
    if (localGather.value && now - localGather.value.startMicros >= localGather.value.durationMicros) {
      localGather.value = null;
    }
  }
);

const tooltip = ref<{
  visible: boolean;
  x: number;
  y: number;
  item: any | null;
  anchor: 'cursor' | 'right';
}>({
  visible: false,
  x: 0,
  y: 0,
  item: null,
  anchor: 'cursor',
});

const groupPanelPos = ref({ x: 40, y: 140 });
const panelPos = ref({ x: 980, y: 140 });
const travelPanelPos = ref({ x: 1040, y: 110 });
const hotbarPos = ref({ x: 120, y: 260 });

const groupDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const panelDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const travelDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const hotbarDrag = ref<{ active: boolean; offsetX: number; offsetY: number }>({
  active: false,
  offsetX: 0,
  offsetY: 0,
});
const startGroupDrag = (event: MouseEvent) => {
  groupDrag.value = {
    active: true,
    offsetX: event.clientX - groupPanelPos.value.x,
    offsetY: event.clientY - groupPanelPos.value.y,
  };
};
const startPanelDrag = (event: MouseEvent) => {
  panelDrag.value = {
    active: true,
    offsetX: event.clientX - panelPos.value.x,
    offsetY: event.clientY - panelPos.value.y,
  };
};
const startTravelDrag = (event: MouseEvent) => {
  travelDrag.value = {
    active: true,
    offsetX: event.clientX - travelPanelPos.value.x,
    offsetY: event.clientY - travelPanelPos.value.y,
  };
};
const startHotbarDrag = (event: MouseEvent) => {
  hotbarDrag.value = {
    active: true,
    offsetX: event.clientX - hotbarPos.value.x,
    offsetY: event.clientY - hotbarPos.value.y,
  };
};

const onGroupDrag = (event: MouseEvent) => {
  if (!groupDrag.value.active) return;
  groupPanelPos.value = {
    x: Math.max(16, event.clientX - groupDrag.value.offsetX),
    y: Math.max(16, event.clientY - groupDrag.value.offsetY),
  };
};
const onPanelDrag = (event: MouseEvent) => {
  if (!panelDrag.value.active) return;
  panelPos.value = {
    x: Math.max(16, event.clientX - panelDrag.value.offsetX),
    y: Math.max(16, event.clientY - panelDrag.value.offsetY),
  };
};
const onTravelDrag = (event: MouseEvent) => {
  if (!travelDrag.value.active) return;
  travelPanelPos.value = {
    x: Math.max(16, event.clientX - travelDrag.value.offsetX),
    y: Math.max(16, event.clientY - travelDrag.value.offsetY),
  };
};
const onHotbarDrag = (event: MouseEvent) => {
  if (!hotbarDrag.value.active) return;
  hotbarPos.value = {
    x: Math.max(16, event.clientX - hotbarDrag.value.offsetX),
    y: Math.max(16, event.clientY - hotbarDrag.value.offsetY),
  };
};

const stopGroupDrag = () => {
  if (!groupDrag.value.active) return;
  groupDrag.value.active = false;
};
const stopPanelDrag = () => {
  if (!panelDrag.value.active) return;
  panelDrag.value.active = false;
};
const stopTravelDrag = () => {
  if (!travelDrag.value.active) return;
  travelDrag.value.active = false;
};
const stopHotbarDrag = () => {
  if (!hotbarDrag.value.active) return;
  hotbarDrag.value.active = false;
};

onMounted(() => {
  const saved = window.localStorage.getItem('uwr.windowPositions');
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as {
        group?: { x: number; y: number };
        panel?: { x: number; y: number };
        travel?: { x: number; y: number };
        hotbar?: { x: number; y: number };
      };
      if (parsed.group) groupPanelPos.value = parsed.group;
      if (parsed.panel) panelPos.value = parsed.panel;
      if (parsed.travel) travelPanelPos.value = parsed.travel;
      if (parsed.hotbar) hotbarPos.value = parsed.hotbar;
    } catch {
      // ignore invalid storage
    }
  }
  window.addEventListener('mousemove', onGroupDrag);
  window.addEventListener('mousemove', onPanelDrag);
  window.addEventListener('mousemove', onTravelDrag);
  window.addEventListener('mousemove', onHotbarDrag);
  window.addEventListener('mouseup', stopGroupDrag);
  window.addEventListener('mouseup', stopPanelDrag);
  window.addEventListener('mouseup', stopTravelDrag);
  window.addEventListener('mouseup', stopHotbarDrag);
  uiTimer = window.setInterval(() => {
    nowMicros.value = Date.now() * 1000;
  }, 200);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onGroupDrag);
  window.removeEventListener('mousemove', onPanelDrag);
  window.removeEventListener('mousemove', onTravelDrag);
  window.removeEventListener('mousemove', onHotbarDrag);
  window.removeEventListener('mouseup', stopGroupDrag);
  window.removeEventListener('mouseup', stopPanelDrag);
  window.removeEventListener('mouseup', stopTravelDrag);
  window.removeEventListener('mouseup', stopHotbarDrag);
  if (uiTimer) clearInterval(uiTimer);
});

watch(
  [groupPanelPos, panelPos, travelPanelPos, hotbarPos],
  () => {
    window.localStorage.setItem(
      'uwr.windowPositions',
      JSON.stringify({
        group: groupPanelPos.value,
        panel: panelPos.value,
        travel: travelPanelPos.value,
        hotbar: hotbarPos.value,
      })
    );
  },
  { deep: true }
);

const showTooltip = (payload: {
  item: any;
  x: number;
  y: number;
  anchor?: 'cursor' | 'right';
}) => {
  const anchor = payload.anchor ?? 'cursor';
  const offsetX = 12;
  const offsetY = anchor === 'right' ? 0 : 12;
  tooltip.value = {
    visible: true,
    x: payload.x + offsetX,
    y: payload.y + offsetY,
    item: payload.item,
    anchor,
  };
};

const moveTooltip = (payload: { x: number; y: number }) => {
  if (!tooltip.value.visible || tooltip.value.anchor === 'right') return;
  tooltip.value = { ...tooltip.value, x: payload.x + 12, y: payload.y + 12 };
};

const hideTooltip = () => {
  tooltip.value = { visible: false, x: 0, y: 0, item: null, anchor: 'cursor' };
};

const panelTitle = computed(() => {
  switch (activePanel.value) {
    case 'character':
      return 'Characters';
    case 'inventory':
      return 'Inventory';
    case 'hotbar':
      return 'Hotbar';
    case 'friends':
      return 'Friends';
    case 'group':
      return 'Group';
    case 'stats':
      return 'Stats';
    case 'crafting':
      return 'Crafting';
    case 'journal':
      return 'Journal';
    case 'quests':
      return 'Quests';
    case 'renown':
      return 'Renown';
    case 'vendor':
      return activeVendor.value?.name ?? 'Vendor';
    case 'characterActions':
      if (!actionTargetCharacter.value) return 'Actions';
      return `${actionTargetCharacter.value.name} · ${actionTargetCharacter.value.className} Lv ${actionTargetCharacter.value.level}`;
    case 'trade':
      return 'Trade';
    case 'track':
      return 'Track';
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

watch(
  [() => isLoggedIn.value, () => player.value?.activeCharacterId],
  ([loggedIn, activeId]) => {
    if (!loggedIn) {
      selectedCharacterId.value = '';
      activePanel.value = 'none';
      return;
    }
    if (activeId && !selectedCharacterId.value) {
      selectedCharacterId.value = activeId.toString();
      activePanel.value = 'none';
      return;
    }
    if (!activeId) {
      activePanel.value = 'character';
    }
  }
);

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};
</script>

<style>
@keyframes combatPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 80, 80, 0.35);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(255, 80, 80, 0.18);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(255, 80, 80, 0.35);
  }
}
</style>

