import { onBeforeUnmount, ref, watch, Ref } from 'vue';

export function useAudio(opts: { combinedEvents: Ref<any[]> }) {
  const { combinedEvents } = opts;

  const audioCtxRef = ref<AudioContext | null>(null);
  const lastResultId = ref<string | null>(null);
  const lastLevelUpEventId = ref<string | null>(null);

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

  // Victory/defeat sound watcher
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

  // Level-up sound watcher
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

  // Cleanup
  onBeforeUnmount(() => {
    if (audioCtxRef.value) {
      audioCtxRef.value.close();
    }
  });
}
