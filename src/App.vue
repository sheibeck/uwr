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
      v-if="panels.log.open"
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

    <!-- Character Info Panel (wide) — combines Inventory and Stats tabs -->
    <div v-if="panels.characterInfo && panels.characterInfo.open" data-panel-id="characterInfo" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('characterInfo').value || {}) }" @mousedown="bringToFront('characterInfo')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('characterInfo', $event)"><div>Character</div><button type="button" :style="styles.panelClose" @click="closePanelById('characterInfo')">x</button></div>
      <div :style="styles.floatingPanelBody"><CharacterInfoPanel :styles="styles" :conn-active="conn.isActive" :selected-character="selectedCharacter" :equipped-slots="equippedSlots" :inventory-items="inventoryItems" :inventory-count="inventoryCount" :max-inventory-slots="maxInventorySlots" :combat-locked="lockInventoryEdits" :stat-bonuses="equippedStatBonuses" :locations="locations" :regions="regions" @equip="equipItem" @unequip="unequipItem" @use-item="useItem" @eat-food="eatFood" @delete-item="deleteItem" @split-stack="(id: bigint, qty: bigint) => splitStack(id, qty)" @organize="organizeInventory" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
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
      <div :style="styles.floatingPanelBody"><CraftingPanel :styles="styles" :selected-character="selectedCharacter" :crafting-available="currentLocationCraftingAvailable" :combat-locked="lockCrafting" :recipes="craftingRecipes" @research="onResearchRecipes" @craft="onCraftRecipe" /></div>
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

    <!-- Loot Panel -->
    <div v-if="panels.loot && panels.loot.open" data-panel-id="loot" :style="{ ...styles.floatingPanel, ...(panelStyle('loot').value || {}) }" @mousedown="bringToFront('loot')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('loot', $event)"><div>Loot</div><button type="button" :style="styles.panelClose" @click="closePanelById('loot')">×</button></div>
      <div :style="styles.floatingPanelBody"><LootPanel :styles="styles" :conn-active="conn.isActive" :loot-items="pendingLoot" @take-loot="takeLoot" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('loot', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('loot', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('loot', $event, { right: true, bottom: true })" />
    </div>

    <!-- Vendor Panel (wide) -->
    <div v-if="panels.vendor && panels.vendor.open" data-panel-id="vendor" :style="{ ...styles.floatingPanel, ...styles.floatingPanelWide, ...(panelStyle('vendor').value || {}) }" @mousedown="bringToFront('vendor')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('vendor', $event)"><div>{{ activeVendor?.name ?? 'Vendor' }}</div><button type="button" :style="styles.panelClose" @click="closePanelById('vendor')">×</button></div>
      <div :style="styles.floatingPanelBody"><VendorPanel :styles="styles" :selected-character="selectedCharacter" :vendor="activeVendor" :vendor-items="vendorItems" :inventory-items="inventoryItems" @buy="buyItem" @sell="sellItem" @sell-all-junk="sellAllJunk" @show-tooltip="showTooltip" @move-tooltip="moveTooltip" @hide-tooltip="hideTooltip" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('vendor', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('vendor', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('vendor', $event, { right: true, bottom: true })" />
    </div>

    <!-- Character Actions Panel -->
    <div v-if="panels.characterActions && panels.characterActions.open" data-panel-id="characterActions" :style="{ ...styles.floatingPanel, ...(panelStyle('characterActions').value || {}) }" @mousedown="bringToFront('characterActions')">
      <div :style="styles.floatingPanelHeader" @mousedown="startDrag('characterActions', $event)"><div>{{ actionTargetCharacter ? `${actionTargetCharacter.name} · ${actionTargetCharacter.className} Lv ${actionTargetCharacter.level}` : 'Actions' }}</div><button type="button" :style="styles.panelClose" @click="closePanelById('characterActions')">×</button></div>
      <div :style="styles.floatingPanelBody"><CharacterActionsPanel :styles="styles" :target="actionTargetCharacter" :is-friend="actionTargetIsFriend" :is-in-group="actionTargetInGroup" :is-leader="isLeader" :target-is-leader="actionTargetIsLeader" @invite="inviteToGroup" @kick="kickMember" @friend="sendFriendRequest" @promote="promoteLeader" @trade="startTrade" @message="sendWhisperTo" /></div>
      <div :style="styles.resizeHandleRight" @mousedown.stop="startResize('characterActions', $event, { right: true })" /><div :style="styles.resizeHandleBottom" @mousedown.stop="startResize('characterActions', $event, { bottom: true })" /><div :style="styles.resizeHandle" @mousedown.stop="startResize('characterActions', $event, { right: true, bottom: true })" />
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
            @select-enemy="setCombatTarget"
            @flee="flee"
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
          :can-engage="!!selectedCharacter && (!selectedCharacter.groupId || pullerId === selectedCharacter.id)"
          @pull="(payload) => startPull(payload.enemyId, payload.pullType)"
          @gather-resource="startGather"
          @hail="hailNpc"
          @open-vendor="openVendor"
          @character-action="openCharacterActions"
          @gift-npc="openGiftOverlay"
          @loot-all-corpse="onLootAllCorpse"
          @initiate-resurrect="onInitiateResurrect"
          @initiate-corpse-summon="onInitiateCorpseSummon"
          @select-npc="selectNpcTarget"
          @talk-npc="onTalkNpc"
          @select-corpse="selectCorpseTarget"
          @select-character="selectCharacterTarget"
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
      @toggle="togglePanel"
      @open="openPanel"
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
import HotbarPanel from './components/HotbarPanel.vue';
import CombatPanel from './components/CombatPanel.vue';
import TravelPanel from './components/TravelPanel.vue';
import LocationGrid from './components/LocationGrid.vue';
import LootPanel from './components/LootPanel.vue';
import CharacterActionsPanel from './components/CharacterActionsPanel.vue';
import TradePanel from './components/TradePanel.vue';
import CommandBar from './components/CommandBar.vue';
import ActionBar from './components/ActionBar.vue';
import NpcDialogPanel from './components/NpcDialogPanel.vue';
import VendorPanel from './components/VendorPanel.vue';
import TrackPanel from './components/TrackPanel.vue';
import RenownPanel from './components/RenownPanel.vue';
import HelpOverlay from './components/HelpOverlay.vue';
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
import { usePanelManager } from './composables/usePanelManager';

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
} = useGameData();

const { player, userId, userEmail, sessionStartedAt } = usePlayer({ players, users });

const { isLoggedIn, isPendingLogin, login, logout, authMessage, authError } = useAuth({
  connActive: computed(() => conn.isActive),
  player,
});

const nowMicros = ref(Date.now() * 1000);
const serverClockOffset = ref(0);
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

// Compute server clock offset from player.lastSeenAt to fix production clock skew
watch(
  () => player.value?.lastSeenAt,
  (lastSeenAt) => {
    if (!lastSeenAt || !('microsSinceUnixEpoch' in lastSeenAt)) return;
    const serverMicros = Number(lastSeenAt.microsSinceUnixEpoch);
    const clientMicros = Date.now() * 1000;
    // Only update if the timestamp is recent (within last 30 seconds) to avoid stale data
    const age = Math.abs(clientMicros - serverMicros);
    if (age < 30_000_000) {
      serverClockOffset.value = serverMicros - clientMicros;
    }
  },
  { immediate: true }
);

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
  if (!activeCombat.value) return [];
  const combatId = activeCombat.value.id.toString();
  return combatPets.value.filter((pet) => pet.combatId.toString() === combatId);
});

const relevantEffects = computed(() => {
  if (!selectedCharacter.value) return [];
  const memberIds = new Set<string>();
  memberIds.add(selectedCharacter.value.id.toString());
  for (const member of groupCharacterMembers.value) {
    memberIds.add(member.id.toString());
  }
  return characterEffects.value.filter(
    (effect: any) => memberIds.has(effect.characterId.toString())
  );
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


// Auto-open loot panel when pendingLoot goes from empty to non-empty
watch(
  () => pendingLoot.value.length,
  (count, prevCount) => {
    console.log('[LOOT DEBUG] pendingLoot changed:', prevCount, '->', count);
    if (count > 0 && (prevCount === 0 || prevCount === undefined)) {
      openPanel('loot');
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
});

const openCharacterActions = (characterId: bigint) => {
  actionTargetCharacterId.value = characterId;
  openPanel('characterActions');
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

const { equippedSlots, inventoryItems, inventoryCount, maxInventorySlots, equipItem, unequipItem, useItem, splitStack, organizeInventory } =
  useInventory({
    connActive: computed(() => conn.isActive),
    selectedCharacter,
    itemInstances,
    itemTemplates,
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
} = usePanelManager({
  group: { x: 40, y: 140 },
  travel: { x: 1040, y: 110 },
  hotbar: { x: 120, y: 260 },
  character: { x: 980, y: 140 },
  characterInfo: { x: 600, y: 140 },
  hotbarPanel: { x: 700, y: 140 },
  friends: { x: 500, y: 140 },
  crafting: { x: 600, y: 140 },
  journal: { x: 600, y: 140 },
  renown: { x: 600, y: 140 },
  loot: { x: 600, y: 200 },
  vendor: { x: 600, y: 140 },
  characterActions: { x: 600, y: 200 },
  trade: { x: 600, y: 140 },
  track: { x: 600, y: 200 },
  travelPanel: { x: 600, y: 140 },
  combat: { x: 600, y: 140 },
  log: { x: 40, y: 400, w: 500, h: 300, open: true },
}, {
  serverPanelLayouts: characterPanelLayouts,
  selectedCharacterId,
  savePanelLayout: savePanelLayoutReducer,
});

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
  uiTimer = window.setInterval(() => {
    nowMicros.value = Date.now() * 1000 + serverClockOffset.value;
  }, 200);
});

onBeforeUnmount(() => {
  window.removeEventListener('mousemove', onPanelMouseMove);
  window.removeEventListener('mouseup', onPanelMouseUp);
  if (uiTimer) clearInterval(uiTimer);
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
  // Close all open panels to reset UI state
  for (const id of openPanels.value) {
    closePanelById(id);
  }
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
</style>

