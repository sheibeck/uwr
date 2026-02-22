<template>
  <div :style="backdropStyle" @click="emit('close')">
    <div :style="dialogStyle" @click.stop>
      <div :style="titleStyle">GUIDE TO THE REALMS</div>

      <div :style="contentStyle">
        <!-- Getting Started -->
        <div :style="sectionHeaderStyle">GETTING STARTED</div>
        <div :style="sectionTextStyle">
          Create a character by choosing a race and class. Select your character to enter the world.
        </div>

        <!-- Communicating -->
        <div :style="sectionHeaderStyle">COMMUNICATING</div>
        <div :style="sectionTextStyle">
          Use the chat input at the bottom of the screen to communicate with other players. Type <b>/say Hello</b> to say something in the local area, or <b>/w character_name Hello</b> to send a private message.
        </div>
        <div :style="sectionTextStyle">
          Typing <b>/</b> will show a list of available slash commands for communication, emotes, and more.
        </div>
        <div :style="sectionTextStyle">
          The log panel is your window into the world. It shows chat messages, combat events, and system notifications. Open it to stay informed about what's happening around you.
        </div>

        <!-- Interacting with the World -->
        <div :style="sectionHeaderStyle">INTERACTING WITH THE WORLD</div>
        <div :style="sectionTextStyle">
          <strong>Right-click</strong> on enemies, resources, NPCs, players, and corpses to open a context menu with available actions.
        </div>
        <div :style="sectionTextStyle">
          <strong>Left-click</strong> to select/target entities.
        </div>

        <!-- Travel -->
        <div :style="sectionHeaderStyle">TRAVEL</div>
        <div :style="sectionTextStyle">
          Moving between locations costs stamina (shown as "X sta" on travel buttons).
        </div>
        <div :style="sectionTextStyle">
          Cross-region travel costs more stamina and triggers a 5-minute cooldown.
        </div>
        <div :style="sectionTextStyle">
          Destinations are color-coded by difficulty relative to your level.
        </div>

        <!-- Location Icons -->
        <div :style="sectionHeaderStyle">LOCATION ICONS</div>
        <div :style="iconRowStyle">
          <div :style="styles.bindStoneIcon"></div>
          <span :style="sectionTextStyle">
            <strong>Bind Stone</strong> - Click to set your respawn point. You return here on death.
          </span>
        </div>
        <div :style="iconRowStyle">
          <div :style="styles.craftingIcon"></div>
          <span :style="sectionTextStyle">
            <strong>Crafting Station</strong> - This location has crafting facilities. Open the Crafting panel to craft items.
          </span>
        </div>


        <!-- Combat -->
        <div :style="sectionHeaderStyle">COMBAT</div>
        <div :style="sectionTextStyle">
          Engage enemies by right-clicking and choose a pull option.
        </div>
        <div :style="sectionTextStyle">
          Use your hotbar abilities during combat. Abilities have cooldowns and cast times.
        </div>
        <div :style="sectionTextStyle">
          Group with other players for tougher fights.
        </div>

        <!-- Useful Tips -->
        <div :style="sectionHeaderStyle">USEFUL TIPS</div>
        <div :style="sectionTextStyle">
          All panels can be moved by dragging their header and resized from edges/corners.
        </div>
        <div :style="sectionTextStyle">
          Type commands in the command bar at the bottom (start with / for slash commands).
        </div>
        <div :style="sectionTextStyle">
          Open the Log panel to see combat events, chat, and system messages.
        </div>
      </div>

      <div :style="buttonContainerStyle">
        <button :style="closeButtonStyle" @click="emit('close')">Close Guide</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, computed } from 'vue';

const props = defineProps<{
  styles: Record<string, Record<string, string | number>>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const backdropStyle = computed(() => ({
  position: 'fixed' as const,
  inset: '0',
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 10001,
}));

const dialogStyle = computed(() => ({
  background: '#141821',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: '14px',
  padding: '2rem',
  maxWidth: '600px',
  width: '90vw',
  maxHeight: 'calc(100vh - 120px)',
  overflowY: 'auto' as const,
  boxShadow: '0 14px 32px rgba(0,0,0,0.6)',
}));

const titleStyle = computed(() => ({
  fontSize: '1.5rem',
  fontWeight: 'bold' as const,
  color: 'rgba(248, 201, 74, 0.9)',
  marginBottom: '1.5rem',
  textAlign: 'center' as const,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
}));

const contentStyle = computed(() => ({
  display: 'flex',
  flexDirection: 'column' as const,
  gap: '0.8rem',
}));

const sectionHeaderStyle = computed(() => ({
  fontSize: '0.75rem',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.1em',
  color: 'rgba(230,232,239,0.6)',
  marginTop: '0.8rem',
  fontWeight: 600,
}));

const sectionTextStyle = computed(() => ({
  fontSize: '0.9rem',
  color: 'rgba(230,232,239,0.85)',
  lineHeight: '1.5',
}));

const iconRowStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.6rem',
}));

const buttonContainerStyle = computed(() => ({
  display: 'flex',
  justifyContent: 'center',
  marginTop: '1.5rem',
}));

const closeButtonStyle = computed(() => ({
  ...props.styles.ghostButton,
  padding: '0.6rem 1.8rem',
  fontSize: '0.95rem',
}));

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
