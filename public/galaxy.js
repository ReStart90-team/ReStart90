import * as THREE from '/assets/three.module.js';

const mountedGalaxies = new WeakMap();
const TAU = Math.PI * 2;
const BRAND_WORD = 'ReStart90';
const WORD_WIDTH = 11.2;
const WORD_FONT = '800 160px "Overpass Variable", Arial, sans-serif';
const PHASE_SECONDS = { sphere: 0.9, scatter: 0.6, assemble: 1.1, word: 10, return: 1.3 };
const smoothProgress = (value) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uMorph;
  uniform float uShape;
  uniform float uDpr;
  uniform float uAspect;
  uniform vec2 uPointer;
  uniform float uPointerStrength;

  attribute vec3 aRibbon;
  attribute vec3 aScatter;
  attribute vec3 aWord;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aSeed;
  attribute float aKind;
  attribute float aEnergy;

  varying vec3 vColor;
  varying float vAlpha;

  mat2 rotate2d(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c);
  }

  void main() {
    vec3 p = position;
    float alpha = aEnergy;
    float phase = aSeed * 6.283185;

    if (aKind < 0.5) {
      // A living, striated shell, not a filled ball or a silhouette.
      float longitude = atan(p.z, p.x);
      float ripple = sin(p.y * 3.2 + longitude * 2.0 - uTime * 0.58);
      p += normalize(p) * (ripple * 0.065 + sin(phase + uTime * 0.8) * 0.032);
      p.xz = rotate2d(uTime * 0.065) * p.xz;
      p.xy = rotate2d(0.10 + sin(uTime * 0.13) * 0.045) * p.xy;

      vec3 ribbon = aRibbon;
      ribbon.y += sin(ribbon.x * 0.8 - uTime * 0.65 + phase) * 0.10;
      ribbon.z += cos(ribbon.x * 0.46 + uTime * 0.38) * 0.24;
      vec3 scatter = aScatter;
      scatter.y += sin(scatter.x * 0.52 + phase + uTime * 0.5) * 0.20;
      scatter.xz = rotate2d(sin(uTime * 0.17) * 0.07) * scatter.xz;
      // The original shell opens through a flowing ribbon, then disperses.
      p = mix(p, mix(ribbon, scatter, smoothstep(0.0, 0.65, uMorph)), uMorph);
      alpha *= 0.76 + 0.24 * pow(0.5 + 0.5 * ripple, 2.0);
      alpha *= 1.0 - 0.22 * uMorph;

      // These are the SAME shell particles, not a second text layer.
      // Only depth breathes at rest; glyph edges and counters stay accurate.
      vec3 word = aWord;
      word.z += sin(phase + uTime * 0.42) * 0.018;
      p = mix(p, word, uShape);
      alpha = mix(alpha, 0.36 + aSeed * 0.20, uShape);
    } else if (aKind < 1.5) {
      // Broad, airy particle orbits with slow differential rotation.
      p.xz = rotate2d(uTime * (0.025 + aSeed * 0.012)) * p.xz;
      p.y += sin(phase + uTime * 0.32) * 0.055;
      p.x *= 1.0 + uMorph * 0.05;
      alpha *= 1.0 - uMorph * 0.24;
      alpha *= pow(1.0 - uShape, 2.0);
    } else if (aKind < 2.5) {
      p.y += sin(p.x * 0.60 + phase + uTime * 0.38) * 0.09;
      p.x += sin(uTime * 0.31 + phase) * 0.12;
      alpha *= 0.8 + 0.2 * sin(phase + uTime * 0.5);
      alpha *= pow(1.0 - uShape, 2.0);
    } else {
      alpha *= mix(1.0, 0.45, uShape);
    }

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vec4 projected = projectionMatrix * viewPosition;
    vec2 screenPosition = projected.xy / projected.w;

    // Repulsion is measured in screen space, so it follows the real cursor.
    vec2 delta = (screenPosition - uPointer) * vec2(uAspect, 1.0);
    float distanceToPointer = length(delta);
    float proximity = exp(-distanceToPointer * distanceToPointer * 17.0);
    vec2 away = delta / max(distanceToPointer, 0.035);
    vec2 curl = vec2(-away.y, away.x);
    float interaction = uPointerStrength * proximity;
    // A readable word still responds, but no cursor can tear it apart.
    interaction *= mix(1.0, 0.10, uShape);
    if (aKind > 2.5) interaction *= 0.12;
    vec2 push = (away * 0.24 + curl * 0.065) * interaction;
    projected.xy += push / vec2(uAspect, 1.0) * projected.w;
    gl_Position = projected;

    float perspective = clamp(14.0 / -viewPosition.z, 0.45, 1.7);
    float sparkle = 0.87 + 0.13 * sin(phase + uTime * (0.45 + aSeed));
    float pointSize = aSize * perspective;
    if (aKind < 0.5) pointSize = mix(pointSize, 1.5 + aSeed * 0.55, uShape);
    gl_PointSize = clamp(pointSize * uDpr, 1.0, 8.0 * uDpr);
    float depth = aKind > 2.5 ? 1.0 : smoothstep(-5.0, 3.3, p.z);
    vAlpha = alpha * sparkle * (0.42 + depth * 0.58);
    vAlpha *= 1.0 + interaction * 0.65;
    vColor = mix(aColor, vec3(0.87, 0.94, 1.0), interaction * 0.26);
    if (aKind < 0.5) vColor = mix(vColor, vec3(0.76, 0.83, 1.0), uShape * 0.36);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    float radiusSquared = dot(point, point);
    if (radiusSquared > 1.0) discard;
    float core = exp(-radiusSquared * 17.0);
    float halo = exp(-radiusSquared * 3.5) * 0.24;
    float edge = 1.0 - smoothstep(0.56, 1.0, radiusSquared);
    float alpha = (core + halo) * edge * vAlpha * 2.0;
    gl_FragColor = vec4(vColor * 1.35, alpha);
    #include <colorspace_fragment>
  }
