import type { Partitura, VisualOpticalTreatment, VisualPoint, VisualSceneV1, VisualShape } from "@iluminate/lighting-core";
import type { DesignerAnimationDiffuser } from "../../designer/designer-paper-canvas";
import type { DiffuserRenderSettings } from "../optical-model";
import type { DesignerViewport } from "../../designer/types";

export type Webgl2PlayerScene = {
  partitura: Partitura;
  visualScene: VisualSceneV1;
};

type DrawBatch = {
  vao: WebGLVertexArrayObject;
  instanceBuffer: WebGLBuffer;
  count: number;
};

type OutlineBatch = {
  vao: WebGLVertexArrayObject;
  instanceBuffer: WebGLBuffer;
  count: number;
};

type PlayerOutlineSelection = { type: "zone" | "channel"; id: string } | null;
type TargetMaskMode = -1 | 0 | 1;

type PreparedTreatment = {
  source: VisualOpticalTreatment;
  batch: DrawBatch;
  direct: boolean;
  useFaceMask: boolean;
  targetMaskTexture: WebGLTexture | null;
  targetMaskBounds: MaskBounds | null;
  targetMaskMode: TargetMaskMode;
};

type MaskBounds = { x: number; y: number; width: number; height: number };

type PlayerUniforms = Record<"colors" | "faceMask" | "targetMask" | "colorCount" | "viewport" | "canvasPx" | "worldSize" | "targetMaskBounds" | "radiusPx" | "intensity" | "mode" | "useFaceMask" | "targetMaskMode", WebGLUniformLocation | null>;
type OutlineUniforms = Record<"viewport" | "canvasPx" | "color" | "widthPx", WebGLUniformLocation | null>;

const QUAD_VERTICES = new Float32Array([
  -1, -1, 1, -1, 1, 1,
  -1, -1, 1, 1, -1, 1
]);

export class Webgl2PlayerRenderer {
  private canvas: HTMLCanvasElement | null = null;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms: PlayerUniforms | null = null;
  private outlineProgram: WebGLProgram | null = null;
  private outlineUniforms: OutlineUniforms | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private colorTexture: WebGLTexture | null = null;
  private faceMaskTexture: WebGLTexture | null = null;
  private allPixels: DrawBatch | null = null;
  private directPixels: DrawBatch | null = null;
  private zoneOutlines: OutlineBatch | null = null;
  private channelOutlines: OutlineBatch | null = null;
  private selectedOutline: OutlineBatch | null = null;
  private outlineSelection: PlayerOutlineSelection = null;
  private treatments: PreparedTreatment[] = [];
  private scene: Webgl2PlayerScene | null = null;
  private viewport: DesignerViewport = { x: 0, y: 0, width: 1, height: 1 };
  private presentation: DesignerAnimationDiffuser = "as_built";
  private settings: DiffuserRenderSettings = {
    diffuserDistanceCm: 10,
    intensity: 1,
    afterZoneEffectCm: 0,
    afterZoneOpacity: 0.26,
    showOutlines: true
  };
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private colorMode: "day" | "night" = "night";
  private hasFaceMask = false;
  private faceMaskEnabled = true;

