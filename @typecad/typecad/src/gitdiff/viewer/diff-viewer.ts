// State
let layerDiffData: Record<string, LayerDataEntry> = {};
let availableLayers: LayerMeta[] = [];
let activeLayers = new Set<string>();
let currentOpacity = 50;
let currentViewMode = 'diff-only';
let textualDiffData: TextualDiff | null = null;
let sidebarOpen = false;

// Nets / BOM diff data + filter state
let netsDiffData: NetlistDiff | null = null;
let bomDiffData: BomDiff | null = null;
let netsActiveFilters: Set<string> | null = null;
let bomActiveFilters: Set<string> | null = null;

// Zoom/pan state
let zoomLevel = 1;
let panTranslateX = 0;
let panTranslateY = 0;
let zoomPanInitialized = false;

// Separate drag state for zoom/pan vs swipe
let isPanDragging = false;
let panDragStartX = 0;
let panDragStartY = 0;
let panDragStartTranslateX = 0;
let panDragStartTranslateY = 0;

let isSwipeDragging = false;

// Touch state
let touchStartX = 0;
let touchStartY = 0;
let touchStartDistance = 0;
let initialZoom = 1;
let initialTranslateX = 0;
let initialTranslateY = 0;

// SVG offset for PCB coords
let SVG_OFFSET_X = 0;
let SVG_OFFSET_Y = 0;

interface LayerDataEntry {
  originalSvg: string | null;
  modifiedSvg: string | null;
  hasDifferences: boolean;
}

interface LayerMeta {
  name: string;
  type: string;
}

interface ChangeDescription {
  type: 'added' | 'removed' | 'modified';
  category: string;
  description: string;
  ref?: string;
  layer?: string;
  x?: number;
  y?: number;
  highlightRadius?: number;
  highlightW?: number;
  highlightH?: number;
}

interface TextualDiff {
  changes: ChangeDescription[];
  summary: string;
}

function getLayerType(layerName: string): string {
  if (layerName.includes('.Cu')) return 'COPPER';
  if (layerName.includes('.Paste')) return 'PASTE';
  if (layerName.includes('.Mask')) return 'MASK';
  if (layerName.includes('.Silkscreen')) return 'SILK';
  if (layerName.includes('Edge.Cuts')) return 'EDGE';
  if (layerName.includes('Render')) return 'RENDER';
  if (layerName.includes('.Fab')) return 'FAB';
  if (layerName.includes('.Courtyard')) return 'COURTYARD';
  if (layerName.includes('.Adhesive')) return 'ADHESIVE';
  if (layerName.includes('User.')) return 'USER';
  if (layerName.includes('Margin')) return 'MARGIN';
  return 'OTHER';
}

function getBadgeClass(layerType: string): string {
  switch (layerType) {
    case 'COPPER':
      return 'badge--destructive';
    case 'PASTE':
      return 'badge--success';
    case 'MASK':
      return 'badge--warning';
    case 'SILK':
      return 'badge--secondary';
    case 'EDGE':
      return 'badge--outline';
    default:
      return 'badge';
  }
}

function populateLayerBadges(): void {
  const container = document.getElementById('layerBadgesContainer');
  if (!container) return;
  container.innerHTML = '';

  if (availableLayers.length > 0) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'filter-toggle-all';
    toggleBtn.id = 'visualToggleAll';
    toggleBtn.textContent = 'Select All';
    toggleBtn.style.marginRight = '0.5rem';
    toggleBtn.addEventListener('click', () => {
      const allSelected = availableLayers.every((layer) => activeLayers.has(layer.name));
      if (allSelected) {
        activeLayers.clear();
      } else {
        availableLayers.forEach((layer) => activeLayers.add(layer.name));
      }
      updateLayerVisibility();
      updateEmptyState();
      updateBadgeStates();
    });
    container.appendChild(toggleBtn);
  }

  availableLayers.forEach((layer) => {
    const badge = document.createElement('span');
    badge.className = `badge ${getBadgeClass(layer.type)} layer-badge main-control-badge`;
    badge.setAttribute('data-layer', layer.name);
    badge.textContent = layer.name;
    badge.title = `Click to toggle ${layer.name} layer`;
    badge.addEventListener('click', () => toggleLayer(layer.name));
    container.appendChild(badge);
  });
}

function createInlineSvgElement(svgString: string): SVGElement | null {
  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = svgDoc.documentElement;
  if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') return null;
  svgEl.removeAttribute('width');
  svgEl.removeAttribute('height');
  svgEl.style.width = '100%';
  svgEl.style.height = '100%';
  svgEl.style.display = 'block';
  return document.importNode(svgEl, true) as unknown as SVGElement;
}

function createImageLayers(): void {
  const imageStack = document.getElementById('imageStack');
  if (!imageStack) return;
  const emptyViewer = imageStack.querySelector('.empty-viewer');

  const existingLayers = imageStack.querySelectorAll('.image-layer');
  existingLayers.forEach((layer) => layer.remove());

  availableLayers.forEach((layer) => {
    const data = layerDiffData[layer.name];

    const originalDiv = document.createElement('div');
    originalDiv.className = 'image-layer original-layer';
    originalDiv.setAttribute('data-layer', layer.name);
    originalDiv.setAttribute('data-type', 'original');
    originalDiv.style.display = 'none';
    if (data && data.originalSvg) {
      const svg = createInlineSvgElement(data.originalSvg);
      if (svg) originalDiv.appendChild(svg);
    }

    const modifiedDiv = document.createElement('div');
    modifiedDiv.className = 'image-layer modified-layer';
    modifiedDiv.setAttribute('data-layer', layer.name);
    modifiedDiv.setAttribute('data-type', 'modified');
    modifiedDiv.style.display = 'none';
    if (data && data.modifiedSvg) {
      const svg = createInlineSvgElement(data.modifiedSvg);
      if (svg) modifiedDiv.appendChild(svg);
    }

    if (emptyViewer) {
      imageStack.insertBefore(originalDiv, emptyViewer);
      imageStack.insertBefore(modifiedDiv, emptyViewer);
    }
  });
}

