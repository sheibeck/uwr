<template>
  <!-- State 1: Unauthenticated — show splash -->
  <SplashScreen
    v-if="!isLoggedIn && !isPendingLogin"
    :styles="styles"
    :conn-active="conn.isActive"
    :auth-message="authMessage"
    :auth-error="authError"
    @login="login"
  />

  <!-- State 2: Authenticated but waiting for data — show loading -->
  <div v-else-if="isPendingLogin" :style="styles.loadingOverlay">
    <div :style="styles.loadingText">Entering the realm...</div>
  </div>

  <!-- State 3: Fully loaded — show game -->
  <div v-else :style="styles.shell">
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

  <!-- Character Select Screen: shown when logged in but no character selected -->
  <div v-if="!selectedCharacter" :style="styles.charSelectScreen">
    <div :style="styles.charSelectTitle">Select Your Character</div>
    <div :style="styles.charSelectContent">
      <CharacterPanel
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
        @select="selectedCharacterId = $event"
      />
    </div>
  </div>

  <!-- Game World: shown only after a character is selected -->
  <main v-else :style="[styles.main, showRightPanel ? {} : styles.mainWide]">
    <!-- Onboarding hint -->
    <div v-if="onboardingHint" :style="styles.onboardingHint">
      <div>{{ onboardingHint }}</div>
      <button type="button" :style="styles.onboardingDismiss" @click="dismissOnboarding">
        Dismiss tour
      </button>
    </div>

    <!-- Log Panel (floating) -->
    <div
      data-panel-id="log"
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelWide,
        ...panelStyle('log').value,
      }"
      @mousedown="bringToFront('log')"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('log', $event)">
        <div>Log</div>
      </div>
      <div :style="{ ...styles.floatingPanelBody, flex: 1, minHeight: 0, overflow: 'auto' }">
        <LogWindow
          :styles="styles"
          :selected-character="selectedCharacter"
          :combined-events="combinedEvents"
          :format-timestamp="formatTimestamp"
        />
      </div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('log', $event, { right: true })" />
      <div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('log', $event, { bottom: true })" />
      <div :style="styles.resizeHandle" @mousedown.stop="startResize('log', $event, { right: true, bottom: true })" />
    </div>

    <div
      v-if="selectedCharacter"
      data-panel-id="hotbar"
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelHotbar,
        ...panelStyle('hotbar').value,
      }"
      @mousedown="bringToFront('hotbar')"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('hotbar', $event)">
        Hotbar
      </div>
      <div :style="styles.floatingPanelBody">
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
          @contextmenu.prevent="
            slot.abilityKey &&
            showAbilityPopup({
              name: slot.name || slot.abilityKey,
              description: hotbarAbilityDescription(slot),
              stats: hotbarTooltipItem(slot)?.stats ?? [],
              x: ($event.currentTarget?.getBoundingClientRect().right ?? $event.clientX) + 12,
              y: ($event.currentTarget?.getBoundingClientRect().top ?? $event.clientY),
            })
          "
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

    <!-- Character Info Panel (wide) — combines Inventory and Stats tabs -->
    <div v-if="panels.characterInfo && panels.characterInfo.open" data-panel-id="characterInfo" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('characterInfo').value || {}) }" @mousedown="bringToFront('characterInfo')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('characterInfo', $event)"><div>Character</div><button type="button" :style="styles.panelClose" @click="closePanelById('characterInfo')">x</button></div>
      <div :style="styles.floatingPanelBody"><CharacterInfoPanel :styles="styles" :conn-active="conn.isActive" :selected-character="selectedCharacter" :equipped-slots="equippedSlots" :inventory-items="inventoryItems" :inventory-count="inventoryCount" :max-inventory-slots="maxInventorySlots" :combat-locked="lockInventoryEdits" :stat-bonuses="equippedStatBonuses" :locations="locations" :regions="regions" :races="races" @equip="equipItem" @unequip="unequipItem" @use-item="useItem" @eat-food="eatFood" @delete-item="deleteItem" @split-stack="(id: bigint, qty: bigint) => splitStack(id, qty)" @organize="organizeInventory" @salvage-item="salvageItem" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('characterInfo', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('characterInfo', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('characterInfo', $event, { right: true, bottom: true })" />
    </div>

    <!-- Hotbar Panel -->
    <div v-if="panels.hotbarPanel && panels.hotbarPanel.open" data-panel-id="hotbarPanel" :style="{ ...styles.floatingPanel, ...(panelStyle('hotbarPanel').value || {}) }" @mousedown="bringToFront('hotbarPanel')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('hotbarPanel', $event)"><div>Hotbar</div><button type="button" :style="styles.panelClose" @click="closePanelById('hotbarPanel')">×</button></div>
      <div :style="styles.floatingPanelBody"><HotbarPanel :styles="styles" :selected-character="selectedCharacter" :available-abilities="availableAbilities" :hotbar="hotbarAssignments" :combat-locked="lockHotbarEdits" @set-hotbar="setHotbarSlot" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('hotbarPanel', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('hotbarPanel', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('hotbarPanel', $event, { right: true, bottom: true })" />
    </div>


    <!-- Friends Panel -->
    <div v-if="panels.friends && panels.friends.open" data-panel-id="friends" :style="{ ...styles.floatingPanel, ...(panelStyle('friends').value || {}) }" @mousedown="bringToFront('friends')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('friends', $event)"><div>Friends</div><button type="button" :style="styles.panelClose" @click="closePanelById('friends')">×</button></div>
      <div :style="styles.floatingPanelBody"><FriendsPanel :styles="styles" :conn-active="conn.isActive" :is-logged-in="isLoggedIn" :friend-email="friendEmail" :incoming-requests="incomingRequests" :outgoing-requests="outgoingRequests" :friends="myFriends" :email-by-user-id="emailByUserId" @update:friendEmail="friendEmail = $event" @send-request="sendRequest" @accept="acceptRequest" @reject="rejectRequest" @remove="removeFriend" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('friends', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('friends', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('friends', $event, { right: true, bottom: true })" />
    </div>

    <!-- Crafting Panel (wide) -->
    <div v-if="panels.crafting && panels.crafting.open" data-panel-id="crafting" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('crafting').value || {}) }" @mousedown="bringToFront('crafting')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('crafting', $event)"><div>Crafting</div><button type="button" :style="styles.panelClose" @click="closePanelById('crafting')">×</button></div>
      <div :style="styles.floatingPanelBody"><CraftingPanel :styles="styles" :selected-character="selectedCharacter" :crafting-available="currentLocationCraftingAvailable" :combat-locked="lockCrafting" :recipes="craftingFilteredRecipes" :recipe-types="craftingRecipeTypes" :active-filter="craftingActiveFilter" :show-only-craftable="craftingShowOnlyCraftable" @update:active-filter="craftingActiveFilter = $event" @update:show-only-craftable="craftingShowOnlyCraftable = $event" @open-modal="onOpenCraftModal" @research="onResearchRecipes" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('crafting', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('crafting', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('crafting', $event, { right: true, bottom: true })" />
    </div>

    <!-- Journal Panel (wide) -->
    <div v-if="panels.journal && panels.journal.open" data-panel-id="journal" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('journal').value || {}) }" @mousedown="bringToFront('journal')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('journal', $event)"><div>Journal</div><button type="button" :style="styles.panelClose" @click="closePanelById('journal')">×</button></div>
      <div :style="styles.floatingPanelBody"><NpcDialogPanel :styles="styles" :npc-dialogs="characterNpcDialogs" :npcs="npcs" :locations="locations" :regions="regions" :npc-affinities="npcAffinities" :selected-character-id="selectedCharacterId" :selected-npc-target="selectedNpcTarget" :quest-instances="characterQuests" :quest-templates="questTemplates" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('journal', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('journal', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('journal', $event, { right: true, bottom: true })" />
    </div>

    <!-- Renown Panel -->
    <div v-if="panels.renown && panels.renown.open" data-panel-id="renown" :style="{ ...styles.floatingPanel, ...(panelStyle('renown').value || {}) }" @mousedown="bringToFront('renown')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('renown', $event)"><div>Renown</div><button type="button" :style="styles.panelClose" @click="closePanelById('renown')">×</button></div>
      <div :style="styles.floatingPanelBody"><RenownPanel :styles="styles" :factions="factions" :faction-standings="characterFactionStandings" :selected-character="selectedCharacter" :renown-data="characterRenown" :renown-perks="characterRenownPerks" :server-firsts="renownServerFirsts" :conn-active="!!conn.isActive" @choose-perk="handleChoosePerk" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('renown', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('renown', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('renown', $event, { right: true, bottom: true })" />
    </div>

    <!-- World Events Panel -->
    <div v-if="panels.worldEvents && panels.worldEvents.open" data-panel-id="worldEvents" :style="{ ...styles.floatingPanel, ...(panelStyle('worldEvents').value || {}) }" @mousedown="bringToFront('worldEvents')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('worldEvents', $event)"><div>World Events</div><button type="button" :style="styles.panelClose" @click="closePanelById('worldEvents')">×</button></div>
      <div :style="styles.floatingPanelBody">
        <WorldEventPanel
          :styles="styles"
          :world-event-rows="worldEventRows"
          :event-contributions="eventContributions"
          :event-objectives="eventObjectives"
          :regions="regions"
          :selected-character="selectedCharacter"
          :is-admin="isAdmin"
          :now-micros="nowMicros"
        />
      </div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('worldEvents', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('worldEvents', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('worldEvents', $event, { right: true, bottom: true })" />
    </div>

    <!-- World Event Banner Overlay -->
    <div v-if="activeBanner" :style="styles.worldEventBanner">
      {{ activeBanner }}
    </div>

    <!-- Loot Panel -->
    <div v-if="panels.loot && panels.loot.open" data-panel-id="loot" :class="{ 'loot-panel-pulse': lootPanelPulsing }" :style="{ ...styles.floatingPanel, ...(panelStyle('loot').value || {}) }" @mousedown="bringToFront('loot')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('loot', $event)"><div>Loot</div><button type="button" :style="styles.panelClose" @click="closePanelById('loot')">×</button></div>
      <div :style="styles.floatingPanelBody"><LootPanel :styles="styles" :conn-active="conn.isActive" :loot-items="pendingLoot" @take-loot="takeLoot" @take-all-loot="takeAllLoot" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('loot', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('loot', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('loot', $event, { right: true, bottom: true })" />
    </div>

    <!-- Vendor Panel (wide) -->
    <div v-if="panels.vendor && panels.vendor.open" data-panel-id="vendor" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('vendor').value || {}) }" @mousedown="bringToFront('vendor')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('vendor', $event)"><div>{{ activeVendor?.name ?? 'Vendor' }}</div><button type="button" :style="styles.panelClose" @click="closePanelById('vendor')">×</button></div>
      <div :style="styles.floatingPanelBody"><VendorPanel :styles="styles" :selected-character="selectedCharacter" :vendor="activeVendor" :vendor-items="vendorItems" :inventory-items="inventoryItems" @buy="buyItem" @sell="sellItem" @sell-all-junk="sellAllJunk" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('vendor', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('vendor', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('vendor', $event, { right: true, bottom: true })" />
    </div>

    <!-- Trade Panel (wide) -->
    <div v-if="panels.trade && panels.trade.open" data-panel-id="trade" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('trade').value || {}) }" @mousedown="bringToFront('trade')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('trade', $event)"><div>Trade</div><button type="button" :style="styles.panelClose" @click="closePanel('trade')">×</button></div>
      <div :style="styles.floatingPanelBody"><TradePanel :styles="styles" :trade="activeTrade" :inventory="tradeInventory" :my-offer="myOffer" :other-offer="otherOffer" :my-offer-locked="myOfferLocked" :other-offer-locked="otherOfferLocked" @add-item="addTradeItem" @remove-item="removeTradeItem" @offer="offerTrade" @cancel="cancelTrade" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('trade', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('trade', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('trade', $event, { right: true, bottom: true })" />
    </div>

    <!-- Track Panel -->
    <div v-if="panels.track && panels.track.open" data-panel-id="track" :style="{ ...styles.floatingPanel, ...(panelStyle('track').value || {}) }" @mousedown="bringToFront('track')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('track', $event)"><div>Track</div><button type="button" :style="styles.panelClose" @click="closePanelById('track')">×</button></div>
      <div :style="styles.floatingPanelBody"><TrackPanel :styles="styles" :options="trackOptions" @select="selectTrackedTarget" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('track', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('track', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('track', $event, { right: true, bottom: true })" />
    </div>

    <!-- Travel Panel -->
    <div v-if="panels.travelPanel && panels.travelPanel.open" data-panel-id="travelPanel" :style="{ ...styles.floatingPanel, ...(panelStyle('travelPanel').value || {}) }" @mousedown="bringToFront('travelPanel')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('travelPanel', $event)"><div>Travel</div><button type="button" :style="styles.panelClose" @click="closePanelById('travelPanel')">x</button></div>
      <div :style="styles.floatingPanelBody"><TravelPanel :styles="styles" :conn-active="conn.isActive" :selected-character="selectedCharacter" :locations="connectedLocations" :regions="regions" :travel-cooldowns="travelCooldowns" :all-locations="locations" :location-connections="locationConnections" @move="moveTo" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('travelPanel', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('travelPanel', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('travelPanel', $event, { right: true, bottom: true })" />
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...panelStyle('travel').value,
      }"
      @mousedown="bringToFront('travel')"
    >
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('travel', $event)">
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
      <div :style="activeCombat ? styles.floatingPanelBodyCombat : styles.floatingPanelBody">
        <template v-if="activeCombat">
          <CombatPanel
            :styles="styles"
            :conn-active="conn.isActive"
            :selected-character="selectedCharacter"
            :active-combat="activeCombat"
            :combat-enemies="combatEnemiesList"
            :can-act="canActInCombat"
            :accordion-state="accordionState"
            :is-flee-casting="isFleeCasting"
            :flee-progress="fleeProgress"
            @select-enemy="setCombatTarget"
            @flee="handleFlee"
            @accordion-toggle="updateAccordionState"
          />
        </template>
        <template v-else>
        <LocationGrid
          :styles="styles"
          :conn-active="conn.isActive"
          :selected-character="selectedCharacter"
          :selected-npc-id="selectedNpcTarget"
          :selected-character-target-id="selectedCharacterTarget"
          :selected-corpse-id="selectedCorpseTarget"
          :characters-here="charactersHere"
          :npcs-here="npcsHere"
          :corpses-here="corpsesHere"
          :enemy-spawns="availableEnemies"
          :resource-nodes="resourceNodesHere"
          :quest-items="locationQuestItems"
          :named-enemies="locationNamedEnemies"
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
          :my-friend-user-ids="myFriendUserIds"
          :group-member-ids="groupMemberIdStrings"
          :is-leader="isLeader"
          :leader-id="leaderId"
          @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
          @gather-resource="startGather"
          @hail="hailNpc"
          @open-vendor="openVendor"
          @player-invite="inviteToGroup"
          @player-kick="kickMember"
          @player-friend="sendFriendRequest"
          @player-promote="promoteLeader"
          @player-trade="startTrade"
          @player-message="sendWhisperTo"
          @gift-npc="openGiftOverlay"
          @loot-all-corpse="onLootAllCorpse"
          @initiate-resurrect="onInitiateResurrect"
          @initiate-corpse-summon="onInitiateCorpseSummon"
          @select-npc="selectNpcTarget"
          @talk-npc="onTalkNpc"
          @select-corpse="selectCorpseTarget"
          @select-character="selectCharacterTarget"
          @loot-quest-item="lootQuestItem"
          @pull-named-enemy="pullNamedEnemy"
        />
        </template>
      </div>
    </div>

    <div
      :style="{
        ...styles.floatingPanel,
        ...styles.floatingPanelCompact,
        ...panelStyle('group').value,
      }"
      @mousedown="bringToFront('group')"
    >
      <div
        :style="styles.floatingPanelHeader"
        @mousedown="startDrag('group', $event)"
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
          :character-effects="relevantEffects"
          :combat-pets="combatPetsForGroup"
          :invite-summaries="inviteSummaries"
          :leader-id="leaderId"
          :puller-id="pullerId"
          :is-leader="isLeader"
          :follow-leader="followLeader"
          :selected-target-id="defensiveTargetId"
          :now-micros="nowMicros"
          :my-friend-user-ids="myFriendUserIds"
          :my-character-id="selectedCharacter?.id ?? null"
          @leave="leaveGroup"
          @accept="acceptInvite"
          @reject="rejectInvite"
          @set-puller="setPuller"
          @toggle-follow="setFollowLeader"
          @target="setDefensiveTarget"
          @player-trade="startTrade"
          @player-friend="sendFriendRequest"
          @player-promote="promoteLeader"
          @player-kick="kickMember"
          @player-message="sendWhisperTo"
        />
      </div>
    </div>
  </main>

  <!-- Crafting Modal -->
  <CraftingModal
    v-if="craftingModalRecipe"
    :recipe="craftingModalRecipe"
    :essence-items="craftingEssenceItems"
    :modifier-items="craftingModifierItems"
    @craft="craftWithEnhancements"
    @close="closeCraftModal"
  />

  <div v-if="showDeathModal" :style="styles.deathOverlay">
    <div :style="styles.deathModal">
      <div :style="styles.deathTitle">You have died.</div>
      <pre :style="styles.deathArt">{{ tombstoneArt }}</pre>
      <button :style="styles.primaryButton" @click="respawnCharacter">Respawn</button>
    </div>
  </div>

  <!-- Corpse Action Confirmation (Resurrect / Corpse Summon) -->
  <div v-if="pendingPrompt" :style="{ position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9000 }">
    <div :style="{ background: '#141821', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '14px', padding: '1.5rem', maxWidth: '420px', width: '90vw', boxShadow: '0 14px 32px rgba(0,0,0,0.6)' }">
      <div :style="{ fontSize: '1.1rem', fontWeight: 'bold', color: '#e6e8ef', marginBottom: '1rem', textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase' }">
        {{ pendingPrompt.type === 'resurrect' ? 'Resurrect' : 'Corpse Summon' }}
      </div>
      <div :style="{ marginBottom: '1.2rem' }">
        <p :style="{ fontSize: '0.9rem', color: '#c8cad0', lineHeight: '1.5', marginBottom: '0.6rem' }">
          {{ pendingPrompt.message }}
        </p>
      </div>
      <div :style="{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }">
        <button
          :style="{ padding: '0.5rem 1.2rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', color: '#a0a3ab', cursor: 'pointer', fontSize: '0.85rem' }"
          @click="declinePendingAction"
        >
          Decline
        </button>
        <button
          :style="{ padding: '0.5rem 1.2rem', background: 'rgba(76, 125, 240, 0.15)', border: '1px solid rgba(76, 125, 240, 0.4)', borderRadius: '8px', color: '#4c7df0', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }"
          @click="acceptPendingAction"
        >
          Accept
        </button>
      </div>
    </div>
  </div>

  <div v-if="rankUpNotification" :style="{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }">
    <div :style="{ background: '#1a1a2e', border: '2px solid #fa5', borderRadius: '12px', padding: '32px 48px', textAlign: 'center', maxWidth: '400px' }">
      <div :style="{ color: '#fa5', fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }">Rank Up!</div>
      <div :style="{ color: '#fff', fontSize: '1.2rem', marginBottom: '16px' }">{{ rankUpNotification.rankName }}</div>
      <div :style="{ color: '#aaa', fontSize: '0.85rem', marginBottom: '16px' }">Choose a perk from the Renown panel</div>
      <button :style="{ ...styles.actionButton, padding: '8px 24px', fontSize: '0.9rem' }" @click="rankUpNotification = null">Continue</button>
    </div>
  </div>

  <!-- Gift overlay -->
  <div v-if="giftTargetNpcId" :style="{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }" @click="giftTargetNpcId = null">
    <div :style="{ background: '#1a1a2e', border: '2px solid #4c7df0', borderRadius: '8px', padding: '24px', maxWidth: '400px', maxHeight: '500px', overflow: 'auto' }" @click.stop>
      <div :style="{ color: '#4c7df0', fontSize: '1.2rem', fontWeight: 700, marginBottom: '12px' }">Select Gift</div>
      <div :style="{ color: '#aaa', fontSize: '0.85rem', marginBottom: '16px' }">Choose an item to give to {{ giftTargetNpcName }}</div>
      <div v-if="giftableItems.length === 0" :style="{ color: '#888', fontSize: '0.85rem', fontStyle: 'italic' }">No items available to gift</div>
      <div v-else :style="{ display: 'flex', flexDirection: 'column', gap: '6px' }">
        <div
          v-for="item in giftableItems"
          :key="item.id.toString()"
          :style="{ padding: '10px', background: 'rgba(76, 125, 240, 0.15)', border: '1px solid rgba(76, 125, 240, 0.3)', borderRadius: '4px', cursor: 'pointer' }"
          @click="giveGift(item.id)"
          @mouseenter="$event.currentTarget.style.background = 'rgba(76, 125, 240, 0.25)'"
          @mouseleave="$event.currentTarget.style.background = 'rgba(76, 125, 240, 0.15)'"
        >
          <div :style="{ fontSize: '0.9rem', fontWeight: 600 }">{{ item.name }}</div>
          <div v-if="item.quantity > 1n" :style="{ fontSize: '0.75rem', opacity: 0.7 }">Quantity: {{ item.quantity }}</div>
        </div>
      </div>
      <button :style="{ ...styles.actionButton, marginTop: '16px', width: '100%' }" @click="giftTargetNpcId = null">Cancel</button>
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
      :open-panels="openPanels"
      :has-active-character="Boolean(selectedCharacter)"
      :combat-locked="lockHotbarEdits"
      :highlight-inventory="highlightInventory"
      :highlight-hotbar="highlightHotbar"
      :has-active-events="hasActiveEvents"
      @toggle="togglePanel"
      @camp="goToCamp"
    />
    </footer>

  <!-- Help overlay -->
  <HelpOverlay v-if="showHelp" :styles="styles" @close="showHelp = false" />

    <div
      v-if="tooltip.visible"
      :style="{
        ...styles.tooltip,
        left: `${tooltip.x}px`,
        top: `${tooltip.y}px`,
      }"
    >
      <div :style="{ ...styles.tooltipTitle, ...tooltipRarityColor(tooltip.item) }">{{ tooltip.item?.name ?? 'Item' }}</div>
      <div v-if="tooltip.item?.description" :style="styles.tooltipLine">
        {{ tooltip.item.description }}
      </div>
      <div v-if="tooltip.item?.craftQuality" :style="styles.tooltipLine">
        <span :style="{ color: craftQualityColor(tooltip.item.craftQuality), fontSize: '11px', textTransform: 'capitalize' }">{{ tooltip.item.craftQuality }} Quality</span>
      </div>
      <div v-if="tooltip.item?.stats?.length" :style="styles.tooltipLine">
        <div v-for="stat in tooltip.item.stats" :key="stat.label">
          {{ stat.label }}: {{ stat.value }}
        </div>
      </div>
      <div v-if="tooltip.item?.affixStats?.length" :style="{ ...styles.tooltipLine, marginTop: '0.25rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.25rem' }">
        <div v-for="(affix, idx) in tooltip.item.affixStats" :key="idx" :style="{ color: '#a0d8a0', fontSize: '0.78rem' }">
          {{ affix.value }} {{ affix.label }} <span :style="{ opacity: 0.7 }">({{ affix.affixName }})</span>
        </div>
      </div>
      <div v-if="tooltip.item?.allowedClasses && tooltip.item.allowedClasses !== 'any'" :style="styles.tooltipLine">
        Classes: {{ tooltip.item.allowedClasses }}
      </div>
      <div v-if="tooltip.item?.armorType && tooltip.item.armorType !== 'none'" :style="styles.tooltipLine">
        Armor: {{ tooltip.item.armorType.charAt(0).toUpperCase() + tooltip.item.armorType.slice(1) }}
      </div>
      <div v-if="tooltip.item?.enemyMembers?.length" :style="styles.tooltipLine">
        <div :style="{ fontWeight: 500, marginBottom: '0.2rem' }">Members:</div>
        <div v-for="(member, idx) in tooltip.item.enemyMembers" :key="idx">
          {{ member }}
        </div>
      </div>
      <div v-if="tooltip.item?.factionName" :style="styles.tooltipLine">
        Faction: {{ tooltip.item.factionName }}
      </div>
    </div>
    <div
      v-if="abilityPopup.visible"
      :style="{
        ...styles.tooltip,
        left: `${abilityPopup.x}px`,
        top: `${abilityPopup.y}px`,
        pointerEvents: 'auto',
        maxWidth: '280px',
      }"
      @click.stop
    >
      <div :style="styles.tooltipTitle">{{ abilityPopup.name }}</div>
      <div v-if="abilityPopup.description" :style="styles.tooltipLine">{{ abilityPopup.description }}</div>
      <div v-if="abilityPopup.stats?.length" :style="styles.tooltipLine">
        <div v-for="stat in abilityPopup.stats" :key="stat.label">{{ stat.label }}: {{ stat.value }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useReducer } from 'spacetimedb/vue';
import { styles } from './ui/styles';
import SplashScreen from './components/SplashScreen.vue';
import AppHeader from './components/AppHeader.vue';
import LogWindow from './components/LogWindow.vue';
import CharacterPanel from './components/CharacterPanel.vue';
import CharacterInfoPanel from './components/CharacterInfoPanel.vue';
import GroupPanel from './components/GroupPanel.vue';
import FriendsPanel from './components/FriendsPanel.vue';
import CraftingPanel from './components/CraftingPanel.vue';
import CraftingModal from './components/CraftingModal.vue';
import HotbarPanel from './components/HotbarPanel.vue';
import CombatPanel from './components/CombatPanel.vue';
import TravelPanel from './components/TravelPanel.vue';
import LocationGrid from './components/LocationGrid.vue';
import LootPanel from './components/LootPanel.vue';
import TradePanel from './components/TradePanel.vue';
import CommandBar from './components/CommandBar.vue';
import ActionBar from './components/ActionBar.vue';
import NpcDialogPanel from './components/NpcDialogPanel.vue';
import VendorPanel from './components/VendorPanel.vue';
import TrackPanel from './components/TrackPanel.vue';
import RenownPanel from './components/RenownPanel.vue';
import WorldEventPanel from './components/WorldEventPanel.vue';
import HelpOverlay from './components/HelpOverlay.vue';
import { ADMIN_IDENTITY_HEX } from './data/worldEventDefs';
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
import { usePanelManager, getDefaultLayout } from './composables/usePanelManager';
import { rarityColor, craftQualityColor } from './ui/colors';
import { buildItemTooltipData } from './composables/useItemTooltip';

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
  pullStates,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  activePets,
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
  factions,
  factionStandings,
  panelLayouts,
  travelCooldowns,
  renownRows,
  renownPerks,
  renownServerFirsts,
  achievements,
  npcAffinities,
  npcDialogueOptions,
  corpses,
  corpseItems,
  pendingSpellCasts,
  questItems,
  namedEnemies,
  searchResults,
  itemAffixes,
  worldEventRows,
  eventContributions,
  eventObjectives,
  appVersionRows,
  activeBardSongs,
} = useGameData();

watch(appVersionRows, (rows) => {
  const serverVersion = (rows as Array<{ version: string }>)[0]?.version;
  const clientVersion = window.__client_version;
  if (!serverVersion || !clientVersion || clientVersion === 'dev') return;
  if (serverVersion === clientVersion) return;
  // Mismatch — only reload once per session to prevent infinite reload loops
  // (server AppVersion may be stale if /setappversion wasn't re-run after the latest deploy)
  if (sessionStorage.getItem('_version_reload_attempted')) {
    console.log('[Version] Mismatch persists but reload already attempted this session, skipping.');
    return;
  }
  sessionStorage.setItem('_version_reload_attempted', '1');
  console.log('[Version] New deployment detected, reloading...');
  window.location.reload();
});

const { player, userId, userEmail, sessionStartedAt } = usePlayer({ players, users });

const isAdmin = computed(() => {
  const identity = window.__my_identity;
  return identity?.toHexString() === ADMIN_IDENTITY_HEX;
});

const { isLoggedIn, isPendingLogin, login, logout, authMessage, authError } = useAuth({
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
  deselectCharacter,
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

const corpsesHere = computed(() => {
  if (!selectedCharacter.value || !corpses.value) return [];
  const locationId = selectedCharacter.value.locationId;

  // Get all active player user IDs (online check)
  const activePlayerUserIds = new Set<bigint>();
  for (const player of players.value ?? []) {
    if (player.activeCharacterId) {
      const char = characters.value?.find(c => c.id === player.activeCharacterId);
      if (char) activePlayerUserIds.add(char.ownerUserId);
    }
  }

  return corpses.value
    .filter(c => c.locationId === locationId)
    .filter(c => {
      // Only show corpses for online players
      const corpseChar = characters.value?.find(ch => ch.id === c.characterId);
      return corpseChar && activePlayerUserIds.has(corpseChar.ownerUserId);
    })
    .map(c => {
      const corpseChar = characters.value?.find(ch => ch.id === c.characterId);
      const itemCount = (corpseItems.value ?? []).filter(ci => ci.corpseId === c.id).length;
      return {
        id: c.id,
        characterName: corpseChar?.name ?? 'Unknown',
        characterId: c.characterId,
        isOwn: c.characterId === selectedCharacter.value!.id,
        itemCount,
      };
    });
});

const activeVendorId = ref<bigint | null>(null);
const activeVendor = computed(() => {
  if (!activeVendorId.value) return null;
  return npcs.value.find((npc) => npc.id.toString() === activeVendorId.value?.toString()) ?? null;
});
const vendorItems = computed(() => {
  if (!activeVendorId.value) return [];
  const chaDiscount = selectedCharacter.value?.vendorBuyMod ?? 0n;
  return vendorInventory.value
    .filter((row) => row.npcId.toString() === activeVendorId.value?.toString())
    .map((row) => {
      const template = itemTemplates.value.find(
        (item) => item.id.toString() === row.itemTemplateId.toString()
      );
      // Apply CHA vendor discount to displayed price (mirrors buy_item reducer formula)
      let displayPrice = row.price;
      if (chaDiscount > 0n && displayPrice > 0n) {
        displayPrice = (displayPrice * (1000n - chaDiscount)) / 1000n;
        if (displayPrice < 1n) displayPrice = 1n;
      }
      const tooltipData = buildItemTooltipData({
        template,
        instance: { qualityTier: row.qualityTier },
        priceOrValue: row.price ? { label: 'Price', value: `${displayPrice} gold` } : undefined,
      });
      return {
        id: row.id,
        templateId: row.itemTemplateId,
        price: displayPrice,
        ...tooltipData,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

const fallbackCombatRoster = computed(() => {
  if (currentGroup.value) return groupCharacterMembers.value;
  return selectedCharacter.value ? [selectedCharacter.value] : [];
});

// Client-side filtering for public tables (replaces unreliable views)
const userGroupMembers = computed(() => {
  if (userId.value == null) return [];
  return groupMemberRows.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

const userCombatResults = computed(() => {
  if (userId.value == null) return [];
  return combatResults.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

const userPrivateEvents = computed(() => {
  if (userId.value == null) return [];
  return privateEvents.value.filter(
    (row: any) => row.ownerUserId === userId.value
  );
});

const userLocationEvents = computed(() => {
  if (!selectedCharacter.value) return [];
  const locId = selectedCharacter.value.locationId;
  return locationEvents.value.filter(
    (row: any) => row.locationId === locId &&
      (!row.excludeCharacterId || row.excludeCharacterId !== selectedCharacter.value!.id)
  );
});

const userGroupEvents = computed(() => {
  if (userId.value == null) return [];
  const myGroupIds = new Set(
    userGroupMembers.value.map((m: any) => m.groupId.toString())
  );
  return groupEvents.value.filter(
    (row: any) => myGroupIds.has(row.groupId.toString())
  );
});

const { combinedEvents, addLocalEvent } = useEvents({
  worldEvents,
  locationEvents: userLocationEvents,
  privateEvents: userPrivateEvents,
  groupEvents: userGroupEvents,
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
  pendingLoot,
  hasOtherLootForResult,
  startCombat,
  startPull,
  startTrackedCombat,
  setCombatTarget,
  flee,
  takeLoot,
  takeAllLoot,
} = useCombat({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  combatEncounters,
  combatParticipants,
  combatEnemies,
  activePets,
  combatEnemyEffects,
  combatEnemyCasts,
  combatLoot,
  itemTemplates,
  combatResults: userCombatResults,
  fallbackRoster: fallbackCombatRoster,
  enemySpawns,
  enemyTemplates,
  enemyRoleTemplates,
  enemySpawnMembers,
  pullStates,
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
  if (!selectedCharacter.value) return [];
  const relevantIds = new Set<string>();
  relevantIds.add(selectedCharacter.value.id.toString());
  for (const member of groupCharacterMembers.value) {
    relevantIds.add(member.id.toString());
  }
  if (activeCombat.value) {
    const combatId = activeCombat.value.id.toString();
    return (activePets.value as any[])
      .filter((pet: any) => pet.combatId?.toString() === combatId)
      .map((pet: any) => ({
        id: pet.id,
        ownerCharacterId: pet.characterId,
        name: pet.name,
        currentHp: pet.currentHp,
        maxHp: pet.maxHp,
      }));
  }
  // Out of combat: show active persistent pets (those without a combatId)
  return (activePets.value as any[])
    .filter((pet: any) => !pet.combatId && relevantIds.has(pet.characterId.toString()))
    .map((pet: any) => ({
      id: pet.id,
      ownerCharacterId: pet.characterId,
      name: pet.name,
      currentHp: pet.currentHp,
      maxHp: pet.maxHp,
    }));
});

const BARD_SONG_DISPLAY_NAMES: Record<string, string> = {
  bard_discordant_note: 'Discordant Note',
  bard_melody_of_mending: 'Melody of Mending',
  bard_chorus_of_vigor: 'Chorus of Vigor',
  bard_march_of_wayfarers: 'March of Wayfarers',
  bard_battle_hymn: 'Battle Hymn',
};

const relevantEffects = computed(() => {
  if (!selectedCharacter.value) return [];
  const memberIds = new Set<string>();
  memberIds.add(selectedCharacter.value.id.toString());
  for (const member of groupCharacterMembers.value) {
    memberIds.add(member.id.toString());
  }
  const effects: any[] = characterEffects.value.filter(
    (effect: any) => memberIds.has(effect.characterId.toString())
  );
  for (const song of (activeBardSongs.value as any[])) {
    if (memberIds.has(song.bardCharacterId.toString())) {
      effects.push({
        id: song.id,
        characterId: song.bardCharacterId,
        effectType: 'song',
        magnitude: 0n,
        roundsRemaining: 0n,
        sourceAbility: BARD_SONG_DISPLAY_NAMES[song.songKey] ?? song.songKey,
      });
    }
  }
  return effects;
});

const characterNpcDialogs = computed(() => {
  if (!selectedCharacter.value) return [];
  return npcDialogs.value.filter(
    (entry: any) => entry.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

// Filter quest instances to current character
const characterQuests = computed(() => {
  if (!selectedCharacter.value) return [];
  return questInstances.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

// Quest item, named enemy, and search result computeds
const characterQuestItems = computed(() => {
  if (!selectedCharacter.value) return [];
  const charId = selectedCharacter.value.id;
  return questItems.value.filter((qi: any) => qi.characterId.toString() === charId.toString());
});

const characterNamedEnemies = computed(() => {
  if (!selectedCharacter.value) return [];
  const charId = selectedCharacter.value.id;
  return namedEnemies.value.filter((ne: any) => ne.characterId.toString() === charId.toString());
});

const characterSearchResult = computed(() => {
  if (!selectedCharacter.value) return null;
  const charId = selectedCharacter.value.id;
  return searchResults.value.find((sr: any) => sr.characterId.toString() === charId.toString()) ?? null;
});

const locationQuestItems = computed(() => {
  if (!selectedCharacter.value) return [];
  const locId = selectedCharacter.value.locationId;
  return characterQuestItems.value.filter(
    (qi: any) => qi.locationId.toString() === locId.toString() && qi.discovered && !qi.looted
  );
});

const locationNamedEnemies = computed(() => {
  if (!selectedCharacter.value) return [];
  const locId = selectedCharacter.value.locationId;
  return characterNamedEnemies.value.filter(
    (ne: any) => ne.locationId.toString() === locId.toString() && ne.isAlive
  );
});

// Reducer call handlers for quest interactions
const lootQuestItem = (questItemId: bigint) => {
  const db = window.__db_conn;
  if (!selectedCharacter.value || !db) return;
  db.reducers.lootQuestItem({ characterId: selectedCharacter.value.id, questItemId });
};

const pullNamedEnemy = (namedEnemyId: bigint) => {
  const db = window.__db_conn;
  if (!selectedCharacter.value || !db) return;
  db.reducers.pullNamedEnemy({ characterId: selectedCharacter.value.id, namedEnemyId });
};

// Filter faction standings to current character
const characterFactionStandings = computed(() => {
  if (!selectedCharacter.value) return [];
  return factionStandings.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

// Renown data for current character
const characterRenown = computed(() => {
  if (!selectedCharacter.value) return null;
  return renownRows.value.find(r => r.characterId.toString() === selectedCharacter.value!.id.toString()) ?? null;
});

const characterRenownPerks = computed(() => {
  if (!selectedCharacter.value) return [];
  return renownPerks.value.filter(p => p.characterId.toString() === selectedCharacter.value!.id.toString());
});

// World Events: hasActiveEvents computed and banner overlay
const hasActiveEvents = computed(() => (worldEventRows.value as any[])?.some((e: any) => e.status === 'active') ?? false);

const activeBanner = ref<string | null>(null);
let bannerTimer: ReturnType<typeof setTimeout> | null = null;

watch(worldEventRows, (newRows, oldRows) => {
  if (!oldRows) return;
  const prevIds = new Set((oldRows as any[]).map((r: any) => r.id.toString()));
  for (const row of (newRows as any[])) {
    if (!prevIds.has(row.id.toString()) && row.status === 'active') {
      activeBanner.value = `World Event: ${row.name} has begun!`;
      if (bannerTimer) clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => { activeBanner.value = null; }, 5000);
    }
  }
}, { deep: true });

// Filter panel layouts to current character
const characterPanelLayouts = computed(() => {
  if (!selectedCharacter.value) return [];
  return panelLayouts.value.filter(
    (row: any) => row.characterId.toString() === selectedCharacter.value!.id.toString()
  );
});

const lastResultId = ref<string | null>(null);
const lastLevelUpEventId = ref<string | null>(null);
const audioCtxRef = ref<AudioContext | null>(null);
const rankUpNotification = ref<{ rankName: string } | null>(null);
const showHelp = ref(false);

// Client-side renown ranks for rank name lookups
const RENOWN_RANKS_CLIENT = [
  { rank: 1, name: 'Unsung' }, { rank: 2, name: 'Whispered' }, { rank: 3, name: 'Recognized' },
  { rank: 4, name: 'Proven' }, { rank: 5, name: 'Stalwart' }, { rank: 6, name: 'Vanguard' },
  { rank: 7, name: 'Champion' }, { rank: 8, name: 'Paragon' }, { rank: 9, name: 'Exemplar' },
  { rank: 10, name: 'Hero' }, { rank: 11, name: 'Exalted' }, { rank: 12, name: 'Ascendant' },
  { rank: 13, name: 'Legend' }, { rank: 14, name: 'Mythic' }, { rank: 15, name: 'Eternal' },
];

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
  () => combinedEvents.value,
  (events) => {
    if (!events || events.length === 0) return;
    const last = events[events.length - 1];
    const id = `sound-${last.id}`;
    if (lastResultId.value === id) return;
    if (last.kind !== 'combat') return;
    const msg = (last.message ?? '').toLowerCase();
    if (msg.startsWith('victory')) {
      lastResultId.value = id;
      playVictorySound();
    } else if (msg.startsWith('defeat')) {
      lastResultId.value = id;
      playDefeatSound();
    }
  },
  { deep: true }
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


const lootPanelPulsing = ref(false);
let lootPulseTimer: ReturnType<typeof setTimeout> | null = null;

// Auto-open loot panel when pendingLoot goes from empty to non-empty
watch(
  () => pendingLoot.value.length,
  (count, prevCount) => {
    console.log('[LOOT DEBUG] pendingLoot changed:', prevCount, '->', count);
    if (count > 0 && (prevCount === 0 || prevCount === undefined)) {
      openPanel('loot');
    }
    // Pulse when new items arrive (count increased)
    if (count > (prevCount ?? 0)) {
      if (lootPulseTimer !== null) clearTimeout(lootPulseTimer);
      lootPanelPulsing.value = true;
      lootPulseTimer = setTimeout(() => {
        lootPanelPulsing.value = false;
        lootPulseTimer = null;
      }, 3500);
    }
  }
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
  groupMembers: userGroupMembers,
});

// NPC targeting state (must be declared before useCommands)
const selectedNpcTarget = ref<bigint | null>(null);
const selectNpcTarget = (npcId: bigint | null) => {
  selectedNpcTarget.value = npcId;
};

// Corpse targeting state
const selectedCorpseTarget = ref<bigint | null>(null);
const selectCorpseTarget = (corpseId: bigint | null) => {
  selectedCorpseTarget.value = corpseId;
};

// Character targeting state (for character-targeted spells like corpse summon)
const selectedCharacterTarget = ref<bigint | null>(null);
const selectCharacterTarget = (characterId: bigint | null) => {
  selectedCharacterTarget.value = characterId;
};

const onTalkNpc = (npcId: bigint) => {
  if (!selectedCharacter.value) return;

  // Find the NPC by ID
  const npc = npcs.value.find(n => n.id === npcId);
  if (!npc) return;

  // Call hailNpc reducer (dialogue appears in Log + Journal, but doesn't auto-open Journal)
  hailNpcReducer({ characterId: selectedCharacter.value.id, npcName: npc.name });
};

// Clear all target selections when location changes
// Watch locationId directly for more reliable reactivity
watch(() => selectedCharacter.value?.locationId, () => {
  selectedNpcTarget.value = null;
  selectedCharacterTarget.value = null;
  selectedCorpseTarget.value = null;
});

// Forward-declared callback so usePanelManager (declared later) can be wired in
const _resetPanelsCb = ref<(() => void) | undefined>(undefined);

const { commandText, submitCommand } = useCommands({
  connActive: computed(() => conn.isActive),
  selectedCharacter,
  inviteSummaries,
  npcsHere,
  onNpcHail: () => {},
  selectedNpcTarget,
  npcDialogueOptions: computed(() => npcDialogueOptions.value),
  npcAffinities: computed(() => npcAffinities.value),
  factionStandings: characterFactionStandings,
  selectedCharacterId: computed(() => selectedCharacterId.value),
  resetPanels: () => _resetPanelsCb.value?.(),
  addLocalEvent,
  players: computed(() => players.value),
  characters: computed(() => characters.value),
  locations: computed(() => locations.value),
  worldEventRows: computed(() => (worldEventRows.value as any[])),
});

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

const closePanel = (panelId: string) => {
  if (panelId === 'trade') {
    cancelTrade();
  }
  closePanelById(panelId);
};

const openVendor = (npcId: bigint) => {
  openPanel('vendor');
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
  if (!conn.isActive || !selectedCharacter.value || !activeVendorId.value) return;
  sellReducer({
    characterId: selectedCharacter.value.id,
    itemInstanceId,
    npcId: activeVendorId.value,
  });
};

const sellAllJunk = () => {
  if (!conn.isActive || !selectedCharacter.value) return;
  sellAllReducer({ characterId: selectedCharacter.value.id });
};

const hailNpcReducer = useReducer(reducers.hailNpc);
const hailNpc = (npcName: string) => {
  if (!selectedCharacter.value) return;
  hailNpcReducer({ characterId: selectedCharacter.value.id, npcName });
  openPanel('journal');
};

// Gift overlay state and logic
const giftTargetNpcId = ref<bigint | null>(null);

const giftTargetNpcName = computed(() => {
  if (!giftTargetNpcId.value) return '';
  const npc = npcs.value.find(n => n.id.toString() === giftTargetNpcId.value?.toString());
  return npc?.name ?? '';
});

const giftableItems = computed(() => {
  if (!selectedCharacter.value || !giftTargetNpcId.value) return [];
  // Get non-equipped inventory items
  return itemInstances.value
    .filter(item =>
      item.ownerCharacterId.toString() === selectedCharacter.value!.id.toString() &&
      !item.equippedSlot
    )
    .map(item => {
      const template = itemTemplates.value.find(t => t.id.toString() === item.templateId.toString());
      return {
        id: item.id,
        name: template?.name ?? 'Unknown Item',
        quantity: item.quantity,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
});

const openGiftOverlay = (npcId: bigint) => {
  giftTargetNpcId.value = npcId;
};

const giveGiftReducer = useReducer(reducers.giveGiftToNpc);
const giveGift = (itemInstanceId: bigint) => {
  if (!selectedCharacter.value || !giftTargetNpcId.value) return;
  giveGiftReducer({
    characterId: selectedCharacter.value.id,
    npcId: giftTargetNpcId.value,
    itemInstanceId,
  });
  giftTargetNpcId.value = null;
};

// Corpse loot handlers
const lootAllCorpseReducer = useReducer(reducers.lootAllCorpse);
const onLootAllCorpse = (corpseId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  lootAllCorpseReducer({ characterId: selectedCharacter.value.id, corpseId });
};

// Resurrection and corpse summon handlers
const initiateResurrectReducer = useReducer(reducers.initiateResurrect);
const onInitiateResurrect = (corpseId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  initiateResurrectReducer({ casterCharacterId: selectedCharacter.value.id, corpseId });
};

const initiateCorpseSummonReducer = useReducer(reducers.initiateCorpseSummon);
const onInitiateCorpseSummon = (targetCharacterId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  initiateCorpseSummonReducer({ casterCharacterId: selectedCharacter.value.id, targetCharacterId });
};

// Confirmation dialog for resurrection/corpse summon
const pendingPrompt = ref<{
  type: 'resurrect' | 'corpse_summon';
  pendingId: bigint;
  casterName: string;
  message: string;
} | null>(null);

watch([pendingSpellCasts, selectedCharacter], () => {
  if (!selectedCharacter.value) {
    pendingPrompt.value = null;
    return;
  }
  const charId = selectedCharacter.value.id;

  // Check for pending resurrect
  const rez = (pendingSpellCasts.value ?? []).find(p => p.spellType === 'resurrect' && p.targetCharacterId === charId);
  if (rez) {
    const caster = characters.value?.find(c => c.id === rez.casterCharacterId);
    pendingPrompt.value = {
      type: 'resurrect',
      pendingId: rez.id,
      casterName: caster?.name ?? 'A cleric',
      message: `${caster?.name ?? 'A cleric'} wants to resurrect you. Accept?`,
    };
    return;
  }

  // Check for pending corpse summon
  const summon = (pendingSpellCasts.value ?? []).find(p => p.spellType === 'corpse_summon' && p.targetCharacterId === charId);
  if (summon) {
    const caster = characters.value?.find(c => c.id === summon.casterCharacterId);
    pendingPrompt.value = {
      type: 'corpse_summon',
      pendingId: summon.id,
      casterName: caster?.name ?? 'Someone',
      message: `${caster?.name ?? 'Someone'} wants to summon your corpses to their location. Accept?`,
    };
    return;
  }

  pendingPrompt.value = null;
}, { deep: true });

const acceptResurrectReducer = useReducer(reducers.acceptResurrect);
const acceptCorpseSummonReducer = useReducer(reducers.acceptCorpseSummon);
const acceptPendingAction = () => {
  if (!conn.isActive || !selectedCharacter.value || !pendingPrompt.value) return;
  const charId = selectedCharacter.value.id;
  const pendingId = pendingPrompt.value.pendingId;
  if (pendingPrompt.value.type === 'resurrect') {
    acceptResurrectReducer({ characterId: charId, pendingId });
  } else {
    acceptCorpseSummonReducer({ characterId: charId, pendingId });
  }
  pendingPrompt.value = null;
};

const declineResurrectReducer = useReducer(reducers.declineResurrect);
const declineCorpseSummonReducer = useReducer(reducers.declineCorpseSummon);
const declinePendingAction = () => {
  if (!conn.isActive || !selectedCharacter.value || !pendingPrompt.value) return;
  const charId = selectedCharacter.value.id;
  const pendingId = pendingPrompt.value.pendingId;
  if (pendingPrompt.value.type === 'resurrect') {
    declineResurrectReducer({ characterId: charId, pendingId });
  } else {
    declineCorpseSummonReducer({ characterId: charId, pendingId });
  }
  pendingPrompt.value = null;
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

const { equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, equipItem, unequipItem, useItem, splitStack, organizeInventory, salvageItem } =
  useInventory({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    itemInstances,
    itemTemplates,
    itemAffixes,
  });

const deleteItem = (itemInstanceId: bigint) => {
  if (!selectedCharacter.value || !conn.isActive) return;
  // Confirmation already handled in InventoryPanel context menu
  deleteItemReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
};

const startGatherReducer = useReducer(reducers.startGatherResource);
const deleteItemReducer = useReducer(reducers.deleteItem);
const inviteToGroupReducer = useReducer(reducers.inviteToGroup);
const friendRequestReducer = useReducer(reducers.sendFriendRequestToCharacter);

const {
  recipes: craftingRecipes,
  filteredRecipes: craftingFilteredRecipes,
  recipeTypes: craftingRecipeTypes,
  activeFilter: craftingActiveFilter,
  showOnlyCraftable: craftingShowOnlyCraftable,
  craftingModalRecipe,
  openCraftModal,
  closeCraftModal,
  modifierItems: craftingModifierItems,
  essenceItems: craftingEssenceItems,
  research: researchRecipes,
  craft: craftRecipe,
  craftWithEnhancements,
} = useCrafting({
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

const onOpenCraftModal = (recipe: any) => {
  if (lockCrafting.value) return;
  openCraftModal(recipe);
};

const myFriendUserIds = computed(() =>
  friends.value.map((f) => f.friendUserId.toString())
);

const groupMemberIdStrings = computed(() =>
  groupCharacterMembers.value.map((m) => m.id.toString())
);

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
      openPanel('trade');
    } else {
      closePanelById('trade');
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
  const now = nowMicros.value;
  return resourceNodes.value
    .filter((node) => node.locationId.toString() === currentLocation.value?.id.toString())
    .filter((node) => {
      // Show shared nodes (no characterId) OR personal nodes for the selected character
      if (!node.characterId) return true;
      return node.characterId.toString() === selectedCharacter.value?.id.toString();
    })
    .filter((node) => node.state === 'available' || node.state === 'harvesting')
    .map((node) => {
      const local = localGather.value?.nodeId?.toString() === node.id.toString();
      const anyGather = resourceGathers.value.find(g => g.nodeId.toString() === node.id.toString());
      const isGathering = local || !!anyGather;
      const castMicros = 8_000_000;
      const endsAt = local
        ? localGather.value!.startMicros + castMicros
        : anyGather
          ? Number(anyGather.endsAtMicros)
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
  abilityLookup,
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
  selectedCorpseTarget,
  selectedCharacterTarget,
  groupId: computed(() => selectedCharacter.value?.groupId ?? null),
  pullerId,
  onTrackRequested: () => {
    openPanel('track');
  },
  onResurrectRequested: (corpseId: bigint) => {
    if (!selectedCharacter.value) return;
    initiateResurrectReducer({ casterCharacterId: selectedCharacter.value.id, corpseId });
  },
  onCorpseSummonRequested: (targetCharacterId: bigint) => {
    if (!selectedCharacter.value) return;
    initiateCorpseSummonReducer({ casterCharacterId: selectedCharacter.value.id, targetCharacterId });
  },
  addLocalEvent,
});

const eatFoodReducer = useReducer(reducers.eatFood);
const eatFood = (itemInstanceId: bigint) => {
  if (!conn.isActive || !selectedCharacter.value) return;
  eatFoodReducer({ characterId: selectedCharacter.value.id, itemInstanceId });
};

const savePanelLayoutReducer = useReducer(reducers.savePanelLayout);

const equippedStatBonuses = computed(() => {
  if (!selectedCharacter.value) {
    return { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
  }
  const bonus = { str: 0n, dex: 0n, cha: 0n, wis: 0n, int: 0n };
  const equippedInstanceIds = new Set<string>();
  for (const instance of itemInstances.value) {
    if (instance.ownerCharacterId.toString() !== selectedCharacter.value.id.toString()) continue;
    if (!instance.equippedSlot) continue;
    equippedInstanceIds.add(instance.id.toString());
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
  // Add affix bonuses from equipped items
  for (const affix of itemAffixes.value) {
    if (!equippedInstanceIds.has(affix.itemInstanceId.toString())) continue;
    const mag = BigInt(affix.magnitude);
    if (affix.statKey === 'strBonus') bonus.str += mag;
    else if (affix.statKey === 'dexBonus') bonus.dex += mag;
    else if (affix.statKey === 'intBonus') bonus.int += mag;
    else if (affix.statKey === 'wisBonus') bonus.wis += mag;
    else if (affix.statKey === 'chaBonus') bonus.cha += mag;
  }
  // Add active CharacterEffect stat buffs for selected character
  const charId = selectedCharacter.value.id.toString();
  for (const effect of characterEffects.value) {
    if (effect.characterId.toString() !== charId) continue;
    const mag = BigInt(effect.magnitude);
    if (effect.effectType === 'str_bonus') bonus.str += mag;
    else if (effect.effectType === 'dex_bonus') bonus.dex += mag;
    else if (effect.effectType === 'cha_bonus') bonus.cha += mag;
    else if (effect.effectType === 'wis_bonus') bonus.wis += mag;
    else if (effect.effectType === 'int_bonus') bonus.int += mag;
  }
  return bonus;
});


const selectTrackedTarget = (templateId: bigint) => {
  if (!selectedCharacter.value) return;
  useAbility('ranger_track', selectedCharacter.value.id);
  startTrackedCombat(templateId);
  closePanelById('track');
};

const offensiveTargetEnemyId = ref<bigint | null>(null);
watch(
  () => activeEnemy.value?.id,
  (id) => {
    if (id != null) offensiveTargetEnemyId.value = id;
  },
  { immediate: true }
);

// Initialize panel manager with default positions
const {
  panels,
  openPanels,
  togglePanel: togglePanelInternal,
  openPanel,
  closePanel: closePanelById,
  bringToFront,
  startDrag,
  startResize,
  onMouseMove: onPanelMouseMove,
  onMouseUp: onPanelMouseUp,
  panelStyle,
  resetAllPanels,
} = usePanelManager(getDefaultLayout(), {
  serverPanelLayouts: characterPanelLayouts,
  selectedCharacterId,
  savePanelLayout: savePanelLayoutReducer,
});

// Wire resetAllPanels into the command handler callback declared earlier
_resetPanelsCb.value = resetAllPanels;

// Wrapper to intercept help toggle
const togglePanel = (panelId: string) => {
  if (panelId === 'help') {
    showHelp.value = !showHelp.value;
    return;
  }
  togglePanelInternal(panelId);
};

type AccordionKey = 'enemies';

const accordionState = reactive<Record<AccordionKey, boolean>>({
  enemies: true,
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

watch(
  () => [...openPanels.value],
  (panels) => {
    if (onboardingStep.value === 'inventory' && panels.includes('characterInfo')) {
      onboardingStep.value = 'hotbar';
    } else if (onboardingStep.value === 'hotbar' && panels.includes('hotbarPanel')) {
      onboardingStep.value = null;
    }
  }
);

onMounted(() => {
  loadAccordionState();
  window.addEventListener('mousemove', onPanelMouseMove);
  window.addEventListener('mouseup', onPanelMouseUp);
  document.addEventListener('click', hideAbilityPopup);
  uiTimer = window.setInterval(() => {
    nowMicros.value = Date.now() * 1000;
  }, 100);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanelMouseMove);
  window.removeEventListener('mouseup', onPanelMouseUp);
  document.removeEventListener('click', hideAbilityPopup);
  if (uiTimer) clearInterval(uiTimer);
});

const showCombatStack = computed(() => combatLocked.value);
const showRightPanel = computed(() => false);

const localGather = ref<{ nodeId: bigint; startMicros: number; durationMicros: number } | null>(
  null
);

const localFlee = ref<{ startMicros: number; durationMicros: number; timer: number } | null>(null);

const isFleeCasting = computed(() => localFlee.value !== null);
const fleeProgress = computed(() => {
  if (!localFlee.value) return 0;
  return Math.min(1, Math.max(0, (nowMicros.value - localFlee.value.startMicros) / localFlee.value.durationMicros));
});

const handleFlee = () => {
  if (!selectedCharacter.value || !conn.isActive || !activeCombat.value) return;
  // If already casting flee, cancel it
  if (localFlee.value) {
    clearTimeout(localFlee.value.timer);
    localFlee.value = null;
    return;
  }
  const timer = window.setTimeout(() => {
    flee();
    localFlee.value = null;
  }, 3000);
  localFlee.value = {
    startMicros: nowMicros.value,
    durationMicros: 3_000_000,
    timer,
  };
};

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
    // Orphan safety net: if localGather exceeds duration + 2s grace, force clear
    if (localGather.value && now - localGather.value.startMicros >= localGather.value.durationMicros + 2_000_000) {
      localGather.value = null;
    }
  }
);

// Gather interruption detector: if server has no active gather for our node, clear localGather after 1s grace
watch(
  () => [localGather.value, activeResourceGather.value] as const,
  ([local, serverGather]) => {
    if (!local) return;
    // Server still shows active gather for this node - all good
    if (serverGather && serverGather.nodeId.toString() === local.nodeId.toString()) return;
    // Server has no active gather - check if enough time passed (1s grace for subscription lag)
    const elapsed = nowMicros.value - local.startMicros;
    if (elapsed > 1_000_000) {
      // Grace period passed, server doesn't have this gather - it was interrupted
      localGather.value = null;
    }
  }
);

// Clear localGather on combat start (gathering stops when entering combat)
watch(
  () => activeCombat.value,
  (newVal) => {
    if (newVal && localGather.value) {
      localGather.value = null;
    }
  }
);

// Clear localFlee when combat ends (flee cast auto-cancelled if combat resolves)
watch(
  () => activeCombat.value,
  (newVal, oldVal) => {
    if (!newVal && localFlee.value) {
      clearTimeout(localFlee.value.timer);
      localFlee.value = null;
    }
  }
);

// Rank-up notification watcher
let lastRenownRank = 0;
watch(characterRenown, (newVal, oldVal) => {
  if (!newVal) { lastRenownRank = 0; return; }
  const newRank = Number(newVal.currentRank);
  if (newRank > lastRenownRank && lastRenownRank > 0) {
    const rankInfo = RENOWN_RANKS_CLIENT.find(r => r.rank === newRank);
    rankUpNotification.value = { rankName: rankInfo?.name ?? `Rank ${newRank}` };
  }
  lastRenownRank = newRank;
});

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

const abilityPopup = ref<{
  visible: boolean;
  x: number;
  y: number;
  name: string;
  description: string;
  stats: { label: string; value: any }[];
}>({
  visible: false,
  x: 0,
  y: 0,
  name: '',
  description: '',
  stats: [],
});


const tooltipRarityColor = (item: any): Record<string, string> => {
  const key = ((item?.qualityTier ?? item?.rarity ?? 'common') as string).toLowerCase();
  return { color: rarityColor(key) };
};

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

const showAbilityPopup = (payload: { name: string; description: string; stats: { label: string; value: any }[]; x: number; y: number }) => {
  abilityPopup.value = { visible: true, ...payload };
};

const hideAbilityPopup = () => {
  abilityPopup.value = { visible: false, x: 0, y: 0, name: '', description: '', stats: [] };
};

const hotbarAbilityDescription = (slot: any): string => {
  const liveAbility = abilityLookup.value.get(slot.abilityKey ?? '');
  return liveAbility?.description?.trim() || slot.description || `${slot.name} ability.`;
};

// panelTitle no longer needed - each panel has its own title in the template

// togglePanel now comes from usePanelManager

watch(
  [() => isLoggedIn.value, () => player.value?.activeCharacterId],
  ([loggedIn, activeId]) => {
    if (!loggedIn) {
      selectedCharacterId.value = '';
      // Close all panels
      for (const id of openPanels.value) {
        closePanelById(id);
      }
      return;
    }
    if (activeId && !selectedCharacterId.value) {
      selectedCharacterId.value = activeId.toString();
      return;
    }
    // No activeId — the character select screen will show naturally
    // since selectedCharacter will be null.
  }
);

const formatTimestamp = (ts: { microsSinceUnixEpoch: bigint }) => {
  const millis = Number(ts.microsSinceUnixEpoch / 1000n);
  return new Date(millis).toLocaleTimeString();
};

const goToCamp = () => {
  deselectCharacter();
};

const handleChoosePerk = (perkKey: string) => {
  console.log('[handleChoosePerk] Called with perkKey:', perkKey);
  console.log('[handleChoosePerk] selectedCharacter:', selectedCharacter.value);
  console.log('[handleChoosePerk] window.__db_conn:', window.__db_conn);

  if (!selectedCharacter.value) {
    console.error('[handleChoosePerk] No selected character!');
    return;
  }
  if (!window.__db_conn) {
    console.error('[handleChoosePerk] No database connection!');
    return;
  }

  console.log('[handleChoosePerk] Calling choosePerk reducer with:', {
    characterId: selectedCharacter.value.id,
    perkKey,
  });

  try {
    window.__db_conn.reducers.choosePerk({
      characterId: selectedCharacter.value.id,
      perkKey,
    });
    console.log('[handleChoosePerk] Reducer called successfully');
  } catch (error) {
    console.error('[handleChoosePerk] Error calling reducer:', error);
  }
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

@keyframes loadingPulse {
  0%, 100% {
    opacity: 0.5;
  }
  50% {
    opacity: 1;
  }
}

@keyframes lootBorderPulse {
  0%   { box-shadow: 0 0 4px 2px rgba(255, 180, 40, 0.0);   border-color: rgba(255, 255, 255, 0.10); }
  20%  { box-shadow: 0 0 12px 5px rgba(255, 180, 40, 0.75); border-color: rgba(255, 190, 60, 0.90); }
  50%  { box-shadow: 0 0 20px 8px rgba(255, 160, 20, 0.55); border-color: rgba(255, 200, 80, 0.80); }
  80%  { box-shadow: 0 0 12px 5px rgba(255, 180, 40, 0.40); border-color: rgba(255, 190, 60, 0.60); }
  100% { box-shadow: 0 0 4px 2px rgba(255, 180, 40, 0.0);   border-color: rgba(255, 255, 255, 0.10); }
}

.loot-panel-pulse {
  animation: lootBorderPulse 0.9s ease-in-out 4;
  border: 1px solid rgba(255, 190, 60, 0.70) !important;
}
</style>