  initialize(canvas: HTMLCanvasElement, options: { capture?: boolean } = {}) {
    if (this.gl) throw new Error("WebGL2 player renderer is already initialized.");
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: false,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: options.capture === true,
      powerPreference: "high-performance"
    });
    if (!gl) throw new Error("WebGL2 is required for the Iluminate player.");
    this.canvas = canvas;
    this.gl = gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.uniforms = {
      colors: gl.getUniformLocation(this.program, "uColors"),
      faceMask: gl.getUniformLocation(this.program, "uFaceMask"),
      targetMask: gl.getUniformLocation(this.program, "uTargetMask"),
      colorCount: gl.getUniformLocation(this.program, "uColorCount"),
      viewport: gl.getUniformLocation(this.program, "uViewport"),
      canvasPx: gl.getUniformLocation(this.program, "uCanvasPx"),
      worldSize: gl.getUniformLocation(this.program, "uWorldSize"),
      targetMaskBounds: gl.getUniformLocation(this.program, "uTargetMaskBounds"),
      radiusPx: gl.getUniformLocation(this.program, "uRadiusPx"),
      intensity: gl.getUniformLocation(this.program, "uIntensity"),
      mode: gl.getUniformLocation(this.program, "uMode"),
      useFaceMask: gl.getUniformLocation(this.program, "uUseFaceMask"),
      targetMaskMode: gl.getUniformLocation(this.program, "uTargetMaskMode")
    };
    this.outlineProgram = createProgram(gl, OUTLINE_VERTEX_SHADER, OUTLINE_FRAGMENT_SHADER);
    this.outlineUniforms = {
      viewport: gl.getUniformLocation(this.outlineProgram, "uViewport"),
      canvasPx: gl.getUniformLocation(this.outlineProgram, "uCanvasPx"),
      color: gl.getUniformLocation(this.outlineProgram, "uColor"),
      widthPx: gl.getUniformLocation(this.outlineProgram, "uWidthPx")
    };
    this.quadBuffer = requireResource(gl.createBuffer(), "quad buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_VERTICES, gl.STATIC_DRAW);
    this.colorTexture = requireResource(gl.createTexture(), "color texture");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.faceMaskTexture = requireResource(gl.createTexture(), "Face Graphic mask texture");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.faceMaskTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  loadScene(scene: Webgl2PlayerScene) {
    const gl = this.requireGl();
    this.releaseSceneResources();
    this.scene = scene;
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    if (scene.partitura.pixelMap.length > maxTextureSize) {
      throw new Error(`Scene contains ${scene.partitura.pixelMap.length} pixels, exceeding the GPU color texture limit ${maxTextureSize}.`);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, Math.max(1, scene.partitura.pixelMap.length), 1, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    this.prepareFaceMask(scene.visualScene);

    const allIndices = scene.partitura.pixelMap.map((pixel) => pixel.index);
    this.allPixels = this.createBatch(allIndices);
    const opticalIndices = new Set<number>();
    this.treatments = scene.visualScene.treatments
      .flatMap((source) => {
        const indices = source.pixelIndices.filter((index) => Number.isInteger(index) && index >= 0 && index < scene.partitura.pixelMap.length);
        if (!indices.length) return [];
        indices.forEach((index) => opticalIndices.add(index));
        const targetMaskMode = opticalTargetMaskMode(source.mode);
        const targetMask = targetMaskMode === 0 ? null : this.createTargetMaskTexture(scene.visualScene, source);
        return [{
          source,
          batch: this.createBatch(indices),
          direct: source.mode === "front" && source.material === "none",
          useFaceMask: source.mode === "front",
          targetMaskTexture: targetMask?.texture ?? null,
          targetMaskBounds: targetMask?.bounds ?? null,
          targetMaskMode: targetMask ? targetMaskMode : 0
        }];
      });
    this.directPixels = this.createBatch(allIndices.filter((index) => !opticalIndices.has(index)));
    this.zoneOutlines = this.createOutlineBatch(buildOutlineSegments(scene.visualScene.shapes.filter((shape) => shape.kind === "zone")));
    this.channelOutlines = this.createOutlineBatch(buildOutlineSegments(scene.visualScene.shapes.filter((shape) => shape.kind === "channel")));
    this.prepareSelectedOutline();
  }

  updateColors(colors: Uint8Array) {
    const gl = this.requireGl();
    const scene = this.requireScene();
    if (colors.length !== scene.partitura.pixelMap.length * 3) {
      throw new Error(`Player RGB frame length ${colors.length} does not match ${scene.partitura.pixelMap.length} scene pixels.`);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, Math.max(1, scene.partitura.pixelMap.length), 1, gl.RGB, gl.UNSIGNED_BYTE, colors);
  }

  updateViewport(viewport: DesignerViewport) {
    this.viewport = { ...viewport };
  }

  updatePresentation(presentation: DesignerAnimationDiffuser) {
    this.presentation = presentation;
  }

  updateOpticalSettings(settings: DiffuserRenderSettings) {
    this.settings = settings;
  }

  updateColorMode(colorMode: "day" | "night") {
    this.colorMode = colorMode;
  }

  updateFaceMaskEnabled(enabled: boolean) {
    this.faceMaskEnabled = enabled;
  }

  updateSelection(selection: PlayerOutlineSelection) {
    this.outlineSelection = selection;
    this.releaseOutlineBatch(this.selectedOutline);
    this.selectedOutline = null;
    this.prepareSelectedOutline();
  }

  resize(width: number, height: number, pixelRatio: number) {
    const gl = this.requireGl();
    const canvas = this.canvas!;
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.pixelRatio = Math.max(0.5, Math.min(2, pixelRatio));
    const backingWidth = Math.max(1, Math.round(this.width * this.pixelRatio));
    const backingHeight = Math.max(1, Math.round(this.height * this.pixelRatio));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    gl.viewport(0, 0, backingWidth, backingHeight);
  }

  render() {
    const gl = this.requireGl();
    if (!this.scene || !this.program || !this.uniforms || !this.colorTexture) return;
    if (this.colorMode === "night") gl.clearColor(0.008, 0.024, 0.09, 1);
    else gl.clearColor(0.88, 0.91, 0.95, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTexture);
    gl.uniform1i(this.uniforms.colors, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.faceMaskTexture);
    gl.uniform1i(this.uniforms.faceMask, 1);
    gl.uniform1i(this.uniforms.targetMask, 2);
    gl.uniform1f(this.uniforms.colorCount, Math.max(1, this.scene.partitura.pixelMap.length));
    gl.uniform4f(this.uniforms.viewport, this.viewport.x, this.viewport.y, Math.max(0.0001, this.viewport.width), Math.max(0.0001, this.viewport.height));
    gl.uniform2f(this.uniforms.canvasPx, this.width * this.pixelRatio, this.height * this.pixelRatio);
    gl.uniform2f(this.uniforms.worldSize, Math.max(0.0001, this.scene.visualScene.bounds.widthCm), Math.max(0.0001, this.scene.visualScene.bounds.heightCm));

    if (this.presentation === "led_map") {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.drawBatch(this.allPixels, this.directPixelRadius(), 1, 0, false);
      this.drawOutlines();
      gl.disable(gl.BLEND);
      return;
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (const treatment of this.treatments) {
      if (treatment.direct) continue;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, treatment.targetMaskTexture);
      this.drawBatch(
        treatment.batch,
        this.treatmentRadiusPx(treatment.source),
        Math.max(0, treatment.source.intensity * this.settings.intensity),
        1,
        treatment.useFaceMask,
        treatment.targetMaskMode,
        treatment.targetMaskBounds
      );
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const treatment of this.treatments) {
      if (!treatment.direct) continue;
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, treatment.targetMaskTexture);
      this.drawBatch(treatment.batch, this.directPixelRadius(), 1, 0, treatment.useFaceMask, treatment.targetMaskMode, treatment.targetMaskBounds);
    }
    this.drawBatch(this.directPixels, this.directPixelRadius(), 1, 0, false);
    this.drawOutlines();
    gl.disable(gl.BLEND);
  }

  destroy() {
    const gl = this.gl;
    if (!gl) return;
    this.releaseSceneResources();
    if (this.colorTexture) gl.deleteTexture(this.colorTexture);
    if (this.faceMaskTexture) gl.deleteTexture(this.faceMaskTexture);
    if (this.quadBuffer) gl.deleteBuffer(this.quadBuffer);
    if (this.program) gl.deleteProgram(this.program);
    if (this.outlineProgram) gl.deleteProgram(this.outlineProgram);
    this.colorTexture = null;
    this.faceMaskTexture = null;
    this.quadBuffer = null;
    this.program = null;
    this.uniforms = null;
    this.outlineProgram = null;
    this.outlineUniforms = null;
    this.scene = null;
    this.gl = null;
    this.canvas = null;
  }

  private createBatch(indices: number[]): DrawBatch {
    const gl = this.requireGl();
    const scene = this.requireScene();
    const instances = new Float32Array(indices.length * 3);
    indices.forEach((index, offset) => {
      const pixel = scene.partitura.pixelMap[index];
      instances[offset * 3] = pixel.x;
      instances[offset * 3 + 1] = pixel.y;
      instances[offset * 3 + 2] = index;
    });
    const vao = requireResource(gl.createVertexArray(), "pixel VAO");
    const instanceBuffer = requireResource(gl.createBuffer(), "pixel instance buffer");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, instances, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8);
    gl.vertexAttribDivisor(2, 1);
    gl.bindVertexArray(null);
    return { vao, instanceBuffer, count: indices.length };
  }

  private createOutlineBatch(segments: Float32Array): OutlineBatch | null {
    if (!segments.length) return null;
    const gl = this.requireGl();
    const vao = requireResource(gl.createVertexArray(), "outline VAO");
    const instanceBuffer = requireResource(gl.createBuffer(), "outline instance buffer");
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, segments, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0);
    gl.vertexAttribDivisor(1, 1);
    gl.bindVertexArray(null);
    return { vao, instanceBuffer, count: segments.length / 4 };
  }

  private drawBatch(batch: DrawBatch | null, radiusPx: number, intensity: number, mode: number, useFaceMask: boolean, targetMaskMode: TargetMaskMode = 0, targetMaskBounds: MaskBounds | null = null) {
    if (!batch?.count || !this.program || !this.uniforms) return;
    const gl = this.requireGl();
    gl.uniform1f(this.uniforms.radiusPx, Math.max(1, radiusPx) * this.pixelRatio);
    gl.uniform1f(this.uniforms.intensity, intensity);
    gl.uniform1f(this.uniforms.mode, mode);
    gl.uniform1f(this.uniforms.useFaceMask, useFaceMask && this.hasFaceMask && this.faceMaskEnabled ? 1 : 0);
    gl.uniform1f(this.uniforms.targetMaskMode, targetMaskMode);
    gl.uniform4f(
      this.uniforms.targetMaskBounds,
      targetMaskBounds?.x ?? 0,
      targetMaskBounds?.y ?? 0,
      Math.max(0.0001, targetMaskBounds?.width ?? 1),
      Math.max(0.0001, targetMaskBounds?.height ?? 1)
    );
    gl.bindVertexArray(batch.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batch.count);
    gl.bindVertexArray(null);
  }

  private drawOutlines() {
    if (!this.outlineProgram || !this.outlineUniforms) return;
    const gl = this.requireGl();
    gl.useProgram(this.outlineProgram);
    gl.uniform4f(this.outlineUniforms.viewport, this.viewport.x, this.viewport.y, Math.max(0.0001, this.viewport.width), Math.max(0.0001, this.viewport.height));
    gl.uniform2f(this.outlineUniforms.canvasPx, this.width * this.pixelRatio, this.height * this.pixelRatio);
    if (this.settings.showOutlines) {
      gl.uniform1f(this.outlineUniforms.widthPx, 1.35 * this.pixelRatio);
      const zoneColor = this.colorMode === "night" ? [0.38, 0.72, 1, 0.72] : [0.04, 0.31, 0.72, 0.78];
      const channelColor = this.colorMode === "night" ? [1, 0.65, 0.12, 0.82] : [0.72, 0.31, 0.02, 0.82];
      this.drawOutlineBatch(this.zoneOutlines, zoneColor);
      this.drawOutlineBatch(this.channelOutlines, channelColor);
      if (this.selectedOutline) {
        gl.uniform1f(this.outlineUniforms.widthPx, 7 * this.pixelRatio);
        this.drawOutlineBatch(this.selectedOutline, this.colorMode === "night" ? [0.25, 0.72, 1, 0.2] : [0.02, 0.35, 0.9, 0.2]);
        gl.uniform1f(this.outlineUniforms.widthPx, 2.8 * this.pixelRatio);
        this.drawOutlineBatch(this.selectedOutline, this.colorMode === "night" ? [0.78, 0.94, 1, 1] : [0.02, 0.22, 0.65, 1]);
      }
    }
  }

  private drawOutlineBatch(batch: OutlineBatch | null, color: number[]) {
    if (!batch?.count || !this.outlineUniforms) return;
    const gl = this.requireGl();
    gl.uniform4f(this.outlineUniforms.color, color[0], color[1], color[2], color[3]);
    gl.bindVertexArray(batch.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, batch.count);
    gl.bindVertexArray(null);
  }

  private directPixelRadius() {
    const pitchCm = 100 / Math.max(1, this.scene?.visualScene.addressablePixelsPerMeter ?? 60);
    return Math.max(2, this.worldLengthToPixels(pitchCm * 0.22));
  }

  private treatmentRadiusPx(source: VisualOpticalTreatment) {
    const pitchCm = 100 / Math.max(1, this.scene?.visualScene.addressablePixelsPerMeter ?? 60);
    const beamRadius = source.sourceDistanceCm * Math.tan(Math.max(5, Math.min(170, source.beamAngleDeg)) * Math.PI / 360);
    const radiusCm = source.mode === "wall_wash"
      ? Math.max(source.spreadCm, source.throwCm * 0.2)
      : source.mode === "halo"
        ? Math.max(pitchCm * 0.4, source.spreadCm + beamRadius)
        : Math.max(pitchCm * 0.32, beamRadius * 0.35 + source.softnessCm);
    return Math.max(2, this.worldLengthToPixels(radiusCm));
  }

  private worldLengthToPixels(lengthCm: number) {
    const xScale = this.width / Math.max(0.0001, this.viewport.width);
    const yScale = this.height / Math.max(0.0001, this.viewport.height);
    return lengthCm * Math.sqrt(Math.max(0.0001, xScale * yScale));
  }

  private createTargetMaskTexture(visualScene: VisualSceneV1, source: VisualOpticalTreatment) {
    const gl = this.requireGl();
    const texture = requireResource(gl.createTexture(), "optical target mask texture");
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const occluders = opticalOccluderShapes(visualScene.shapes, source);
    if (!occluders.length) {
      gl.deleteTexture(texture);
      return null;
    }
    const bounds = opticalOccluderMaskBounds(occluders, visualScene.bounds);
    const { width, height } = targetMaskTextureSize(bounds);
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    const context = surface.getContext("2d", { alpha: false });
    if (!context) throw new Error("Unable to prepare the optical target mask.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.setTransform(width / bounds.width, 0, 0, height / bounds.height, -bounds.x * width / bounds.width, -bounds.y * height / bounds.height);
    context.fillStyle = "#FFFFFF";
    for (const occluder of occluders) {
      context.fill(visualShapePath(occluder), occluder.fillRule === "nonzero" ? "nonzero" : "evenodd");
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, surface);
    return { texture, bounds };
  }

  private releaseSceneResources() {
    const gl = this.gl;
    if (!gl) return;
    const batches = [this.allPixels, this.directPixels, ...this.treatments.map((treatment) => treatment.batch)];
    const released = new Set<WebGLVertexArrayObject>();
    for (const batch of batches) {
      if (!batch || released.has(batch.vao)) continue;
      released.add(batch.vao);
      gl.deleteVertexArray(batch.vao);
      gl.deleteBuffer(batch.instanceBuffer);
    }
    for (const treatment of this.treatments) {
      if (treatment.targetMaskTexture) gl.deleteTexture(treatment.targetMaskTexture);
    }
    this.allPixels = null;
    this.directPixels = null;
    this.treatments = [];
    for (const outline of [this.zoneOutlines, this.channelOutlines, this.selectedOutline]) this.releaseOutlineBatch(outline);
    this.zoneOutlines = null;
    this.channelOutlines = null;
    this.selectedOutline = null;
  }

  private prepareSelectedOutline() {
    if (!this.scene || !this.outlineSelection) return;
    this.selectedOutline = this.createOutlineBatch(buildOutlineSegments(selectedOutlineShapes(this.scene.visualScene.shapes, this.outlineSelection)));
  }

  private releaseOutlineBatch(outline: OutlineBatch | null) {
    if (!outline || !this.gl) return;
    this.gl.deleteVertexArray(outline.vao);
    this.gl.deleteBuffer(outline.instanceBuffer);
  }

  private prepareFaceMask(visualScene: VisualSceneV1) {
    const gl = this.requireGl();
    const physicalGraphics = visualScene.shapes.filter((shape) => shape.kind === "face-graphic");
    this.hasFaceMask = physicalGraphics.length > 0;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.faceMaskTexture);
    if (!physicalGraphics.length) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255]));
      return;
    }
    const { width, height } = faceMaskTextureSize(visualScene);
    const surface = document.createElement("canvas");
    surface.width = width;
    surface.height = height;
    const context = surface.getContext("2d", { alpha: false });
    if (!context) throw new Error("Unable to prepare the Face Graphic transmission mask.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, width, height);
    context.scale(width / Math.max(0.0001, visualScene.bounds.widthCm), height / Math.max(0.0001, visualScene.bounds.heightCm));
    for (const graphic of [...physicalGraphics].reverse()) {
      context.fillStyle = graphic.passMode === "opaque" ? "#000000" : graphic.passMode === "clear" ? "#FFFFFF" : graphic.filterColor ?? "#FFFFFF";
      const path = visualShapePath(graphic);
      context.fill(path, graphic.fillRule === "nonzero" ? "nonzero" : "evenodd");
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, surface);
  }

  private requireGl() {
    if (!this.gl) throw new Error("WebGL2 player renderer is not initialized.");
    return this.gl;
  }

  private requireScene() {
    if (!this.scene) throw new Error("WebGL2 player scene is not loaded.");
    return this.scene;
  }
}

const VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec2 aWorld;
layout(location = 2) in float aColorIndex;

uniform vec4 uViewport;
uniform vec2 uCanvasPx;
uniform float uRadiusPx;
uniform float uColorCount;

out vec2 vLocal;
out vec2 vWorld;
flat out int vColorIndex;

void main() {
  vec2 normalized = (aWorld - uViewport.xy) / uViewport.zw;
  vec2 center = vec2(normalized.x * 2.0 - 1.0, 1.0 - normalized.y * 2.0);
  vec2 pixelOffset = aQuad * uRadiusPx * 2.0 / uCanvasPx;
  gl_Position = vec4(center + pixelOffset, 0.0, 1.0);
  vLocal = aQuad;
  vWorld = aWorld + vec2(
    aQuad.x * uRadiusPx / uCanvasPx.x * uViewport.z,
    -aQuad.y * uRadiusPx / uCanvasPx.y * uViewport.w
  );
  vColorIndex = int(clamp(aColorIndex, 0.0, uColorCount - 1.0));
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uColors;
uniform sampler2D uFaceMask;
uniform sampler2D uTargetMask;
uniform float uIntensity;
uniform float uMode;
uniform float uUseFaceMask;
uniform float uTargetMaskMode;
uniform vec2 uWorldSize;
uniform vec4 uTargetMaskBounds;

in vec2 vLocal;
in vec2 vWorld;
flat in int vColorIndex;
out vec4 finalColor;

void main() {
  float distanceFromCenter = length(vLocal);
  if (distanceFromCenter > 1.0) discard;
  vec3 color = texelFetch(uColors, ivec2(vColorIndex, 0), 0).rgb;
  float directAlpha = 1.0 - smoothstep(0.58, 1.0, distanceFromCenter);
  float opticalAlpha = exp(-distanceFromCenter * distanceFromCenter * 3.2);
  float alpha = mix(directAlpha, opticalAlpha, step(0.5, uMode));
  vec2 targetUv = (vWorld - uTargetMaskBounds.xy) / uTargetMaskBounds.zw;
  vec2 targetInsideMin = step(vec2(0.0), targetUv);
  vec2 targetInsideMax = step(targetUv, vec2(1.0));
  float targetAlpha = texture(uTargetMask, clamp(targetUv, vec2(0.0), vec2(1.0))).r
    * targetInsideMin.x * targetInsideMin.y * targetInsideMax.x * targetInsideMax.y;
  float maskedTargetAlpha = uTargetMaskMode < -0.5 ? 1.0 - targetAlpha : targetAlpha;
  alpha *= mix(1.0, maskedTargetAlpha, step(0.5, abs(uTargetMaskMode)));
  vec2 maskUv = clamp(vWorld / uWorldSize, vec2(0.0), vec2(1.0));
  vec3 transmission = texture(uFaceMask, maskUv).rgb;
  vec3 transmitted = mix(color, color * transmission, step(0.5, uUseFaceMask));
  float peak = max(color.r, max(color.g, color.b));
  float transmittedPeak = max(transmitted.r, max(transmitted.g, transmitted.b));
  float transmissionAlpha = peak > 0.00001 ? transmittedPeak / peak : 0.0;
  float maskedAlpha = mix(1.0, transmissionAlpha, step(0.5, uUseFaceMask));
  finalColor = vec4(transmitted * uIntensity * alpha, alpha * maskedAlpha);
}
`;

const OUTLINE_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 aQuad;
layout(location = 1) in vec4 aSegment;

uniform vec4 uViewport;
uniform vec2 uCanvasPx;
uniform float uWidthPx;

void main() {
  vec2 startNormalized = (aSegment.xy - uViewport.xy) / uViewport.zw;
  vec2 endNormalized = (aSegment.zw - uViewport.xy) / uViewport.zw;
  vec2 startPx = vec2(startNormalized.x, 1.0 - startNormalized.y) * uCanvasPx;
  vec2 endPx = vec2(endNormalized.x, 1.0 - endNormalized.y) * uCanvasPx;
  vec2 direction = endPx - startPx;
  float segmentLength = length(direction);
  if (segmentLength < 0.0001) direction = vec2(1.0, 0.0);
  else direction /= segmentLength;
  vec2 normal = vec2(-direction.y, direction.x);
  float along = aQuad.x * 0.5 + 0.5;
  vec2 positionPx = mix(startPx, endPx, along) + normal * aQuad.y * uWidthPx * 0.5;
  vec2 clip = positionPx / uCanvasPx * 2.0 - 1.0;
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const OUTLINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec4 uColor;
out vec4 finalColor;

void main() {
  finalColor = uColor;
}
`;

/** Builds persistent world-space line segments for the optional Animate pass. */
export function buildOutlineSegments(shapes: VisualShape[]) {
  const segments: number[] = [];
  for (const shape of shapes) {
    for (const polyline of shapeOutlinePolylines(shape)) {
      for (let index = 1; index < polyline.length; index += 1) {
        const start = polyline[index - 1];
        const end = polyline[index];
        if (start.x === end.x && start.y === end.y) continue;
        segments.push(start.x, start.y, end.x, end.y);
      }
    }
  }
  return new Float32Array(segments);
}

export function selectedOutlineShapes(shapes: VisualShape[], selection: PlayerOutlineSelection) {
  if (!selection) return [];
  return shapes.filter((shape) => shape.kind === selection.type && shape.id === selection.id).slice(0, 1);
}

function shapeOutlinePolylines(shape: VisualShape): VisualPoint[][] {
  if (shape.primitive === "rectangle") {
    return [[
      { x: shape.x, y: shape.y },
      { x: shape.x + shape.width, y: shape.y },
      { x: shape.x + shape.width, y: shape.y + shape.height },
      { x: shape.x, y: shape.y + shape.height },
      { x: shape.x, y: shape.y }
    ]];
  }
  if (shape.primitive === "ellipse") {
    const points: VisualPoint[] = [];
    const centerX = shape.x + shape.width / 2;
    const centerY = shape.y + shape.height / 2;
    for (let step = 0; step <= 64; step += 1) {
      const angle = step / 64 * Math.PI * 2;
      points.push({ x: centerX + Math.cos(angle) * shape.width / 2, y: centerY + Math.sin(angle) * shape.height / 2 });
    }
    return [points];
  }
  return shape.contours.map((contour) => flattenContour(contour.points, contour.pathMode, true)).filter((points) => points.length > 1);
}

function flattenContour(points: VisualPoint[], pathMode: "straight" | "bezier", closed: boolean) {
  if (points.length < 2) return points.map((point) => ({ x: point.x, y: point.y }));
  const flattened: VisualPoint[] = [{ x: points[0].x, y: points[0].y }];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    if (pathMode !== "bezier" || (!start.handleOut && !end.handleIn)) {
      flattened.push({ x: end.x, y: end.y });
      continue;
    }
    const control1 = { x: start.x + (start.handleOut?.x ?? 0), y: start.y + (start.handleOut?.y ?? 0) };
    const control2 = { x: end.x + (end.handleIn?.x ?? 0), y: end.y + (end.handleIn?.y ?? 0) };
    for (let step = 1; step <= 16; step += 1) {
      const time = step / 16;
      const inverse = 1 - time;
      flattened.push({
        x: inverse ** 3 * start.x + 3 * inverse ** 2 * time * control1.x + 3 * inverse * time ** 2 * control2.x + time ** 3 * end.x,
        y: inverse ** 3 * start.y + 3 * inverse ** 2 * time * control1.y + 3 * inverse * time ** 2 * control2.y + time ** 3 * end.y
      });
    }
  }
  return flattened;
}