// updateLayerVisibility must be a var (hoisted) so toggleLayer can reference it before declaration
var updateLayerVisibility: () => void = function (): void {
  const validLayerNames = new Set(availableLayers.map((l) => l.name));
  const invalidLayers = Array.from(activeLayers).filter((name) => !validLayerNames.has(name));
  invalidLayers.forEach((name) => activeLayers.delete(name));

  availableLayers.forEach((layer) => {
    const originalLayer = document.querySelector(
      `.image-layer[data-layer="${layer.name}"][data-type="original"]`,
    ) as HTMLElement | null;
    const modifiedLayer = document.querySelector(
      `.image-layer[data-layer="${layer.name}"][data-type="modified"]`,
    ) as HTMLElement | null;

    [originalLayer, modifiedLayer].forEach((el) => {
      if (el) el.style.display = 'none';
    });
  });

  activeLayers.forEach((layerName) => {
    const originalLayer = document.querySelector(
      `.image-layer[data-layer="${layerName}"][data-type="original"]`,
    ) as HTMLElement | null;
    const modifiedLayer = document.querySelector(
      `.image-layer[data-layer="${layerName}"][data-type="modified"]`,
    ) as HTMLElement | null;

    switch (currentViewMode) {
      case 'diff-only':
        [originalLayer, modifiedLayer].forEach((layer) => {
          if (layer) {
            layer.style.display = 'block';
            layer.style.removeProperty('opacity');
          }
        });
        break;

      case 'side-by-side':
        [originalLayer, modifiedLayer].forEach((layer) => {
          if (layer) {
            layer.style.display = 'block';
            layer.style.opacity = '1';
          }
        });
        break;

      case 'overlay':
        if (originalLayer && modifiedLayer) {
          originalLayer.style.display = 'block';
          originalLayer.style.opacity = String(1 - currentOpacity / 100);
          modifiedLayer.style.display = 'block';
          modifiedLayer.style.opacity = String(currentOpacity / 100);
        }
        break;

      case 'onion-skin':
        if (originalLayer && modifiedLayer) {
          originalLayer.style.display = 'block';
          originalLayer.style.removeProperty('opacity');
          modifiedLayer.style.display = 'block';
          modifiedLayer.style.opacity = String(currentOpacity / 100);
        }
        break;

      case 'swipe':
        if (originalLayer && modifiedLayer) {
          originalLayer.style.display = 'block';
          originalLayer.style.removeProperty('opacity');
          modifiedLayer.style.display = 'block';
          modifiedLayer.style.removeProperty('opacity');
        }
        break;
    }
  });

  const globalOpacitySlider = document.getElementById('globalOpacitySlider') as HTMLInputElement | null;
  if (
    globalOpacitySlider &&
    currentViewMode !== 'overlay' &&
    currentViewMode !== 'onion-skin' &&
    currentViewMode !== 'side-by-side'
  ) {
    updateGlobalOpacity(globalOpacitySlider.value);
  }
};

function toggleLayer(layerName: string): void {
  const layerExists = availableLayers.some((layer) => layer.name === layerName);
  if (!layerExists) return;

  if (activeLayers.has(layerName)) {
    activeLayers.delete(layerName);
  } else {
    activeLayers.add(layerName);
  }

  updateLayerVisibility();
  updateEmptyState();
  updateBadgeStates();
  updateToggleAllButton();
}

function changeViewMode(mode: string): void {
  const oldMode = currentViewMode;
  currentViewMode = mode;

  const imageStack = document.getElementById('imageStack');
  if (!imageStack) return;

  const opacityControls = document.getElementById('opacityControls');
  const globalOpacityControls = document.getElementById('globalOpacityControls');
  const cardFooter = document.getElementById('cardFooter');
  const sideBySideLabels = document.getElementById('sideBySideLabels');

  imageStack.classList.remove('side-by-side', 'overlay', 'onion-skin', 'swipe', 'diff-only');

  if (opacityControls) {
    opacityControls.style.display = mode === 'overlay' || mode === 'onion-skin' ? 'flex' : 'none';
  }
  if (globalOpacityControls) {
    globalOpacityControls.style.display =
      mode === 'side-by-side' || mode === 'overlay' || mode === 'onion-skin' ? 'none' : 'flex';
  }

  if (cardFooter) {
    if (mode === 'diff-only' || mode === 'side-by-side') {
      cardFooter.style.display = 'block';
    } else {
      cardFooter.style.display = 'none';
    }
  }
  if (sideBySideLabels) {
    if (mode === 'side-by-side') {
      sideBySideLabels.style.setProperty('display', 'flex', 'important');
    } else {
      sideBySideLabels.style.setProperty('display', 'none', 'important');
    }
  }

  imageStack.classList.add(mode === 'diff-only' ? 'diff-only' : mode);

  if (mode !== 'swipe') {
    resetClipPaths();
  }

  updateLayerVisibility();

  if (mode === 'swipe') {
    initializeSwipeView();
  }

  if (zoomPanInitialized && oldMode !== mode) {
    resetZoomPanInternal();
  }
}

function updateOpacity(value: number): void {
  currentOpacity = value;
  const opacityValueEl = document.getElementById('opacityValue');
  if (opacityValueEl) opacityValueEl.textContent = `${value}%`;

  if (currentViewMode === 'overlay') {
    activeLayers.forEach((layerName) => {
      const originalLayer = document.querySelector(
        `.image-layer[data-layer="${layerName}"][data-type="original"]`,
      ) as HTMLElement | null;
      const modifiedLayer = document.querySelector(
        `.image-layer[data-layer="${layerName}"][data-type="modified"]`,
      ) as HTMLElement | null;
      if (originalLayer) originalLayer.style.opacity = String(1 - value / 100);
      if (modifiedLayer) modifiedLayer.style.opacity = String(value / 100);
    });
  } else if (currentViewMode === 'onion-skin') {
    activeLayers.forEach((layerName) => {
      const modifiedLayer = document.querySelector(
        `.image-layer[data-layer="${layerName}"][data-type="modified"]`,
      ) as HTMLElement | null;
      if (modifiedLayer) modifiedLayer.style.opacity = String(value / 100);
    });
  } else {
    clearAllInlineOpacityStyles();
  }
}

