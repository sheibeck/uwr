import { computed, reactive, ref, watch, Ref } from 'vue';

// Panel IDs that open on demand — default to screen center
const ON_DEMAND_PANEL_IDS = [
  'character', 'characterInfo', 'hotbarPanel', 'friends', 'crafting',
  'journal', 'renown', 'worldEvents', 'loot', 'vendor', 'trade',
  'track', 'travelPanel', 'combat', 'map', 'bank',
];

/**
 * Compute the default panel layout based on current viewport dimensions.
 * Called both for initial defaults (new players) and by /resetwindows.
 *
 * Layout:
 *   log     — top-left  (x=16, y=16, w=500, h=300)
 *   travel  — top-right (x = vw - 320 - 16, y=16)
 *   hotbar  — just left of travel (x = travelX - 160 - 8, y=16)
 *   group   — just left of hotbar (x = hotbarX - 260 - 8, y=16)
 *   others  — screen center
 */
export function getDefaultLayout(): Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }> {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  const travelX = Math.max(400, vw - 320 - 16);
  const hotbarX = travelX - 160 - 8;
  const groupX = hotbarX - 260 - 8;

  const centerX = Math.round(vw / 2 - 160);
  const centerY = 50;

  const layout: Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }> = {
    log:    { x: 16,     y: 16, w: 500, h: 300, open: true },
    travel: { x: travelX, y: 16, open: true },
    hotbar: { x: hotbarX, y: 16, open: true },
    group:  { x: groupX,  y: 16, open: true },
  };

  for (const id of ON_DEMAND_PANEL_IDS) {
    layout[id] = { x: centerX, y: centerY };
  }

  // Map panel gets a wider default size to show the region graph comfortably
  layout.map = { x: Math.round(vw / 2 - 350), y: centerY, w: 700, h: 240 };

  return layout;
}

export interface PanelState {
  open: boolean;
  x: number;
  y: number;
  w: number; // 0 = auto/CSS default
  h: number; // 0 = auto/CSS default
  zIndex: number;
}

interface DragState {
  panelId: string;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  panelId: string;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  startPosX: number;
  startPosY: number;
  edges: {
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
    top?: boolean;
  };
}

interface ServerSyncOptions {
  serverPanelLayouts: Ref<any[]>;
  selectedCharacterId: Ref<string | bigint | undefined>;
  savePanelLayout: (args: { characterId: bigint; panelStatesJson: string }) => void;
}

