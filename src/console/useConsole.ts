// The console controller (47-CONTEXT "Input routing", "Conversation mode", "Click actions",
// "Input while an LLM job runs", "History and reload"; 47-RESEARCH "Echo rules").
//
// createConsole executes what routeInput describes against the reducers and owns the draft, the
// conversation chip, the narrative send queue, the keyword and rail actions and the one automatic
// look. Dispatch follows the route descriptor only (T-47-03): no reducer runs for a line that
// routeInput did not classify as that command's exact form. Only the active character id is sent
// (T-47-05); the server re-checks ownership against ctx.sender.
//
// Echo rules: the player's own line is echoed for intents, reducer commands, info commands and
// rail or keyword actions. No local echo for the automatic look, talk_to_npc, whisper,
// group_message, say or submit_command: the server writes those lines itself.
//
// Must be called inside a component setup or an effect scope: the watchers stop with that scope.

import { computed, ref, shallowRef, watch } from 'vue';
import type { ComputedRef } from 'vue';
import type { Character } from '../module_bindings/types';
import { createInputHistory } from '../input/history';
import { formatEvents, formatFaction, formatFactions, formatGroup, formatRenown } from '../input/infoCommands';
import { QUEUE_MAX, createNarrativeQueue } from '../input/narrativeQueue';
import type { QueuedLine } from '../input/narrativeQueue';
import { routeInput } from '../input/routeInput';
import type { InfoCommand, ReducerCall, RouteContext } from '../input/routeInput';
import { visibleNodes } from '../rails/nearby';
import type { ConsoleApi, ConversationTarget, FrameControls, GameData, GameReducers, SubmitResult } from '../game/context';
import type { KeywordEntry } from './keywords';
import { queueGateActive } from './indicator';

export const QUEUE_FULL_LINE = 'Wait for the Keeper to finish first.';
export const QUEUE_LOST_LINE = 'Your queued lines were not sent. Send them again.';

interface NarrativeLine {
  text: string;
  mode: 'narrative' | 'intent';
  /** Local echo text; null when the server writes the echo itself. */
  echo: string | null;
  /** For a direct talk send: the conversation NPC. */
  npcId?: bigint;
}