function updateGlobalOpacity(value: string): void {
  const opacityDecimal = parseFloat(value) / 100;
  const globalOpacityValueEl = document.getElementById('globalOpacityValue');
  if (globalOpacityValueEl) globalOpacityValueEl.textContent = `${value}%`;

  if (currentViewMode === 'overlay' || currentViewMode === 'onion-skin' || currentViewMode === 'side-by-side') return;

  activeLayers.forEach((layerName) => {
    const originalLayer = document.querySelector(
      `.image-layer[data-layer="${layerName}"][data-type="original"]`,
    ) as HTMLElement | null;
    const modifiedLayer = document.querySelector(
      `.image-layer[data-layer="${layerName}"][data-type="modified"]`,
    ) as HTMLElement | null;

    [originalLayer, modifiedLayer].forEach((layer) => {
      if (layer && layer.style.display !== 'none') {
        layer.style.opacity = String(opacityDecimal);
      }
    });
  });
}

function clearAllInlineOpacityStyles(): void {
  document.querySelectorAll('.image-layer').forEach((layer) => {
    (layer as HTMLElement).style.removeProperty('opacity');
  });
}

function initializeSwipeView(): void {
  const imageStack = document.getElementById('imageStack');
  if (!imageStack) return;

  const existingContainer = imageStack.querySelector('.swipe-container');
  if (existingContainer) existingContainer.remove();

  const swipeContainer = document.createElement('div');
  swipeContainer.className = 'swipe-container';

  const divider = document.createElement('div');
  divider.className = 'swipe-divider';
  swipeContainer.appendChild(divider);
  imageStack.appendChild(swipeContainer);

  divider.addEventListener('mousedown', (e: MouseEvent) => {
    isSwipeDragging = true;
    const dividerRect = divider.getBoundingClientRect();
    const yPx = e.clientY - dividerRect.top;
    divider.style.setProperty('--handle-y', yPx + 'px');
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isSwipeDragging) return;

    const rect = imageStack.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

    divider.style.left = `${percentage}%`;
    const dividerRect = divider.getBoundingClientRect();
    const yPx = e.clientY - dividerRect.top;
    divider.style.setProperty('--handle-y', yPx + 'px');

    activeLayers.forEach((layerName) => {
      const originalLayer = document.querySelector(
        `.image-layer[data-layer="${layerName}"][data-type="original"]`,
      ) as HTMLElement | null;
      const modifiedLayer = document.querySelector(
        `.image-layer[data-layer="${layerName}"][data-type="modified"]`,
      ) as HTMLElement | null;
      if (originalLayer) originalLayer.style.clipPath = `inset(0 ${100 - percentage}% 0 0)`;
      if (modifiedLayer) modifiedLayer.style.clipPath = `inset(0 0 0 ${percentage}%)`;
    });
  });

  document.addEventListener('mouseup', () => {
    isSwipeDragging = false;
  });
}

function resetClipPaths(): void {
  document.querySelectorAll('.image-layer').forEach((layer) => {
    (layer as HTMLElement).style.clipPath = '';
  });
}

function updateEmptyState(): void {
  const emptyViewer = document.getElementById('emptyViewer');
  const noDifferencesViewer = document.getElementById('noDifferencesViewer');
  if (!emptyViewer || !noDifferencesViewer) return;

  if (availableLayers.length === 0) {
    emptyViewer.style.display = 'none';
    noDifferencesViewer.style.display = 'block';
  } else if (activeLayers.size === 0) {
    emptyViewer.style.display = 'block';
    noDifferencesViewer.style.display = 'none';
  } else {
    emptyViewer.style.display = 'none';
    noDifferencesViewer.style.display = 'none';
  }
}

function updateBadgeStates(): void {
  availableLayers.forEach((layer) => {
    const badge = document.querySelector(`.main-control-badge[data-layer="${layer.name}"]`);
    if (!badge) return;

    if (activeLayers.has(layer.name)) {
      badge.classList.remove('badge--outline', 'inactive');
      badge.classList.add(getBadgeClass(layer.type));
    } else {
      badge.classList.add('badge--outline', 'inactive');
      badge.classList.remove('badge--destructive', 'badge--success', 'badge--warning', 'badge--secondary');
    }
  });

  const toggleBtn = document.getElementById('visualToggleAll');
  if (toggleBtn) {
    const allSelected = availableLayers.length > 0 && availableLayers.every((layer) => activeLayers.has(layer.name));
    toggleBtn.textContent = allSelected ? 'Deselect All' : 'Select All';
  }
}

function selectDiffLayers(): void {
  availableLayers.forEach((layer) => {
    const data = layerDiffData[layer.name];
    if (data && data.hasDifferences) {
      activeLayers.add(layer.name);
    } else {
      activeLayers.delete(layer.name);
    }
  });
  updateLayerVisibility();
  updateEmptyState();
  updateBadgeStates();
  updateToggleAllButton();
}

function toggleAllLayers(): void {
  if (availableLayers.length === 0) return;
  const allActive = availableLayers.every((l) => activeLayers.has(l.name));
  if (allActive) {
    activeLayers.clear();
  } else {
    availableLayers.forEach((l) => activeLayers.add(l.name));
  }
  updateLayerVisibility();
  updateEmptyState();
  updateBadgeStates();
  updateToggleAllButton();
}

function updateToggleAllButton(): void {
  const btn = document.getElementById('toggleAllLayers');
  if (!btn) return;
  const allActive = availableLayers.length > 0 && availableLayers.every((l) => activeLayers.has(l.name));
  btn.textContent = allActive ? 'Deselect All' : 'Select All';
  btn.title = allActive ? 'Deselect all layers' : 'Select all layers';
}