export function opticalTargetShape(shapes: VisualShape[], source: Pick<VisualOpticalTreatment, "targetType" | "targetId">) {
  return shapes.find((shape) => shape.kind === source.targetType && shape.id === source.targetId) ?? null;
}

/** Front light stays on its face; reflected/rear light stays off every physical face. */
export function opticalTargetMaskMode(mode: VisualOpticalTreatment["mode"]): TargetMaskMode {
  if (mode === "front") return 1;
  return -1;
}

export function opticalOccluderShapes(shapes: VisualShape[], source: Pick<VisualOpticalTreatment, "mode" | "targetType" | "targetId">) {
  if (source.mode === "front") {
    const target = opticalTargetShape(shapes, source);
    return target ? [target] : [];
  }
  return shapes.filter((shape) => shape.kind === "zone" || shape.kind === "channel");
}

export function opticalTargetMaskBounds(shape: VisualShape, sceneBounds: VisualSceneV1["bounds"]): MaskBounds {
  return opticalOccluderMaskBounds([shape], sceneBounds);
}

function opticalOccluderMaskBounds(shapes: VisualShape[], sceneBounds: VisualSceneV1["bounds"]): MaskBounds {
  const pixelsPerCm = 1024 / Math.max(sceneBounds.widthCm, sceneBounds.heightCm, 1);
  const paddingCm = 2 / pixelsPerCm;
  const minX = Math.min(...shapes.map((shape) => shape.x));
  const minY = Math.min(...shapes.map((shape) => shape.y));
  const maxX = Math.max(...shapes.map((shape) => shape.x + shape.width));
  const maxY = Math.max(...shapes.map((shape) => shape.y + shape.height));
  return {
    x: minX - paddingCm,
    y: minY - paddingCm,
    width: Math.max(0.0001, maxX - minX + paddingCm * 2),
    height: Math.max(0.0001, maxY - minY + paddingCm * 2)
  };
}

