<script setup lang="ts">
import HereCard from './HereCard.vue';
import NearbyList from './NearbyList.vue';
import TrackingList from './TrackingList.vue';
import WorldEventCard from './WorldEventCard.vue';

// Here, Nearby, Tracking and the world event card as sibling sections (47-UI-SPEC "Context Rail
// Contract"). Shared by the desktop context rail and, in 47-12, the mobile Map sheet.
</script>

<template>
  <HereCard />
  <NearbyList />
  <TrackingList />
  <WorldEventCard />
</template>
