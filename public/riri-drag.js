/**
 * Riri positioning only. Import syncRiriPosition and call it after updateRiri().
 * No business actions, image changes, chat writes, or DOM replacement occur here.
 */
const STORAGE_KEY = 'rs90.riri.position.v1';
const EDGE = 12;
const GAP = 12;
const MAX_COORDINATE = 1000000;
let position = readPosition();
let installed = false;
let gesture = null;
let blockedClick = null;
let frame = 0;
let observer = null;
let observedLauncher = null;
let observedDrawer = null;

function validPosition(value) {
  return value && typeof value.x === 'number' && typeof value.y === 'number'
    && Number.isFinite(value.x) && Number.isFinite(value.y)
    && value.x >= 0 && value.y >= 0
    && value.x <= MAX_COORDINATE && value.y <= MAX_COORDINATE;
}

function readPosition() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    return validPosition(value) ? { x: value.x, y: value.y } : null;
  } catch {
    // Private browsing, denied storage, or malformed JSON: keep an in-memory position.
    return null;
  }
}

function savePosition() {
  if (!validPosition(position)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // Dragging must still work when storage is full or unavailable.
  }
}

function viewport() {
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = window.innerHeight || document.documentElement.clientHeight;
  const visual = window.visualViewport;
  // Fixed coordinates are layout-viewport pixels. Include visual offsets when zoomed
  // or when the software keyboard pans/shrinks the visible viewport.
  const left = visual ? Math.max(0, visual.offsetLeft) : 0;
  const top = visual ? Math.max(0, visual.offsetTop) : 0;
  return {
    left, top,
    right: left + (visual ? visual.width : width),
    bottom: top + (visual ? visual.height : height),
    width: visual ? visual.width : width,
    height: visual ? visual.height : height,
  };
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function clampPosition(value, launcher, view = viewport()) {
  const width = launcher.offsetWidth;
  const height = launcher.offsetHeight;
  const marginX = Math.min(EDGE, Math.max(0, (view.width - width) / 2));
  const marginY = Math.min(EDGE, Math.max(0, (view.height - height) / 2));
  return {
    x: clamp(value.x, view.left + marginX, view.right - marginX - width),
    y: clamp(value.y, view.top + marginY, view.bottom - marginY - height),
  };
}

function elements() {
  const root = document.getElementById('riri-root');
  const launcher = root?.querySelector('.riri-launcher');
  const dock = launcher?.closest('.riri-dock');
  return root && launcher && dock ? { root, launcher, dock, drawer: root.querySelector('.riri-drawer') } : null;
}

function isChinese() {
  return !document.documentElement.lang || document.documentElement.lang.toLowerCase().startsWith('zh');
}

function decorate({ root, launcher, dock }) {
  let tip = dock.querySelector('.riri-drag-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'riri-drag-tip';
    tip.id = 'riri-drag-help';
    tip.setAttribute('role', 'tooltip');
    dock.append(tip);
  }
  const help = isChinese()
    ? '拖动瑞瑞可移动；轻点打开对话。聚焦后按 Alt + 方向键移动，Shift 可加大步长。'
    : 'Drag Riri to move; tap to chat. When focused, use Alt + arrow keys to move; hold Shift for larger steps.';
  if (tip.textContent !== help) tip.textContent = help;
  launcher.removeAttribute('title');
  launcher.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown Alt+ArrowLeft Alt+ArrowRight');
  const descriptions = new Set((launcher.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  descriptions.add(tip.id);
  launcher.setAttribute('aria-describedby', [...descriptions].join(' '));
  launcher.querySelector('img')?.setAttribute('draggable', 'false');
  if (!root.querySelector('.riri-drag-status')) {
    const status = document.createElement('div');
    status.className = 'riri-drag-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    root.append(status);
  }
}

function layoutHints({ dock, launcher }, view) {
  const hint = dock.querySelector(':scope > span');
  const tip = dock.querySelector('.riri-drag-tip');
  const widthLimit = Math.max(1, Math.min(240, view.width - EDGE * 2));
  dock.style.setProperty('--riri-hint-max-width', `${widthLimit}px`);
  // offset dimensions ignore transforms, including the launcher's legacy hover motion.
  const width = Math.max(hint?.offsetWidth || 0, tip?.offsetWidth || 0);
  const height = Math.max(hint?.offsetHeight || 0, tip?.offsetHeight || 0);
  const launcherWidth = launcher.offsetWidth;
  const launcherHeight = launcher.offsetHeight;
  const leftSpace = position.x - view.left - EDGE - GAP;
  const rightSpace = view.right - EDGE - position.x - launcherWidth - GAP;
  let direction;
  let x;
  let y;
  if (leftSpace >= width || rightSpace >= width) {
    direction = leftSpace >= width ? 'left' : 'right';
    x = direction === 'left' ? -GAP - width : launcherWidth + GAP;
    y = clamp(position.y + (launcherHeight - height) / 2,
      view.top + EDGE, view.bottom - EDGE - height) - position.y;
  } else {
    direction = position.y - view.top >= view.bottom - position.y - launcherHeight ? 'top' : 'bottom';
    x = clamp(position.x + (launcherWidth - width) / 2,
      view.left + EDGE, view.right - EDGE - width) - position.x;
    y = direction === 'top' ? -GAP - height : launcherHeight + GAP;
    if (position.y + y < view.top + EDGE || position.y + y + height > view.bottom - EDGE) direction = 'hidden';
  }
  dock.dataset.ririHint = direction;
  dock.style.setProperty('--riri-hint-x', `${x}px`);
  dock.style.setProperty('--riri-hint-y', `${y}px`);
  dock.style.setProperty('--riri-hint-width', `${width}px`);
}

function layoutDrawer({ drawer, launcher }, view) {
  if (!drawer) return;
  const scroller = drawer.querySelector(':scope > .agent');
  const scrollTop = scroller?.scrollTop || 0;
  const edgeX = Math.min(EDGE, view.width / 4);
  const edgeY = Math.min(EDGE, view.height / 4);
  const mobile = view.width <= 680;
  const width = Math.max(1, Math.min(mobile ? 520 : 390, view.width - edgeX * 2));
  const fullHeight = Math.max(1, Math.min(mobile ? 560 : Infinity, view.height - edgeY * 2));
  drawer.style.width = `${width}px`;
  drawer.style.height = mobile ? `${fullHeight}px` : 'auto';
  drawer.style.maxHeight = `${fullHeight}px`;
  drawer.style.setProperty('--riri-history-height', `${Math.min(300, fullHeight * 0.32)}px`);
  // Never getBoundingClientRect(): drawer-in uses translate/scale. offsetHeight is
  // its actual layout size, independent of animation, including the reserved close row.
  const naturalHeight = Math.min(fullHeight, drawer.offsetHeight);
  const leftSpace = position.x - GAP - view.left - edgeX;
  const rightSpace = view.right - edgeX - position.x - launcher.offsetWidth - GAP;
  let x;
  let y;
  let maxHeight = fullHeight;
  let side;
  if (mobile) {
    side = 'sheet';
    x = view.left + (view.width - width) / 2;
    y = view.bottom - edgeY - fullHeight;
  } else if (leftSpace >= width || rightSpace >= width) {
    side = leftSpace >= width ? 'left' : 'right';
    x = side === 'left' ? position.x - GAP - width : position.x + launcher.offsetWidth + GAP;
    y = clamp(position.y + launcher.offsetHeight / 2 - naturalHeight / 2,
      view.top + edgeY, view.bottom - edgeY - naturalHeight);
  } else {
    const above = Math.max(0, position.y - GAP - view.top - edgeY);
    const below = Math.max(0, view.bottom - edgeY - position.y - launcher.offsetHeight - GAP);
    side = above >= naturalHeight ? 'top' : below >= naturalHeight ? 'bottom' : above >= below ? 'top' : 'bottom';
    maxHeight = Math.max(1, side === 'top' ? above : below);
    drawer.style.maxHeight = `${maxHeight}px`;
    // The agent is the scroll container; its existing textarea and send buttons survive.
    const height = Math.min(maxHeight, drawer.offsetHeight);
    x = clamp(position.x + launcher.offsetWidth / 2 - width / 2,
      view.left + edgeX, view.right - edgeX - width);
    y = side === 'top' ? position.y - GAP - height : position.y + launcher.offsetHeight + GAP;
    y = clamp(y, view.top + edgeY, view.bottom - edgeY - height);
  }
  drawer.dataset.ririSide = side;
  drawer.style.left = `${x}px`;
  drawer.style.top = `${y}px`;
  drawer.style.right = 'auto';
  drawer.style.bottom = 'auto';
  if (scroller) {
    // The temporary full-height measurement must not reset a partially scrolled chat.
    scroller.scrollTop = scrollTop;
    const focused = document.activeElement;
    if (focused && scroller.contains(focused)) {
      let top = focused.offsetTop;
      let parent = focused.offsetParent;
      while (parent && parent !== scroller) {
        top += parent.offsetTop;
        parent = parent.offsetParent;
      }
      if (parent === scroller) {
        const bottom = top + focused.offsetHeight;
        if (top < scroller.scrollTop) scroller.scrollTop = top;
        else if (bottom > scroller.scrollTop + scroller.clientHeight) {
          scroller.scrollTop = Math.max(top, bottom - scroller.clientHeight);
        }
      }
    }
  }
}

function applyPosition(parts) {
  const view = viewport();
  position = clampPosition(position, parts.launcher, view);
  parts.root.classList.add('riri-positioned');
  parts.dock.style.setProperty('--riri-x', `${position.x}px`);
  parts.dock.style.setProperty('--riri-y', `${position.y}px`);
  parts.dock.style.setProperty('--riri-launcher-width', `${parts.launcher.offsetWidth}px`);
  parts.dock.style.setProperty('--riri-launcher-height', `${parts.launcher.offsetHeight}px`);
  layoutHints(parts, view);
  layoutDrawer(parts, view);
}

function scheduleSync() {
  if (frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    syncRiriPosition();
  });
}

function watchSizes(parts) {
  if (!observer && 'ResizeObserver' in window) observer = new ResizeObserver(scheduleSync);
  if (!observer || (observedLauncher === parts.launcher && observedDrawer === parts.drawer)) return;
  observer.disconnect();
  observedLauncher = parts.launcher;
  observedDrawer = parts.drawer;
  observer.observe(parts.launcher);
  if (parts.drawer) observer.observe(parts.drawer);
}

/** Idempotent: call after EVERY updateRiri(), including route, send and Escape updates. */
export function syncRiriPosition() {
  if (!installed) installListeners();
  const parts = elements();
  if (!parts) {
    finishGesture(true);
    observer?.disconnect();
    observedLauncher = null;
    observedDrawer = null;
    return;
  }
  if (gesture && gesture.launcher !== parts.launcher) finishGesture(true);
  if (!position) {
    // Preserve the existing desktop/mobile default without measuring an animated button.
    const style = window.getComputedStyle(parts.dock);
    const right = Number.parseFloat(style.right);
    const bottom = Number.parseFloat(style.bottom);
    const view = viewport();
    position = {
      x: view.right - (Number.isFinite(right) ? right : 28) - parts.launcher.offsetWidth,
      y: view.bottom - (Number.isFinite(bottom) ? bottom : 24) - parts.launcher.offsetHeight,
    };
  }
  decorate(parts);
  const previous = { ...position };
  applyPosition(parts);
  if (previous.x !== position.x || previous.y !== position.y) savePosition();
  watchSizes(parts);
}

function onPointerDown(event) {
  // A new genuine gesture must not be swallowed by an old drag's click guard.
  if (!gesture) blockedClick = null;
  const launcher = event.target instanceof Element ? event.target.closest('#riri-root .riri-launcher') : null;
  if (!launcher || launcher.disabled || gesture || event.isPrimary === false || event.button !== 0) return;
  syncRiriPosition();
  gesture = {
    id: event.pointerId, type: event.pointerType, launcher,
    startX: event.clientX, startY: event.clientY,
    baseX: position.x, baseY: position.y,
    moved: false, captured: false,
  };
  // Capture is attempted for both mouse and touch; document delegation remains the
  // fallback if an older engine, detached element, or platform rejects capture.
  try {
    if (typeof launcher.setPointerCapture === 'function') {
      launcher.setPointerCapture(event.pointerId);
      gesture.captured = typeof launcher.hasPointerCapture === 'function'
        ? launcher.hasPointerCapture(event.pointerId) : true;
    }
  } catch {
    gesture.captured = false;
  }
  document.getElementById('riri-root')?.classList.add('riri-pressing');
  // Do not prevent pointerdown: a normal short tap still reaches the original click delegate.
}

function onPointerMove(event) {
  if (!gesture || event.pointerId !== gesture.id) return;
  // A missing outside pointerup must not leave the mouse in dragging mode.
  if (gesture.type === 'mouse' && event.buttons === 0) {
    finishGesture(true);
    return;
  }
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  const threshold = gesture.type === 'touch' ? 10 : 6;
  if (!gesture.moved && dx * dx + dy * dy < threshold * threshold) return;
  gesture.moved = true;
  if (event.cancelable) event.preventDefault();
  const parts = elements();
  if (!parts) return finishGesture(true);
  parts.root.classList.add('riri-dragging');
  position = { x: gesture.baseX + dx, y: gesture.baseY + dy };
  applyPosition(parts);
}

function finishGesture(cancelled = false, event = null) {
  if (!gesture || (event && event.pointerId !== gesture.id)) return;
  const completed = gesture;
  // Clear first: releasePointerCapture can synchronously fire lostpointercapture.
  gesture = null;
  document.getElementById('riri-root')?.classList.remove('riri-pressing', 'riri-dragging');
  if (completed.moved) {
    savePosition();
    blockedClick = { id: completed.id, until: performance.now() + 800 };
    if (!cancelled && event?.cancelable) event.preventDefault();
  }
  try {
    if (completed.captured && typeof completed.launcher.releasePointerCapture === 'function') {
      completed.launcher.releasePointerCapture(completed.id);
    }
  } catch {
    // Detached launchers and already-lost capture are normal after a route/render.
  }
  if (!cancelled && event && !completed.moved && completed.type === 'touch'
    && completed.launcher.isConnected && !completed.launcher.disabled) {
    // Some touch engines omit the compatibility click after capture is released.
    // Activate the original button once; suppress a possible later native click.
    blockedClick = { id: completed.id, until: performance.now() + 800 };
    completed.launcher.click();
  }
}

function onClick(event) {
  if (!blockedClick) return;
  if (performance.now() > blockedClick.until) {
    blockedClick = null;
    return;
  }
  const hasPointerId = typeof event.pointerId === 'number' && event.pointerId > 0;
  // Keyboard/programmatic clicks normally have detail=0 and no positive pointerId.
  if (event.detail === 0 && !hasPointerId) return;
  if (hasPointerId && event.pointerId !== blockedClick.id) return;
  // Do not limit this to the launcher: a capture-less release over Send must not send.
  event.preventDefault();
  event.stopImmediatePropagation();
  blockedClick = null;
}

function onKeyDown(event) {
  const launcher = event.target instanceof Element ? event.target.closest('#riri-root .riri-launcher') : null;
  if (!launcher || launcher.disabled || gesture || !event.altKey || event.ctrlKey || event.metaKey) return;
  const vectors = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const vector = vectors[event.key];
  if (!vector) return;
  // Alt+arrows only, only on the launcher: never Enter, textarea, send, or browser navigation.
  event.preventDefault();
  event.stopImmediatePropagation();
  syncRiriPosition();
  const step = event.shiftKey ? 32 : 12;
  position = { x: position.x + vector[0] * step, y: position.y + vector[1] * step };
  const parts = elements();
  if (!parts) return;
  applyPosition(parts);
  savePosition();
  parts.root.querySelector('.riri-drag-status').textContent = isChinese()
    ? `瑞瑞已移动至横向 ${Math.round(position.x)}、纵向 ${Math.round(position.y)} 像素。`
    : `Riri moved to ${Math.round(position.x)} pixels from the left, ${Math.round(position.y)} from the top.`;
}

function installListeners() {
  installed = true;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', event => finishGesture(false, event), true);
  document.addEventListener('pointercancel', event => finishGesture(true, event), true);
  document.addEventListener('lostpointercapture', event => finishGesture(true, event), true);
  document.addEventListener('pointerout', event => {
    if (gesture && event.pointerId === gesture.id && !gesture.captured && !event.relatedTarget) finishGesture(true, event);
  }, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('dragstart', event => {
    if (event.target instanceof Element && event.target.closest('#riri-root .riri-launcher')) event.preventDefault();
  }, true);
  window.addEventListener('blur', () => finishGesture(true));
  window.addEventListener('resize', scheduleSync);
  window.visualViewport?.addEventListener('resize', scheduleSync);
  window.visualViewport?.addEventListener('scroll', scheduleSync);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) finishGesture(true);
  });
}
