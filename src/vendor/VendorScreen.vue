<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { PhStorefront } from '@phosphor-icons/vue';
import { FRAME_KEY, GAME_KEY, createInertFrame, createInertGame } from '../game/context';
import type { ScreenArgs } from '../game/context';
import { LEDGER_KEY, createInertLedger } from '../ledger/ledgerContext';
import { createActionRunner } from '../ledger/actionRunner';
import NoticeLine from '../ledger/NoticeLine.vue';
import SegTabs from '../ledger/SegTabs.vue';
import EmptyState from '../screens/EmptyState.vue';
import ForSale from './ForSale.vue';
import SellPanel from './SellPanel.vue';
import { rapportParts, resolveVendor, vendorLeft } from './vendorModel';
import type { VendorResolution, VendorSnapshot } from './vendorModel';

// The Trade screen (50-UI-SPEC "Vendor Contract" and "Layout Contract > Vendor"): the vendor band
// with the rapport line, the For sale and Your backpack columns on desktop, and a Buy and Sell tab
// pair under a vendor row on mobile. The vendor comes from the screen arguments (Nearby's Trade),
// else the only vendor here, else a list to choose from. A second Trade for another NPC does not
// remount the drawer, so the screen watches the arguments, resets its local state and re-keys the
// vendor stock through ledger.setVendor. Names, greetings and item names are server text and only
// reach the page as text nodes. Registration in SCREENS is Plan 23.
const frame = inject(FRAME_KEY, createInertFrame());
const game = inject(GAME_KEY, createInertGame());
const ledger = inject(LEDGER_KEY, createInertLedger());

const mobile = computed(() => !frame.isDesktop.value);
const online = computed(() => game.connected.value && ledger.reducers.value !== null);
const runner = createActionRunner({ online });

const character = computed(() => game.character.value);

// A vendor chosen from the 'Vendors here' list, or picked automatically as the only vendor here.
// Keeping it as a choice means a vendor that later leaves is reported as no longer nearby.
const chosen = ref<{ id: bigint; name: string } | null>(null);
const resetKey = ref(0);
const tab = ref('buy');
const snapshot = shallowRef<VendorSnapshot | null>(null);

const TABS = [
  { id: 'buy', label: 'Buy' },
  { id: 'sell', label: 'Sell' },
];

const effectiveArgs = computed<ScreenArgs | null>(() => {
  const args = frame.screenArgs.value;
  if (args !== null && args.npcId !== undefined) return args;
  if (chosen.value !== null) return { npcId: chosen.value.id, npcName: chosen.value.name };
  return null;
});

const resolution = computed<VendorResolution>(() => resolveVendor(effectiveArgs.value, game.npcsHere.value));

function applyResolution(res: VendorResolution): void {
  if (res.kind === 'vendor') {
    const npc = res.npc;
    snapshot.value = {
      id: npc.id,
      name: npc.name,
      greeting: npc.greeting ?? '',
      factionId: npc.factionId ?? null,
      locationId: npc.locationId,
    };
    if (effectiveArgs.value === null) chosen.value = { id: npc.id, name: npc.name };
  } else if (res.kind === 'gone') {
    const current = snapshot.value;
    if (current === null || current.id !== res.npcId) {
      snapshot.value = {
        id: res.npcId,
        name: res.name,
        greeting: '',
        factionId: null,
        locationId: character.value?.locationId ?? 0n,
      };
    }
  } else {
    snapshot.value = null;
  }
}
watch(resolution, applyResolution, { immediate: true });

// The vendor stock subscription follows the snapshot (also while the vendor is gone, so the band and
// the For sale rows stay), and closes when the screen has no vendor or unmounts.
watch(
  () => (snapshot.value === null ? null : snapshot.value.id),
  () => {
    const current = snapshot.value;
    ledger.setVendor(current === null ? null : { npcId: current.id, npcName: current.name });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  ledger.setVendor(null);
});

// A second Trade (even for the same NPC) arrives as new screen arguments without a remount: the
// local choice, the For sale filter, the mobile tab and any open confirmation start over.
watch(
  () => frame.screenArgs.value,
  () => {
    chosen.value = null;
    resetKey.value += 1;
    tab.value = 'buy';
  },
);

// The Vendors here list is replaced by the vendor band, which removes the focused pick; focus
// moves to the vendor's name (tabindex -1), so it is announced and never falls to body.
const vendorName = useTemplateRef<HTMLElement>('vendorName');

async function choose(id: bigint, name: string): Promise<void> {
  chosen.value = { id, name };
  resetKey.value += 1;
  tab.value = 'buy';
  await nextTick();
  vendorName.value?.focus();
}

const nearby = computed(() => (snapshot.value === null ? false : !vendorLeft(snapshot.value, game.npcsHere.value)));
const factionName = computed(() => {
  const current = snapshot.value;
  if (current === null || current.factionId === null) return '';
  const faction = game.factions.value.find((row) => row.id === current.factionId);
  return faction ? faction.name : '';
});
const role = computed(() => (factionName.value === '' ? 'Vendor' : `Vendor · ${factionName.value}`));
const initial = computed(() => (snapshot.value === null ? '' : (Array.from(snapshot.value.name)[0] ?? '')));
const quote = computed(() =>
  snapshot.value !== null && snapshot.value.greeting !== '' ? `“${snapshot.value.greeting}”` : '',
);
const rapport = computed(() => {
  const c = character.value;
  if (c === null) return null;
  return rapportParts({
    perkKeys: game.renownPerks.value.map((perk) => perk.perkKey),
    level: c.level,
    vendorBuyMod: c.vendorBuyMod,
    vendorSellMod: c.vendorSellMod,
  });
});
</script>