function initializeZoomPan(): void {
  if (zoomPanInitialized) return;
  zoomPanInitialized = true;

  const imageStack = document.getElementById('imageStack');
  if (!imageStack) return;
  const zoomControls = document.getElementById('zoomControls')!;
  const zoomInfo = document.getElementById('zoomInfo')!;
  const zoomInBtn = document.getElementById('zoomInBtn')!;
  const zoomOutBtn = document.getElementById('zoomOutBtn')!;
  const zoomResetBtn = document.getElementById('zoomResetBtn')!;
  const zoomLevelSpan = document.getElementById('zoomLevel')!;

  function showZoomControls(): void {
    zoomControls.style.display = activeLayers.size > 0 ? 'flex' : 'none';
    zoomInfo.style.display = activeLayers.size > 0 ? 'block' : 'none';
  }

  function updateZoomLevelDisplay(): void {
    zoomLevelSpan.textContent = Math.round(zoomLevel * 100) + '%';
  }

  function applyTransform(): void {
    const visibleLayers = imageStack!.querySelectorAll('.image-layer[style*="display: block"]');
    visibleLayers.forEach((layer) => {
      const el = layer.querySelector('img, svg') as HTMLElement | null;
      if (el) {
        el.style.transform = `matrix(${zoomLevel}, 0, 0, ${zoomLevel}, ${panTranslateX}, ${panTranslateY})`;
        el.style.transformOrigin = '0 0';
      }
    });
  }

  function zoomIn(): void {
    if (zoomLevel < 10) {
      zoomLevel *= 1.2;
      updateZoomLevelDisplay();
      applyTransform();
    }
  }

  function zoomOut(): void {
    if (zoomLevel > 0.2) {
      zoomLevel /= 1.2;
      updateZoomLevelDisplay();
      applyTransform();
    }
  }

  function resetZoomPan(): void {
    zoomLevel = 1;
    panTranslateX = 0;
    panTranslateY = 0;
    updateZoomLevelDisplay();
    applyTransform();
  }

  zoomInBtn.addEventListener('click', zoomIn);
  zoomOutBtn.addEventListener('click', zoomOut);
  zoomResetBtn.addEventListener('click', resetZoomPan);

  imageStack.addEventListener(
    'wheel',
    (e: WheelEvent) => {
      if (activeLayers.size === 0) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = zoomLevel * delta;
      if (newZoom >= 0.2 && newZoom <= 10) {
        const rect = imageStack.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const scaleFactor = newZoom / zoomLevel;
        panTranslateX = mouseX - scaleFactor * (mouseX - panTranslateX);
        panTranslateY = mouseY - scaleFactor * (mouseY - panTranslateY);
        zoomLevel = newZoom;
        updateZoomLevelDisplay();
        applyTransform();
      }
    },
    { passive: false },
  );

  imageStack.addEventListener('mousedown', (e: MouseEvent) => {
    if (activeLayers.size === 0) return;
    if (currentViewMode === 'swipe' && (e.target as HTMLElement).classList.contains('swipe-divider')) return;

    isPanDragging = true;
    panDragStartX = e.clientX;
    panDragStartY = e.clientY;
    panDragStartTranslateX = panTranslateX;
    panDragStartTranslateY = panTranslateY;

    imageStack.querySelectorAll('.image-layer').forEach((layer) => {
      layer.classList.add('zoomed');
    });
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isPanDragging || activeLayers.size === 0) return;
    panTranslateX = panDragStartTranslateX + (e.clientX - panDragStartX);
    panTranslateY = panDragStartTranslateY + (e.clientY - panDragStartY);
    applyTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isPanDragging) {
      isPanDragging = false;
      imageStack.querySelectorAll('.image-layer').forEach((layer) => {
        layer.classList.remove('zoomed');
      });
    }
  });

  imageStack.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      if (activeLayers.size === 0) return;
      if (e.touches.length === 1) {
        const dampingFactor = 0.5;
        touchStartX = e.touches[0].clientX - panTranslateX / dampingFactor;
        touchStartY = e.touches[0].clientY - panTranslateY / dampingFactor;
      } else if (e.touches.length === 2) {
        touchStartDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        initialZoom = zoomLevel;
        initialTranslateX = panTranslateX;
        initialTranslateY = panTranslateY;
      }
      e.preventDefault();
    },
    { passive: false },
  );

  imageStack.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (activeLayers.size === 0) return;
      if (e.touches.length === 1 && zoomLevel > 1) {
        const dampingFactor = 0.5;
        panTranslateX = (e.touches[0].clientX - touchStartX) * dampingFactor;
        panTranslateY = (e.touches[0].clientY - touchStartY) * dampingFactor;
        applyTransform();
      } else if (e.touches.length === 2) {
        const currentDistance = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY,
        );
        const newZoom = initialZoom * (currentDistance / touchStartDistance);
        if (newZoom >= 0.2 && newZoom <= 10) {
          zoomLevel = newZoom;
          updateZoomLevelDisplay();
          applyTransform();
        }
      }
      e.preventDefault();
    },
    { passive: false },
  );

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (activeLayers.size === 0) return;
    switch (e.key) {
      case '+':
      case '=':
        zoomIn();
        break;
      case '-':
        zoomOut();
        break;
      case '0':
      case 'Home':
        resetZoomPan();
        break;
    }
  });

  const _baseUpdateLayerVisibility = updateLayerVisibility;
  updateLayerVisibility = function (): void {
    _baseUpdateLayerVisibility();
    showZoomControls();
    resetZoomPan();
  };
  (window as any).updateLayerVisibility = updateLayerVisibility;

  updateZoomLevelDisplay();
  showZoomControls();
}

function resetZoomPanInternal(): void {
  zoomLevel = 1;
  panTranslateX = 0;
  panTranslateY = 0;
  const zoomLevelSpan = document.getElementById('zoomLevel');
  if (zoomLevelSpan) zoomLevelSpan.textContent = '100%';
  const imageStack = document.getElementById('imageStack');
  if (imageStack) {
    imageStack.querySelectorAll('.image-layer img, .image-layer svg').forEach((el) => {
      (el as HTMLElement).style.transform = 'matrix(1, 0, 0, 1, 0, 0)';
      (el as HTMLElement).style.transformOrigin = '0 0';
    });
  }
}

function setSvgOffset(dx: number, dy: number): void {
  SVG_OFFSET_X = dx;
  SVG_OFFSET_Y = dy;
}

function setLayerData(layerData: any[]): void {
  availableLayers = layerData
    .filter((layer: any) => !layer.name.includes('Render') && (layer.originalSvg || layer.modifiedSvg))
    .map((layer: any) => ({
      name: layer.name,
      type: getLayerType(layer.name),
    }));

  activeLayers.clear();

  layerDiffData = {};
  layerData.forEach((layer: any) => {
    if (!layer.name.includes('Render') && (layer.originalSvg || layer.modifiedSvg)) {
      layerDiffData[layer.name] = {
        originalSvg: layer.annotatedOriginalSvg || layer.originalSvg,
        modifiedSvg: layer.annotatedModifiedSvg || layer.modifiedSvg,
        hasDifferences: layer.hasDifferences,
      };
    }
  });

  populateLayerBadges();
  createImageLayers();
  updateEmptyState();

  setTimeout(() => {
    selectDiffLayers();
    updateBadgeStates();
    updateToggleAllButton();
    initializeZoomPan();
    changeViewMode('diff-only');
    dumpSvgDebugInfo();
    computeClientSideOffset();
  }, 100);
}