export function usePanelManager(
  defaults: Record<string, { x: number; y: number; w?: number; h?: number; open?: boolean }>,
  serverSync?: ServerSyncOptions
) {
  const panels = reactive<Record<string, PanelState>>({});
  const dragState = ref<DragState | null>(null);
  const resizeState = ref<ResizeState | null>(null);
  const topZ = ref(10);
  const dirtyUntil = ref(0); // Timestamp until which local state has authority over server sync

  // Dirty window covers: 300ms localStorage + 2000ms server + ~500ms round-trip
  const DIRTY_WINDOW = 3000;

  // Mark local state as dirty to prevent server overwrite during save pipeline
  const markDirty = () => {
    dirtyUntil.value = Date.now() + DIRTY_WINDOW;
  };

  // Initialize panels from defaults
  for (const [id, def] of Object.entries(defaults)) {
    panels[id] = {
      open: def.open ?? false,
      x: def.x,
      y: def.y,
      w: def.w ?? 0,
      h: def.h ?? 0,
      zIndex: 10,
    };
  }

  // Sync topZ to the highest zIndex among all panels
  const syncTopZ = () => {
    let max = 10;
    for (const state of Object.values(panels)) {
      if (state.zIndex > max) max = state.zIndex;
    }
    topZ.value = max;
  };

  // Load from localStorage
  const loadFromStorage = () => {
    try {
      // Check for old localStorage format and migrate
      const oldData = localStorage.getItem('uwr.windowPositions');
      if (oldData) {
        const parsed = JSON.parse(oldData);
        // Migrate old positions
        if (parsed.group && panels.group) {
          panels.group.x = parsed.group.x;
          panels.group.y = parsed.group.y;
        }
        if (parsed.panel && panels.character) {
          // Old "panel" was the main floating panel (usually character)
          panels.character.x = parsed.panel.x;
          panels.character.y = parsed.panel.y;
        }
        if (parsed.travel && panels.travel) {
          panels.travel.x = parsed.travel.x;
          panels.travel.y = parsed.travel.y;
        }
        if (parsed.hotbar && panels.hotbar) {
          panels.hotbar.x = parsed.hotbar.x;
          panels.hotbar.y = parsed.hotbar.y;
        }
        // Delete old key after migration
        localStorage.removeItem('uwr.windowPositions');
      }

      // Load new format
      const data = localStorage.getItem('uwr.panelStates');
      if (data) {
        const parsed = JSON.parse(data);
        for (const [id, state] of Object.entries(parsed)) {
          if (panels[id]) {
            Object.assign(panels[id], state);
          }
        }
      }

      // Always ensure fixed panels start open
      if (panels.group) panels.group.open = true;
      if (panels.travel) panels.travel.open = true;
      if (panels.hotbar) panels.hotbar.open = true;
      if (panels.log) panels.log.open = true;
    } catch (e) {
      console.warn('Failed to load panel states from localStorage:', e);
    }

    // Sync topZ after loading to ensure it's >= all loaded zIndex values
    syncTopZ();
  };

  // Save to localStorage (debounced)
  let saveTimer: number | undefined;
  let serverSaveTimer: number | undefined;
  const loadingFromServer = ref(false);

  const saveToServer = () => {
    if (!serverSync) return;
    clearTimeout(serverSaveTimer);
    serverSaveTimer = window.setTimeout(() => {
      const charId = serverSync.selectedCharacterId.value;
      if (!charId) return;
      try {
        // Convert charId to bigint for reducer call (it's stored as a string in useCharacters)
        const charIdBigInt = typeof charId === 'string' ? BigInt(charId) : charId;
        const data: Record<string, any> = {};
        for (const [id, state] of Object.entries(panels)) {
          // Save all fields except zIndex (local-only)
          data[id] = { open: state.open, x: state.x, y: state.y, w: state.w, h: state.h };
        }
        serverSync.savePanelLayout({ characterId: charIdBigInt, panelStatesJson: JSON.stringify(data) });
      } catch (e) {
        console.warn('Failed to save panel layout to server:', e);
      }
    }, 2000);
  };

  const saveToStorage = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const data: Record<string, PanelState> = {};
        for (const [id, state] of Object.entries(panels)) {
          data[id] = { ...state };
        }
        localStorage.setItem('uwr.panelStates', JSON.stringify(data));
        // Also save to server after localStorage save
        saveToServer();
      } catch (e) {
        console.warn('Failed to save panel states to localStorage:', e);
      }
    }, 300);
  };

  // Watch panels for changes (skip if loading from server)
  watch(
    () => JSON.stringify(panels),
    () => {
      if (!loadingFromServer.value) {
        saveToStorage();
      }
    }
  );

  // Computed set of open panel IDs
  const openPanels = computed(() => {
    const result = new Set<string>();
    for (const [id, state] of Object.entries(panels)) {
      if (state.open) {
        result.add(id);
      }
    }
    return result;
  });

  // Toggle panel open/closed
  const togglePanel = (id: string) => {
    if (!panels[id]) return;
    panels[id].open = !panels[id].open;
    if (panels[id].open) {
      bringToFront(id);
    }
    markDirty();
  };

  // Open panel and bring to front
  const openPanel = (id: string) => {
    if (!panels[id]) return;
    panels[id].open = true;
    bringToFront(id);
    markDirty();
  };

  // Close panel
  const closePanel = (id: string) => {
    if (!panels[id]) return;
    panels[id].open = false;
    markDirty();
  };

  // Bring panel to front
  const bringToFront = (id: string) => {
    if (!panels[id]) return;
    topZ.value += 1;
    panels[id].zIndex = topZ.value;

    // Reset z-indexes when ceiling reached to prevent unbounded growth
    if (topZ.value > 5000) {
      // Collect all panels with their current zIndex, sort by zIndex ascending
      const entries = Object.entries(panels).sort((a, b) => a[1].zIndex - b[1].zIndex);
      // Reassign z-indexes starting from 10
      entries.forEach(([pid, state], idx) => {
        state.zIndex = 10 + idx;
      });
      topZ.value = 10 + entries.length;
      // Re-apply the current panel on top
      panels[id].zIndex = topZ.value;
    }
  };

  // Start dragging a panel
  const startDrag = (id: string, event: MouseEvent) => {
    if (!panels[id]) return;
    event.preventDefault();
    dragState.value = {
      panelId: id,
      offsetX: event.clientX - panels[id].x,
      offsetY: event.clientY - panels[id].y,
    };
    bringToFront(id);
  };

  // Start resizing a panel
  const startResize = (
    id: string,
    event: MouseEvent,
    edges: { right?: boolean; bottom?: boolean; left?: boolean; top?: boolean }
  ) => {
    if (!panels[id]) return;
    event.preventDefault();
    event.stopPropagation();

    const panel = panels[id];

    // If w or h is 0 (auto), get current size from the element
    let currentW = panel.w;
    let currentH = panel.h;

    if (currentW === 0 || currentH === 0) {
      // Try to find the panel element to get its current size
      const panelEl = document.querySelector(
        `[data-panel-id="${id}"]`
      ) as HTMLElement;
      if (panelEl) {
        if (currentW === 0) currentW = panelEl.clientWidth;
        if (currentH === 0) currentH = panelEl.clientHeight;
      } else {
        // Fallback to reasonable defaults
        if (currentW === 0) currentW = 320;
        if (currentH === 0) currentH = 400;
      }
    }

    resizeState.value = {
      panelId: id,
      startX: event.clientX,
      startY: event.clientY,
      startW: currentW,
      startH: currentH,
      startPosX: panel.x,
      startPosY: panel.y,
      edges,
    };
    bringToFront(id);
  };

  // Handle mouse move for drag and resize
  const onMouseMove = (event: MouseEvent) => {
    if (dragState.value) {
      const { panelId, offsetX, offsetY } = dragState.value;
      const panel = panels[panelId];
      if (!panel) return;

      // Calculate new position, clamped to stay on screen
      const newX = Math.max(16, event.clientX - offsetX);
      const newY = Math.max(16, event.clientY - offsetY);

      panel.x = newX;
      panel.y = newY;
      markDirty();
    } else if (resizeState.value) {
      const { panelId, startX, startY, startW, startH, startPosX, startPosY, edges } =
        resizeState.value;
      const panel = panels[panelId];
      if (!panel) return;

      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      let newW = startW;
      let newH = startH;
      let newX = startPosX;
      let newY = startPosY;

      if (edges.right) {
        newW = Math.max(200, startW + deltaX);
      }
      if (edges.bottom) {
        newH = Math.max(120, startH + deltaY);
      }
      if (edges.left) {
        const potentialW = startW - deltaX;
        if (potentialW >= 200) {
          newW = potentialW;
          newX = startPosX + deltaX;
        }
      }
      if (edges.top) {
        const potentialH = startH - deltaY;
        if (potentialH >= 120) {
          newH = potentialH;
          newY = startPosY + deltaY;
        }
      }

      panel.w = newW;
      panel.h = newH;
      panel.x = newX;
      panel.y = newY;
      markDirty();
    }
  };

  // Handle mouse up to end drag or resize
  const onMouseUp = () => {
    dragState.value = null;
    resizeState.value = null;
  };

  // Get style object for a panel
  const panelStyle = (id: string, extraStyles?: Record<string, any>) => {
    return computed(() => {
      const panel = panels[id];
      if (!panel) return {};

      const style: Record<string, any> = {
        left: `${panel.x}px`,
        top: `${panel.y}px`,
        zIndex: panel.zIndex,
        ...extraStyles,
      };

      if (panel.w > 0) {
        style.width = `${panel.w}px`;
      }
      if (panel.h > 0) {
        style.height = `${panel.h}px`;
      }

      return style;
    });
  };

  // Load from server when character changes
  if (serverSync) {
    // Track the last JSON we actually applied to avoid re-applying stale server state
    // when unrelated reactive updates (e.g. character stats changing) cause the
    // serverPanelLayouts computed to produce a new array reference.
    let lastAppliedJson = '';
    let lastAppliedCharId = '';

    watch(
      [() => serverSync.serverPanelLayouts.value, () => serverSync.selectedCharacterId.value],
      ([layouts, charId]) => {
        if (!charId || !layouts || layouts.length === 0) return;
        // Reset tracking when the active character changes
        const charIdStr = String(charId);
        if (charIdStr !== lastAppliedCharId) {
          lastAppliedJson = '';
          lastAppliedCharId = charIdStr;
        }
        // Convert charId to bigint for comparison (it's stored as a string in useCharacters)
        const charIdBigInt = typeof charId === 'string' ? BigInt(charId) : charId;
        // Find the layout row for the active character
        const row = layouts.find((r: any) => r.characterId === charIdBigInt);
        if (!row?.panelStatesJson) return;
        // Skip if server JSON hasn't changed — prevents reactive re-computations from
        // triggering a stale apply and closing panels that the user just opened.
        if (row.panelStatesJson === lastAppliedJson) return;
        // Skip server sync if local state is dirty (user made recent changes)
        if (dirtyUntil.value > Date.now()) return;
        // Mark as applied before writing so a thrown error doesn't leave it stale
        lastAppliedJson = row.panelStatesJson;
        try {
          loadingFromServer.value = true;
          const parsed = JSON.parse(row.panelStatesJson);
          for (const [id, state] of Object.entries(parsed)) {
            if (panels[id] && typeof state === 'object' && state !== null) {
              const s = state as any;
              // Only apply position/size/visibility, keep zIndex local
              if (typeof s.x === 'number') panels[id].x = s.x;
              if (typeof s.y === 'number') panels[id].y = s.y;
              if (typeof s.w === 'number') panels[id].w = s.w;
              if (typeof s.h === 'number') panels[id].h = s.h;
              if (typeof s.open === 'boolean') panels[id].open = s.open;
            }
          }
          // Always ensure fixed panels start open
          if (panels.group) panels.group.open = true;
          if (panels.travel) panels.travel.open = true;
          if (panels.hotbar) panels.hotbar.open = true;
          if (panels.log) panels.log.open = true;
        } catch (e) {
          console.warn('Failed to parse server panel layout:', e);
        } finally {
          loadingFromServer.value = false;
          // Sync topZ after server restore completes
          syncTopZ();
        }
      },
      { immediate: true }
    );
  }

  // Reset all panels to the default layout (same as new player defaults)
  const resetAllPanels = () => {
    const layout = getDefaultLayout();
    for (const [id, pos] of Object.entries(layout)) {
      if (!panels[id]) continue;
      panels[id].x = pos.x;
      panels[id].y = pos.y;
      if (pos.w !== undefined) panels[id].w = pos.w;
      if (pos.h !== undefined) panels[id].h = pos.h;
    }
    markDirty();
    saveToStorage();
  };

  // Load initial state
  loadFromStorage();
  // Guard: if localStorage has panel data, block server sync for 3s to protect
  // freshly-restored open/closed state. Server save debounce is 2s — user may have
  // camped before it completed, leaving server state stale.
  if (localStorage.getItem('uwr.panelStates')) {
    markDirty();
  }

  return {
    panels,
    openPanels,
    togglePanel,
    openPanel,
    closePanel,
    bringToFront,
    startDrag,
    startResize,
    onMouseMove,
    onMouseUp,
    panelStyle,
    resetAllPanels,
  };
}