`;

function sampleWordPixels() {
  // Entirely local canvas typography; a loaded Overpass is used automatically.
  // The same font stack resolves to bold Arial on an early, cold mount.
  const bitmap = document.createElement('canvas');
  const context = bitmap.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Local text sampling is unavailable');
  context.font = WORD_FONT;
  const padding = 16;
  bitmap.width = Math.ceil(context.measureText(BRAND_WORD).width + padding * 2 + 24);
  bitmap.height = 224;
  context.font = WORD_FONT; // Resizing a canvas resets its drawing state.
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#ffffff';
  context.fillText(BRAND_WORD, padding, 176);

  const { width, height } = bitmap;
  const pixels = context.getImageData(0, 0, width, height).data;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right <= left || bottom <= top) throw new Error('Empty local brand glyphs');

  const samples = [];
  const scale = WORD_WIDTH / (right - left);
  const centerX = (left + right) * 0.5;
  const centerY = (top + bottom) * 0.5;
  // A two-pixel interior grid preserves counters, stems and the exact casing.
  for (let y = top; y <= bottom; y += 2) {
    for (let x = left; x <= right; x += 2) {
      if (pixels[(y * width + x) * 4 + 3] < 150) continue;
      samples.push([(x - centerX) * scale, (centerY - y) * scale + 0.12]);
    }
  }
  if (!samples.length) throw new Error('Empty local brand samples');
  return { samples, scale };
}

function updateWordAttribute(geometry) {
  const { samples, scale } = sampleWordPixels();
  let state = 90319;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Shuffle first, then stratify: all eight glyphs get even coverage on mobile
  // too, without concentrating a cap of the sphere into one letter.
  for (let i = samples.length - 1; i > 0; i -= 1) {
    const other = Math.floor(random() * (i + 1));
    [samples[i], samples[other]] = [samples[other], samples[i]];
  }
  const source = geometry.getAttribute('position');
  const targets = new Float32Array(source.array);
  const shellCount = geometry.userData.shellCount;
  for (let i = 0; i < shellCount; i += 1) {
    const sample = samples[Math.floor((i + 0.5) * samples.length / shellCount)];
    const offset = i * 3;
    targets[offset] = sample[0] + (random() - 0.5) * scale * 0.65;
    targets[offset + 1] = sample[1] + (random() - 0.5) * scale * 0.65;
    targets[offset + 2] = (random() - 0.5) * 0.07;
  }
  const attribute = geometry.getAttribute('aWord');
  if (attribute) {
    attribute.array.set(targets);
    attribute.needsUpdate = true;
  } else {
    geometry.setAttribute('aWord', new THREE.BufferAttribute(targets, 3));
  }
}

function makeParticleGeometry(mobile) {
  const counts = mobile
    ? { shell: 4800, rings: 720, trails: 550, stars: 150 }
    : { shell: 10000, rings: 1600, trails: 1100, stars: 330 };
  const count = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const positions = new Float32Array(count * 3);
  const ribbons = new Float32Array(count * 3);
  const scatter = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const seeds = new Float32Array(count);
  const kinds = new Float32Array(count);
  const energies = new Float32Array(count);

  // A deterministic field keeps route transitions visually consistent.
  let randomState = 90127;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const centered = (width) => (random() + random() + random() - 1.5) * width;
  const palette = [
    new THREE.Color('#e7efff'),
    new THREE.Color('#bdccf6'),
    new THREE.Color('#a695ed'),
    new THREE.Color('#d2c4ff'),
    new THREE.Color('#91c6ef'),
  ];
  const point = new THREE.Vector3();
  let cursor = 0;

  const addPoint = (x, y, z, kind, size, energy, colorIndex, ribbon, dispersed) => {
    const offset = cursor * 3;
    positions.set([x, y, z], offset);
    ribbons.set(ribbon || [x, y, z], offset);
    scatter.set(dispersed || [x, y, z], offset);
    const color = palette[colorIndex];
    colors.set([color.r, color.g, color.b], offset);
    sizes[cursor] = size;
    energies[cursor] = energy;
    seeds[cursor] = random();
    kinds[cursor] = kind;
    cursor += 1;
  };

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < counts.shell; i += 1) {
    const y = 1 - (2 * (i + 0.5)) / counts.shell;
    const circumference = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = i * goldenAngle + centered(0.045);
    const radius = 3 + centered(0.095) + Math.sin(angle * 3 + y * 8) * 0.042;
    const x = Math.cos(angle) * circumference * radius;
    const sy = y * radius;
    const z = Math.sin(angle) * circumference * radius;

    const strand = i % 7;
    const along = (Math.floor(i / 7) / Math.ceil(counts.shell / 7)) * 2 - 1;
    const rx = along * 6.05 + centered(0.11);
    const strandOffset = (strand - 3) * 0.19;
    const ribbon = [
      rx,
      Math.sin(rx * 0.66 + strand * 0.12) * 1.1 + strandOffset + centered(0.23),
      Math.cos(rx * 0.50 + strand * 0.22) * 1.25 + centered(0.32),
    ];
    const spread = 1.1 + random() * 0.65;
    const dispersed = [
      x * spread + centered(2.1),
      sy * (0.72 + random() * 0.35) + centered(0.8),
      z * (0.9 + random() * 0.65) + centered(1.2),
    ];
    const colorChoice = random();
    const colorIndex = colorChoice < 0.42 ? 0 : colorChoice < 0.65 ? 1 : colorChoice < 0.84 ? 2 : 3;
    const bright = random();
    const size = bright > 0.96 ? 4.1 + random() * 1.6 : 1.9 + random() * 1.8;
    const energy = 0.34 + random() * 0.50 + (bright > 0.96 ? 0.12 : 0);
    addPoint(x, sy, z, 0, size, energy, colorIndex, ribbon, dispersed);
  }

  for (let i = 0; i < counts.rings; i += 1) {
    const layer = i % 2;
    const angle = random() * TAU;
    const radius = THREE.MathUtils.clamp((layer ? 4.82 : 4.14) + random() * 0.55 + centered(0.10), 4.1, 5.4);
    point.set(Math.cos(angle) * radius, centered(0.16), Math.sin(angle) * radius);
    point.applyAxisAngle(new THREE.Vector3(1, 0, 0), layer ? 1.12 : 1.26);
    point.applyAxisAngle(new THREE.Vector3(0, 0, 1), layer ? 0.24 : -0.31);
    const brokenArc = 0.3 + 0.7 * Math.pow(Math.sin(angle * 1.5 + layer), 2);
    addPoint(
      point.x, point.y, point.z,
      1, 1.9 + random() * 1.8,
      (0.35 + random() * 0.35) * brokenArc,
      random() < 0.73 ? 0 : 4,
    );
  }

  // Fine, wide filaments give the composition a horizontal energy flow.
  const lanes = 11;
  for (let i = 0; i < counts.trails; i += 1) {
    const lane = i % lanes;
    const phase = lane * 0.56;
    const x = (random() * 2 - 1) * 7.3;
    const y = Math.sin(x * 0.44 + phase) * (0.55 + lane * 0.065)
      + (lane - 5) * 0.18 + x * (lane % 2 ? 0.045 : -0.045) + centered(0.055);
    const z = Math.cos(x * 0.3 + phase) * 1.2 + (lane - 5) * 0.17;
    const edgeFade = Math.max(0.12, 1 - Math.pow(Math.abs(x) / 7.3, 2));
    addPoint(x, y, z, 2, 0.95 + random() * 1.0, (0.18 + random() * 0.24) * edgeFade, lane % 3 ? 1 : 3);
  }

  for (let i = 0; i < counts.stars; i += 1) {
    const x = (random() * 2 - 1) * 11.5;
    const y = (random() * 2 - 1) * 7.5;
    const z = -3.5 - random() * 9;
    const brighter = random() > 0.94;
    addPoint(x, y, z, 3, brighter ? 3.1 : 1.3 + random(), brighter ? 0.5 : 0.12 + random() * 0.20, i % 4 === 0 ? 2 : 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aRibbon', new THREE.BufferAttribute(ribbons, 3));
  geometry.setAttribute('aScatter', new THREE.BufferAttribute(scatter, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aKind', new THREE.BufferAttribute(kinds, 1));
  geometry.setAttribute('aEnergy', new THREE.BufferAttribute(energies, 1));
  geometry.userData.shellCount = counts.shell;
  try {
    updateWordAttribute(geometry);
  } catch (error) {
    geometry.dispose();
    throw error;
  }
  return geometry;
}

/** Mount a self-contained particle field; call the returned function on route exit. */
export function mountGalaxy(container) {
  if (!container || typeof container.appendChild !== 'function') return () => {};
  mountedGalaxies.get(container)?.();

  let disposed = false;
  let failed = false;
  let renderer = null;
  let geometry = null;
  let material = null;
  let canvas = null;
  let fallback = null;
  let resizeObserver = null;
  let intersectionObserver = null;
  let raf = 0;
  const removeListeners = [];

  const markShape = (shape) => {
    if (container.dataset && container.dataset.galaxyShape !== shape) {
      container.dataset.galaxyShape = shape;
    }
  };
  const cancelFrame = () => {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  };
  const releaseWebGL = () => {
    cancelFrame();
    removeListeners.splice(0).reverse().forEach((remove) => remove());
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    resizeObserver = null;
    intersectionObserver = null;
    geometry?.dispose();
    material?.dispose();
    geometry = null;
    material = null;
    if (renderer) {
      renderer.renderLists?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    }
    canvas?.remove();
    canvas = null;
  };
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    releaseWebGL();
    fallback?.remove();
    fallback = null;
    if (mountedGalaxies.get(container) === cleanup) {
      mountedGalaxies.delete(container);
      if (container.dataset) delete container.dataset.galaxyShape;
    }
  };
  const showFallback = () => {
    if (disposed || failed) return;
    failed = true;
    releaseWebGL();
    fallback = document.createElement('div');
    fallback.setAttribute('aria-hidden', 'true');
    Object.assign(fallback.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      background: 'radial-gradient(ellipse at 52% 47%, rgba(219,224,255,.16) 0%, rgba(149,121,234,.10) 19%, rgba(79,103,168,.04) 35%, transparent 62%)',
    });
    // DOM text is ONLY the real no-WebGL/failed-renderer degradation.
    const brand = document.createElement('span');
    brand.textContent = BRAND_WORD;
    Object.assign(brand.style, {
      position: 'absolute',
      left: '50%',
      top: '49%',
      transform: 'translate(-50%, -50%)',
      fontFamily: '"Overpass Variable", Arial, sans-serif',
      fontWeight: '800',
      lineHeight: '1',
      letterSpacing: '-0.025em',
      whiteSpace: 'nowrap',
      color: '#cbd7f2',
      textShadow: '0 0 22px rgba(159,151,230,.26), 0 0 60px rgba(124,119,216,.14)',
    });
    fallback.appendChild(brand);
    // A quiet, entirely local fallback, rather than an empty stage or an error.
    for (let i = 0; i < 28; i += 1) {
      const star = document.createElement('i');
      Object.assign(star.style, {
        position: 'absolute',
        left: `${9 + ((i * 47) % 83)}%`,
        top: `${7 + ((i * 31) % 86)}%`,
        width: i % 7 === 0 ? '2px' : '1px',
        height: i % 7 === 0 ? '2px' : '1px',
        borderRadius: '50%',
        background: '#d3d9ff',
        opacity: `${0.15 + (i % 5) * 0.10}`,
      });
      fallback.appendChild(star);
    }
    container.appendChild(fallback);
    markShape('word');
    const sizeFallback = () => {
      if (disposed || !fallback) return;
      const { width } = container.getBoundingClientRect();
      brand.style.fontSize = `${Math.max(1, Math.min(104, width * 0.17))}px`;
    };
    sizeFallback();
    listen(window, 'resize', sizeFallback, { passive: true });
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(sizeFallback);
      resizeObserver.observe(container);
    }
  };
  mountedGalaxies.set(container, cleanup);
  markShape('sphere');

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    removeListeners.push(() => target.removeEventListener(type, handler, options));
  };

  try {
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const mobile = coarsePointer || window.innerWidth < 640;
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reducedMotion = motionQuery.matches;
    let inViewport = true;
    let hasSize = false;
    let lastTime = 0;
    let elapsed = 0;
    let phase = reducedMotion ? 'word' : 'sphere';
    let phaseElapsed = 0;
    let destination = reducedMotion ? 'word' : 'sphere';
    let phaseFromMorph = 0;
    let phaseFromWord = reducedMotion ? 1 : 0;
    let shapeValue = phaseFromWord;
    let morphValue = 0;
    let morphVelocity = 0;
    let morphTarget = 0;
    let pointerInside = false;
    let pointerStrength = 0;
    let shaderFailed = false;
    const pointerTarget = new THREE.Vector2(4, 4);
    const pointer = pointerTarget.clone();
    const parallaxTarget = new THREE.Vector2();
    const parallax = new THREE.Vector2();
    markShape(phase);

    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance',
      depth: false,
      stencil: false,
    });
    renderer.setClearColor(0x020208, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.debug.onShaderError = () => { shaderFailed = true; };
    canvas = renderer.domElement;
    canvas.setAttribute('aria-hidden', 'true');
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      display: 'block',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      zIndex: '0',
    });
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(0, 0.12, 14);
    const uniforms = {
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uShape: { value: shapeValue },
      uDpr: { value: 1 },
      uAspect: { value: 1 },
      uPointer: { value: pointer },
      uPointerStrength: { value: 0 },
    };
    geometry = makeParticleGeometry(mobile);
    material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const field = new THREE.Points(geometry, material);
    field.frustumCulled = false; // GPU morphs intentionally extend past the base shell.
    scene.add(field);

    const canRender = () => !disposed && !failed && !document.hidden && inViewport && hasSize;
    const draw = () => {
      if (!canRender()) return;
      try {
        renderer.render(scene, camera);
        if (shaderFailed) showFallback();
      } catch {
        showFallback();
      }
    };
    const updateCamera = () => {
      // The sphere has depth; the word should remain almost front-facing.
      const wordStillness = 1 - shapeValue * 0.82;
      camera.position.x = parallax.x * 0.48 * wordStillness;
      camera.position.y = 0.12 + parallax.y * 0.32 * wordStillness;
      camera.lookAt(0, 0.04, 0);
    };
    const beginPhase = (next) => {
      phase = next;
      phaseElapsed = 0;
      phaseFromMorph = morphValue;
      phaseFromWord = shapeValue;
      destination = next === 'sphere' || next === 'return' ? 'sphere' : 'word';
      markShape(next === 'sphere' || next === 'word' ? next : 'transition');
    };
    const advancePhase = () => {
      if (phase === 'sphere') {
        beginPhase('scatter');
      } else if (phase === 'scatter') {
        shapeValue = 0;
        beginPhase('assemble');
      } else if (phase === 'assemble') {
        shapeValue = 1;
        beginPhase('word');
      } else if (phase === 'word') {
        beginPhase('return');
      } else {
        shapeValue = 0;
        beginPhase('sphere');
      }
    };
    const triggerMorph = () => {
      if (reducedMotion || !canRender()) return;
      // Retarget from the currently displayed particles, even mid-transition.
      beginPhase(destination === 'word' ? 'return' : 'scatter');
    };
    const frame = (now) => {
      raf = 0;
      if (!canRender() || reducedMotion) return;
      const phaseDt = lastTime ? Math.min((now - lastTime) / 1000, 0.2) : 0.016;
      const dt = Math.min(phaseDt, 0.033);
      lastTime = now;
      elapsed += phaseDt;
      phaseElapsed += phaseDt;
      if (phaseElapsed >= PHASE_SECONDS[phase]) {
        const overflow = phaseElapsed - PHASE_SECONDS[phase];
        advancePhase();
        phaseElapsed = overflow;
      }
      const progress = smoothProgress(phaseElapsed / PHASE_SECONDS[phase]);
      if (phase === 'scatter') {
        morphTarget = phaseFromMorph + (1 - phaseFromMorph) * progress;
        shapeValue = phaseFromWord * (1 - progress);
      } else if (phase === 'assemble') {
        morphTarget = 1;
        shapeValue = phaseFromWord + (1 - phaseFromWord) * progress;
      } else if (phase === 'return') {
        morphTarget = phaseFromMorph * (1 - progress);
        shapeValue = phaseFromWord * (1 - progress);
      } else {
        morphTarget = phase === 'word' ? 1 : 0;
        shapeValue = phase === 'word' ? 1 : 0;
      }

      // Damped spring recovery retains a slight elastic energy without jitter.
      morphVelocity += ((morphTarget - morphValue) * 49 - morphVelocity * 10.8) * dt;
      morphValue += morphVelocity * dt;
      morphValue = THREE.MathUtils.clamp(morphValue, 0, 1);
      const easing = 1 - Math.exp(-dt * 5.5);
      pointer.lerp(pointerTarget, 1 - Math.exp(-dt * 12));
      pointerStrength += ((pointerInside ? 1 : 0) - pointerStrength) * (1 - Math.exp(-dt * 7));
      parallax.lerp(parallaxTarget, easing);
      updateCamera();
      uniforms.uTime.value = elapsed;
      uniforms.uMorph.value = morphValue;
      uniforms.uShape.value = shapeValue;
      uniforms.uPointerStrength.value = pointerStrength;
      draw();
      if (canRender() && !reducedMotion) raf = window.requestAnimationFrame(frame);
    };
    const wake = () => {
      if (!canRender()) {
        cancelFrame();
        lastTime = 0;
        return;
      }
      if (reducedMotion) {
        draw();
      } else if (!raf) {
        lastTime = 0;
        raf = window.requestAnimationFrame(frame);
      }
    };
    const resize = () => {
      if (disposed || failed) return;
      const { width, height } = container.getBoundingClientRect();
      hasSize = width > 0 && height > 0;
      if (!hasSize) { wake(); return; }
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1 : 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(Math.max(1, Math.round(width)), Math.max(1, Math.round(height)), false);
      camera.aspect = width / height;
      // Fit the full 11.2-unit word (plus margins), not just the original sphere.
      // This also preserves a readable single line on portrait/mobile stages.
      const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
      camera.position.z = Math.max(14, (WORD_WIDTH + 1.4) / (2 * Math.tan(halfFov) * camera.aspect));
      camera.updateProjectionMatrix();
      uniforms.uDpr.value = dpr;
      uniforms.uAspect.value = camera.aspect;
      updateCamera();
      wake();
    };
    const handlePointer = (event) => {
      if (reducedMotion || event.pointerType === 'touch' || !canRender()) return;
      const rect = container.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      const y = 1 - ((event.clientY - rect.top) / rect.height) * 2;
      pointerInside = x >= -1 && x <= 1 && y >= -1 && y <= 1;
      parallaxTarget.set(
        THREE.MathUtils.clamp(x, -1, 1),
        THREE.MathUtils.clamp(y, -1, 1),
      );
      if (pointerInside) pointerTarget.set(x, y);
    };
    const leavePointer = () => {
      pointerInside = false;
      parallaxTarget.set(0, 0);
      if (reducedMotion) {
        uniforms.uPointerStrength.value = 0;
        parallax.set(0, 0);
        updateCamera();
        draw();
      }
    };
    const handleClick = (event) => {
      // Decorative interaction never intercepts navigation or form controls.
      if (event.defaultPrevented || event.target?.closest?.('button, a, input, textarea, select, summary, label, [contenteditable="true"], [role="button"], [role="link"], [data-no-galaxy]')) return;
      triggerMorph();
    };
    const handleMotionPreference = () => {
      reducedMotion = motionQuery.matches;
      cancelFrame();
      lastTime = 0;
      if (reducedMotion) {
        morphValue = 0;
        morphVelocity = 0;
        morphTarget = 0;
        shapeValue = 1;
        pointerInside = false;
        pointerStrength = 0;
        pointerTarget.set(4, 4);
        pointer.copy(pointerTarget);
        parallaxTarget.set(0, 0);
        parallax.set(0, 0);
        uniforms.uTime.value = 0;
        uniforms.uMorph.value = 0;
        uniforms.uShape.value = 1;
        uniforms.uPointerStrength.value = 0;
      }
      // Reduced motion is a genuinely static particle word, never a sphere.
      // Resuming holds that word for six seconds instead of jumping away.
      beginPhase('word');
      updateCamera();
      wake();
    };

    listen(window, 'pointermove', handlePointer, { passive: true });
    listen(container, 'pointerleave', leavePointer, { passive: true });
    listen(container, 'click', handleClick);
    listen(window, 'blur', leavePointer);
    listen(window, 'resize', resize, { passive: true });
    listen(document, 'visibilitychange', wake);
    listen(canvas, 'webglcontextlost', (event) => {
      event.preventDefault();
      showFallback();
    });
    if (motionQuery.addEventListener) {
      listen(motionQuery, 'change', handleMotionPreference);
    } else {
      motionQuery.addListener(handleMotionPreference);
      removeListeners.push(() => motionQuery.removeListener(handleMotionPreference));
    }
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      intersectionObserver = new IntersectionObserver(([entry]) => {
        inViewport = Boolean(entry?.isIntersecting);
        wake();
      }, { rootMargin: '60px' });
      intersectionObserver.observe(container);
    }
    const wordGeometry = geometry;
    if (document.fonts?.ready) {
      // Re-sample only an already-requested local font; no fetch/load is added.
      // Route exits and context loss invalidate this asynchronous continuation.
      document.fonts.ready.then(() => {
        if (disposed || failed || geometry !== wordGeometry) return;
        try {
          updateWordAttribute(wordGeometry);
          draw();
        } catch {
          // Keep the valid initial Arial particle glyphs if font refresh fails.
        }
      }).catch(() => {});
    }
    resize();
  } catch {
    showFallback();
  }

  return cleanup;
}