export function targetMaskTextureSize(bounds: MaskBounds) {
  const longest = Math.max(bounds.width, bounds.height, 0.0001);
  const pixelsPerCm = 1024 / longest;
  return {
    width: Math.max(1, Math.ceil(bounds.width * pixelsPerCm)),
    height: Math.max(1, Math.ceil(bounds.height * pixelsPerCm))
  };
}

export function faceMaskTextureSize(visualScene: Pick<VisualSceneV1, "bounds">) {
  const longest = Math.max(visualScene.bounds.widthCm, visualScene.bounds.heightCm, 1);
  return {
    width: Math.max(1, Math.round(2048 * visualScene.bounds.widthCm / longest)),
    height: Math.max(1, Math.round(2048 * visualScene.bounds.heightCm / longest))
  };
}

function visualShapePath(graphic: VisualShape) {
  const path = new Path2D();
  if (graphic.primitive === "ellipse") {
    path.ellipse(graphic.x + graphic.width / 2, graphic.y + graphic.height / 2, Math.abs(graphic.width / 2), Math.abs(graphic.height / 2), 0, 0, Math.PI * 2);
    return path;
  }
  if (graphic.primitive !== "path" || !graphic.contours.length) {
    path.rect(graphic.x, graphic.y, graphic.width, graphic.height);
    return path;
  }
  for (const contour of graphic.contours) appendClosedContour(path, contour.points, contour.pathMode);
  return path;
}

function appendClosedContour(path: Path2D, points: VisualPoint[], pathMode: "straight" | "bezier" | undefined) {
  if (!points.length) return;
  path.moveTo(points[0].x, points[0].y);
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length];
    if (pathMode === "bezier" && (start.handleOut || end.handleIn)) {
      path.bezierCurveTo(
        start.x + (start.handleOut?.x ?? 0),
        start.y + (start.handleOut?.y ?? 0),
        end.x + (end.handleIn?.x ?? 0),
        end.y + (end.handleIn?.y ?? 0),
        end.x,
        end.y
      );
    } else path.lineTo(end.x, end.y);
  });
  path.closePath();
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = requireResource(gl.createProgram(), "shader program");
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown WebGL program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = requireResource(gl.createShader(type), "shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown WebGL shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function requireResource<T>(resource: T | null, label: string): T {
  if (!resource) throw new Error(`Unable to allocate WebGL ${label}.`);
  return resource;
}