<template>
  <div class="vendor-screen" :class="{ mobile }">
    <EmptyState
      v-if="!character || resolution.kind === 'empty'"
      :icon="PhStorefront"
      title="No vendor here."
      body="Find a vendor in Nearby, then choose Trade."
    />

    <div v-else-if="resolution.kind === 'list'" class="vendor-list">
      <h6>Vendors here</h6>
      <ul class="picks">
        <li v-for="vendor in resolution.vendors" :key="String(vendor.id)">
          <button type="button" class="btn btn-secondary vendor-pick" @click="choose(vendor.id, vendor.name)">
            <PhStorefront :size="20" aria-hidden="true" />
            <span class="pick-name">{{ vendor.name }}</span>
          </button>
        </li>
      </ul>
    </div>

    <template v-else-if="snapshot">
      <div v-if="!mobile" class="band">
        <span class="avatar" aria-hidden="true">{{ initial }}</span>
        <div class="identity">
          <span ref="vendorName" class="name" tabindex="-1">{{ snapshot.name }}</span>
          <span class="role">{{ role }}</span>
        </div>
        <p v-if="rapport" class="rapport">
          {{ rapport.lead }}<span class="figures">{{ rapport.figures }}</span>{{ rapport.suffix }}
        </p>
        <p v-if="quote" class="quote" :title="snapshot.greeting">{{ quote }}</p>
      </div>
      <template v-else>
        <div class="vendor-row">
          <span class="avatar" aria-hidden="true">{{ initial }}</span>
          <div class="identity">
            <span ref="vendorName" class="name" tabindex="-1">{{ snapshot.name }}</span>
            <span v-if="quote" class="quote one-line" :title="snapshot.greeting">{{ quote }}</span>
          </div>
        </div>
        <p v-if="rapport" class="rapport mobile-rapport">
          {{ rapport.lead }}<span class="figures">{{ rapport.figures }}</span>{{ rapport.suffix }}
        </p>
      </template>

      <div v-if="!mobile" class="desk-grid">
        <div class="col sale-col">
          <ForSale
            :vendor="snapshot"
            :vendor-nearby="nearby"
            :runner="runner"
            :mobile="false"
            :reset-key="resetKey"
          />
        </div>
        <div class="col sell-col">
          <SellPanel
            :key="resetKey"
            :open-vendor-id="snapshot.id"
            :vendor-nearby="nearby"
            :vendor-name="snapshot.name"
            :runner="runner"
            :mobile="false"
          />
        </div>
      </div>
      <SegTabs v-else v-model="tab" :tabs="TABS" label="Trade view" id-prefix="vendor">
        <template #default="{ active }">
          <div class="panel-body">
            <ForSale
              v-if="active === 'buy'"
              :vendor="snapshot"
              :vendor-nearby="nearby"
              :runner="runner"
              mobile
              :reset-key="resetKey"
            />
            <SellPanel
              v-else
              :key="resetKey"
              :open-vendor-id="snapshot.id"
              :vendor-nearby="nearby"
              :vendor-name="snapshot.name"
              :runner="runner"
              mobile
            />
          </div>
        </template>
      </SegTabs>
      <NoticeLine :rejection="runner.rejection.value" />
    </template>
  </div>
</template>

<style scoped>
.vendor-screen {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

h6 {
  margin: 0 0 8px;
  color: var(--color-neutral-400);
}

.vendor-list {
  display: flex;
  flex-direction: column;
}

.picks {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.vendor-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  text-align: left;
}

.pick-name {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--color-line-npc);
  font-weight: 500;
}

/* The band: avatar, identity, quote and rapport. Rapport sits under the role line from 900px and
   moves to the right edge from 1200px. */
.band {
  flex: none;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  grid-template-areas:
    'avatar identity'
    'avatar rapport'
    'avatar quote';
  column-gap: 16px;
  row-gap: 4px;
  align-items: start;
  padding-bottom: 16px;
}

@media (min-width: 1200px) {
  .band {
    grid-template-columns: 44px minmax(0, 1fr) auto;
    grid-template-areas:
      'avatar identity rapport'
      'avatar quote rapport';
  }

  .rapport {
    text-align: right;
  }
}

.avatar {
  grid-area: avatar;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-neutral-800);
  box-shadow: inset 0 0 0 1px var(--color-neutral-700);
  color: var(--color-line-npc);
  font-size: 14px;
  font-weight: 500;
}

.identity {
  grid-area: identity;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.name {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--color-line-npc);
  overflow-wrap: anywhere;
}

.role {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-400);
  overflow-wrap: anywhere;
}

.quote {
  grid-area: quote;
  margin: 0;
  font-size: 12px;
  font-style: italic;
  line-height: 1.5;
  color: var(--color-neutral-300);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}

.rapport {
  grid-area: rapport;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-neutral-500);
  font-variant-numeric: tabular-nums;
}

.figures {
  color: var(--color-accent-300);
}

.desk-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 24px;
}

.col {
  min-height: 0;
  min-width: 0;
}

.vendor-row {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
}

.vendor-row .identity {
  flex: 1;
}

.quote.one-line {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--color-neutral-400);
}

.mobile-rapport {
  flex: none;
  padding: 8px 0;
}

.panel-body {
  padding: 8px 0;
}
</style>