function computeClientSideOffset(): void {
  if (SVG_OFFSET_X !== 0 || SVG_OFFSET_Y !== 0) {
    return;
  }

  const allSvgs = Array.from(document.querySelectorAll('.image-layer svg')) as SVGSVGElement[];
  let svgViewBoxMinX: number | null = null;
  let svgViewBoxMinY: number | null = null;
  let svgContentMinX: number | null = null;
  let svgContentMinY: number | null = null;

  for (const svg of allSvgs) {
    const vb = svg.viewBox.baseVal;
    if (vb.width > 0 && vb.height > 0) {
      svgViewBoxMinX = vb.x;
      svgViewBoxMinY = vb.y;
      break;
    }
  }

  for (const svg of allSvgs) {
    const parentLayer = svg.closest('.image-layer') as HTMLElement | null;
    const layerName = parentLayer?.getAttribute('data-layer') || '';
    const layerType = parentLayer?.getAttribute('data-type') || '';
    if (layerName === 'Edge.Cuts' && layerType === 'modified') {
      try {
        const bbox = svg.getBBox();
        if (bbox.width > 0 && bbox.height > 0) {
          svgContentMinX = bbox.x;
          svgContentMinY = bbox.y;
        }
      } catch {}
    }
  }

  if (!textualDiffData || !textualDiffData.changes) {
    return;
  }

  const pcbCoords: Array<{ x: number; y: number }> = [];
  for (const change of textualDiffData.changes) {
    if (change.x != null && change.y != null) {
      pcbCoords.push({ x: change.x, y: change.y });
    }
  }

  if (pcbCoords.length === 0) {
    return;
  }

  if (svgViewBoxMinX == null) {
    return;
  }

  const pcbMinX = Math.min(...pcbCoords.map((c) => c.x));
  const pcbMinY = Math.min(...pcbCoords.map((c) => c.y));

  const svgMinX = svgContentMinX != null ? svgContentMinX : svgViewBoxMinX;
  const svgMinY = svgContentMinY != null ? svgContentMinY : svgViewBoxMinY!;

  const offsetX = svgMinX - pcbMinX;
  const offsetY = svgMinY - pcbMinY;

  if (Math.abs(offsetX) < 0.01 && Math.abs(offsetY) < 0.01) {
    return;
  }

  SVG_OFFSET_X = offsetX;
  SVG_OFFSET_Y = offsetY;
}

function dumpSvgDebugInfo(): void {
  const allSvgs = document.querySelectorAll('.image-layer svg') as NodeListOf<SVGSVGElement>;

  allSvgs.forEach((svg, idx) => {
    const parentLayer = svg.closest('.image-layer') as HTMLElement | null;
    const layerName = parentLayer?.getAttribute('data-layer') || 'unknown';
    const layerType = parentLayer?.getAttribute('data-type') || 'unknown';
    const vb = svg.viewBox.baseVal;
    const bbox = svg.getBBox();

    const firstPath = svg.querySelector('path');
    if (firstPath) {
      const d = firstPath.getAttribute('d') || '';
      const firstCoordMatch = d.match(/M\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)/);
      if (firstCoordMatch) {
      }
    }

    const firstCircle = svg.querySelector('circle');
    if (firstCircle) {
    }
  });

  const container = document.getElementById('imageStack');
  if (container) {
    const cRect = container.getBoundingClientRect();
  }
}

// Textual Diff Sidebar

const CATEGORY_LABELS: Record<string, string> = {
  component: 'Components',
  track: 'Tracks',
  via: 'Vias',
  zone: 'Zones',
  text: 'Text',
  graphic: 'Graphics',
  setup: 'Setup',
};
const CATEGORY_ORDER = ['component', 'track', 'via', 'zone', 'text', 'graphic', 'setup'];

function setTextualDiff(data: TextualDiff): void {
  textualDiffData = data;
  if (data && data.changes && data.changes.length > 0) {
    const first = data.changes[0];
  }
  renderSidebar();
  const toggleBtn = document.getElementById('diffSidebarToggle');
  const countSpan = document.getElementById('diffToggleCount');
  if (toggleBtn && countSpan && data && data.changes && data.changes.length > 0) {
    toggleBtn.style.display = 'block';
    countSpan.textContent = String(data.changes.length);
  }
}

function toggleSidebar(): void {
  sidebarOpen = !sidebarOpen;
  const sidebar = document.getElementById('diffSidebar');
  if (sidebar) {
    sidebar.classList.toggle('open', sidebarOpen);
  }
}

function renderSidebar(): void {
  const summary = document.getElementById('diffSidebarSummary');
  const content = document.getElementById('diffSidebarContent');
  if (!textualDiffData || !content || !summary) return;

  summary.textContent = textualDiffData.summary || '';
  content.innerHTML = '';

  const changesByCategory: Record<string, ChangeDescription[]> = {};
  for (const change of textualDiffData.changes) {
    const cat = change.category || 'other';
    if (!changesByCategory[cat]) changesByCategory[cat] = [];
    changesByCategory[cat].push(change);
  }

  for (const cat of CATEGORY_ORDER) {
    const items = changesByCategory[cat];
    if (!items || items.length === 0) continue;

    const catLabel = document.createElement('div');
    catLabel.className = 'diff-sidebar-category';
    catLabel.textContent = CATEGORY_LABELS[cat] || cat;
    content.appendChild(catLabel);

    for (const item of items) {
      const row = document.createElement('div');
      row.className = `change-item ${item.type}`;
      const badge = item.type === 'added' ? '+' : item.type === 'removed' ? '\u2212' : '~';
      row.innerHTML = `<span class="change-badge ${item.type}">${badge}</span>${escapeHtml(item.description)}`;
      if (item.x != null && item.y != null) {
        row.addEventListener('click', () =>
          zoomToChange(item.x!, item.y!, item.highlightRadius, item.highlightW, item.highlightH),
        );
      }
      content.appendChild(row);
    }
  }
}

function removeHighlightMarker(): void {
  document.querySelectorAll('.highlight-marker').forEach((el) => el.remove());
}

function applyTransformAll(): void {
  const imageStack = document.getElementById('imageStack');
  if (!imageStack) return;
  imageStack.querySelectorAll('.image-layer[style*="display: block"]').forEach((layer) => {
    const el = layer.querySelector('svg') as HTMLElement | null;
    if (el) {
      el.style.transform = `matrix(${zoomLevel}, 0, 0, ${zoomLevel}, ${panTranslateX}, ${panTranslateY})`;
      el.style.transformOrigin = '0 0';
    }
  });
}

