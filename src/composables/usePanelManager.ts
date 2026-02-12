import { computed, reactive, ref, watch } from 'vue';

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

export function usePanelManager(
  defaults: Record<string, { x: number; y: number; w?: number; h?: number }>
) {
  const panels = reactive<Record<string, PanelState>>({});
  const dragState = ref<DragState | null>(null);
  const resizeState = ref<ResizeState | null>(null);
  const topZ = ref(10);

  // Initialize panels from defaults
  for (const [id, def] of Object.entries(defaults)) {
    panels[id] = {
      open: false,
      x: def.x,
      y: def.y,
      w: def.w ?? 0,
      h: def.h ?? 0,
      zIndex: 10,
    };
  }

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
  };

  // Save to localStorage (debounced)
  let saveTimer: number | undefined;
  const saveToStorage = () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      try {
        const data: Record<string, PanelState> = {};
        for (const [id, state] of Object.entries(panels)) {
          data[id] = { ...state };
        }
        localStorage.setItem('uwr.panelStates', JSON.stringify(data));
      } catch (e) {
        console.warn('Failed to save panel states to localStorage:', e);
      }
    }, 300);
  };

  // Watch panels for changes
  watch(
    () => JSON.stringify(panels),
    () => {
      saveToStorage();
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
  };

  // Open panel and bring to front
  const openPanel = (id: string) => {
    if (!panels[id]) return;
    panels[id].open = true;
    bringToFront(id);
  };

  // Close panel
  const closePanel = (id: string) => {
    if (!panels[id]) return;
    panels[id].open = false;
  };

  // Bring panel to front
  const bringToFront = (id: string) => {
    if (!panels[id]) return;
    topZ.value += 1;
    panels[id].zIndex = topZ.value;
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

  // Load initial state
  loadFromStorage();

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
  };
}
