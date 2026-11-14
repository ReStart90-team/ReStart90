const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let galaxyContainer;
let disposeGalaxy;
let generation = 0;

export function syncVisuals() {
  const container = document.getElementById('galaxy-stage');
  if (container !== galaxyContainer) {
    disposeGalaxy?.();
    disposeGalaxy = null;
    galaxyContainer = container;
    const id = ++generation;
    if (container) {
      import('./galaxy.js').then(({ mountGalaxy }) => {
        if (id === generation && container.isConnected) disposeGalaxy = mountGalaxy(container);
      }).catch(() => container.classList.add('galaxy-fallback'));
    }
  }
  if (reduced.matches) return;
  document.querySelectorAll('.xroles-grid article, .live-product-grid > div:first-child, .xsafe-grid > div, .xcta h2').forEach(el => {
    if (el.dataset.motionReady) return;
    el.dataset.motionReady = '1';
    observer.observe(el);
  });
}

const observer = new IntersectionObserver(entries => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) continue;
    if (!reduced.matches) target.animate([
      { opacity: 0, transform: 'translateY(24px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)' });
    observer.unobserve(target);
  }
}, { threshold: 0.15 });

const glow = document.createElement('div');
glow.className = 'pointer-glow';
glow.setAttribute('aria-hidden', 'true');
document.body.append(glow);
let frame = 0;
let pointer = { x: 0, y: 0 };
document.addEventListener('pointermove', ev => {
  if (reduced.matches || ev.pointerType === 'touch') return;
  pointer = { x: ev.clientX, y: ev.clientY };
  if (frame) return;
  frame = requestAnimationFrame(() => {
    glow.style.left = `${pointer.x}px`;
    glow.style.top = `${pointer.y}px`;
    glow.style.opacity = '1';
    frame = 0;
  });
}, { passive: true });
document.addEventListener('pointerleave', () => { glow.style.opacity = '0'; });
document.addEventListener('pointerdown', ev => {
  if (reduced.matches) return;
  const ripple = document.createElement('div');
  ripple.className = 'click-wave';
  ripple.setAttribute('aria-hidden', 'true');
  ripple.style.setProperty('--x', `${ev.clientX}px`);
  ripple.style.setProperty('--y', `${ev.clientY}px`);
  document.body.append(ripple);
  ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  setTimeout(() => ripple.remove(), 1000);
});
window.addEventListener('pagehide', () => { disposeGalaxy?.(); observer.disconnect(); });

let localVideoUrl;
let subtitleUrl;
document.addEventListener('click', ev => {
  if (ev.target.closest('[data-film-open]')) document.getElementById('film-input')?.click();
  if (ev.target.closest('[data-subtitle-open]')) document.getElementById('subtitle-input')?.click();
});
document.addEventListener('change', ev => {
  const file = ev.target.files?.[0];
  if (!file) return;
  if (ev.target.id === 'film-input') {
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    localVideoUrl = URL.createObjectURL(file);
    const frame = document.getElementById('film-frame');
    frame.querySelector('video')?.remove();
    frame.querySelector('.film-controls').style.display = 'none';
    const video = document.createElement('video');
    video.id = 'brand-film';
    video.src = localVideoUrl;
    video.controls = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-label', 'ReStart90 brand film');
    frame.append(video);
    document.querySelector('[data-subtitle-open]').hidden = false;
    video.play().catch(() => {});
  }
  if (ev.target.id === 'subtitle-input') {
    if (subtitleUrl) URL.revokeObjectURL(subtitleUrl);
    subtitleUrl = URL.createObjectURL(file);
    const video = document.getElementById('brand-film');
    if (!video) return;
    video.querySelector('track')?.remove();
    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'Subtitles';
    track.srclang = document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
    track.src = subtitleUrl;
    track.default = true;
    video.append(track);
  }
});

// Launch Film V2: only begin after an explicit user click, with sound enabled.
export async function playLaunchFilm() {
  const frame = document.getElementById('film-frame');
  const video = document.getElementById('brand-film');
  if (!frame || !video?.dataset.filmSrc) return;
  const cover = frame.querySelector('.launch-film-cover');
  const loading = frame.querySelector('.launch-film-loading');
  if (!video.getAttribute('src')) video.src = video.dataset.filmSrc;
  video.muted = false;
  video.volume = 1;
  video.hidden = false;
  cover.hidden = true;
  if (loading) loading.hidden = false;
  const clearLoading = () => { if (loading) loading.hidden = true; };
  video.addEventListener('playing', clearLoading, { once: true });
  try {
    await video.play();
    clearLoading();
  } catch {
    clearLoading();
    if (video.error) {
      video.hidden = true;
      cover.hidden = false;
      if (loading) {
        loading.hidden = false;
        loading.textContent = document.documentElement.lang.startsWith('zh') ? '加载失败，请点击重试。' : 'Could not load the film. Click to retry.';
      }
      video.removeAttribute('src');
      video.load();
    }
    // If playback is blocked, native controls stay visible for another user tap.
  }
}
document.addEventListener('click', event => {
  if (event.target.closest('[data-launch-film-play]')) {
    event.preventDefault();
    void playLaunchFilm();
  }
});