function zoomToChange(
  pcbX: number,
  pcbY: number,
  highlightRadius?: number,
  highlightW?: number,
  highlightH?: number,
): void {
  removeHighlightMarker();

  const ns = 'http://www.w3.org/2000/svg';
  const allSvgs = document.querySelectorAll('.image-layer svg') as NodeListOf<SVGSVGElement>;

  allSvgs.forEach((s) => {
    s.style.transition = 'none';
    s.style.transform = 'none';
  });

  const svg = document.querySelector('.image-layer[style*="display: block"] svg') as SVGSVGElement | null;
  if (!svg) {
    return;
  }

  const sx = pcbX + SVG_OFFSET_X;
  const sy = pcbY + SVG_OFFSET_Y;

  const container = document.getElementById('imageStack');
  if (!container) return;
  const cRect = container.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;

  const scaleX = cRect.width / vb.width;
  const scaleY = cRect.height / vb.height;
  const scale = Math.min(scaleX, scaleY);
  const ox = (cRect.width - vb.width * scale) / 2;
  const oy = (cRect.height - vb.height * scale) / 2;
  const px = (sx - vb.x) * scale + ox;
  const py = (sy - vb.y) * scale + oy;

  const rw = highlightW || (highlightRadius || 1) * 2;
  const rh = highlightH || (highlightRadius || 1) * 2;

  const rx = sx - rw / 2;
  const ry = sy - rh / 2;
  allSvgs.forEach((s) => {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'highlight-marker');

    const fill = document.createElementNS(ns, 'rect');
    fill.setAttribute('x', String(rx));
    fill.setAttribute('y', String(ry));
    fill.setAttribute('width', String(rw));
    fill.setAttribute('height', String(rh));
    fill.setAttribute('fill', '#ffff00');
    fill.setAttribute('fill-opacity', '0.15');
    fill.setAttribute('stroke', 'none');
    g.appendChild(fill);

    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', String(rx));
    r.setAttribute('y', String(ry));
    r.setAttribute('width', String(rw));
    r.setAttribute('height', String(rh));
    r.setAttribute('fill', 'none');
    r.setAttribute('stroke', '#ffff00');
    r.setAttribute('stroke-width', '0.3');
    g.appendChild(r);

    s.appendChild(g);
  });
  setTimeout(removeHighlightMarker, 4000);

  const targetZoom = 4;
  zoomLevel = targetZoom;
  panTranslateX = cRect.width / 2 - px * targetZoom;
  panTranslateY = cRect.height / 2 - py * targetZoom;

  applyTransformAll();

  allSvgs.forEach((s) => {
    s.style.transition = '';
  });

  const zoomLevelSpan = document.getElementById('zoomLevel');
  if (zoomLevelSpan) zoomLevelSpan.textContent = Math.round(zoomLevel * 100) + '%';

  const zoomControls = document.getElementById('zoomControls');
  const zoomInfo = document.getElementById('zoomInfo');
  if (zoomControls) zoomControls.style.display = 'flex';
  if (zoomInfo) zoomInfo.style.display = 'block';
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return escapeHtml(str);
}

// Theme
function toggleTheme(): void {
  const html = document.documentElement;
  const isDark = html.classList.contains('dark');
  if (isDark) {
    html.classList.remove('dark');
    html.classList.add('light');
    updateThemeIcon('light');
    localStorage.setItem('theme', 'light');
  } else {
    html.classList.remove('light');
    html.classList.add('dark');
    updateThemeIcon('dark');
    localStorage.setItem('theme', 'dark');
  }
}

function updateThemeIcon(theme: string): void {
  const sunIcon = document.getElementById('sunIcon');
  const moonIcon = document.getElementById('moonIcon');
  if (!sunIcon || !moonIcon) return;
  sunIcon.style.display = theme === 'dark' ? 'block' : 'none';
  moonIcon.style.display = theme === 'dark' ? 'none' : 'block';
}

function initializeTheme(): void {
  const savedTheme = localStorage.getItem('theme') || 'light';
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  html.classList.add(savedTheme);
  updateThemeIcon(savedTheme);
}

// Nets diff

interface NetDiffEntry {
  name: string;
  type: 'added' | 'removed' | 'modified';
  origSegments: number;
  modSegments: number;
  origVias: number;
  modVias: number;
  origRefs: string[];
  modRefs: string[];
  details: string[];
}

interface NetlistDiff {
  nets: NetDiffEntry[];
  summary: string;
}

function toggleNetsFilter(status: string): void {
  if (!netsActiveFilters) return;
  if (netsActiveFilters.has(status)) {
    netsActiveFilters.delete(status);
  } else {
    netsActiveFilters.add(status);
  }
  applyNetsFilters();
  renderNetsFilterBadges();
}

function applyNetsFilters(): void {
  if (!netsDiffData) return;
  const rows = document.querySelectorAll('#netsTableContainer tbody tr');
  rows.forEach((row) => {
    const el = row as HTMLElement;
    const s = el.getAttribute('data-status') || '';
    el.style.display = netsActiveFilters && netsActiveFilters.has(s) ? '' : 'none';
  });
}

function renderNetsFilterBadges(): void {
  const summaryEl = document.getElementById('netsSummary');
  if (!summaryEl || !netsDiffData) return;

  const added = netsDiffData.nets.filter((n) => n.type === 'added').length;
  const removed = netsDiffData.nets.filter((n) => n.type === 'removed').length;
  const modified = netsDiffData.nets.filter((n) => n.type === 'modified').length;

  const allActive = netsActiveFilters && netsActiveFilters.size === 3;
  const toggleLabel = allActive ? 'Deselect All' : 'Select All';

  let html = `<button type="button" class="filter-toggle-all" id="netsToggleAll">${toggleLabel}</button>`;

  const statuses: { key: string; label: string; count: number }[] = [
    { key: 'added', label: 'Added', count: added },
    { key: 'removed', label: 'Removed', count: removed },
    { key: 'modified', label: 'Modified', count: modified },
  ];

  for (const s of statuses) {
    if (s.count === 0) continue;
    const active = netsActiveFilters ? netsActiveFilters.has(s.key) : false;
    let badgeClass = '';
    if (active) {
      if (s.key === 'added') badgeClass = 'badge--success';
      else if (s.key === 'removed') badgeClass = 'badge--destructive';
      else badgeClass = 'badge--secondary';
    } else {
      badgeClass = 'badge--outline inactive';
    }
    html += `<span class="badge ${escapeAttr(badgeClass)} filter-badge" data-filter="${escapeAttr(s.key)}">${s.count} ${s.label}</span>`;
  }

  summaryEl.innerHTML = html;

  summaryEl.querySelectorAll('.filter-badge').forEach((badge) => {
    badge.addEventListener('click', () => {
      toggleNetsFilter(badge.getAttribute('data-filter') || '');
    });
  });

  const toggleBtn = document.getElementById('netsToggleAll');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (netsActiveFilters && netsActiveFilters.size === 3) {
        netsActiveFilters.clear();
      } else {
        netsActiveFilters = new Set(['added', 'removed', 'modified']);
      }
      applyNetsFilters();
      renderNetsFilterBadges();
    });
  }
}