export function createConsole(deps: { game: GameData; frame: FrameControls }): ConsoleApi & { dispose(): void } {
  const { game, frame } = deps;

  const draft = ref('');
  const conversation = shallowRef<ConversationTarget | null>(null);
  const inputFocused = ref(false);
  const sendTick = ref(0);
  const focusTick = ref(0);

  const history = createInputHistory();
  const queue = createNarrativeQueue();
  const gate = computed(() => queueGateActive(game.llmJobs.value));
  const queuedCount = computed(() => queue.items.value.length);

  // ---- helpers -------------------------------------------------------------------------------

  function warn(name: string, error: unknown): void {
    console.warn('[console]', name, error);
  }

  /**
   * Runs one reducer call (object syntax). Always returns a promise and never rejects: the server
   * writes its own refusal line, so the client logs a warning and adds no copy.
   */
  function fire(name: string, run: (reducers: GameReducers) => Promise<void> | undefined): Promise<void> {
    const reducers = game.reducers.value;
    if (reducers === null) return Promise.resolve();
    try {
      return Promise.resolve(run(reducers)).catch((error: unknown) => warn(name, error));
    } catch (error) {
      warn(name, error);
      return Promise.resolve();
    }
  }

  function ready(): boolean {
    return game.connected.value && game.reducers.value !== null && game.characterId.value !== null;
  }

  function echo(text: string): void {
    game.feed.appendLocal('echo', text);
  }

  function bump(): void {
    sendTick.value += 1;
  }

  // ---- routing context -----------------------------------------------------------------------

  function nameOf(id: bigint): string | null {
    const self = game.character.value;
    if (self !== null && self.id === id) return self.name;
    const known = game.knownCharacters.value.find((c: Character) => c.id === id);
    return known ? known.name : null;
  }

  const pendingInviters = computed<string[]>(() => {
    const me = game.characterId.value;
    if (me === null) return [];
    const names: string[] = [];
    for (const invite of game.groupInvites.value) {
      if (invite.toCharacterId !== me) continue;
      const name = nameOf(invite.fromCharacterId);
      if (name !== null) names.push(name);
    }
    return names;
  });

  const routeContext: ComputedRef<RouteContext> = computed(() => {
    const placeNames: string[] = [];
    for (const connection of game.connections.value) {
      const place = game.locations.value.find((l) => l.id === connection.toLocationId);
      if (place) placeNames.push(place.name);
    }
    return {
      conversation: conversation.value ? { id: conversation.value.npcId, name: conversation.value.name } : null,
      npcsHere: game.npcsHere.value.map((n) => ({ id: n.id, name: n.name })),
      placeNames,
      nodeNames: visibleNodes(game.nodesHere.value, game.characterId.value).map((n) => n.name),
      pendingInviterNames: pendingInviters.value,
    };
  });

  // ---- info commands -------------------------------------------------------------------------

  function infoText(command: InfoCommand, arg: string | null): string {
    const me = game.characterId.value;
    const standings = game.factionStandings.value.filter((s) => s.characterId === me);
    switch (command) {
      case 'renown':
        return formatRenown({
          renown: game.renown.value.find((r) => r.characterId === me) ?? null,
          perks: game.renownPerks.value.filter((p) => p.characterId === me),
        });
      case 'factions':
        return formatFactions({ standings, factions: game.factions.value });
      case 'faction':
        if (arg === null) return formatFactions({ standings, factions: game.factions.value });
        return formatFaction(arg, { standings, factions: game.factions.value });
      case 'events':
        return formatEvents({
          events: game.worldEvents.value,
          regions: game.regions.value,
          objectives: game.eventObjectives.value,
        });
      case 'group': {
        const group = game.group.value;
        const members: { id: bigint; name: string; level: bigint; className: string }[] = [];
        for (const member of game.groupMembers.value) {
          const self = game.character.value;
          const row =
            self !== null && self.id === member.characterId
              ? self
              : game.knownCharacters.value.find((c: Character) => c.id === member.characterId);
          if (row) members.push({ id: row.id, name: row.name, level: row.level, className: row.className });
        }
        return formatGroup({
          inGroup: group !== null,
          leaderId: group !== null ? group.leaderCharacterId : null,
          members,
          inviterNames: pendingInviters.value,
        });
      }
      default:
        return '';
    }
  }

  // ---- narrative sends and the queue ---------------------------------------------------------

  function narrativeSend(line: NarrativeLine): SubmitResult {
    if (queue.mustQueue(gate.value)) {
      if (queue.items.value.length >= QUEUE_MAX) {
        game.feed.appendLocal('system', QUEUE_FULL_LINE);
        return 'refused';
      }
      const echoKey = game.feed.appendLocal('echo', line.echo ?? line.text, { queued: true });
      // Record the NPC the line was typed to; release decides the route against it (WR-06).
      queue.enqueue({
        text: line.text,
        mode: line.mode,
        echoKey,
        conversationNpcId: conversation.value === null ? null : conversation.value.npcId,
      });
      return 'queued';
    }

    const characterId = game.characterId.value;
    if (characterId === null) return 'offline';
    if (line.echo !== null) echo(line.echo);
    const token = queue.beginDirect();
    const sent =
      line.mode === 'narrative' && line.npcId !== undefined
        ? fire('talkToNpc', (r) => r.talkToNpc({ characterId, npcId: line.npcId as bigint, message: line.text }))
        : fire('submitIntent', (r) => r.submitIntent({ characterId, text: line.text }));
    void sent.finally(() => queue.settle(token));
    return 'sent';
  }

  /** Releases one queued line when the gate is clear and nothing is in flight. */
  function release(): void {
    if (!game.connected.value) return;
    const line: QueuedLine | null = queue.takeNext(gate.value);
    if (line === null) return;
    const token = queue.token();
    const characterId = game.characterId.value;
    if (characterId === null) {
      queue.settle(token);
      return;
    }
    // The route is decided now, against the NPC the line was typed to. A talk line goes out only
    // while the conversation is still with that same NPC and the NPC is here. In every other case
    // (conversation ended, another NPC hailed, or typed outside a conversation) it is an intent,
    // so a queued line never reaches a different NPC (WR-06).
    const queuedTo = line.conversationNpcId;
    const current = conversation.value;
    const sameNpc = queuedTo !== null && current !== null && current.npcId === queuedTo;
    const npcStillHere = sameNpc && game.npcsHere.value.some((n) => n.id === queuedTo);
    let sent: Promise<void>;
    if (line.mode === 'narrative' && queuedTo !== null && npcStillHere) {
      // The server echoes talk_to_npc itself, so the Queued echo goes away.
      game.feed.remove(line.echoKey);
      sent = fire('talkToNpc', (r) => r.talkToNpc({ characterId, npcId: queuedTo, message: line.text }));
    } else {
      game.feed.setQueued(line.echoKey, false);
      sent = fire('submitIntent', (r) => r.submitIntent({ characterId, text: line.text }));
    }
    void sent.finally(() => queue.settle(token));
  }

  const stopRelease = watch([gate, queue.inFlight, () => queue.items.value.length], release);

  function dropQueue(announce: boolean): void {
    const dropped = queue.drop();
    for (const line of dropped) game.feed.setQueued(line.echoKey, false);
    if (announce && dropped.length > 0) game.feed.appendLocal('system', QUEUE_LOST_LINE);
  }

  const stopConnected = watch(game.connected, (isConnected) => {
    if (!isConnected) dropQueue(true);
  });

  const stopCharacter = watch(game.characterId, () => {
    dropQueue(false);
    conversation.value = null;
  });

  // ---- conversation lifecycle ----------------------------------------------------------------

  const stopLocation = watch(
    () => (game.character.value === null ? null : game.character.value.locationId),
    () => {
      conversation.value = null;
    },
  );

  const stopNpcs = watch(
    () => game.npcsHere.value,
    (npcs) => {
      const target = conversation.value;
      if (target !== null && !npcs.some((n) => n.id === target.npcId)) conversation.value = null;
    },
  );

  // ---- automatic look ------------------------------------------------------------------------

  // One look when the frame opens for a character, after the private event subscription applied
  // (research Pitfall 2). Not repeated after a reconnect (CONTEXT asks for one look).
  let lookSentFor: bigint | null = null;
  const stopLook = watch(
    [game.privateEventsApplied, game.characterId, game.connected],
    ([applied, characterId, isConnected]) => {
      if (characterId === null) {
        lookSentFor = null;
        return;
      }
      if (!applied || !isConnected || game.reducers.value === null) return;
      if (lookSentFor === characterId) return;
      lookSentFor = characterId;
      void fire('submitIntent', (r) => r.submitIntent({ characterId, text: 'look' }));
    },
    { immediate: true },
  );

  // ---- submit --------------------------------------------------------------------------------

  function runReducer(characterId: bigint, call: ReducerCall, routeEcho: string | null): SubmitResult {
    if (routeEcho !== null) echo(routeEcho);
    const name = call.reducer;
    void fire(name, (r) => (r[name] as (a: object) => Promise<void>).call(r, { characterId, ...call.args }));
    return 'sent';
  }

  function submit(): SubmitResult {
    const characterId = game.characterId.value;
    if (!ready() || characterId === null) return 'offline';
    const route = routeInput(draft.value, routeContext.value);
    let result: SubmitResult;

    switch (route.kind) {
      case 'none':
        return 'empty';
      case 'reducer':
        result = runReducer(characterId, route.call, route.echo);
        break;
      case 'intent':
        if (route.queue) {
          result = narrativeSend({ text: route.text, mode: 'intent', echo: route.echo });
        } else {
          if (route.echo !== null) echo(route.echo);
          void fire('submitIntent', (r) => r.submitIntent({ characterId, text: route.text }));
          result = 'sent';
        }
        // A refused line stays in the draft, so the player has not left the conversation.
        if (route.endsConversation && result !== 'refused') conversation.value = null;
        break;
      case 'talk':
        result = narrativeSend({ text: route.message, mode: 'narrative', echo: null, npcId: route.npcId });
        break;
      case 'hail':
        result = narrativeSend({ text: route.text, mode: 'intent', echo: route.echo });
        if (result !== 'refused') conversation.value = { npcId: route.npc.id, name: route.npc.name };
        break;
      case 'info':
        echo(route.echo);
        game.feed.appendLocal('look', infoText(route.command, route.arg));
        result = 'sent';
        break;
      case 'endConversation':
        echo(route.echo);
        conversation.value = null;
        result = 'sent';
        break;
      default:
        return 'empty';
    }

    if (result === 'sent' || result === 'queued') {
      history.record(draft.value);
      draft.value = '';
      bump();
    }
    return result;
  }

  // ---- recall and pre-fill -------------------------------------------------------------------

  function recallPrevious(): void {
    const value = history.up(draft.value);
    if (value !== null) draft.value = value;
  }

  function recallNext(): void {
    const value = history.down();
    if (value !== null) draft.value = value;
  }

  function prefill(text: string): void {
    if (!ready()) return;
    frame.closeScreen();
    if (draft.value.trim() !== '') history.record(draft.value);
    draft.value = text;
    focusTick.value += 1;
  }

  // ---- click actions (CON-02) ----------------------------------------------------------------

  function endConversation(): void {
    conversation.value = null;
  }

  function hail(npc: { id: bigint; name: string }): void {
    if (!ready()) return;
    frame.closeScreen();
    const text = `hail ${npc.name}`;
    const result = narrativeSend({ text, mode: 'intent', echo: text });
    if (result === 'refused') return;
    conversation.value = { npcId: npc.id, name: npc.name };
    bump();
  }

  function travel(location: { id: bigint; name: string }): void {
    const characterId = game.characterId.value;
    if (!ready() || characterId === null) return;
    frame.closeScreen();
    conversation.value = null;
    echo(`go to ${location.name}`);
    void fire('moveCharacter', (r) => r.moveCharacter({ characterId, locationId: location.id }));
    bump();
  }

  function examine(name: string): void {
    if (!ready()) return;
    frame.closeScreen();
    conversation.value = null;
    const text = `look at ${name}`;
    if (narrativeSend({ text, mode: 'intent', echo: text }) !== 'refused') bump();
  }

  function gather(node: { id: bigint; name: string }): void {
    const characterId = game.characterId.value;
    if (!ready() || characterId === null) return;
    frame.closeScreen();
    conversation.value = null;
    echo(`gather ${node.name}`);
    void fire('startGatherResource', (r) => r.startGatherResource({ characterId, nodeId: node.id }));
    bump();
  }

  function pull(enemy: { id: bigint; name: string }, pullType: 'careful' | 'body'): void {
    const characterId = game.characterId.value;
    if (!ready() || characterId === null) return;
    // Actions are disabled in a fight (quick-261006-a0i).
    if (game.combat.active.value) return;
    frame.closeScreen();
    conversation.value = null;
    echo(`${pullType} pull ${enemy.name}`);
    void fire('startPull', (r) => r.startPull({ characterId, enemySpawnId: enemy.id, pullType }));
    bump();
  }

  function invite(name: string): void {
    const characterId = game.characterId.value;
    if (!ready() || characterId === null) return;
    frame.closeScreen();
    echo(`invite ${name}`);
    void fire('inviteToGroup', (r) => r.inviteToGroup({ characterId, targetName: name }));
    bump();
  }

  function whisperTo(name: string): void {
    prefill(`whisper ${name} `);
  }

  function trade(): void {
    if (!ready()) return;
    frame.closeScreen();
    frame.openScreen('vendor');
  }

  function actOnKeyword(entry: KeywordEntry): void {
    switch (entry.kind) {
      case 'npc':
        hail({ id: entry.id, name: entry.name });
        break;
      case 'enemy':
        // One click is one action: a careful pull, the same as the Nearby Pull button (owner decision).
        pull({ id: entry.id, name: entry.name }, 'careful');
        break;
      case 'place':
        travel({ id: entry.id, name: entry.name });
        break;
      case 'node':
        examine(entry.name);
        break;
      case 'player':
        whisperTo(entry.name);
        break;
    }
  }

  function dispose(): void {
    stopRelease();
    stopConnected();
    stopCharacter();
    stopLocation();
    stopNpcs();
    stopLook();
    dropQueue(false);
  }

  return {
    draft,
    conversation,
    queuedCount,
    sendTick,
    focusTick,
    inputFocused,
    submit,
    recallPrevious,
    recallNext,
    prefill,
    endConversation,
    actOnKeyword,
    hail,
    travel,
    examine,
    gather,
    pull,
    whisperTo,
    invite,
    trade,
    dispose,
  };
}
