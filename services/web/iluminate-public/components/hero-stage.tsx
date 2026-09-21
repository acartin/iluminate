"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import markAsset from "@/assets/iluminate-brand-master-editable_Mark Light.svg";

const SIGNAL_RED = new THREE.Color("#e8170c");
const NEON_RED = new THREE.Color("#ff2a18");
const INTERACTION_COLORS = ["#ff174f", "#ff5a00", "#8b5cff"];
const DOT_COLOR = "#00e5ff";

type InteractivePart = {
  meshes: THREE.Mesh[];
  material: THREE.MeshPhysicalMaterial;
  halo: THREE.Sprite;
  color: THREE.Color;
  baseColor: THREE.Color;
  active: boolean;
  isDot: boolean;
};

type GlowParticle = {
  sprite: THREE.Sprite;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  delay: number;
  size: number;
};

function createGlowTexture() {
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 128;
  glowCanvas.height = 128;
  const context = glowCanvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.12, "rgba(255,255,255,.95)");
    gradient.addColorStop(0.42, "rgba(255,255,255,.42)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNebulaTexture() {
  const nebulaCanvas = document.createElement("canvas");
  nebulaCanvas.width = 768;
  nebulaCanvas.height = 768;
  const context = nebulaCanvas.getContext("2d");
  if (context) {
    const clouds = [
      [382, 382, 255, 198, 0.94],
      [242, 322, 182, 138, 0.72],
      [520, 302, 162, 217, 0.68],
      [472, 500, 218, 134, 0.62],
      [294, 506, 138, 170, 0.54],
    ];
    clouds.forEach(([x, y, radiusX, radiusY, alpha]) => {
      context.save();
      context.translate(x, y);
      context.scale(radiusX / radiusY, 1);
      const gradient = context.createRadialGradient(0, 0, 0, 0, 0, radiusY);
      gradient.addColorStop(0, `rgba(4,4,7,${alpha})`);
      gradient.addColorStop(0.42, `rgba(5,5,8,${alpha * 0.72})`);
      gradient.addColorStop(0.76, `rgba(8,8,11,${alpha * 0.23})`);
      gradient.addColorStop(1, "rgba(8,8,11,0)");
      context.fillStyle = gradient;
      context.fillRect(-radiusY, -radiusY, radiusY * 2, radiusY * 2);
      context.restore();
    });
  }
  const texture = new THREE.CanvasTexture(nebulaCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3;
}

function createScene(
  canvas: HTMLCanvasElement,
  container: HTMLDivElement,
  onReady: () => void,
) {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: false,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }

  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#ddd8cf");

  const camera = new THREE.PerspectiveCamera(mobile ? 40 : 34, 1, 0.1, 50);
  camera.position.set(0, 0, mobile ? 13 : 11);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const glowTexture = createGlowTexture();
  const nebulaTexture = createNebulaTexture();

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(28, 18),
    new THREE.MeshStandardMaterial({ color: 0xddd8cf, roughness: 0.96, metalness: 0 }),
  );
  // Keep the sculpture physically close to the wall so the shadow reads as
  // mounted signage, not as an object floating in the room.
  wall.position.z = -0.24;
  wall.receiveShadow = true;
  scene.add(wall);

  const seamMaterial = new THREE.LineBasicMaterial({
    color: 0x6c675f,
    transparent: true,
    opacity: 0.09,
  });
  const seams = new THREE.BufferGeometry();
  seams.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([
      -14, -3.9, -0.23, 14, -3.9, -0.23,
      -14, 3.9, -0.23, 14, 3.9, -0.23,
      -6.8, -9, -0.23, -6.8, 9, -0.23,
      6.8, -9, -0.23, 6.8, 9, -0.23,
    ], 3),
  );
  scene.add(new THREE.LineSegments(seams, seamMaterial));

  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(mobile ? 5.1 : 9.65, mobile ? 4.3 : 7.35),
    new THREE.MeshBasicMaterial({
    map: nebulaTexture,
    transparent: true,
    opacity: 0.97,
    depthWrite: false,
    toneMapped: false,
    }),
  );
  nebula.position.set(mobile ? -0.65 : 3.15, mobile ? 2.85 : 0.78, -0.18);
  scene.add(nebula);

  const sculpture = new THREE.Group();
  const finalPosition = new THREE.Vector3(mobile ? -0.65 : 3.1, mobile ? 2.85 : 0.75, 0);
  sculpture.position.copy(finalPosition);
  scene.add(sculpture);

  const redMaterial = new THREE.MeshPhysicalMaterial({
    color: SIGNAL_RED,
    roughness: 0.3,
    metalness: 0.04,
    clearcoat: 0.48,
    clearcoatRoughness: 0.26,
    emissive: NEON_RED,
    emissiveIntensity: 0.16,
  });
  const graphiteMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0b0b0d,
    roughness: 0.24,
    metalness: 0.18,
    clearcoat: 0.68,
    clearcoatRoughness: 0.2,
    emissive: NEON_RED,
    emissiveIntensity: 0,
  });
  const interactiveParts: InteractivePart[] = [];
  const interactiveMeshes: THREE.Mesh[] = [];
  const particles: GlowParticle[] = [];
  let markLoaded = false;
  const importedMark = new THREE.Group();
  const rawMark = new THREE.Group();
  importedMark.add(rawMark);
  sculpture.add(importedMark);
  const markUrl = typeof markAsset === "string" ? markAsset : markAsset.src;
  new SVGLoader().load(markUrl, (data) => {
    data.paths.forEach((path) => {
      const style = path.userData?.style as { fill?: string } | undefined;
      const fill = new THREE.Color(style?.fill ?? "#0b0b0d");
      const isRed = fill.r > fill.g * 1.35;
      const material = (isRed ? redMaterial : graphiteMaterial).clone();
      const interactionColor = new THREE.Color(
        isRed ? INTERACTION_COLORS[interactiveParts.length % INTERACTION_COLORS.length] : DOT_COLOR,
      );
      material.emissive.copy(interactionColor);
      material.emissiveIntensity = 0;
      const shapes = SVGLoader.createShapes(path);
      const meshes: THREE.Mesh[] = [];
      const partBounds = new THREE.Box2();
      shapes.forEach((shape) => {
        const geometry = new THREE.ExtrudeGeometry(shape, {
          depth: 8,
          bevelEnabled: true,
          bevelThickness: 1.4,
          bevelSize: 0.7,
          bevelSegments: 4,
          curveSegments: 18,
        });
        geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          partBounds.expandByPoint(new THREE.Vector2(geometry.boundingBox.min.x, geometry.boundingBox.min.y));
          partBounds.expandByPoint(new THREE.Vector2(geometry.boundingBox.max.x, geometry.boundingBox.max.y));
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        meshes.push(mesh);
        interactiveMeshes.push(mesh);
        rawMark.add(mesh);
      });
      const center = partBounds.getCenter(new THREE.Vector2());
      const partSize = partBounds.getSize(new THREE.Vector2());
      const haloMaterial = new THREE.SpriteMaterial({
        map: glowTexture,
        color: interactionColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const halo = new THREE.Sprite(haloMaterial);
      halo.position.set(center.x, center.y, -2.2);
      halo.scale.set(Math.max(partSize.x * 1.9, 34), Math.max(partSize.y * 1.55, 34), 1);
      rawMark.add(halo);
      const part: InteractivePart = {
        meshes,
        material,
        halo,
        color: interactionColor,
        baseColor: isRed ? SIGNAL_RED.clone() : new THREE.Color("#0b0b0d"),
        active: false,
        isDot: !isRed,
      };
      const partIndex = interactiveParts.push(part) - 1;
      meshes.forEach((mesh) => { mesh.userData.interactivePart = partIndex; });
    });
    rawMark.scale.y = -1;
    const bounds = new THREE.Box3().setFromObject(rawMark);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    rawMark.position.sub(center);
    const normalizedScale = 2.75 / size.y;
    importedMark.scale.setScalar(normalizedScale);
    markLoaded = true;
  });

  const ambient = new THREE.HemisphereLight(0xffffff, 0x8d857d, 1.2);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xfff8ef, 1.65);
  key.position.set(-1.2, 2.8, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 512 : 1024, mobile ? 512 : 1024);
  key.shadow.radius = 8;
  key.shadow.blurSamples = 20;
  key.shadow.camera.left = -6;
  key.shadow.camera.right = 6;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -6;
  scene.add(key);

  const fill = new THREE.PointLight(0xffffff, 0.7, 14, 2);
  fill.position.set(5, -3, 5);
  scene.add(fill);

  const pointer = new THREE.Vector2();
  const pointerTarget = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const lastTrailPoint = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
  const clock = new THREE.Clock();
  let previousElapsed = 0;
  let pointerInside = false;
  let hoveredPart = -1;
  let dotPulse = 0;
  let frame = 0;
  let visible = true;
  let disposed = false;
  let firstFrame = true;

  const resize = () => {
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.35 : 1.8));
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  };

  const handlePointer = (event: PointerEvent) => {
    const bounds = container.getBoundingClientRect();
    pointerInside = event.clientX >= bounds.left && event.clientX <= bounds.right
      && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
    pointerTarget.x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    pointerTarget.y = -((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
  };

  const addParticle = (
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    maxLife: number,
    size: number,
    color: THREE.Color,
    delay = 0,
  ) => {
    if (particles.length >= 140) {
      const oldest = particles.shift();
      if (oldest) {
        scene.remove(oldest.sprite);
        (oldest.sprite.material as THREE.SpriteMaterial).dispose();
      }
    }
    const material = new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.copy(position);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    particles.push({ sprite, velocity, life: maxLife, maxLife, delay, size });
  };

  const addTrail = (position: THREE.Vector3, color: THREE.Color) => {
    if (lastTrailPoint.distanceToSquared(position) < 0.025) return;
    lastTrailPoint.copy(position);
    const direction = position.clone().sub(nebula.position);
    direction.z = 0;
    if (direction.lengthSq() < 0.01) direction.set(0, 1, 0);
    direction.normalize();
    for (let tail = 0; tail < 5; tail += 1) {
      addParticle(
        position.clone().addScaledVector(direction, -tail * 0.065).add(new THREE.Vector3(0, 0, 0.13)),
        direction.clone().multiplyScalar(4.9 - tail * 0.16),
        0.94 - tail * 0.045,
        0.23 - tail * 0.026,
        color,
        tail * 0.022,
      );
    }
  };

  const burstComets = (origin: THREE.Vector3) => {
    const arms = 7;
    for (let arm = 0; arm < arms; arm += 1) {
      const angle = (Math.PI * 2 * arm) / arms + 0.18;
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      for (let tail = 0; tail < 4; tail += 1) {
        const speed = 1.05 - tail * 0.12;
        addParticle(
          origin.clone().addScaledVector(direction, -tail * 0.045).add(new THREE.Vector3(0, 0, 0.18)),
          direction.clone().multiplyScalar(speed),
          0.62 - tail * 0.055,
          0.2 - tail * 0.025,
          new THREE.Color([...INTERACTION_COLORS, DOT_COLOR][(arm + tail) % 4]),
          tail * 0.026,
        );
      }
    }
  };

  const getIntersection = () => {
    if (!pointerInside || !markLoaded) return undefined;
    raycaster.setFromCamera(pointerTarget, camera);
    return raycaster.intersectObjects(interactiveMeshes, false)[0];
  };

  const handleClick = (event: MouseEvent) => {
    handlePointer(event as PointerEvent);
    const hit = getIntersection();
    if (!hit) return;
    const partIndex = hit.object.userData.interactivePart as number;
    const part = interactiveParts[partIndex];
    if (!part) return;
    if (part.isDot) {
      const bars = interactiveParts.filter((candidate) => !candidate.isDot);
      const turnOn = bars.some((candidate) => !candidate.active);
      bars.forEach((candidate) => { candidate.active = turnOn; });
      part.active = turnOn;
      dotPulse = 1;
      burstComets(hit.point);
    } else {
      part.active = !part.active;
    }
  };

  const render = () => {
    if (disposed) return;
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(0.05, elapsed - previousElapsed);
    previousElapsed = elapsed;
    const intro = easeOutCubic(Math.min(1, elapsed / 1.45));
    pointer.lerp(pointerTarget, reducedMotion ? 1 : 0.045);

    sculpture.position.x = finalPosition.x + THREE.MathUtils.lerp(2.4, 0, intro);
    sculpture.position.y = finalPosition.y + THREE.MathUtils.lerp(-0.35, 0, intro);
    sculpture.scale.setScalar((mobile ? 0.4 : 1.48) * THREE.MathUtils.lerp(0.84, 1, intro));
    sculpture.rotation.y = pointer.x * 0.11;
    sculpture.rotation.x = -pointer.y * 0.07;
    sculpture.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 0.32) * 0.006;

    const hit = getIntersection();
    hoveredPart = hit ? hit.object.userData.interactivePart as number : -1;
    renderer.domElement.style.cursor = hit ? "pointer" : "default";
    if (hit && !reducedMotion) addTrail(hit.point, interactiveParts[hoveredPart].color);
    if (!hit) lastTrailPoint.x = Number.POSITIVE_INFINITY;

    interactiveParts.forEach((part, index) => {
      const hovered = index === hoveredPart;
      const pulse = part.isDot ? dotPulse * 0.9 : 0;
      const targetEmission = part.active ? 1.65 : hovered ? 0.9 : 0;
      part.material.color.lerp(part.active || hovered ? part.color : part.baseColor, 0.13);
      part.material.emissiveIntensity = THREE.MathUtils.lerp(
        part.material.emissiveIntensity,
        targetEmission + pulse,
        0.14,
      );
      const haloMaterial = part.halo.material as THREE.SpriteMaterial;
      const targetHalo = part.active ? (part.isDot ? 0.72 : 0.82) : hovered ? 0.5 : 0;
      haloMaterial.opacity = THREE.MathUtils.lerp(haloMaterial.opacity, targetHalo + dotPulse * 0.18, 0.13);
    });
    dotPulse = Math.max(0, dotPulse - delta * 3.7);

    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      if (particle.delay > 0) {
        particle.delay -= delta;
        continue;
      }
      particle.life -= delta;
      const progress = Math.max(0, particle.life / particle.maxLife);
      particle.sprite.position.addScaledVector(particle.velocity, delta);
      particle.velocity.multiplyScalar(Math.max(0, 1 - delta * 1.15));
      const material = particle.sprite.material as THREE.SpriteMaterial;
      material.opacity = Math.sin(Math.min(1, progress) * Math.PI * 0.5) * 0.82;
      particle.sprite.scale.setScalar(particle.size * (0.62 + progress * 0.72));
      if (particle.life <= 0) {
        scene.remove(particle.sprite);
        material.dispose();
        particles.splice(index, 1);
      }
    }

    camera.position.x = pointer.x * 0.22;
    camera.position.y = pointer.y * 0.14;
    camera.lookAt(0.5, 0.25, -0.4);
    renderer.render(scene, camera);

    if (firstFrame && markLoaded) {
      firstFrame = false;
      onReady();
    }
    if (!reducedMotion && visible) frame = window.requestAnimationFrame(render);
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  const visibilityObserver = new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (!wasVisible && visible && !reducedMotion) frame = window.requestAnimationFrame(render);
  }, { threshold: 0.01 });
  visibilityObserver.observe(container);
  window.addEventListener("pointermove", handlePointer, { passive: true });
  window.addEventListener("click", handleClick);
  resize();
  render();

  return () => {
    disposed = true;
    window.cancelAnimationFrame(frame);
    resizeObserver.disconnect();
    visibilityObserver.disconnect();
    window.removeEventListener("pointermove", handlePointer);
    window.removeEventListener("click", handleClick);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
      if (object instanceof THREE.Sprite) object.material.dispose();
    });
    redMaterial.dispose();
    graphiteMaterial.dispose();
    glowTexture.dispose();
    nebulaTexture.dispose();
    renderer.dispose();
  };
}

export function HeroStage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    return createScene(canvas, container, () => setReady(true)) ?? undefined;
  }, []);

  return (
    <div ref={containerRef} className={`hero-stage ${ready ? "is-webgl-ready" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="hero-canvas" />
      <div className="hero-sculpture-fallback">
        <i className="fallback-ray fallback-ray-left" />
        <i className="fallback-ray fallback-ray-center" />
        <i className="fallback-ray fallback-ray-right" />
        <b />
      </div>
      <span className="webgl-caption">Rozar · Click para encender</span>
    </div>
  );
}