function setNetlistDiff(data: NetlistDiff): void {
  const summaryEl = document.getElementById('netsSummary');
  const container = document.getElementById('netsTableContainer');
  const emptyEl = document.getElementById('netsEmpty');
  if (!summaryEl || !container || !emptyEl) return;

  if (!data || !data.nets || data.nets.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  netsDiffData = data;
  if (!netsActiveFilters) {
    netsActiveFilters = new Set(['added', 'removed', 'modified']);
  }

  renderNetsFilterBadges();

  const sorter = (a: NetDiffEntry, b: NetDiffEntry): number => {
    const order = { added: 0, removed: 1, modified: 2 };
    return order[a.type] - order[b.type] || a.name.localeCompare(b.name);
  };

  const sorted = [...data.nets].sort(sorter);
  const tbodyRows = sorted
    .map((n) => {
      const badge = `<span class="diff-badge ${n.type}">${n.type}</span>`;
      const tracks =
        n.origSegments > 0 || n.modSegments > 0
          ? `<span>${n.origSegments}</span><span class="arrow">→</span><span>${n.modSegments}</span>`
          : '<span>—</span>';
      const vias =
        n.origVias > 0 || n.modVias > 0
          ? `<span>${n.origVias}</span><span class="arrow">→</span><span>${n.modVias}</span>`
          : '<span>—</span>';
      const hasRefs = n.origRefs.length > 0 || n.modRefs.length > 0;
      const refsHtml = hasRefs
        ? `<span>${n.origRefs.length}</span><span class="arrow">→</span><span>${n.modRefs.length}</span>`
        : '<span>—</span>';
      const details =
        n.details.length > 0
          ? `<ul class="detail-list">${n.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
          : '';
      return `<tr class="row-${n.type}" data-status="${n.type}">
            <td><strong>${escapeHtml(n.name)}</strong></td>
            <td>${badge}</td>
            <td class="cell-number">${tracks}</td>
            <td class="cell-number">${vias}</td>
            <td class="cell-number">${refsHtml}</td>
            <td>${details}</td>
        </tr>`;
    })
    .join('');

  container.innerHTML = `
        <div class="diff-table-container">
            <table class="diff-table">
                <thead>
                    <tr>
                        <th>Net</th>
                        <th>Status</th>
                        <th class="cell-number">Tracks</th>
                        <th class="cell-number">Vias</th>
                        <th class="cell-number">Pads</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>${tbodyRows}</tbody>
            </table>
        </div>
    `;

  applyNetsFilters();
}

// BOM diff

interface BomEntry {
  ref: string;
  value: string;
  footprint: string;
  layer: string;
  x: number;
  y: number;
  rotation: number;
}

interface BomDiffEntry {
  ref: string;
  value: string;
  footprint: string;
  layer: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  changes: string[];
  orig?: BomEntry;
  mod?: BomEntry;
}

interface BomDiff {
  components: BomDiffEntry[];
  added: BomDiffEntry[];
  removed: BomDiffEntry[];
  modified: BomDiffEntry[];
  unchanged: BomDiffEntry[];
  summary: string;
}

function toggleBomFilter(status: string): void {
  if (!bomActiveFilters) return;
  if (bomActiveFilters.has(status)) {
    bomActiveFilters.delete(status);
  } else {
    bomActiveFilters.add(status);
  }
  applyBomFilters();
  renderBomFilterBadges();
}

function applyBomFilters(): void {
  if (!bomDiffData) return;
  const rows = document.querySelectorAll('#bomTableContainer tbody tr');
  rows.forEach((row) => {
    const el = row as HTMLElement;
    const s = el.getAttribute('data-status') || '';
    el.style.display = bomActiveFilters && bomActiveFilters.has(s) ? '' : 'none';
  });
}

function renderBomFilterBadges(): void {
  const summaryEl = document.getElementById('bomSummary');
  if (!summaryEl || !bomDiffData) return;

  const added = bomDiffData.added.length;
  const removed = bomDiffData.removed.length;
  const modified = bomDiffData.modified.length;
  const unchanged = bomDiffData.unchanged.length;

  const totalStatuses = [added > 0, removed > 0, modified > 0, unchanged > 0].filter(Boolean).length;
  const allActive = bomActiveFilters && bomActiveFilters.size === totalStatuses;
  const toggleLabel = allActive ? 'Deselect All' : 'Select All';

  let html = `<button type="button" class="filter-toggle-all" id="bomToggleAll">${toggleLabel}</button>`;

  const statuses: { key: string; label: string; count: number }[] = [
    { key: 'added', label: 'Added', count: added },
    { key: 'removed', label: 'Removed', count: removed },
    { key: 'modified', label: 'Modified', count: modified },
    { key: 'unchanged', label: 'Unchanged', count: unchanged },
  ];

  for (const s of statuses) {
    if (s.count === 0) continue;
    const active = bomActiveFilters ? bomActiveFilters.has(s.key) : false;
    let badgeClass = '';
    if (active) {
      if (s.key === 'added') badgeClass = 'badge--success';
      else if (s.key === 'removed') badgeClass = 'badge--destructive';
      else if (s.key === 'modified') badgeClass = 'badge--secondary';
      else badgeClass = 'badge--outline';
    } else {
      badgeClass = 'badge--outline inactive';
    }
    html += `<span class="badge ${escapeAttr(badgeClass)} filter-badge" data-filter="${escapeAttr(s.key)}">${s.count} ${s.label}</span>`;
  }

  summaryEl.innerHTML = html;

  summaryEl.querySelectorAll('.filter-badge').forEach((badge) => {
    badge.addEventListener('click', () => {
      toggleBomFilter(badge.getAttribute('data-filter') || '');
    });
  });

  const toggleBtn = document.getElementById('bomToggleAll');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const totalStatuses2 = [
        bomDiffData!.added.length > 0,
        bomDiffData!.removed.length > 0,
        bomDiffData!.modified.length > 0,
        bomDiffData!.unchanged.length > 0,
      ].filter(Boolean).length;
      if (bomActiveFilters && bomActiveFilters.size === totalStatuses2) {
        bomActiveFilters.clear();
      } else {
        bomActiveFilters = new Set(
          ['added', 'removed', 'modified', 'unchanged'].filter((k) => {
            const d = bomDiffData!;
            if (k === 'added') return d.added.length > 0;
            if (k === 'removed') return d.removed.length > 0;
            if (k === 'modified') return d.modified.length > 0;
            if (k === 'unchanged') return d.unchanged.length > 0;
            return false;
          }),
        );
      }
      applyBomFilters();
      renderBomFilterBadges();
    });
  }
}

function setBomDiff(data: BomDiff): void {
  const summaryEl = document.getElementById('bomSummary');
  const container = document.getElementById('bomTableContainer');
  const emptyEl = document.getElementById('bomEmpty');
  if (!summaryEl || !container || !emptyEl) return;

  if (!data || !data.components || data.components.length === 0) {
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  bomDiffData = data;
  if (!bomActiveFilters) {
    bomActiveFilters = new Set(
      ['added', 'removed', 'modified', 'unchanged'].filter((k) => {
        if (k === 'added') return data.added.length > 0;
        if (k === 'removed') return data.removed.length > 0;
        if (k === 'modified') return data.modified.length > 0;
        if (k === 'unchanged') return data.unchanged.length > 0;
        return false;
      }),
    );
  }

  renderBomFilterBadges();

  const order = { added: 0, removed: 1, modified: 2, unchanged: 3 };
  const sorted = [...data.components].sort((a, b) => order[a.type] - order[b.type] || a.ref.localeCompare(b.ref));

  const tbodyRows = sorted
    .map((c) => {
      const badge =
        c.type === 'unchanged'
          ? `<span class="diff-badge unchanged">ok</span>`
          : `<span class="diff-badge ${c.type}">${c.type}</span>`;
      const changes =
        c.type !== 'unchanged' && c.changes.length > 0
          ? `<ul class="detail-list">${c.changes.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>`
          : c.type === 'unchanged'
            ? '<span style="color: var(--muted-foreground); font-size: 0.75rem;">no changes</span>'
            : '';
      return `<tr class="row-${c.type}" data-status="${c.type}">
            <td><span class="bom-ref">${escapeHtml(c.ref)}</span></td>
            <td><span class="bom-value">${escapeHtml(c.value || '—')}</span></td>
            <td><span class="bom-footprint">${escapeHtml(c.footprint || '—')}</span></td>
            <td>${escapeHtml(c.layer || '—')}</td>
            <td>${badge}</td>
            <td>${changes}</td>
        </tr>`;
    })
    .join('');

  container.innerHTML = `
        <div class="diff-table-container">
            <table class="diff-table">
                <thead>
                    <tr>
                        <th>Ref</th>
                        <th>Value</th>
                        <th>Footprint</th>
                        <th>Layer</th>
                        <th>Status</th>
                        <th>Changes</th>
                    </tr>
                </thead>
                <tbody>${tbodyRows}</tbody>
            </table>
        </div>
    `;

  applyBomFilters();
}

function initializeTabs(): void {
  const tabsContainer = document.querySelector('.tabs');
  if (!tabsContainer) return;

  const tablist = tabsContainer.querySelector('[role="tablist"]');
  if (!tablist) return;

  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]')) as HTMLButtonElement[];
  const panels = tabs
    .map((tab) => document.getElementById(tab.getAttribute('aria-controls') || ''))
    .filter(Boolean) as HTMLElement[];

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t, idx) => {
        const isSelected = t === tab;
        t.setAttribute('aria-selected', String(isSelected));
        t.setAttribute('tabindex', isSelected ? '0' : '-1');

        const panel = panels[idx];
        if (panel) {
          if (isSelected) {
            panel.removeAttribute('hidden');
            panel.setAttribute('aria-selected', 'true');
          } else {
            panel.setAttribute('hidden', '');
            panel.setAttribute('aria-selected', 'false');
          }
        }
      });
    });
  });

  // Keyboard navigation (Left / Right Arrow)
  tablist.addEventListener('keydown', (e: Event) => {
    const keyboardEvent = e as KeyboardEvent;
    let index = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;

    if (keyboardEvent.key === 'ArrowRight') {
      index = (index + 1) % tabs.length;
      tabs[index].focus();
      tabs[index].click();
      keyboardEvent.preventDefault();
    } else if (keyboardEvent.key === 'ArrowLeft') {
      index = (index - 1 + tabs.length) % tabs.length;
      tabs[index].focus();
      tabs[index].click();
      keyboardEvent.preventDefault();
    }
  });
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  initializeTabs();

  // Bind handlers
  document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
  document.getElementById('viewModeSelect')?.addEventListener('change', (e) => {
    changeViewMode((e.target as HTMLSelectElement).value);
  });
  document.getElementById('globalOpacitySlider')?.addEventListener('input', (e) => {
    updateGlobalOpacity((e.target as HTMLInputElement).value);
  });
  document.getElementById('opacitySlider')?.addEventListener('input', (e) => {
    updateOpacity(parseInt((e.target as HTMLInputElement).value, 10));
  });
  document.getElementById('diffSidebarToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('diffSidebarClose')?.addEventListener('click', toggleSidebar);
  document.getElementById('toggleAllLayers')?.addEventListener('click', toggleAllLayers);

  updateGlobalOpacity('70');

  const cardFooter = document.getElementById('cardFooter');
  if (cardFooter) cardFooter.style.display = 'block';

  setTimeout(() => {
    selectDiffLayers();
    updateBadgeStates();
    updateToggleAllButton();
    initializeZoomPan();
    changeViewMode('diff-only');
  }, 100);
});
