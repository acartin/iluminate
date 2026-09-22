"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import markAsset from "@/assets/iluminate-brand-master-editable_Mark Light.svg";

const NEON_RED = new THREE.Color("#ff3b30");
const REST_BLACK = new THREE.Color("#0b0b0d");
const SOLID_COLORS = ["#ff3b30", "#2675ff", "#ff7a00", "#00c875", "#9b5cff", "#ffd21f"];

type InteractivePart = {
  meshes: THREE.Mesh[];
  material: THREE.MeshBasicMaterial;
  outlineMaterial: THREE.LineBasicMaterial;
  halo: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  haloBaseScale: THREE.Vector3;
  color: THREE.Color;
  lightColor: THREE.Color;
  baseColor: THREE.Color;
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

type MagicTrailPoint = {
  position: THREE.Vector3;
  color: THREE.Color;
  life: number;
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

function createShapeGlowTexture(meshes: THREE.Mesh[], bounds: THREE.Box2) {
  // Render the glow from the real SVG triangles at a high resolution. The
  // generous transparent margin prevents the Gaussian falloff from clipping
  // and keeps angled rays aligned with their faces.
  const canvasSize = 768;
  // A fixed conversion keeps the light radius identical in SVG units. Using
  // a per-shape fit made the smaller dot's halo tighter than the rays'.
  const pixelsPerSvgUnit = 5;
  const partSize = bounds.getSize(new THREE.Vector2());
  const scale = pixelsPerSvgUnit;
  const offsetX = (canvasSize - partSize.x * scale) * 0.5;
  const offsetY = (canvasSize - partSize.y * scale) * 0.5;
  const planeSize = new THREE.Vector2(canvasSize / scale, canvasSize / scale);
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = canvasSize;
  maskCanvas.height = canvasSize;
  const maskContext = maskCanvas.getContext("2d");
  if (maskContext) {
    maskContext.fillStyle = "white";
    meshes.forEach((mesh) => {
      const positions = mesh.geometry.getAttribute("position");
      const indices = mesh.geometry.index;
      const triangleCount = indices ? indices.count : positions.count;
      for (let offset = 0; offset < triangleCount; offset += 3) {
        maskContext.beginPath();
        for (let vertex = 0; vertex < 3; vertex += 1) {
          const index = indices ? indices.getX(offset + vertex) : offset + vertex;
          const x = offsetX + (positions.getX(index) - bounds.min.x) * scale;
          const y = canvasSize - (offsetY + (positions.getY(index) - bounds.min.y) * scale);
          if (vertex === 0) maskContext.moveTo(x, y);
          else maskContext.lineTo(x, y);
        }
        maskContext.closePath();
        maskContext.fill();
      }
    });
  }
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = canvasSize;
  glowCanvas.height = canvasSize;
  const glowContext = glowCanvas.getContext("2d");
  if (glowContext) {
    // Several restrained passes read more like emitted light than one opaque
    // blur. Most energy stays close to the edge and the broad pass is faint.
    glowContext.filter = "blur(150px)";
    glowContext.globalAlpha = 0.3;
    glowContext.drawImage(maskCanvas, 0, 0);
    glowContext.filter = "blur(75px)";
    glowContext.globalAlpha = 0.4;
    glowContext.drawImage(maskCanvas, 0, 0);
    glowContext.filter = "blur(30px)";
    glowContext.globalAlpha = 0.52;
    glowContext.drawImage(maskCanvas, 0, 0);
    glowContext.filter = "blur(11px)";
    glowContext.globalAlpha = 0.7;
    glowContext.drawImage(maskCanvas, 0, 0);
    glowContext.filter = "blur(2px)";
    glowContext.globalAlpha = 0.9;
    glowContext.drawImage(maskCanvas, 0, 0);
  }
  const texture = new THREE.CanvasTexture(glowCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return { texture, planeSize };
}

function createSparkTexture() {
  const sparkCanvas = document.createElement("canvas");
  sparkCanvas.width = 128;
  sparkCanvas.height = 128;
  const context = sparkCanvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(64, 64, 0, 64, 64, 22);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.18, "rgba(255,255,255,.92)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 128, 128);
    const beam = context.createLinearGradient(0, 64, 128, 64);
    beam.addColorStop(0, "rgba(255,255,255,0)");
    beam.addColorStop(0.48, "rgba(255,255,255,.08)");
    beam.addColorStop(0.5, "rgba(255,255,255,.95)");
    beam.addColorStop(0.52, "rgba(255,255,255,.08)");
    beam.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = beam;
    context.fillRect(0, 59, 128, 10);
    context.save();
    context.translate(64, 64);
    context.rotate(Math.PI / 2);
    context.translate(-64, -64);
    context.fillStyle = beam;
    context.fillRect(0, 61, 128, 6);
    context.restore();
  }
  const texture = new THREE.CanvasTexture(sparkCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getRandomNeonColor() {
  return new THREE.Color(SOLID_COLORS[Math.floor(Math.random() * SOLID_COLORS.length)]);
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
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }

  let mobile = container.getBoundingClientRect().width <= 700;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(mobile ? 40 : 34, 1, 0.1, 50);
  camera.position.set(0, 0, mobile ? 13 : 11);
  camera.lookAt(0.5, 0.25, -0.4);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);
  const glowTexture = createGlowTexture();
  const sparkTexture = createSparkTexture();

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

  // Invisible hit area preserves the magic pointer trail without adding a
  // visual panel or cloud behind the sculpture.
  const interactionField = new THREE.Mesh(
    new THREE.PlaneGeometry(mobile ? 4.5 : 5.8, mobile ? 3.8 : 4.7),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  interactionField.position.set(mobile ? -0.65 : 3.9, mobile ? 2.85 : 0.78, -0.18);
  scene.add(interactionField);

  const maxMagicPoints = 48;
  const magicPositions = new Float32Array(maxMagicPoints * 3);
  const magicColors = new Float32Array(maxMagicPoints * 3);
  const magicGeometry = new THREE.BufferGeometry();
  magicGeometry.setAttribute("position", new THREE.BufferAttribute(magicPositions, 3));
  magicGeometry.setAttribute("color", new THREE.BufferAttribute(magicColors, 3));
  magicGeometry.setDrawRange(0, 0);
  const magicLine = new THREE.Line(
    magicGeometry,
    new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.98,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  magicLine.frustumCulled = false;
  scene.add(magicLine);

  const sculpture = new THREE.Group();
  const finalPosition = new THREE.Vector3(mobile ? -0.65 : 3.85, mobile ? 2.85 : 0.6, 0);
  sculpture.position.copy(finalPosition);
  scene.add(sculpture);

  const flatMaterial = new THREE.MeshBasicMaterial({ color: REST_BLACK, toneMapped: false });
  const interactiveParts: InteractivePart[] = [];
  const interactiveMeshes: THREE.Mesh[] = [];
  const shapeGlowTextures: THREE.Texture[] = [];
  const particles: GlowParticle[] = [];
  const magicTrailPoints: MagicTrailPoint[] = [];
  let markLoaded = false;
  let breathStartedAt = 0;
  const clock = new THREE.Clock();
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
      const baseColor = REST_BLACK.clone();
      const peakColor = isRed ? NEON_RED.clone() : REST_BLACK.clone();
      const material = flatMaterial.clone();
      material.color.copy(peakColor);
      const interactionColor = NEON_RED.clone();
      const outlineMaterial = new THREE.LineBasicMaterial({
        color: NEON_RED,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const shapes = SVGLoader.createShapes(path);
      const meshes: THREE.Mesh[] = [];
      const partBounds = new THREE.Box2();
      shapes.forEach((shape) => {
        const geometry = new THREE.ShapeGeometry(shape, 24);
        geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          partBounds.expandByPoint(new THREE.Vector2(geometry.boundingBox.min.x, geometry.boundingBox.min.y));
          partBounds.expandByPoint(new THREE.Vector2(geometry.boundingBox.max.x, geometry.boundingBox.max.y));
        }
        const mesh = new THREE.Mesh(geometry, material);
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), outlineMaterial);
        outline.position.z = 0.04;
        mesh.add(outline);
        meshes.push(mesh);
        interactiveMeshes.push(mesh);
        rawMark.add(mesh);
      });
      const center = partBounds.getCenter(new THREE.Vector2());
      const { texture: shapeGlowTexture, planeSize } = createShapeGlowTexture(meshes, partBounds);
      shapeGlowTextures.push(shapeGlowTexture);
      const haloMaterial = new THREE.MeshBasicMaterial({
        map: shapeGlowTexture,
        color: interactionColor,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        // The opaque face masks the inner half of the glow, matching the
        // SIGNAL treatment: crisp face and outline, emitted light outside.
        depthTest: true,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        side: THREE.DoubleSide,
      });
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), haloMaterial);
      halo.position.set(center.x, center.y, -0.06);
      halo.scale.set(planeSize.x, planeSize.y, 1);
      halo.renderOrder = -1;
      rawMark.add(halo);
      const part: InteractivePart = {
        meshes,
        material,
        outlineMaterial,
        halo,
        haloBaseScale: halo.scale.clone(),
        color: peakColor,
        lightColor: interactionColor,
        baseColor,
        isDot: !isRed,
      };
      const partIndex = interactiveParts.push(part) - 1;
      meshes.forEach((mesh) => { mesh.userData.interactivePart = partIndex; });
    });
    const bounds = new THREE.Box3();
    interactiveMeshes.forEach((mesh) => {
      if (mesh.geometry.boundingBox) bounds.union(mesh.geometry.boundingBox);
    });
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    rawMark.scale.y = -1;
    rawMark.position.set(-center.x, center.y, -center.z);
    const normalizedScale = 2.75 / size.y;
    importedMark.scale.setScalar(normalizedScale);
    breathStartedAt = clock.getElapsedTime();
    markLoaded = true;
  });

  const pointerTarget = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();
  const lastTrailPoint = new THREE.Vector3(Number.POSITIVE_INFINITY, 0, 0);
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
    const nextMobile = bounds.width <= 700;
    if (nextMobile !== mobile) {
      mobile = nextMobile;
      camera.fov = mobile ? 40 : 34;
      camera.position.set(0, 0, mobile ? 13 : 11);
      camera.lookAt(0.5, 0.25, -0.4);
      interactionField.geometry.dispose();
      interactionField.geometry = new THREE.PlaneGeometry(
        mobile ? 4.5 : 5.8,
        mobile ? 3.8 : 4.7,
      );
      interactionField.position.set(
        mobile ? -0.65 : 3.9,
        mobile ? 2.85 : 0.78,
        -0.18,
      );
      finalPosition.set(mobile ? -0.65 : 3.85, mobile ? 2.85 : 0.6, 0);
    }
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
    texture = glowTexture,
  ) => {
    if (particles.length >= 320) {
      const oldest = particles.shift();
      if (oldest) {
        scene.remove(oldest.sprite);
        (oldest.sprite.material as THREE.SpriteMaterial).dispose();
      }
    }
    const material = new THREE.SpriteMaterial({
      map: texture,
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

  const addMagicTrail = (position: THREE.Vector3, color: THREE.Color) => {
    if (lastTrailPoint.distanceToSquared(position) < 0.0045) return;
    if (!Number.isFinite(lastTrailPoint.x)) magicTrailPoints.length = 0;
    const previous = lastTrailPoint.clone();
    lastTrailPoint.copy(position);
    const trailPosition = position.clone();
    trailPosition.z += 0.3;
    magicTrailPoints.push({ position: trailPosition, color: color.clone(), life: 1 });
    if (magicTrailPoints.length > maxMagicPoints) magicTrailPoints.shift();

    const movement = Number.isFinite(previous.x)
      ? position.clone().sub(previous)
      : new THREE.Vector3(0, 0.1, 0);
    movement.z = 0;
    if (movement.lengthSq() < 0.001) movement.set(0, 0.1, 0);
    movement.normalize();
    const tangent = new THREE.Vector3(-movement.y, movement.x, 0);
    addParticle(
      trailPosition,
      movement.clone().multiplyScalar(0.035),
      0.42,
      0.25,
      color,
      0,
      glowTexture,
    );
    for (let spark = 0; spark < 5; spark += 1) {
      const side = spark - 2;
      addParticle(
        trailPosition.clone().addScaledVector(tangent, side * 0.03),
        movement.clone().multiplyScalar(0.1).addScaledVector(tangent, side * 0.12),
        0.58 + Math.abs(side) * 0.1,
        side === 0 ? 0.16 : Math.abs(side) === 1 ? 0.115 : 0.08,
        color,
        Math.abs(side) * 0.012,
        sparkTexture,
      );
    }
  };

  const burstComets = (origin: THREE.Vector3) => {
    // Master-button celebration: long multicolor comet arms followed by a
    // second, irregular field of sparks. It stays short but fills the stage.
    const arms = 12;
    for (let arm = 0; arm < arms; arm += 1) {
      const angle = (Math.PI * 2 * arm) / arms + 0.12 + (arm % 2) * 0.055;
      const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
      for (let tail = 0; tail < 6; tail += 1) {
        const speed = 2.05 - tail * 0.18;
        addParticle(
          origin.clone().addScaledVector(direction, -tail * 0.065).add(new THREE.Vector3(0, 0, 0.18)),
          direction.clone().multiplyScalar(speed),
          0.96 - tail * 0.065,
          0.3 - tail * 0.026,
          new THREE.Color(SOLID_COLORS[(arm + tail) % SOLID_COLORS.length]),
          tail * 0.022,
        );
      }
    }
    for (let index = 0; index < 36; index += 1) {
      const angle = index * 2.39996 + Math.sin(index * 1.73) * 0.16;
      const speed = 0.85 + (index % 10) * 0.16;
      addParticle(
        origin.clone().add(new THREE.Vector3(0, 0, 0.24)),
        new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0),
        0.88 + (index % 5) * 0.11,
        0.1 + (index % 4) * 0.026,
        new THREE.Color(SOLID_COLORS[(index * 5) % SOLID_COLORS.length]),
        (index % 6) * 0.022,
        sparkTexture,
      );
    }
    addParticle(origin.clone().add(new THREE.Vector3(0, 0, 0.26)), new THREE.Vector3(), 0.38, 1.15, new THREE.Color("#ffffff"));
    addParticle(origin.clone().add(new THREE.Vector3(0, 0, 0.25)), new THREE.Vector3(), 0.52, 0.86, NEON_RED, 0.055);
  };

  const burstBarStars = (origin: THREE.Vector3, baseColor: THREE.Color) => {
    const count = 40;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.sin(index * 2.17) * 0.18;
      const speed = 1.05 + (index % 8) * 0.24;
      const color = baseColor.clone().offsetHSL(((index % 5) - 2) * 0.028, 0, 0.04);
      addParticle(
        origin.clone().add(new THREE.Vector3(0, 0, 0.2)),
        new THREE.Vector3(Math.cos(angle) * speed, Math.sin(angle) * speed, 0),
        0.76 + (index % 5) * 0.1,
        0.1 + (index % 4) * 0.024,
        color,
        (index % 5) * 0.016,
        sparkTexture,
      );
    }
    addParticle(origin.clone().add(new THREE.Vector3(0, 0, 0.24)), new THREE.Vector3(), 0.3, 0.62, baseColor);
  };

  const getIntersection = () => {
    if (!pointerInside || !markLoaded) return undefined;
    raycaster.setFromCamera(pointerTarget, camera);
    return raycaster.intersectObjects(interactiveMeshes, false)[0];
  };

  const getFieldIntersection = () => {
    if (!pointerInside) return undefined;
    raycaster.setFromCamera(pointerTarget, camera);
    const hit = raycaster.intersectObject(interactionField, false)[0];
    if (!hit?.uv) return undefined;
    const x = (hit.uv.x - 0.5) * 2;
    const y = (hit.uv.y - 0.5) * 2;
    return x * x + y * y < 0.92 ? hit : undefined;
  };

  const handleClick = (event: MouseEvent) => {
    handlePointer(event as PointerEvent);
    const hit = getIntersection();
    if (!hit) return;
    const partIndex = hit.object.userData.interactivePart as number;
    const part = interactiveParts[partIndex];
    if (!part) return;
    if (part.isDot) {
      interactiveParts.forEach((candidate) => {
        if (candidate.isDot) {
          candidate.color.copy(REST_BLACK);
          candidate.lightColor.copy(NEON_RED);
          return;
        }
        const nextColor = getRandomNeonColor();
        candidate.color.copy(nextColor);
        candidate.lightColor.copy(nextColor);
      });
      dotPulse = 1;
      burstComets(hit.point);
    } else {
      const nextColor = getRandomNeonColor();
      part.color.copy(nextColor);
      part.lightColor.copy(nextColor);
      burstBarStars(hit.point, part.lightColor);
    }
  };

  const render = () => {
    if (disposed) return;
    const elapsed = clock.getElapsedTime();
    const delta = Math.min(0.05, elapsed - previousElapsed);
    previousElapsed = elapsed;
    sculpture.position.copy(finalPosition);
    sculpture.scale.setScalar(mobile ? 0.4 : 1.1);
    sculpture.rotation.set(0, 0, 0);
    const hit = getIntersection();
    const fieldHit = hit ? undefined : getFieldIntersection();
    hoveredPart = hit ? hit.object.userData.interactivePart as number : -1;
    renderer.domElement.style.cursor = hit ? "pointer" : fieldHit ? "crosshair" : "default";
    if (!reducedMotion && (hit || fieldHit)) {
      const trailColor = hit
        ? interactiveParts[hoveredPart].lightColor
        : NEON_RED;
      addMagicTrail((hit ?? fieldHit)!.point, trailColor);
    }
    if (!hit && !fieldHit) lastTrailPoint.x = Number.POSITIVE_INFINITY;

    const breathElapsed = Math.max(0, elapsed - breathStartedAt);
    const rawBreath = reducedMotion ? 1 : (Math.cos(breathElapsed * 0.9) + 1) * 0.5;
    const breath = rawBreath * rawBreath * (3 - 2 * rawBreath);
    const faceTarget = new THREE.Color();
    interactiveParts.forEach((part, index) => {
      const hovered = index === hoveredPart;
      faceTarget.copy(part.baseColor).lerp(part.color, breath);
      part.material.color.lerp(faceTarget, reducedMotion ? 1 : 0.16);
      part.outlineMaterial.color.lerp(part.lightColor, reducedMotion ? 1 : 0.12);
      const targetOutline = hovered ? 1 : 0.8 + breath * 0.2;
      part.outlineMaterial.opacity = THREE.MathUtils.lerp(
        part.outlineMaterial.opacity,
        targetOutline,
        0.13,
      );
      // The off/rest face changes to black or white, but its emitted outline
      // never disappears. Only the halo intensity breathes between medium and
      // full power.
      const glowStrength = hovered ? 1.65 : 1.35 + breath * 0.25;
      part.halo.material.color.lerp(part.lightColor, reducedMotion ? 1 : 0.1);
      part.halo.material.opacity = THREE.MathUtils.lerp(
        part.halo.material.opacity,
        Math.min(1, glowStrength * 0.62 + (part.isDot ? dotPulse * 0.08 : 0)),
        0.13,
      );
      // Breathing changes light intensity only. Scaling the halo made the
      // diagonal rays appear to slide away from their SVG silhouettes.
      part.halo.scale.copy(part.haloBaseScale);
    });
    dotPulse = Math.max(0, dotPulse - delta * 3.7);

    for (let index = magicTrailPoints.length - 1; index >= 0; index -= 1) {
      magicTrailPoints[index].life -= delta * 0.95;
      if (magicTrailPoints[index].life <= 0) magicTrailPoints.splice(index, 1);
    }
    magicTrailPoints.forEach((point, index) => {
      const offset = index * 3;
      magicPositions[offset] = point.position.x;
      magicPositions[offset + 1] = point.position.y;
      magicPositions[offset + 2] = point.position.z;
      const brightness = point.life * point.life;
      magicColors[offset] = point.color.r * brightness;
      magicColors[offset + 1] = point.color.g * brightness;
      magicColors[offset + 2] = point.color.b * brightness;
    });
    magicGeometry.setDrawRange(0, magicTrailPoints.length);
    magicGeometry.attributes.position.needsUpdate = true;
    magicGeometry.attributes.color.needsUpdate = true;

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
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
      if (object instanceof THREE.Sprite) object.material.dispose();
    });
    flatMaterial.dispose();
    glowTexture.dispose();
    shapeGlowTextures.forEach((texture) => texture.dispose());
    sparkTexture.dispose();
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
