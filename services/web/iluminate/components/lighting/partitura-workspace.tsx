"use client";

import Link from "next/link";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Partitura } from "@iluminate/lighting-core";
import { AlertCircle, ArrowLeft, Cable, Circle, CircleDot, ClipboardPaste, Copy, Cpu, Download, FlipHorizontal as SquareCenterlineDashedVertical, Group, Hammer, Hand, Image as ImageIcon, Layers, Layers2, Lightbulb, LoaderCircle, Magnet, Maximize2, MousePointer2, Move, Pause, PenLine, Play, Plus, Radius, Redo2, Ruler, RotateCcw, Save, Scissors, Settings2, Share2, Sparkles, Spline, Square, Tally2, Trash2, Undo2, Ungroup, Waves, Waypoints, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { compiledStringIdsForSource, designerCompileSignature } from "./designer/designer-compile-metadata";
import { compileDesignerDocument } from "./designer/designer-compile-client";
import { clipLightSourcesForTarget, designerClipTargetIdsForSelection, designerOpticalTargetsForClipTarget } from "./designer/designer-animation-selection";
import {
  clamp,
  clampViewport,
  designerBooleanResultName,
  designerDerivedGeometryName,
  designerProjectionName,
  fitViewportToDesigner,
  formatDecimal,
  missingWorkLineHolePoints,
  nextDesignerItemNumber,
  routeBounds,
  snapValue,
  updatedDesignerOffsetName,
  workLineIntersectionPoints
} from "./designer/designer-geometry";
import {
  applyDesignerBooleanOperation,
  deleteChannelPoint as deleteChannelPointPath,
  deletePolygonPoint,
  designerShapePointCount,
  designerShapePointLocation,
  insertChannelPoint as insertChannelPointPath,
  insertPolygonPoint,
  movedShape,
  rectanglePoints,
  resizedBuildArea,
  resizedZone,
  setChannelNodeType as setChannelNodeTypePath,
  setPolygonNodeType,
  updatePolygonPoint,
  type DesignerBooleanOperation
} from "./designer/geometry/designer-geometry-engine";
import {
  clearFloatingTerminalJoints,
  canSolderRoutes,
  createLedStringFromChannel,
  createLedStringsFromZonePaths,
  createRouteFromDraft,
  deleteDesignerRoute,
  detachSolderedRoutePoint,
  findMatchingControllerPort,
  findMatchingSolderTerminal,
  isRouteTerminal,
  moveRoutePointWithRetraction,
  moveRouteTerminals,
  nearestRouteInsertIndex,
  resolveRouteOutputs,
  routeLengthCm,
  sameSnapPoint,
  sampleRouteLedDots,
  selectedStringConnectionPlan,
  summarizeRoute
} from "./designer/electrical/designer-electrical-engine";
import { offsetDesignerGeometry } from "@/lib/lighting/designer-derived-geometry";
import { DesignerStudioCanvas, type DesignerAnimationDiffuser } from "./designer/designer-paper-canvas";
import { DEFAULT_DIFFUSER_RENDER_SETTINGS, type DiffuserRenderSettings } from "./player/optical-model";
import { DesignerLayersPanel, NodeTypePicker, ToolbarField, ToolbarNumber, ToolButton } from "./designer/designer-ui";
import { assignDesignerObjectsToSublayer, designerSublayerForObject, designerWithSublayerMasks, inheritDesignerSublayerForCopy, insertDesignerCopyAbove, nextDesignerSublayer, removeDesignerSublayer, restoreDesignerSublayerAuthoredState } from "./designer/designer-sublayers";
import { designerLayerForSelection, type DesignerActiveLayer, type DesignerFilletCornerTarget, type DesignerLayerTarget, type DesignerLayerTreeScope, type DesignerMoveAxis, type DesignerRouteSurfaceView, type DesignerRouteTerminal, type DesignerSelection, type DesignerTool, type DesignerViewport } from "./designer/types";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import {
  canonicalizeDesignerGeometry,
  addDefaultLightSourcesForNewTargets,
  clonePartituraDocument,
  createDefaultOpticalTreatment,
  createClipIdentity,
  ClipParams,
  ClipForm,
  DesignerArtworkForm,
  DesignerBuildAreaForm,
  DesignerChannelForm,
  DesignerControllerForm,
  DesignerCompileIssue,
  DesignerCompileIssueTarget,
  DesignerDerivedGeometry,
  DesignerForm,
  DesignerFaceGraphicForm,
  DesignerFabricationOperation,
  DesignerFabricationPartForm,
  DesignerFabricationPathForm,
  DesignerGroupForm,
  DesignerGeometry,
  DesignerLayerSettings,
  DesignerLedStripConfiguration,
  DesignerLayersForm,
  DesignerSublayerForm,
  DesignerSublayerScope,
  DesignerSystemSublayerScope,
  DesignerOpticalMode,
  DesignerOpticalTreatment,
  DesignerPoint,
  DesignerPointNodeType,
  DesignerProjection,
  DesignerProjectionLayer,
  DesignerRouteKind,
  DesignerRouteForm,
  DesignerText,
  DesignerVectorGroupMember,
  DesignerWorkLineForm,
  DesignerZoneForm,
  LedStripCatalogProfile,
  designerGlobalLightSourceMode,
  designerOpticalModeSide,
  nextEmptyClipLayer,
  normalizeDefaultSignLayout,
  parseDesignerGroupLightTargetId,
  designerGeometryAsShape,
  resolveDesignerDerivedGeometry,
  resolveDesignerGeometryReference,
  wouldCreateDesignerDerivedGeometryCycle,
  wouldCreateDesignerProjectionCycle,
  PartituraDocument,
  PersistedPartitura,
  SceneForm
} from "@/lib/lighting/partitura-model";
import { DEFAULT_DESIGNER_FONT_ID, DESIGNER_FONT_CATALOG, designerFontResource, designerFontUrl } from "@/lib/lighting/designer-font-catalog";
import type { ArtworkIntrinsicSize } from "@/lib/lighting/artwork-intrinsic-size";
import { compressedJsonRequest } from "@/lib/http/compressed-json";
import { importArtworkSvgAsZoneDrafts } from "@/lib/lighting/artwork-svg-zones";
import type { FabricationExportFormat, FabricationExportOptions, FabricationExportResult } from "./designer/fabrication/designer-fabrication-export";
import { channelPathsFromGeometries, generatedChannelName, type ChannelPathAlignment } from "./designer/geometry/designer-channel-from-path";
import { generateDesignerLightboxZone, type DesignerLightboxProfile } from "./designer/geometry/designer-lightbox-zone";
import { applyDesignerNativeFillet } from "./designer/geometry/designer-geometry-commands";
import { resolveDesignerProjectionGeometry } from "./designer/geometry/designer-projected-geometry";
import { canvasInteractionSnapCm, CHANNEL_ROUTER_BIT_PRESETS, channelWidthForRouterDiameter, geometryToolPolicy } from "./designer/canvas/designer-tool-policy";
import type { DesignerMarqueeSelectionResult } from "./designer/canvas/designer-marquee-selection";
import type { PlayerSurfaceHandle } from "./player/player-surface";
import type { PlayerStatus } from "./player/player-controller";

const DesignerAnimateTimeline = lazy(() => import("./designer/designer-animate-timeline").then((module) => ({ default: module.DesignerAnimateTimeline })));
const PlayerSurface = lazy(() => import("./player/player-surface").then((module) => ({ default: module.PlayerSurface })));

type ProjectAsset = {
  id: string;
  fileName: string;
  mimeType: string;
};

type DesignerGeometrySelection = Extract<Exclude<DesignerSelection, null>, { type: "build_area" | "zone" | "face_graphic" | "projection" | "derived_geometry" }>;

const MIN_COMPILE_INDICATOR_MS = 700;
const DEFAULT_FABRICATION_EXPORT_OPTIONS: FabricationExportOptions = {
  includeReference: true,
  includeZones: true,
  includeChannels: true,
  includeFaceGraphic: true,
  includeFabricationPlans: true,
  includeAlignmentMarks: true,
  flattenToleranceMm: 0.1,
  minimumFeatureMm: 0.5
};

function waitForCompileIndicatorPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function isDesignerGeometrySelection(selection: DesignerSelection): selection is DesignerGeometrySelection {
  return selection?.type === "build_area" || selection?.type === "zone" || selection?.type === "face_graphic" || selection?.type === "projection" || selection?.type === "derived_geometry";
}

function designerGeometrySelectionKey(selection: Pick<DesignerGeometrySelection, "type" | "id">) {
  return `${selection.type}:${selection.id}`;
}

function isDesignerVectorGroupMember(selection: DesignerGeometrySelection): selection is DesignerGeometrySelection & DesignerVectorGroupMember {
  return selection.type === "build_area" || selection.type === "zone" || selection.type === "face_graphic";
}

type ApiResult = {
  ok: boolean;
  validation: {
    errors: Array<{ code: string; path: string; message: string }>;
    warnings: Array<{ code: string; path: string; message: string }>;
  };
  partitura?: Partitura;
  message?: string;
};

type EffectCatalog = Record<string, EffectDefinition>;

type SharePolicy = "private" | "review" | "unlisted" | "public";

type ScenePublication = {
  shareId: string;
  slug: string;
  title?: string;
  policy: SharePolicy;
  status: "pending" | "rendering" | "ready" | "failed" | "cancelled";
  errorSummary?: string | null;
  shareUrl: string | null;
  revoked?: boolean;
};

type DesignerHistoryEntry = {
  document: PartituraDocument;
  selection: DesignerSelection;
};

type OpticalTargetRef = { type: "zone" | "channel"; id: string };

type LedStripSetupDraft = {
  stripConfiguration: DesignerLedStripConfiguration;
  addressablePixelsPerMeter: number;
  ledsPerMeter: number;
  ledPackageSizeMm: number;
  ledPcbWidthMm: number;
};

function ledStripSetupDraftFromDesigner(designer: DesignerForm): LedStripSetupDraft {
  const stripConfiguration = designer.stripConfiguration ?? {
    name: "Custom LED strip",
    construction: "discrete" as const,
    nativeControlProtocol: "ws281x",
    colorModel: "rgb" as const,
    voltageV: 5,
    cutMode: "marked_segments" as const,
    addressablePixelsPerCutSegment: 1,
    physicalLedsPerCutSegment: 1,
    physicalLedsPerAddressablePixel: 1,
    addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
    physicalLedsPerMeter: designer.ledsPerMeter,
    pcbWidthMm: designer.ledPcbWidthMm,
    ledPackageSizeMm: designer.ledPackageSizeMm
  };
  return {
    stripConfiguration,
    addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
    ledsPerMeter: designer.ledsPerMeter,
    ledPackageSizeMm: designer.ledPackageSizeMm,
    ledPcbWidthMm: designer.ledPcbWidthMm
  };
}

function designerWithLedStripSetupDraft(designer: DesignerForm, draft: LedStripSetupDraft): DesignerForm {
  return {
    ...designer,
    stripConfiguration: draft.stripConfiguration,
    addressablePixelsPerMeter: draft.addressablePixelsPerMeter,
    ledsPerMeter: draft.ledsPerMeter,
    ledDensityPerMeter: draft.addressablePixelsPerMeter,
    ledPackageSizeMm: draft.ledPackageSizeMm,
    ledPcbWidthMm: draft.ledPcbWidthMm
  };
}

type EditableNativeOffset = {
  target: "build_area" | "zone" | "face_graphic";
  id: string;
  sourceGeometry: DesignerGeometry;
  sourceName: string;
};

type EditableNativeFillet = {
  target: DesignerFilletCornerTarget & { type: "build_area" | "zone" | "face_graphic" };
  sourceGeometry: DesignerGeometry;
};

const DESIGNER_HISTORY_LIMIT = 100;

function moveDesignerItemsBefore<T extends { id: string }>(items: T[], movingIds: string[], beforeId: string) {
  const moving = new Set(movingIds);
  const movedItems = items.filter((item) => moving.has(item.id));
  const remaining = items.filter((item) => !moving.has(item.id));
  const beforeIndex = remaining.findIndex((item) => item.id === beforeId);
  if (!movedItems.length || beforeIndex < 0) return items;
  return [...remaining.slice(0, beforeIndex), ...movedItems, ...remaining.slice(beforeIndex)];
}

const ACTIVE_LAYER_LABELS: Record<DesignerActiveLayer, string> = {
  artwork: "Artwork",
  reference: "Reference",
  zones: "Zones",
  faceGraphic: "Face Graphic",
  fabrication: "Fabrication Plans",
  lightSources: "Light Sources",
  hardware: "Hardware",
  strings: "Strings"
};

const DESIGNER_TOOL_LABELS: Record<DesignerTool, string> = {
  select: "Select",
  move: "Move",
  pan: "Pan",
  measure: "Measure",
  work_line: "Work line",
  image_place: "Image",
  build_area_rect: "Rectangle reference",
  build_area_ellipse: "Ellipse reference",
  build_area_polygon: "Polygon reference",
  build_area_bezier: "Bezier reference",
  reference_text: "Reference text",
  zone_rect: "Rectangle zone",
  zone_ellipse: "Ellipse zone",
  zone_polygon: "Polygon zone",
  zone_text: "Zone text",
  channel_bezier: "Channel",
  face_graphic_rect: "Rectangle face graphic",
  face_graphic_ellipse: "Ellipse face graphic",
  face_graphic_polygon: "Polygon face graphic",
  face_graphic_bezier: "Bezier face graphic",
  face_graphic_text: "Face Graphic text",
  path_trim: "Trim path",
  fillet: "Fillet nodes",
  led_string: "LED string",
  data_cable: "Data cable",
  cut: "Cut route"
};

function RulerDimensionLineIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 15v-3" />
      <path d="M14 15v-3" />
      <path d="M18 15v-3" />
      <path d="M2 8V4" />
      <path d="M22 6H2" />
      <path d="M22 8V4" />
      <path d="M6 15v-3" />
      <rect x="2" y="12" width="20" height="8" rx="2" />
    </svg>
  );
}

function VectorPolygonIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m12.828 4.813 5.344 2.375" />
      <path d="m15.769 18.153 3.461-8.306" />
      <path d="m5.687 14.074 7.625 4.852" />
      <path d="M9.772 5.579 5.228 11.42" />
      <circle cx="11" cy="4" r="2" />
      <circle cx="15" cy="20" r="2" />
      <circle cx="20" cy="8" r="2" />
      <circle cx="4" cy="13" r="2" />
    </svg>
  );
}

function BooleanSquaresIcon({ operation, className }: { operation: "union" | "subtract" | "intersect" | "exclude"; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {operation === "union" ? (
        <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 0 1 1h3a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-3a1 1 0 0 0-1-1z" />
      ) : operation === "subtract" ? (
        <>
          <path d="M10 22a2 2 0 0 1-2-2" />
          <path d="M16 22h-2" />
          <path d="M16 4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3a1 1 0 0 0 1-1v-5a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z" />
          <path d="M20 8a2 2 0 0 1 2 2" />
          <path d="M22 14v2" />
          <path d="M22 20a2 2 0 0 1-2 2" />
        </>
      ) : operation === "intersect" ? (
        <>
          <path d="M10 22a2 2 0 0 1-2-2" />
          <path d="M14 2a2 2 0 0 1 2 2" />
          <path d="M16 22h-2" />
          <path d="M2 10V8" />
          <path d="M2 4a2 2 0 0 1 2-2" />
          <path d="M20 8a2 2 0 0 1 2 2" />
          <path d="M22 14v2" />
          <path d="M22 20a2 2 0 0 1-2 2" />
          <path d="M4 16a2 2 0 0 1-2-2" />
          <path d="M8 10a2 2 0 0 1 2-2h5a1 1 0 0 1 1 1v5a2 2 0 0 1-2 2H9a1 1 0 0 1-1-1z" />
          <path d="M8 2h2" />
        </>
      ) : (
        <>
          <path d="M16 12v2a2 2 0 0 1-2 2H9a1 1 0 0 0-1 1v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2" />
          <path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3a1 1 0 0 1-1 1h-5a2 2 0 0 0-2 2v2" />
        </>
      )}
    </svg>
  );
}

function PrimitiveDimensionNumber({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(() => String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  function commit() {
    const parsed = Number(draft.trim().replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDraft(String(value));
      return;
    }
    const next = Math.max(0.1, parsed);
    setDraft(String(next));
    onCommit(next);
  }

  return (
    <ToolbarField label={label}>
      <div className="flex h-8 items-center rounded-md border border-input bg-card">
        <input
          className="h-full w-20 rounded-md bg-transparent px-2 text-right font-mono text-body-sm outline-none focus:ring-2 focus:ring-blue-500"
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.preventDefault();
              setDraft(String(value));
            }
          }}
        />
        <span className="pr-2 text-[11px] text-muted-foreground">cm</span>
      </div>
    </ToolbarField>
  );
}

function designerToolInstruction(tool: DesignerTool) {
  if (tool === "select") return "Click an object, or drag empty canvas to select visible profiles";
  if (tool === "move") return "Drag a whole object on the fixed axis; hold Ctrl for both axes";
  if (tool === "path_trim") return "Hover a crossed segment to preview it, then click to remove it";
  if (tool === "fillet") return "Click corner nodes to apply the configured tangent radius; Esc finishes";
  if (tool === "pan") return "Drag the canvas to move the view";
  if (tool === "measure") return "Drag between two points to measure";
  if (tool === "work_line") return "Click to add points; press Enter or double-click to finish";
  if (tool === "image_place") return "Drag on the canvas to place the image container";
  if (tool === "reference_text" || tool === "zone_text" || tool === "face_graphic_text") return "Click to place editable text";
  if (tool === "build_area_rect" || tool === "build_area_ellipse" || tool === "zone_rect" || tool === "zone_ellipse" || tool === "face_graphic_rect" || tool === "face_graphic_ellipse") return "Drag on the canvas to create it";
  if (tool === "channel_bezier") return "Click to add nodes, or create from the selected paths";
  if (tool === "build_area_polygon" || tool === "build_area_bezier" || tool === "zone_polygon" || tool === "face_graphic_polygon" || tool === "face_graphic_bezier") return "Click to add nodes and close the path to finish";
  if (tool === "led_string" || tool === "data_cable") return "Click to draw the route";
  return "Click a route point to split it";
}

const FABRICATION_CUTTER_PRESETS_MM = [1.5, 2, 3, 3.175, 4, 6, 6.35] as const;
const ANIMATION_PREVIEW_DEBOUNCE_MS = 180;

function cutterDiameterForDisplay(diameterMm: number, unit: DesignerForm["fabricationCutterUnit"]) {
  if (unit === "in") return diameterMm / 25.4;
  if (unit === "cm") return diameterMm / 10;
  return diameterMm;
}

function cutterDiameterFromDisplay(value: number, unit: DesignerForm["fabricationCutterUnit"]) {
  if (unit === "in") return value * 25.4;
  if (unit === "cm") return value * 10;
  return value;
}

function persistedDocumentSignature(document: PartituraDocument) {
  const { previewTimeMs: _previewTimeMs, ...persistedDocument } = document;
  return JSON.stringify(persistedDocument);
}

export function PartituraDesignerStudio({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState<PartituraDocument>(() => normalizeDefaultSignLayout(initialPartitura.document));
  const documentRef = useRef<PartituraDocument>(document);
  const savedDocumentSignatureRef = useRef(persistedDocumentSignature(document));
  const generatedPartituraStaleRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [editorMode, setEditorMode] = useState<"design" | "animate">("design");
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [animationResult, setAnimationResult] = useState<ApiResult | null>(null);
  const [animationGenerating, setAnimationGenerating] = useState(false);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [animationViewerOpen, setAnimationViewerOpen] = useState(false);
  const [animationViewerViewport, setAnimationViewerViewport] = useState<DesignerViewport | null>(null);
  const playerSurfaceRef = useRef<PlayerSurfaceHandle | null>(null);
  const [playerStatus, setPlayerStatus] = useState<PlayerStatus | null>(null);
  const animationResultRef = useRef<ApiResult | null>(null);
  const animationGenerationIdRef = useRef(0);
  const animationGenerationAbortRef = useRef<AbortController | null>(null);
  const animationPreviewTimerRef = useRef<number | null>(null);
  const pendingAnimationPreviewRef = useRef<{ document: PartituraDocument; play: boolean } | null>(null);
  const animationTimelineInteractionRef = useRef(false);
  const animationResumePlaybackRef = useRef(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePolicy, setSharePolicy] = useState<SharePolicy>("review");
  const [shareRightsConfirmed, setShareRightsConfirmed] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePublication, setSharePublication] = useState<ScenePublication | null>(null);
  const setupDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const [tool, setTool] = useState<DesignerTool>("select");
  const [nodeCreationType, setNodeCreationType] = useState<DesignerPointNodeType>("corner");
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [faceGraphicVinylPreview, setFaceGraphicVinylPreview] = useState(false);
  const [routeSurfaceView, setRouteSurfaceView] = useState<DesignerRouteSurfaceView>("both");
  const [routeCreationSurface, setRouteCreationSurface] = useState<"rear" | "front">("rear");
  const [channelCreationSurface, setChannelCreationSurface] = useState<"rear" | "front">("front");
  const [channelPathAlignment, setChannelPathAlignment] = useState<ChannelPathAlignment>("center");
  const [channelPathOffsetMm, setChannelPathOffsetMm] = useState(10);
  const [moveAxis, setMoveAxis] = useState<DesignerMoveAxis>("x");
  const [directFilletRadiusMm, setDirectFilletRadiusMm] = useState(() => Math.max(0, document.designer?.filletRadiusMm ?? 2));
  const [directFilletRadiusSource, setDirectFilletRadiusSource] = useState<"custom" | "router_bit">("custom");
  const activeDirectFilletRadiusMmRef = useRef(directFilletRadiusMm);
  // No work plane is active until the operator picks a category in the Layers
  // panel. Until then the canvas must not select or drag any object.
  const [activeLayer, setActiveLayer] = useState<DesignerActiveLayer | null>(null);
  const [activeLayerTarget, setActiveLayerTarget] = useState<DesignerLayerTarget | null>(null);
  const [projectionTargetLayer, setProjectionTargetLayer] = useState<DesignerProjectionLayer | "fabrication">("faceGraphic");
  const [projectionFabricationPartId, setProjectionFabricationPartId] = useState<"new" | string>("new");
  const [projectionFabricationPartName, setProjectionFabricationPartName] = useState("Fabrication part 1");
  const [projectionFabricationOperation, setProjectionFabricationOperation] = useState<DesignerFabricationOperation>("cut");
  const [selection, setSelection] = useState<DesignerSelection>(null);
  const [geometrySelections, setGeometrySelections] = useState<DesignerGeometrySelection[]>([]);
  const [marqueeChannelIds, setMarqueeChannelIds] = useState<string[]>([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);
  const [opticalTargetSelection, setOpticalTargetSelection] = useState<OpticalTargetRef[]>([]);
  const undoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const redoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const historyInteractionIdRef = useRef(0);
  const historyRecordedInteractionRef = useRef<number | null>(null);
  const editableNativeOffsetRef = useRef<EditableNativeOffset | null>(null);
  const editableNativeFilletRef = useRef<EditableNativeFillet | null>(null);
  const [, setHistoryRevision] = useState(0);
  const [clipboard, setClipboard] = useState<DesignerSelection>(null);
  const [fabricationNotice, setFabricationNotice] = useState("Ready");
  const [fabricationExportOpen, setFabricationExportOpen] = useState(false);
  const [fabricationExporting, setFabricationExporting] = useState(false);
  const [fabricationExportOptions, setFabricationExportOptions] = useState<FabricationExportOptions>(DEFAULT_FABRICATION_EXPORT_OPTIONS);
  const [fabricationExportResult, setFabricationExportResult] = useState<FabricationExportResult | null>(null);
  const [compileIssuesOpen, setCompileIssuesOpen] = useState(false);
  const [viewport, setViewport] = useState<DesignerViewport | null>(null);
  const [layersPanelOpen, setLayersPanelOpen] = useState(true);
  const [layersPanelWidth, setLayersPanelWidth] = useState(340);
  const [lightingEditorOpen, setLightingEditorOpen] = useState(false);
  const [animationTimelineHeight, setAnimationTimelineHeight] = useState(260);
  const [animationTimelineCollapsed, setAnimationTimelineCollapsed] = useState(false);
  const [selectedAnimationClipTargetId, setSelectedAnimationClipTargetId] = useState<string | null>(null);
  const [animationDiffuser, setAnimationDiffuser] = useState<DesignerAnimationDiffuser>("as_built");
  const [animationFaceMaskEnabled, setAnimationFaceMaskEnabled] = useState(true);
  const [diffuserSettings, setDiffuserSettings] = useState<DiffuserRenderSettings>(DEFAULT_DIFFUSER_RENDER_SETTINGS);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [ledStripProfiles, setLedStripProfiles] = useState<LedStripCatalogProfile[]>([]);
  const [selectedLedStripProfileId, setSelectedLedStripProfileId] = useState(() => document.designer?.stripConfiguration?.sourceProfileId ?? "");
  const [ledStripSetupDraft, setLedStripSetupDraft] = useState<LedStripSetupDraft | null>(null);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const [importingSvgZones, setImportingSvgZones] = useState(false);
  const artworkUrls = useMemo(() => Object.fromEntries(projectAssets.map((asset) => [asset.id, `/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/${encodeURIComponent(asset.id)}`])), [document.projectId, projectAssets]);

  useEffect(() => {
    const stored = window.localStorage.getItem("iluminate.layers.width");
    const parsed = stored ? Number(stored) : Number.NaN;
    if (Number.isFinite(parsed)) setLayersPanelWidth(Math.min(520, Math.max(280, parsed)));
  }, []);

  useEffect(() => {
    window.localStorage.setItem("iluminate.layers.width", String(layersPanelWidth));
  }, [layersPanelWidth]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    const beginPointerInteraction = () => {
      historyInteractionIdRef.current += 1;
    };
    window.addEventListener("pointerdown", beginPointerInteraction, true);
    return () => window.removeEventListener("pointerdown", beginPointerInteraction, true);
  }, []);

  useEffect(() => {
    animationResultRef.current = animationResult;
  }, [animationResult]);

  useEffect(() => {
    if (editorMode === "animate") return;
    cancelScheduledAnimationPreview();
    animationGenerationAbortRef.current?.abort();
    animationGenerationAbortRef.current = null;
  }, [editorMode]);

  useEffect(() => () => {
    cancelScheduledAnimationPreview();
    animationGenerationAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!sharePublication || !["pending", "rendering"].includes(sharePublication.status)) return;
    let cancelled = false;
    const refresh = async () => {
      const response = await fetch(`/api/lighting/scene-shares/${encodeURIComponent(sharePublication.shareId)}`, { cache: "no-store" });
      if (!response.ok || cancelled) return;
      const payload = await response.json() as { publication?: ScenePublication };
      if (payload.publication) setSharePublication(payload.publication);
    };
    const timer = window.setInterval(() => void refresh(), 3_000);
    void refresh();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sharePublication?.shareId, sharePublication?.status]);

  useEffect(() => {
    if (editorMode === "animate" && !animationResultRef.current?.ok && !animationGenerating) {
      void previewAnimation(documentRef.current, { play: false });
    }
  }, [editorMode]);

  useEffect(() => {
    if (editorMode !== "animate") {
      setLightingEditorOpen(false);
      return;
    }
    if (selection?.type === "zone" || selection?.type === "channel" || selection?.type === "light_source") setLightingEditorOpen(true);
  }, [editorMode]);

  useEffect(() => {
    const fitTimelineToViewport = () => setAnimationTimelineHeight((current) => Math.min(current, maximumTimelineHeight(window.innerHeight)));
    fitTimelineToViewport();
    window.addEventListener("resize", fitTimelineToViewport);
    return () => window.removeEventListener("resize", fitTimelineToViewport);
  }, []);

  const designerState = document.designer;
  if (!designerState) return null;
  const designer: DesignerForm = designerState;
  const appliedLedStripSetup = ledStripSetupDraftFromDesigner(designer);
  const ledStripPreview = ledStripSetupDraft ?? appliedLedStripSetup;
  const ledStripPreviewDesigner = designerWithLedStripSetupDraft(designer, ledStripPreview);
  const canvasDesigner = designerWithSublayerMasks(ledStripPreviewDesigner);
  const ledStripSetupDirty = Boolean(ledStripSetupDraft && JSON.stringify(ledStripSetupDraft) !== JSON.stringify(appliedLedStripSetup));
  const interactionSnapCm = canvasInteractionSnapCm(designer.snapCm, snapToGrid);
  const activeDirectFilletRadiusMm = directFilletRadiusSource === "router_bit"
    ? designer.fabricationCutterDiameterMm / 2
    : directFilletRadiusMm;
  activeDirectFilletRadiusMmRef.current = activeDirectFilletRadiusMm;
  const fabricationCutterPreset = FABRICATION_CUTTER_PRESETS_MM.find((diameter) => Math.abs(diameter - designer.fabricationCutterDiameterMm) < 1e-6);
  const channelRouterPreset = CHANNEL_ROUTER_BIT_PRESETS.find((preset) => Math.abs(preset.diameterMm - designer.channelRouterDiameterMm) < 1e-6);
  const selectedArtwork = selection?.type === "artwork" ? designer.artwork.find((artwork) => artwork.id === selection.id) ?? null : null;
  const selectedWorkLine = selection?.type === "work_line" ? designer.workLines.find((line) => line.id === selection.id) ?? null : null;
  const selectedWorkLinePointIndex = selection?.type === "work_line" ? selection.pointIndex : undefined;
  const selectedWorkLinePoint = selectedWorkLine && typeof selectedWorkLinePointIndex === "number" ? selectedWorkLine.points[selectedWorkLinePointIndex] : null;
  const selectedArtworkAsset = selectedArtwork ? projectAssets.find((asset) => asset.id === selectedArtwork.assetId) ?? null : null;
  const selectedBuildArea = selection?.type === "build_area" ? designer.buildAreas.find((buildArea) => buildArea.id === selection.id) ?? null : null;
  const selectedBuildAreaPointIndex = selection?.type === "build_area" ? selection.pointIndex : undefined;
  const selectedBuildAreaPointLocation = selectedBuildArea && typeof selectedBuildAreaPointIndex === "number" ? designerShapePointLocation(selectedBuildArea, selectedBuildAreaPointIndex) : null;
  const selectedLightSource = selection?.type === "light_source" ? designer.lightSources.find((source) => source.id === selection.id) ?? null : null;
  const selectedZone = selection?.type === "zone" ? designer.zones.find((zone) => zone.id === selection.id) ?? null : selectedLightSource?.targetType === "zone" ? designer.zones.find((zone) => zone.id === selectedLightSource.targetId) ?? null : null;
  const selectedZonePointIndex = selection?.type === "zone" ? selection.pointIndex : undefined;
  const selectedZonePointLocation = selectedZone && typeof selectedZonePointIndex === "number" ? designerShapePointLocation(selectedZone, selectedZonePointIndex) : null;
  const selectedFaceGraphic = selection?.type === "face_graphic" ? designer.faceGraphics.find((element) => element.id === selection.id) ?? null : null;
  const selectedFaceGraphicPointIndex = selection?.type === "face_graphic" ? selection.pointIndex : undefined;
  const selectedFaceGraphicPointLocation = selectedFaceGraphic && typeof selectedFaceGraphicPointIndex === "number" ? designerShapePointLocation(selectedFaceGraphic, selectedFaceGraphicPointIndex) : null;
  const selectedFabricationPath = selection?.type === "fabrication_path" ? designer.fabricationPaths.find((path) => path.id === selection.id) ?? null : null;
  const selectedFabricationPart = selection?.type === "fabrication_part" ? designer.fabricationParts.find((part) => part.id === selection.id) ?? null : null;
  const selectedDirectFilletTarget: DesignerFilletCornerTarget | null = selectedBuildArea && typeof selectedBuildAreaPointIndex === "number"
    ? { type: "build_area", id: selectedBuildArea.id, cornerIndex: selectedBuildAreaPointIndex }
    : selectedZone && selection?.type === "zone" && typeof selectedZonePointIndex === "number"
      ? { type: "zone", id: selectedZone.id, cornerIndex: selectedZonePointIndex }
      : selectedFaceGraphic && typeof selectedFaceGraphicPointIndex === "number"
        ? { type: "face_graphic", id: selectedFaceGraphic.id, cornerIndex: selectedFaceGraphicPointIndex }
        : null;
  const selectedProjection = selection?.type === "projection" ? designer.projections.find((projection) => projection.id === selection.id) ?? null : null;
  const selectedProjectionResolution = selectedProjection ? resolveDesignerProjectionGeometry(designer, selectedProjection.id) : null;
  const selectedDerivedGeometry = selection?.type === "derived_geometry" ? designer.derivedGeometries.find((operation) => operation.id === selection.id) ?? null : null;
  const selectedDerivedGeometryResolution = selectedDerivedGeometry ? resolveDesignerDerivedGeometry(designer, selectedDerivedGeometry.id) : null;
  const selectedDerivedGeometryStatus = selectedDerivedGeometryResolution
    ? [
        selectedDerivedGeometryResolution.issue === "cycle" ? "Cycle"
          : selectedDerivedGeometryResolution.issue === "broken" ? "Broken source"
            : selectedDerivedGeometryResolution.issue === "collapsed" ? "Collapsed"
              : selectedDerivedGeometryResolution.issue === "invalid-topology" ? "Invalid topology"
                : "Live derived profile",
        ...selectedDerivedGeometryResolution.warnings
      ].join(" · ")
    : "Live derived profile";
  const selectedText = selection?.type === "text" ? designer.texts.find((entry) => entry.id === selection.id) ?? null : null;
  const selectedChannel = selection?.type === "channel" ? designer.channels.find((channel) => channel.id === selection.id) ?? null : selectedLightSource?.targetType === "channel" ? designer.channels.find((channel) => channel.id === selectedLightSource.targetId) ?? null : null;
  const selectedProjectionSourceChannel = selectedProjection ? designer.channels.find((channel) => channel.geometryId === selectedProjection.sourceGeometryId) ?? null : null;
  const selectedChannelPointIndex = selection?.type === "channel" ? selection.pointIndex : undefined;
  const selectedChannelPoint = selectedChannel && typeof selectedChannelPointIndex === "number" ? selectedChannel.points[selectedChannelPointIndex] : null;
  const selectedChannelNodeType = selectedChannelPoint?.nodeType ?? (selectedChannel?.pathMode === "bezier" ? "smooth" : "corner");
  const selectedChannelPointCanFillet = Boolean(selectedChannel && typeof selectedChannelPointIndex === "number"
    && (selectedChannel.closed || selectedChannelPointIndex > 0 && selectedChannelPointIndex < selectedChannel.points.length - 1)
    && (selectedChannelNodeType === "corner" || selectedChannelNodeType === "straight"));
  const selectedRoute = selection?.type === "route" ? designer.routes.find((route) => route.id === selection.id) ?? null : null;
  const selectedRouteLightingHostValue = selectedRoute?.lightingHost ? `${selectedRoute.lightingHost.type}:${selectedRoute.lightingHost.id}` : "auto";
  const selectedRouteLightingHostExists = !selectedRoute?.lightingHost || (selectedRoute.lightingHost.type === "zone"
    ? designer.zones.some((zone) => zone.id === selectedRoute.lightingHost?.id)
    : designer.channels.some((channel) => channel.id === selectedRoute.lightingHost?.id));
  const selectedRoutePointIndex = selection?.type === "route" ? selection.pointIndex : undefined;
  const selectedController = selection?.type === "controller" ? designer.controller : null;
  const selectedObjectLayerLocked = selection?.type === "artwork" || selection?.type === "build_area"
    ? designer.layers.artwork.locked
    : selection?.type === "zone" || selection?.type === "channel"
      ? designer.layers.zones.locked
      : selection?.type === "face_graphic"
        ? designer.layers.faceGraphic.locked || selectedFaceGraphic?.locked === true
      : selection?.type === "fabrication_path"
        ? designer.layers.fabrication.locked || selectedFabricationPath?.locked === true || designer.fabricationParts.find((part) => part.id === selectedFabricationPath?.partId)?.locked === true
      : selection?.type === "fabrication_part"
        ? designer.layers.fabrication.locked || selectedFabricationPart?.locked === true
      : selection?.type === "derived_geometry" && selectedDerivedGeometry
        ? designer.layers[selectedDerivedGeometry.targetLayer === "reference" ? "artwork" : selectedDerivedGeometry.targetLayer].locked
      : selection?.type === "text" && selectedText
        ? designer.layers[selectedText.targetLayer === "reference" ? "artwork" : selectedText.targetLayer].locked || selectedText.locked
      : selection?.type === "light_source"
        ? designer.layers.lightSources.locked
        : selection?.type === "route"
          ? designer.layers.strings.locked
          : selection?.type === "controller"
            ? designer.layers.hardware.locked
            : false;
  const selectedObjectSublayerLocked = selection?.type === "artwork"
    ? canvasDesigner.artwork.find((entry) => entry.id === selection.id)?.locked === true
    : selection?.type === "build_area"
      ? canvasDesigner.buildAreas.find((entry) => entry.id === selection.id)?.locked === true
      : selection?.type === "zone"
        ? canvasDesigner.zones.find((entry) => entry.id === selection.id)?.locked === true
        : selection?.type === "channel"
          ? canvasDesigner.channels.find((entry) => entry.id === selection.id)?.locked === true
          : selection?.type === "face_graphic"
            ? canvasDesigner.faceGraphics.find((entry) => entry.id === selection.id)?.locked === true
            : selection?.type === "route"
              ? canvasDesigner.routes.find((entry) => entry.id === selection.id)?.locked === true
              : false;
  const selectedObjectLocked = selectedObjectLayerLocked || selectedObjectSublayerLocked;
  const activeTargetCustomSublayer = activeLayerTarget?.sublayerId ? designer.sublayers.find((entry) => entry.id === activeLayerTarget.sublayerId) : null;
  const activeTargetSystemLocked = activeLayerTarget && ["artwork", "reference", "zones", "channels", "strings", "dataCables"].includes(activeLayerTarget.scope)
    ? designer.systemSublayers[activeLayerTarget.scope as DesignerSystemSublayerScope].locked
    : false;
  const activeTargetCategoryLocked = activeLayerTarget?.scope === "artwork" || activeLayerTarget?.scope === "reference" || activeLayerTarget?.scope === "workLines"
    ? designer.layers.artwork.locked
    : activeLayerTarget?.scope === "zones" || activeLayerTarget?.scope === "channels" || activeLayerTarget?.scope === "effectTargets"
      ? designer.layers.zones.locked
      : activeLayerTarget?.scope === "faceGraphic"
        ? designer.layers.faceGraphic.locked
        : activeLayerTarget?.scope === "strings" || activeLayerTarget?.scope === "dataCables"
          ? designer.layers.strings.locked
          : activeLayerTarget?.scope === "controller"
            ? designer.layers.hardware.locked
            : activeLayerTarget?.scope === "fabrication"
              ? designer.layers.fabrication.locked
              : false;
  const activeLayerTargetLocked = activeTargetCategoryLocked || activeTargetSystemLocked || activeTargetCustomSublayer?.locked === true;
  const selectedGeometryId = selectedBuildArea?.geometryId ?? selectedZone?.geometryId ?? selectedFaceGraphic?.geometryId ?? selectedFabricationPath?.geometryId ?? selectedProjection?.geometryId ?? selectedDerivedGeometry?.geometryId ?? selectedChannel?.geometryId;
  const directFilletAvailable = Boolean(selectedBuildArea || selectedZone || selectedFaceGraphic);
  const selectedNativeShape = selectedBuildArea ?? selectedZone ?? selectedFaceGraphic;
  const pathTrimAvailable = Boolean(
    selectedNativeShape?.shape === "polygon" && selectedNativeShape.points?.length
    || selection?.type === "channel" && selectedChannel?.points.length
  );
  const projectionSourceOptions = [
    ...designer.buildAreas.map((entry) => ({ geometryId: entry.geometryId, label: `Reference · ${entry.name}` })),
    ...designer.zones.map((entry) => ({ geometryId: entry.geometryId, label: `Zone · ${entry.name}` })),
    ...designer.faceGraphics.map((entry) => ({ geometryId: entry.geometryId, label: `Face Graphic · ${entry.name}` })),
    ...designer.fabricationPaths.map((entry) => ({ geometryId: entry.geometryId, label: `Fabrication · ${entry.name}` })),
    ...designer.channels.map((entry) => ({ geometryId: entry.geometryId, label: `Channel · ${entry.name}` })),
    ...designer.projections.map((entry) => ({ geometryId: entry.geometryId, label: `Projection · ${entry.name}` })),
    ...designer.derivedGeometries.map((entry) => ({ geometryId: entry.geometryId, label: `${entry.operation === "offset" ? "Offset" : "Fillet"} · ${entry.name}` }))
  ].filter((entry): entry is { geometryId: string; label: string } => Boolean(entry.geometryId));
  const selectedProfileKeys = geometrySelections.map(designerGeometrySelectionKey);
  const selectedGeometryKeys = [...selectedProfileKeys, ...marqueeChannelIds.map((id) => `channel:${id}`)];
  const hasMultipleGeometrySelection = geometrySelections.length >= 2;
  const activeSelectedRouteIds = selectedRouteIds.filter((id) => designer.routes.some((route) => route.id === id));
  const selectedLedStringIds = activeSelectedRouteIds.filter((id) => designer.routes.some((route) => route.id === id && route.kind === "led_string"));
  const selectedCanvasCount = geometrySelections.length + marqueeChannelIds.length + activeSelectedRouteIds.length;
  const hasMultipleCanvasSelection = selectedCanvasCount >= 2;
  const selectedGeometryKeySet = new Set(selectedProfileKeys);
  const selectedVectorGroup = designer.vectorGroups.find((group) => group.members.length === selectedGeometryKeySet.size
    && group.members.every((member) => selectedGeometryKeySet.has(designerGeometrySelectionKey(member)))) ?? null;
  const canGroupGeometrySelection = hasMultipleGeometrySelection && geometrySelections.every(isDesignerVectorGroupMember);
  const selectedOpticalTarget = selectedZone ? { type: "zone" as const, id: selectedZone.id } : selectedChannel ? { type: "channel" as const, id: selectedChannel.id } : null;
  const selectedOpticalTargets = (opticalTargetSelection.length ? opticalTargetSelection : selectedOpticalTarget ? [selectedOpticalTarget] : [])
    .filter((target) => target.type === "zone" ? designer.zones.some((zone) => zone.id === target.id) : designer.channels.some((channel) => channel.id === target.id));
  const selectedOpticalTargetEntries = selectedOpticalTargets.map((target) => ({
    ...target,
    name: target.type === "zone"
      ? designer.zones.find((zone) => zone.id === target.id)?.name ?? target.id
      : designer.channels.find((channel) => channel.id === target.id)?.name ?? target.id,
    treatments: designer.lightSources.filter((source) => source.targetType === target.type && source.targetId === target.id)
  }));
  const selectedOpticalTreatments = selectedOpticalTarget
    ? designer.lightSources.filter((treatment) => treatment.targetType === selectedOpticalTarget.type && treatment.targetId === selectedOpticalTarget.id)
    : [];
  const animationOpticalTreatments = clipLightSourcesForTarget(designer.lightSources, selectedOpticalTarget, selectedAnimationClipTargetId);
  const selectedAnimationLightSource = animationOpticalTreatments.length === 1 && animationOpticalTreatments[0].id === selectedAnimationClipTargetId
    ? animationOpticalTreatments[0]
    : null;
  const selectedAnimationGlobalMode = selectedAnimationClipTargetId ? designerGlobalLightSourceMode(selectedAnimationClipTargetId) : null;
  const selectedAnimationGroupTarget = selectedAnimationClipTargetId ? parseDesignerGroupLightTargetId(selectedAnimationClipTargetId) : null;
  const selectedAnimationTargetsFullSign = selectedAnimationClipTargetId === "full_sign";
  const animationOpticalTargetEntries = selectedOpticalTargetEntries.map((entry) => ({
    ...entry,
    treatments: selectedAnimationGlobalMode
      ? entry.treatments.filter((source) => source.mode === selectedAnimationGlobalMode)
      : selectedAnimationGroupTarget
        ? entry.treatments.filter((source) => designerOpticalModeSide(source.mode) === selectedAnimationGroupTarget.side)
        : entry.treatments
  }));
  const selectedAnimationTargetIds = useMemo(
    () => designerClipTargetIdsForSelection(designer, selection),
    [designer, selection]
  );
  const routeSummaries = designer.routes.map((route) => summarizeRoute(route, designer));
  const routeOutputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const stringConnectionPlan = selectedStringConnectionPlan(designer, selectedLedStringIds);
  const channelGenerationPreview = tool === "channel_bezier" && geometrySelections.length
    ? channelPathsFromGeometries(selectedChannelSourceGeometries(), channelPathAlignment, designer.channelRouterDiameterMm, channelPathOffsetMm).paths.map((path, index): DesignerChannelForm => ({
      id: `channel_generation_preview_${index}`,
      name: "Channel preview",
      points: path.points,
      pathMode: path.pathMode,
      widthMm: channelWidthForRouterDiameter(designer.channelRouterDiameterMm),
      closed: path.closed,
      cap: "round",
      fabricationSurface: channelCreationSurface,
      visible: true,
      locked: true,
      opacity: 0.65
    }))
    : [];
  const totalGeneratedPixels = routeSummaries.reduce((total, route) => total + route.pixels, 0);
  const stripConsistencyNotice = (() => {
    const strip = ledStripPreviewDesigner.stripConfiguration;
    if (!strip || strip.construction !== "discrete") return null;
    const ledsPerPixel = strip.physicalLedsPerAddressablePixel;
    const ledsPerCut = strip.physicalLedsPerCutSegment;
    if (ledsPerPixel !== undefined) {
      const impliedLedsPerMeter = ledStripPreviewDesigner.addressablePixelsPerMeter * ledsPerPixel;
      if (Math.abs(impliedLedsPerMeter - ledStripPreviewDesigner.ledsPerMeter) > Math.max(0.1, ledStripPreviewDesigner.ledsPerMeter * 0.02)) {
        return `Review specification: ${formatDecimal(ledStripPreviewDesigner.addressablePixelsPerMeter)} pixels/m × ${formatDecimal(ledsPerPixel)} LEDs/pixel implies ${formatDecimal(impliedLedsPerMeter)} LEDs/m.`;
      }
    }
    if (ledsPerPixel !== undefined && ledsPerCut !== undefined) {
      const pixelsPerCut = ledsPerCut / ledsPerPixel;
      if (Math.abs(pixelsPerCut - Math.round(pixelsPerCut)) > 0.02) {
        return `Review specification: ${formatDecimal(ledsPerCut)} LEDs/cut does not contain a whole number of ${formatDecimal(ledsPerPixel)}-LED pixels.`;
      }
    }
    return null;
  })();
  const activeViewport = viewport ?? { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };
  const activeGeometryToolPolicy = geometryToolPolicy(tool);
  const nodeCreationToolActive = activeGeometryToolPolicy?.construction === "path" && tool !== "work_line";
  const compileIsCurrent = Boolean(document.compiledLayout && document.compiledDesignerSignature === designerCompileSignature(designer));
  const compileErrors = document.compiledLayout?.validation.errors ?? [];
  const compileWarnings = document.compiledLayout?.validation.warnings ?? [];
  const compileIssueDetails = document.compiledLayout?.validation.issues ?? [
    ...compileErrors.map((message, index) => ({ id: `legacy-error:${index}`, severity: "error" as const, message, targets: [] })),
    ...compileWarnings.map((message, index) => ({ id: `legacy-warning:${index}`, severity: "warning" as const, message, targets: [] }))
  ];
  const compileErrorDetails = compileIssueDetails.filter((issue) => issue.severity === "error");
  const compileWarningDetails = compileIssueDetails.filter((issue) => issue.severity === "warning");
  const compileIssueCount = compileErrors.length + compileWarnings.length;
  const canAnimate = compileIsCurrent && compileErrors.length === 0;
  const compileControlLabel = compiling
    ? "Compiling…"
    : !compileIsCurrent
    ? "Compile required"
    : canAnimate
      ? "Compiled · Animate ready"
      : "Compiled · Animate blocked";
  const currentDocumentSignature = useMemo(() => persistedDocumentSignature(document), [document]);
  const hasUnsavedChanges = currentDocumentSignature !== savedDocumentSignatureRef.current;

  useEffect(() => {
    if (viewport) return;
    setViewport(fitViewportToDesigner(designer));
  }, [designer.canvasHeightCm, designer.canvasWidthCm, viewport]);

  useEffect(() => {
    if (!nodeCreationToolActive) return;
    setNodeCreationType(activeGeometryToolPolicy?.mode === "bezier" ? "smooth" : "corner");
    setSelection(null);
    setSelectedRouteIds([]);
    // Channel can consume profiles selected immediately before the tool is
    // activated. Other path tools still begin with an empty operand set.
    if (tool !== "channel_bezier") setGeometrySelections([]);
  }, [nodeCreationToolActive, tool]);

  useEffect(() => {
    let cancelled = false;
    async function loadProjectAssets() {
      if (!document.projectId) return;
      const response = await fetch(`/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets`, { cache: "no-store" });
      const payload = (await response.json()) as { records?: ProjectAsset[] };
      if (!cancelled) setProjectAssets(payload.records ?? []);
    }
    void loadProjectAssets();
    return () => {
      cancelled = true;
    };
  }, [document.projectId, assetsVersion]);

  useEffect(() => {
    let cancelled = false;
    async function loadLedStripProfiles() {
      const response = await fetch("/api/lighting/led-strip-profiles", { cache: "no-store" });
      const payload = (await response.json()) as { records?: LedStripCatalogProfile[] };
      if (!cancelled && response.ok) {
        setLedStripProfiles(payload.records ?? []);
        setSelectedLedStripProfileId((current) => current || payload.records?.[0]?.id || "");
      }
    }
    void loadLedStripProfiles();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadEffects() {
      const response = await fetch("/api/lighting/effects", { cache: "no-store" });
      const payload = (await response.json()) as { effects?: EffectCatalog };
      if (!cancelled) setEffectCatalog(payload.effects ?? {});
    }
    void loadEffects();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const key = event.key.toLowerCase();
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redoDesignerChange();
        else undoDesignerChange();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        redoDesignerChange();
        return;
      }
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      historyInteractionIdRef.current += 1;
      if (event.key === "Escape" && (tool === "move" || tool === "path_trim" || tool === "fillet")) {
        setTool("select");
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelection();
      }
      if (event.key.toLowerCase() === "v") setTool("select");
      if (!modifier && event.key.toLowerCase() === "m") setTool("move");
      if (event.key.toLowerCase() === "h") setTool("pan");
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "zones" && event.key.toLowerCase() === "r") { ensureActiveLayerTargetVisible(); setTool("zone_rect"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "zones" && event.key.toLowerCase() === "e") { ensureActiveLayerTargetVisible(); setTool("zone_ellipse"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "zones" && event.key.toLowerCase() === "p") { ensureActiveLayerTargetVisible(); setTool("zone_polygon"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "channels" && event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey) { ensureActiveLayerTargetVisible(); setTool("channel_bezier"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "faceGraphic" && event.key.toLowerCase() === "r") { ensureActiveLayerTargetVisible(); setTool("face_graphic_rect"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "faceGraphic" && event.key.toLowerCase() === "e") { ensureActiveLayerTargetVisible(); setTool("face_graphic_ellipse"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "faceGraphic" && event.key.toLowerCase() === "p") { ensureActiveLayerTargetVisible(); setTool("face_graphic_polygon"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "faceGraphic" && event.key.toLowerCase() === "b") { ensureActiveLayerTargetVisible(); setTool("face_graphic_bezier"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "artwork" && event.key.toLowerCase() === "i") { ensureActiveLayerTargetVisible(); setTool("image_place"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "reference" && event.key.toLowerCase() === "p") { ensureActiveLayerTargetVisible(); setTool("build_area_polygon"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "reference" && event.key.toLowerCase() === "b") { ensureActiveLayerTargetVisible(); setTool("build_area_bezier"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "strings" && event.key.toLowerCase() === "l") { ensureActiveLayerTargetVisible(); setTool("led_string"); }
      if (!activeLayerTargetLocked && activeLayerTarget?.scope === "dataCables" && event.key.toLowerCase() === "d") { ensureActiveLayerTargetVisible(); setTool("data_cable"); }
      if (!activeLayerTargetLocked && (activeLayerTarget?.scope === "strings" || activeLayerTarget?.scope === "dataCables") && event.key.toLowerCase() === "x") setTool("cut");
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  function replaceDocument(nextDocument: PartituraDocument) {
    documentRef.current = nextDocument;
    setDocument(nextDocument);
  }

  function recordDesignerHistory(currentDocument: PartituraDocument) {
    const interactionId = historyInteractionIdRef.current;
    if (historyRecordedInteractionRef.current === interactionId) return;
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(currentDocument), selection }
    ];
    redoHistoryRef.current = [];
    historyRecordedInteractionRef.current = interactionId;
    setHistoryRevision((revision) => revision + 1);
  }

  function restoreDesignerHistory(entry: DesignerHistoryEntry, notice: "Undo" | "Redo") {
    const restoredDocument = clonePartituraDocument(entry.document);
    replaceDocument(restoredDocument);
    setSelection(entry.selection);
    discardRuntimeArtifacts();
    historyInteractionIdRef.current += 1;
    historyRecordedInteractionRef.current = null;
    setFabricationNotice(notice);
    setHistoryRevision((revision) => revision + 1);
  }

  function undoDesignerChange() {
    const entry = undoHistoryRef.current.at(-1);
    if (!entry) return;
    undoHistoryRef.current = undoHistoryRef.current.slice(0, -1);
    redoHistoryRef.current = [
      ...redoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(documentRef.current), selection }
    ];
    restoreDesignerHistory(entry, "Undo");
  }

  function redoDesignerChange() {
    const entry = redoHistoryRef.current.at(-1);
    if (!entry) return;
    redoHistoryRef.current = redoHistoryRef.current.slice(0, -1);
    undoHistoryRef.current = [
      ...undoHistoryRef.current.slice(-(DESIGNER_HISTORY_LIMIT - 1)),
      { document: clonePartituraDocument(documentRef.current), selection }
    ];
    restoreDesignerHistory(entry, "Redo");
  }

  function discardRuntimeArtifacts() {
    cancelScheduledAnimationPreview();
    animationGenerationAbortRef.current?.abort();
    animationGenerationAbortRef.current = null;
    animationGenerationIdRef.current += 1;
    animationResultRef.current = null;
    generatedPartituraStaleRef.current = true;
    setAnimationResult(null);
    setAnimationPlaying(false);
    setPartitura((current) => (
      current.generatedPartitura === undefined ? current : { ...current, generatedPartitura: undefined }
    ));
  }

  function updateLiveDocument(updater: (current: PartituraDocument) => PartituraDocument, options: { invalidateRuntime?: boolean; recordHistory?: boolean } = {}) {
    const nextDocument = updater(documentRef.current);
    if (nextDocument === documentRef.current) return nextDocument;
    if (options.recordHistory !== false) recordDesignerHistory(documentRef.current);
    documentRef.current = nextDocument;
    setDocument(nextDocument);
    if (options.invalidateRuntime) discardRuntimeArtifacts();
    return nextDocument;
  }

  async function save(nextDocument?: PartituraDocument) {
    const normalizedDocument = normalizeDefaultSignLayout(nextDocument ?? documentRef.current);
    const clearGeneratedPartitura = generatedPartituraStaleRef.current;
    setSaving(true);
    try {
      const request = await compressedJsonRequest({
        name: partitura.name,
        status: partitura.status,
        document: normalizedDocument,
        clearGeneratedPartitura
      });
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: request.headers,
        body: request.body
      });
      const payload = (await response.json()) as { saved?: Pick<PersistedPartitura, "id" | "name" | "status" | "updatedAt"> & { generatedPartituraCleared: boolean } };
      if (!response.ok || !payload.saved) {
        setFabricationNotice("Unable to save the partitura.");
        return false;
      }
      generatedPartituraStaleRef.current = false;
      setPartitura((current) => ({
        ...current,
        name: payload.saved!.name,
        status: payload.saved!.status,
        updatedAt: payload.saved!.updatedAt,
        ...(payload.saved!.generatedPartituraCleared ? { generatedPartitura: undefined, validationReport: undefined } : {})
      }));
      savedDocumentSignatureRef.current = persistedDocumentSignature(normalizedDocument);
      replaceDocument(normalizedDocument);
      return true;
    } catch {
      setFabricationNotice("Unable to save the partitura.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function loadFabricationFonts(options: FabricationExportOptions) {
    const enabled = (targetLayer: DesignerProjectionLayer) => targetLayer === "reference" ? options.includeReference : targetLayer === "zones" ? options.includeZones : options.includeFaceGraphic;
    const fontIds = Array.from(new Set(designer.texts.filter((text) => enabled(text.targetLayer)).map((text) => text.fontId)));
    const entries = await Promise.all(fontIds.map(async (fontId) => {
      const resource = designerFontResource(fontId);
      if (!resource) return null;
      try {
        const response = await fetch(designerFontUrl(fontId));
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data))).map((value) => value.toString(16).padStart(2, "0")).join("");
        return `sha256:${digest}` === resource.hash ? [fontId, data] as const : null;
      } catch {
        return null;
      }
    }));
    return new Map(entries.filter((entry): entry is readonly [string, ArrayBuffer] => Boolean(entry)));
  }

  async function exportFabrication(format: FabricationExportFormat) {
    setFabricationExporting(true);
    try {
      const { generateDesignerFabricationExport } = await import("./designer/fabrication/designer-fabrication-export");
      const fontDataById = await loadFabricationFonts(fabricationExportOptions);
      const result = await generateDesignerFabricationExport({
        designer,
        identity: { projectId: partitura.projectId, partituraId: partitura.id, partituraKey: partitura.partituraKey, partituraName: partitura.name },
        sourceDocument: document,
        fontDataById,
        options: fabricationExportOptions
      });
      setFabricationExportResult(result);
      const errorCount = result.issues.filter((issue) => issue.severity === "error").length;
      const warningCount = result.issues.filter((issue) => issue.severity === "warning").length;
      if (errorCount) {
        setFabricationNotice(`Export blocked · ${errorCount} error${errorCount === 1 ? "" : "s"}`);
        return;
      }
      const baseName = partitura.partituraKey.replace(/[^A-Za-z0-9_-]+/g, "_");
      result.files.forEach((file) => {
        const content = format === "svg" ? file.svg : file.dxf;
        const blob = new Blob([content], { type: format === "svg" ? "image/svg+xml;charset=utf-8" : "application/dxf;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = window.document.createElement("a");
        anchor.href = url;
        anchor.download = file.downloadBaseName
          ? `${file.downloadBaseName}.${format}`
          : `${baseName}-fabrication-${file.fileSuffix}.${format}`;
        anchor.hidden = true;
        window.document.body.appendChild(anchor);
        try {
          anchor.click();
        } finally {
          anchor.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
        }
      });
      setFabricationNotice(`${result.files.length} ${format.toUpperCase()} file${result.files.length === 1 ? "" : "s"} downloaded · ${result.pathCount} paths${warningCount ? ` · ${warningCount} warnings` : ""}`);
    } catch (error) {
      setFabricationNotice(error instanceof Error ? `Export failed · ${error.message}` : "Export failed unexpectedly.");
    } finally {
      setFabricationExporting(false);
    }
  }

  function commitCanonicalDesigner(canonical: DesignerForm, options: { recordHistory?: boolean } = {}) {
    const invalidatesRuntime = designerCompileSignature(designer) !== designerCompileSignature(canonical);
    updateLiveDocument((current) => ({ ...current, designer: canonical }), { invalidateRuntime: invalidatesRuntime, recordHistory: options.recordHistory });
  }

  function objectIdsForSublayerScope(source: DesignerForm, scope: DesignerSublayerScope) {
    if (scope === "artwork") return source.artwork.map((entry) => entry.id);
    if (scope === "reference") return source.buildAreas.map((entry) => entry.id);
    if (scope === "zones") return source.zones.map((entry) => entry.id);
    if (scope === "channels") return source.channels.map((entry) => entry.id);
    if (scope === "faceGraphic") return source.faceGraphics.map((entry) => entry.id);
    return source.routes.filter((entry) => entry.kind === (scope === "strings" ? "led_string" : "data_cable")).map((entry) => entry.id);
  }

  function updateDesigner(nextDesigner: DesignerForm, options: { recordHistory?: boolean } = {}) {
    let organizedDesigner = nextDesigner;
    const targetScope = activeLayerTarget?.scope;
    const targetSublayerId = activeLayerTarget?.sublayerId;
    if (targetSublayerId && targetScope && ["artwork", "reference", "zones", "channels", "faceGraphic", "strings", "dataCables"].includes(targetScope)) {
      const scope = targetScope as DesignerSublayerScope;
      const target = designer.sublayers.find((entry) => entry.id === targetSublayerId && entry.scope === scope && !entry.locked);
      if (target) {
        const previousIds = new Set(objectIdsForSublayerScope(designer, scope));
        const addedIds = objectIdsForSublayerScope(nextDesigner, scope).filter((id) => !previousIds.has(id));
        if (addedIds.length) {
          organizedDesigner = {
            ...nextDesigner,
            sublayers: assignDesignerObjectsToSublayer(nextDesigner.sublayers, scope, addedIds, target.id)
          };
        }
      }
    }
    commitCanonicalDesigner(canonicalizeDesignerGeometry(addDefaultLightSourcesForNewTargets(designer, organizedDesigner)), options);
  }

  function patchDesigner(patch: Partial<DesignerForm>) {
    updateDesigner({ ...designer, ...patch });
  }

  function previewSelectedLedStripProfile(profileId: string) {
    setSelectedLedStripProfileId(profileId);
    if (!profileId) {
      setLedStripSetupDraft(ledStripSetupDraftFromDesigner(designer));
      return;
    }
    const profile = ledStripProfiles.find((entry) => entry.id === profileId);
    if (!profile) return;
    const { id, profileKey: _profileKey, revision, clientId: _clientId, sourceUrl: _sourceUrl, ...configuration } = profile;
    const stripConfiguration: DesignerLedStripConfiguration = {
      ...configuration,
      sourceProfileId: id,
      sourceProfileRevision: revision
    };
    setLedStripSetupDraft({
      stripConfiguration,
      addressablePixelsPerMeter: configuration.addressablePixelsPerMeter,
      ledsPerMeter: configuration.physicalLedsPerMeter ?? configuration.addressablePixelsPerMeter,
      ledPackageSizeMm: configuration.ledPackageSizeMm ?? designer.ledPackageSizeMm,
      ledPcbWidthMm: configuration.pcbWidthMm
    });
  }

  function patchCustomLedStripConfiguration(patch: Partial<DesignerLedStripConfiguration>) {
    setSelectedLedStripProfileId("");
    setLedStripSetupDraft((currentDraft) => {
      const current = currentDraft ?? ledStripSetupDraftFromDesigner(designer);
      const next = {
        ...current.stripConfiguration,
        ...patch,
        name: "Custom LED strip",
        sourceProfileId: undefined,
        sourceProfileRevision: undefined
      };
      return {
        stripConfiguration: next,
        addressablePixelsPerMeter: next.addressablePixelsPerMeter,
        ledsPerMeter: next.physicalLedsPerMeter ?? current.ledsPerMeter,
        ledPackageSizeMm: next.ledPackageSizeMm ?? current.ledPackageSizeMm,
        ledPcbWidthMm: next.pcbWidthMm
      };
    });
  }

  function applyLedStripSetupDraft() {
    if (!ledStripSetupDraft) return;
    patchDesigner({
      stripConfiguration: ledStripSetupDraft.stripConfiguration,
      addressablePixelsPerMeter: ledStripSetupDraft.addressablePixelsPerMeter,
      ledsPerMeter: ledStripSetupDraft.ledsPerMeter,
      ledDensityPerMeter: ledStripSetupDraft.addressablePixelsPerMeter,
      ledPackageSizeMm: ledStripSetupDraft.ledPackageSizeMm,
      ledPcbWidthMm: ledStripSetupDraft.ledPcbWidthMm
    });
    setFabricationNotice(`${ledStripSetupDraft.stripConfiguration.name} applied to this partitura.`);
    setLedStripSetupDraft(null);
    if (setupDetailsRef.current) setupDetailsRef.current.open = false;
  }

  function cancelLedStripSetupDraft() {
    setLedStripSetupDraft(null);
    setSelectedLedStripProfileId(designer.stripConfiguration?.sourceProfileId ?? "");
    if (setupDetailsRef.current) setupDetailsRef.current.open = false;
  }

  function updateDesignerFromCanvas(nextDesigner: DesignerForm, options: { recordHistory?: boolean } = {}) {
    const authoredDesigner = restoreDesignerSublayerAuthoredState(designer, nextDesigner);
    updateDesigner(ledStripSetupDraft ? {
      ...authoredDesigner,
      stripConfiguration: designer.stripConfiguration,
      addressablePixelsPerMeter: designer.addressablePixelsPerMeter,
      ledsPerMeter: designer.ledsPerMeter,
      ledDensityPerMeter: designer.ledDensityPerMeter,
      ledPackageSizeMm: designer.ledPackageSizeMm,
      ledPcbWidthMm: designer.ledPcbWidthMm
    } : authoredDesigner, options);
  }

  function patchWorkLine(workLineId: string, patch: Partial<Pick<DesignerWorkLineForm, "name" | "layer" | "points">>) {
    updateDesigner({
      ...designer,
      workLines: designer.workLines.map((line) => line.id === workLineId ? { ...line, ...patch } : line)
    });
  }

  function patchWorkLinePoint(workLineId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const line = designer.workLines.find((entry) => entry.id === workLineId);
    if (!line?.points[pointIndex]) return;
    patchWorkLine(workLineId, {
      points: line.points.map((point, index) => index === pointIndex ? { ...point, ...patch } : point)
    });
  }

  function deleteWorkLinePoint(workLineId: string, pointIndex: number) {
    const line = designer.workLines.find((entry) => entry.id === workLineId);
    if (!line || line.points.length <= 2) return;
    patchWorkLine(workLineId, { points: line.points.filter((_, index) => index !== pointIndex) });
    setSelection({ type: "work_line", id: workLineId });
  }

  function generateWorkLineHoles() {
    if (designer.layers.faceGraphic.locked) {
      setFabricationNotice("Generate Holes blocked: unlock Face Graphic first.");
      return;
    }
    const intersections = workLineIntersectionPoints(designer.workLines);
    if (!intersections.length) {
      setFabricationNotice("Generate Holes found no intersections between Work Lines.");
      return;
    }
    const pendingIntersections = missingWorkLineHolePoints(intersections, designer.faceGraphics);
    if (!pendingIntersections.length) {
      setFabricationNotice("Generate Holes: every Work Line intersection already has a hole.");
      return;
    }
    const diameterCm = designer.holeDiameterMm / 10;
    const radiusCm = diameterCm / 2;
    const firstNumber = nextDesignerItemNumber(designer.faceGraphics, "work_line_hole_");
    const holes = pendingIntersections.map((point, index): DesignerFaceGraphicForm => {
      const number = firstNumber + index;
      return {
        id: `work_line_hole_${number}`,
        name: `Hole ${number}`,
        shape: "ellipse",
        x: point.x - radiusCm,
        y: point.y - radiusCm,
        width: diameterCm,
        height: diameterCm,
        passMode: "clear",
        filterColor: "#FFFFFF",
        visible: true,
        locked: false,
        opacity: 1
      };
    });
    updateDesigner({
      ...designer,
      layers: {
        ...designer.layers,
        faceGraphic: { ...designer.layers.faceGraphic, visible: true }
      },
      faceGraphics: [...designer.faceGraphics, ...holes]
    });
    setFabricationNotice(`${holes.length} hole${holes.length === 1 ? "" : "s"} generated directly in Face Graphic at ${designer.holeDiameterMm} mm diameter.`);
  }

  function patchDesignerLayer(layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) {
    patchDesignerLayers([layer], patch);
  }

  function setArtworkVisibility(visible: boolean) {
    updateDesigner({
      ...designer,
      layers: {
        ...designer.layers,
        artwork: { ...designer.layers.artwork, visible },
        reference: { ...designer.layers.reference, visible }
      }
    });
  }

  function setArtworkFolderVisibility(_folder: "workLines", visible: boolean) {
    patchDesigner({ workLinesVisible: visible });
  }

  function patchDesignerLayers(layers: Array<keyof DesignerLayersForm>, patch: Partial<DesignerLayerSettings>) {
    const nextLayers = { ...designer.layers };
    layers.forEach((layer) => {
      nextLayers[layer] = { ...nextLayers[layer], ...patch };
    });
    updateDesigner({
      ...designer,
      layers: nextLayers
    });
  }

  function ensureLayerVisible(layer: keyof DesignerLayersForm) {
    if (designer.layers[layer].visible) return;
    updateDesigner({
      ...designer,
      layers: { ...designer.layers, [layer]: { ...designer.layers[layer], visible: true } }
    });
  }

  function ensureActiveLayerTargetVisible() {
    if (!activeLayerTarget) return;
    const layer: keyof DesignerLayersForm = activeLayerTarget.scope === "artwork" || activeLayerTarget.scope === "reference" || activeLayerTarget.scope === "workLines"
      ? "artwork"
      : activeLayerTarget.scope === "zones" || activeLayerTarget.scope === "channels" || activeLayerTarget.scope === "effectTargets"
        ? "zones"
        : activeLayerTarget.scope === "faceGraphic"
          ? "faceGraphic"
          : activeLayerTarget.scope === "fabrication"
            ? "fabrication"
            : activeLayerTarget.scope === "controller"
              ? "hardware"
              : "strings";
    const systemScope = ["artwork", "reference", "zones", "channels", "strings", "dataCables"].includes(activeLayerTarget.scope)
      ? activeLayerTarget.scope as DesignerSystemSublayerScope
      : null;
    if (designer.layers[layer].visible && (!systemScope || designer.systemSublayers[systemScope].visible)) return;
    updateDesigner({
      ...designer,
      layers: { ...designer.layers, [layer]: { ...designer.layers[layer], visible: true } },
      systemSublayers: systemScope
        ? { ...designer.systemSublayers, [systemScope]: { ...designer.systemSublayers[systemScope], visible: true } }
        : designer.systemSublayers
    });
  }

  function reorderDesignerItems(layer: "artwork" | "reference" | "zones" | "channels" | "faceGraphic" | "strings", activeId: string, overId: string) {
    if (layer === "artwork") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, artwork: reorderById(designer.artwork, activeId, overId) });
      setSelection({ type: "artwork", id: activeId });
      return;
    }
    if (layer === "reference") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, buildAreas: reorderById(designer.buildAreas, activeId, overId) });
      setSelection({ type: "build_area", id: activeId });
      return;
    }
    if (layer === "zones") {
      if (designer.layers.zones.locked) return;
      updateDesigner({ ...designer, zones: reorderById(designer.zones, activeId, overId) });
      setSelection({ type: "zone", id: activeId });
      return;
    }
    if (layer === "channels") {
      if (designer.layers.zones.locked) return;
      updateDesigner({ ...designer, channels: reorderById(designer.channels, activeId, overId) });
      setSelection({ type: "channel", id: activeId });
      return;
    }
    if (layer === "faceGraphic") {
      if (designer.layers.faceGraphic.locked) return;
      updateDesigner({ ...designer, faceGraphics: reorderById(designer.faceGraphics, activeId, overId) });
      setSelection({ type: "face_graphic", id: activeId });
      return;
    }
    if (designer.layers.strings.locked) return;
    const activeRoute = designer.routes.find((route) => route.id === activeId);
    const overRoute = designer.routes.find((route) => route.id === overId);
    if (!activeRoute || !overRoute || activeRoute.kind !== overRoute.kind) return;
    updateDesigner({ ...designer, routes: reorderRoutesWithinKind(designer.routes, activeId, overId) });
    setSelection({ type: "route", id: activeId });
  }

  function addDesignerSublayer(scope: DesignerSublayerScope, objectIds: string[] = []) {
    const sublayer = nextDesignerSublayer(designer, scope, objectIds);
    updateDesigner({
      ...designer,
      sublayers: [
        ...assignDesignerObjectsToSublayer(designer.sublayers, scope, objectIds, null),
        sublayer
      ]
    });
    setActiveLayerTarget({ scope, sublayerId: sublayer.id });
    return sublayer.id;
  }

  function patchDesignerSublayer(sublayerId: string, patch: Partial<Pick<DesignerSublayerForm, "name" | "visible" | "locked">>) {
    updateDesigner({
      ...designer,
      sublayers: designer.sublayers.map((entry) => entry.id === sublayerId ? { ...entry, ...patch } : entry)
    });
  }

  function patchDesignerSystemSublayer(scope: DesignerSystemSublayerScope, patch: Partial<{ visible: boolean; locked: boolean }>) {
    updateDesigner({
      ...designer,
      systemSublayers: {
        ...designer.systemSublayers,
        [scope]: { ...designer.systemSublayers[scope], ...patch }
      }
    });
  }

  function deleteDesignerSublayer(sublayerId: string) {
    const removed = designer.sublayers.find((entry) => entry.id === sublayerId);
    updateDesigner({ ...designer, sublayers: removeDesignerSublayer(designer.sublayers, sublayerId) });
    if (removed && activeLayerTarget?.sublayerId === sublayerId) setActiveLayerTarget({ scope: removed.scope, sublayerId: null });
  }

  function assignObjectsToDesignerSublayer(scope: DesignerSublayerScope, objectIds: string[], sublayerId: string | null, beforeObjectId?: string) {
    const nextDesigner = {
      ...designer,
      sublayers: assignDesignerObjectsToSublayer(designer.sublayers, scope, objectIds, sublayerId)
    };
    if (beforeObjectId) {
      if (scope === "artwork") nextDesigner.artwork = moveDesignerItemsBefore(designer.artwork, objectIds, beforeObjectId);
      else if (scope === "reference") nextDesigner.buildAreas = moveDesignerItemsBefore(designer.buildAreas, objectIds, beforeObjectId);
      else if (scope === "zones") nextDesigner.zones = moveDesignerItemsBefore(designer.zones, objectIds, beforeObjectId);
      else if (scope === "channels") nextDesigner.channels = moveDesignerItemsBefore(designer.channels, objectIds, beforeObjectId);
      else if (scope === "faceGraphic") nextDesigner.faceGraphics = moveDesignerItemsBefore(designer.faceGraphics, objectIds, beforeObjectId);
      else nextDesigner.routes = moveDesignerItemsBefore(designer.routes, objectIds, beforeObjectId);
    }
    updateDesigner(nextDesigner);
  }

  function addArtwork(point?: DesignerPoint) {
    if (designer.layers.artwork.locked) {
      setFabricationNotice("Artwork layer is locked. Unlock it to add images.");
      setTool("select");
      return;
    }
    const next = designer.artwork.length + 1;
    const width = Math.max(12, Math.round(activeViewport.width * 0.3));
    const height = Math.max(8, Math.round(activeViewport.height * 0.3));
    const centerX = point?.x ?? activeViewport.x + activeViewport.width / 2;
    const centerY = point?.y ?? activeViewport.y + activeViewport.height / 2;
    const artwork: DesignerArtworkForm = {
      id: `artwork_${Date.now()}`,
      assetId: "",
      name: `Image ${next}`,
      x: snapValue(centerX - width / 2, interactionSnapCm),
      y: snapValue(centerY - height / 2, interactionSnapCm),
      width,
      height,
      visible: true,
      locked: false,
      opacity: 0.85
    };
    updateDesigner({
      ...designer,
      layers: { ...designer.layers, artwork: { ...designer.layers.artwork, visible: true } },
      artwork: [...designer.artwork, artwork]
    });
    setActiveLayer("artwork");
    setSelection({ type: "artwork", id: artwork.id });
    setTool("select");
    setFabricationNotice("Image container added. Pick its image in the panel.");
  }

  function placeImageAt(point: DesignerPoint) {
    addArtwork(point);
  }

  async function uploadArtwork(file: File) {
    if (!document.projectId) return;
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/upload`, { method: "POST", body: form });
      if (!response.ok) {
        setFabricationNotice("Image upload failed.");
        return;
      }
      setFabricationNotice(`Uploaded ${file.name}. Pick it in Images and place it.`);
      setAssetsVersion((version) => version + 1);
    } catch {
      setFabricationNotice("Image upload failed.");
    }
  }

  function patchArtwork(artworkId: string, patch: Partial<DesignerArtworkForm>) {
    const touchesGeometry = patch.x !== undefined || patch.y !== undefined || patch.width !== undefined || patch.height !== undefined;
    if (designer.layers.artwork.locked && touchesGeometry) return;
    if (patch.assetId) {
      void assignArtworkSourceAtIntrinsicSize(artworkId, patch.assetId);
      return;
    }
    updateDesigner({ ...designer, artwork: designer.artwork.map((entry) => (entry.id === artworkId ? { ...entry, ...patch } : entry)) });
  }

  async function assignArtworkSourceAtIntrinsicSize(artworkId: string, assetId: string) {
    const asset = projectAssets.find((entry) => entry.id === assetId);
    if (!asset || !document.projectId) {
      setFabricationNotice("Artwork source is unavailable.");
      return;
    }
    setFabricationNotice(`Reading native size · ${asset.fileName}`);
    try {
      const response = await fetch(`${artworkUrls[assetId]}?inspect=size`, { cache: "no-store" });
      const payload = await response.json() as ArtworkIntrinsicSize | { message?: string };
      if (!response.ok || !("widthCm" in payload) || !("heightCm" in payload)) {
        throw new Error("message" in payload ? payload.message ?? "Artwork size could not be determined." : "Artwork size could not be determined.");
      }
      const currentDesigner = documentRef.current.designer;
      if (!currentDesigner || currentDesigner.layers.artwork.locked || !currentDesigner.artwork.some((entry) => entry.id === artworkId)) return;
      const nextDesigner = canonicalizeDesignerGeometry({
        ...currentDesigner,
        artwork: currentDesigner.artwork.map((entry) => entry.id === artworkId ? {
          ...entry,
          assetId,
          width: payload.widthCm,
          height: payload.heightCm
        } : entry)
      });
      const invalidatesRuntime = designerCompileSignature(currentDesigner) !== designerCompileSignature(nextDesigner);
      updateLiveDocument((current) => ({ ...current, designer: nextDesigner }), { invalidateRuntime: invalidatesRuntime });
      const basis = payload.basis === "css-pixels-96dpi" ? " · 96 dpi (no physical density in file)" : "";
      setFabricationNotice(`Native size applied · ${formatDecimal(payload.widthCm)} × ${formatDecimal(payload.heightCm)} cm${basis}`);
    } catch (error) {
      setFabricationNotice(error instanceof Error ? `Image not assigned · ${error.message}` : "Image not assigned · native size could not be determined.");
    }
  }

  async function createZonesFromArtworkSvg(artworkId: string) {
    const currentDesigner = documentRef.current.designer;
    const artwork = currentDesigner?.artwork.find((entry) => entry.id === artworkId);
    const asset = artwork ? projectAssets.find((entry) => entry.id === artwork.assetId) : null;
    if (!currentDesigner || !artwork || !asset || !documentRef.current.projectId) {
      setFabricationNotice("SVG import unavailable: the Artwork source is missing.");
      return;
    }
    if (currentDesigner.layers.zones.locked) {
      setFabricationNotice("Unlock Diffusors before importing SVG paths as Zones.");
      return;
    }
    const paper = window.paper;
    if (!paper) {
      setFabricationNotice("The geometry engine is still loading. Try the SVG import again.");
      return;
    }
    setImportingSvgZones(true);
    setFabricationNotice(`Reading SVG paths · ${asset.fileName}`);
    try {
      const response = await fetch(`${artworkUrls[asset.id]}?inspect=svg-source`, { cache: "no-store" });
      const payload = await response.json() as { source?: string; widthCm?: number; heightCm?: number; message?: string };
      if (!response.ok || !payload.source || !payload.widthCm || !payload.heightCm) {
        throw new Error(payload.message ?? "SVG vector source could not be read.");
      }
      const imported = importArtworkSvgAsZoneDrafts(payload.source, paper, {
        artwork,
        intrinsicWidthCm: payload.widthCm,
        intrinsicHeightCm: payload.heightCm
      });
      if (!imported.drafts.length) throw new Error("The SVG has no closed vector paths that can become Zones.");

      const latestDesigner = documentRef.current.designer;
      if (!latestDesigner || latestDesigner.layers.zones.locked) throw new Error("Diffusors was locked before the import completed.");
      const firstNumber = nextDesignerItemNumber(latestDesigner.zones, "zone_");
      const baseName = asset.fileName.replace(/\.svg$/i, "") || "SVG";
      const zones = imported.drafts.map((draft, index): DesignerZoneForm => {
        const importedLabel = draft.suggestedName?.trim();
        const label = importedLabel || `Path ${index + 1}`;
        const { suggestedName: _suggestedName, ...shape } = draft;
        return { id: `zone_${firstNumber + index}`, name: `${baseName} · ${label}`, ...shape };
      });
      const nextDesigner = canonicalizeDesignerGeometry({
        ...latestDesigner,
        zones: [...latestDesigner.zones, ...zones]
      });
      const invalidatesRuntime = designerCompileSignature(latestDesigner) !== designerCompileSignature(nextDesigner);
      updateLiveDocument((current) => ({ ...current, designer: nextDesigner }), { invalidateRuntime: invalidatesRuntime });
      const skipped = imported.skippedOpenPaths ? ` · ${imported.skippedOpenPaths} open path${imported.skippedOpenPaths === 1 ? "" : "s"} skipped` : "";
      setFabricationNotice(`${zones.length} Zone${zones.length === 1 ? "" : "s"} created from ${asset.fileName}${skipped}.`);
    } catch (error) {
      setFabricationNotice(error instanceof Error ? `SVG import failed · ${error.message}` : "SVG import failed.");
    } finally {
      setImportingSvgZones(false);
    }
  }

  function patchZoneVisual(zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)) });
  }

  function patchBuildAreaVisual(buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) {
    updateDesigner({ ...designer, buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === buildAreaId ? { ...buildArea, ...patch } : buildArea)) });
  }

  function patchBuildArea(buildAreaId: string, patch: Partial<DesignerBuildAreaForm>) {
    if (designer.layers.artwork.locked) return;
    const currentBuildArea = designer.buildAreas.find((buildArea) => buildArea.id === buildAreaId);
    const previousId = buildAreaId;
    const nextId = patch.id ?? previousId;
    const nextPatch = patch.shape === "polygon" && currentBuildArea && !currentBuildArea.points
      ? { ...patch, points: rectanglePoints(currentBuildArea) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({
      ...designer,
      buildAreas: designer.buildAreas.map((buildArea) => (buildArea.id === buildAreaId ? { ...buildArea, ...nextPatch } : buildArea))
    });
    if (nextId !== previousId) setSelection({ type: "build_area", id: nextId });
  }

  function layerTargetForSelection(nextSelection: DesignerSelection): DesignerLayerTarget | null {
    if (!nextSelection) return null;
    let scope: DesignerLayerTreeScope;
    if (nextSelection.type === "artwork") scope = "artwork";
    else if (nextSelection.type === "build_area") scope = "reference";
    else if (nextSelection.type === "work_line") scope = "workLines";
    else if (nextSelection.type === "zone") scope = "zones";
    else if (nextSelection.type === "channel") scope = "channels";
    else if (nextSelection.type === "face_graphic") scope = "faceGraphic";
    else if (nextSelection.type === "route") scope = designer.routes.find((entry) => entry.id === nextSelection.id)?.kind === "data_cable" ? "dataCables" : "strings";
    else if (nextSelection.type === "controller") scope = "controller";
    else if (nextSelection.type === "fabrication_part") return { scope: "fabrication", sublayerId: null, fabricationPartId: nextSelection.id };
    else if (nextSelection.type === "fabrication_path") return { scope: "fabrication", sublayerId: null, fabricationPartId: designer.fabricationPaths.find((entry) => entry.id === nextSelection.id)?.partId };
    else if (nextSelection.type === "text") scope = designer.texts.find((entry) => entry.id === nextSelection.id)?.targetLayer ?? "reference";
    else if (nextSelection.type === "projection") scope = designer.projections.find((entry) => entry.id === nextSelection.id)?.targetLayer ?? "reference";
    else if (nextSelection.type === "derived_geometry") scope = designer.derivedGeometries.find((entry) => entry.id === nextSelection.id)?.targetLayer ?? "reference";
    else return null;
    const sublayerId = ["artwork", "reference", "zones", "channels", "faceGraphic", "strings", "dataCables"].includes(scope)
      ? designerSublayerForObject(designer, scope as DesignerSublayerScope, nextSelection.id)?.id ?? null
      : null;
    return { scope, sublayerId };
  }

  useEffect(() => {
    const target = layerTargetForSelection(selection);
    if (target) setActiveLayerTarget(target);
  }, [selection, designer.sublayers, designer.routes, designer.texts, designer.projections, designer.derivedGeometries, designer.fabricationPaths]);

  function selectDesignerItem(nextSelection: DesignerSelection, additive = false) {
    // Empty-space drags are used to pan/zoom in Animate. Keep the current
    // optical target selected so its properties panel does not disappear.
    if (editorMode === "animate" && nextSelection === null) return;
    if (editorMode === "animate") {
      const source = nextSelection?.type === "light_source" ? designer.lightSources.find((entry) => entry.id === nextSelection.id) : null;
      const opticalTarget: OpticalTargetRef | null = nextSelection?.type === "zone" || nextSelection?.type === "channel"
        ? { type: nextSelection.type, id: nextSelection.id }
        : source ? { type: source.targetType, id: source.targetId } : null;
      if (opticalTarget && additive) {
        const base = opticalTargetSelection.length ? opticalTargetSelection : selectedOpticalTarget ? [selectedOpticalTarget] : [];
        const exists = base.some((target) => target.type === opticalTarget.type && target.id === opticalTarget.id);
        const nextTargets = exists
          ? base.filter((target) => target.type !== opticalTarget.type || target.id !== opticalTarget.id)
          : [...base, opticalTarget];
        setOpticalTargetSelection(nextTargets);
        const primary = nextTargets.at(-1);
        setSelection(primary ? { type: primary.type, id: primary.id } : null);
        setLightingEditorOpen(Boolean(primary));
        return;
      }
      setOpticalTargetSelection(opticalTarget ? [opticalTarget] : []);
    } else {
      setOpticalTargetSelection([]);
      setMarqueeChannelIds([]);
      if (nextSelection?.type === "route") {
        const route = designer.routes.find((entry) => entry.id === nextSelection.id);
        const base = route?.kind === "led_string"
          ? activeSelectedRouteIds.filter((id) => designer.routes.some((entry) => entry.id === id && entry.kind === "led_string"))
          : [];
        const nextRouteIds = additive && route?.kind === "led_string"
          ? base.includes(route.id) ? base.filter((id) => id !== route.id) : [...base, route.id]
          : route ? [route.id] : [];
        setSelectedRouteIds(nextRouteIds);
        setGeometrySelections([]);
        const primaryRouteId = nextRouteIds.at(-1);
        setSelection(primaryRouteId ? {
          type: "route",
          id: primaryRouteId,
          pointIndex: !additive && primaryRouteId === nextSelection.id ? nextSelection.pointIndex : undefined
        } : null);
        setActiveLayer("strings");
        setLayersPanelOpen(true);
        return;
      }
      setSelectedRouteIds([]);
      const projection = nextSelection?.type === "projection" ? designer.projections.find((entry) => entry.id === nextSelection.id) : null;
      const derived = nextSelection?.type === "derived_geometry" ? designer.derivedGeometries.find((entry) => entry.id === nextSelection.id) : null;
      const text = nextSelection?.type === "text" ? designer.texts.find((entry) => entry.id === nextSelection.id) : null;
      const geometryTarget = projection?.targetLayer ?? derived?.targetLayer ?? text?.targetLayer;
      const selectionLayer = geometryTarget ? geometryTarget === "reference" ? "artwork" : geometryTarget : designerLayerForSelection(nextSelection);
      const selectedAuthoringGroup = isDesignerGeometrySelection(nextSelection)
        ? designer.vectorGroups.find((group) => group.members.some((member) => designerGeometrySelectionKey(member) === designerGeometrySelectionKey(nextSelection)))
        : null;
      const requestedGeometrySelections: DesignerGeometrySelection[] = selectedAuthoringGroup
        ? selectedAuthoringGroup.members.map((member) => ({ ...member }))
        : isDesignerGeometrySelection(nextSelection) ? [nextSelection] : [];
      if (additive && isDesignerGeometrySelection(nextSelection) && selectionLayer) {
        const sameLayer = geometrySelections.every((entry) => {
          const selectedProjection = entry.type === "projection" ? designer.projections.find((projectionEntry) => projectionEntry.id === entry.id) : null;
          const selectedDerived = entry.type === "derived_geometry" ? designer.derivedGeometries.find((operation) => operation.id === entry.id) : null;
          const selectedTarget = selectedProjection?.targetLayer ?? selectedDerived?.targetLayer;
          const layer = selectedTarget ? selectedTarget === "reference" ? "artwork" : selectedTarget : designerLayerForSelection(entry);
          return layer === selectionLayer;
        });
        const base = sameLayer ? geometrySelections : [];
        const requestedKeys = new Set(requestedGeometrySelections.map(designerGeometrySelectionKey));
        const allRequestedSelected = requestedGeometrySelections.every((requested) => base.some((entry) => designerGeometrySelectionKey(entry) === designerGeometrySelectionKey(requested)));
        const nextSelections = allRequestedSelected
          ? base.filter((entry) => !requestedKeys.has(designerGeometrySelectionKey(entry)))
          : [...base, ...requestedGeometrySelections.filter((requested) => !base.some((entry) => designerGeometrySelectionKey(entry) === designerGeometrySelectionKey(requested)))];
        setGeometrySelections(nextSelections);
        setSelection(nextSelections.at(-1) ?? null);
        setActiveLayer(selectionLayer);
        setLayersPanelOpen(true);
        return;
      }
      setGeometrySelections(requestedGeometrySelections);
      if (selectionLayer) {
        setActiveLayer(selectionLayer);
        setLayersPanelOpen(true);
      }
    }
    setSelection(nextSelection);
    if (editorMode === "animate") {
      setLightingEditorOpen(nextSelection?.type === "zone" || nextSelection?.type === "channel" || nextSelection?.type === "light_source");
    }
  }

  function selectAnimationClipTarget(targetId: string | null) {
    const targets = designerOpticalTargetsForClipTarget(designer, targetId);
    setOpticalTargetSelection(targets);
    const primary = targets[0];
    setSelection(primary ? { type: primary.type, id: primary.id } : null);
    setLightingEditorOpen(Boolean(primary));
  }

  function selectDesignerMarqueeItems(result: DesignerMarqueeSelectionResult) {
    if (!result.layer || !result.selections.length) {
      setGeometrySelections([]);
      setMarqueeChannelIds([]);
      setSelectedRouteIds([]);
      setSelection(null);
      return;
    }
    const profileSelections = result.selections.filter(isDesignerGeometrySelection);
    const expanded = profileSelections.flatMap((candidate) => {
      const group = designer.vectorGroups.find((entry) => entry.members.some((member) => designerGeometrySelectionKey(member) === designerGeometrySelectionKey(candidate)));
      return group?.members.map((member) => ({ ...member })) ?? [candidate];
    });
    const unique = expanded.filter((candidate, index, entries) => entries.findIndex((entry) => designerGeometrySelectionKey(entry) === designerGeometrySelectionKey(candidate)) === index);
    setOpticalTargetSelection([]);
    setSelectedRouteIds([]);
    setGeometrySelections(unique);
    setMarqueeChannelIds(result.selections.filter((candidate) => candidate.type === "channel").map((candidate) => candidate.id));
    setSelection(result.selections.at(-1) ?? null);
    setActiveLayer(result.layer);
    setLayersPanelOpen(true);
  }

  function activateDesignerLayer(layer: DesignerActiveLayer) {
    setActiveLayer(layer);
    const scope: DesignerLayerTreeScope = layer === "artwork" || layer === "reference" ? "artwork"
      : layer === "zones" ? "zones"
        : layer === "faceGraphic" ? "faceGraphic"
          : layer === "fabrication" ? "fabrication"
            : layer === "hardware" ? "controller"
              : "strings";
    setActiveLayerTarget({ scope, sublayerId: null });
    setTool("select");
    setSelection(null);
    setGeometrySelections([]);
    setMarqueeChannelIds([]);
    setSelectedRouteIds([]);
  }

  function activateDesignerLayerTarget(target: DesignerLayerTarget) {
    const layer: DesignerActiveLayer = target.scope === "artwork" || target.scope === "reference" || target.scope === "workLines" ? "artwork"
      : target.scope === "zones" || target.scope === "channels" || target.scope === "effectTargets" ? "zones"
        : target.scope === "faceGraphic" ? "faceGraphic"
          : target.scope === "fabrication" ? "fabrication"
            : target.scope === "controller" ? "hardware"
              : "strings";
    setActiveLayerTarget(target);
    setActiveLayer(layer);
    setTool("select");
    setSelection(null);
    setGeometrySelections([]);
    setMarqueeChannelIds([]);
    setSelectedRouteIds([]);
  }

  function openLightingSetup(target: OpticalTargetRef) {
    selectDesignerItem({ type: target.type, id: target.id });
    setLightingEditorOpen(true);
  }

  function patchController(patch: Partial<DesignerControllerForm>) {
    const visibilityOnly = Object.keys(patch).every((key) => key === "visible");
    if (designer.layers.hardware.locked && !visibilityOnly) return;
    updateDesigner({
      ...designer,
      layers: patch.visible === true && !designer.layers.hardware.visible
        ? { ...designer.layers, hardware: { ...designer.layers.hardware, visible: true } }
        : designer.layers,
      controller: { ...designer.controller, ...patch, id: "controller" }
    });
  }

  function patchZone(zoneId: string, patch: Partial<DesignerZoneForm>) {
    if (designer.layers.zones.locked) return;
    const currentZone = designer.zones.find((zone) => zone.id === zoneId);
    const nextPatch = patch.shape === "polygon" && currentZone && !currentZone.points
      ? { ...patch, points: rectanglePoints(currentZone) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({
      ...designer,
      zones: designer.zones.map((zone) => (zone.id === zoneId ? { ...zone, ...nextPatch } : zone))
    });
    if (patch.id && patch.id !== zoneId) setSelection({ type: "zone", id: patch.id });
  }

  function patchFaceGraphic(elementId: string, patch: Partial<DesignerFaceGraphicForm>) {
    if (designer.layers.faceGraphic.locked) return;
    const current = designer.faceGraphics.find((element) => element.id === elementId);
    if (!current || current.locked && !Object.keys(patch).every((key) => key === "locked" || key === "visible")) return;
    const nextPatch = patch.shape === "polygon" && !current.points
      ? { ...patch, points: rectanglePoints(current) }
      : patch.shape && patch.shape !== "polygon"
        ? { ...patch, points: undefined }
        : patch;
    updateDesigner({ ...designer, faceGraphics: designer.faceGraphics.map((element) => element.id === elementId ? { ...element, ...nextPatch } : element) });
  }

  function addFabricationPart() {
    const next = nextDesignerItemNumber(designer.fabricationParts, "fabrication_part_");
    const part: DesignerFabricationPartForm = {
      id: `fabrication_part_${next}`,
      name: `Fabrication part ${next}`,
      material: "Unspecified",
      thicknessMm: 3,
      machiningSide: "front",
      visible: true,
      locked: false,
      opacity: 1
    };
    updateDesigner({ ...designer, fabricationParts: [...designer.fabricationParts, part] });
    setProjectionFabricationPartId(part.id);
    setActiveLayer("fabrication");
  }

  function patchFabricationPart(partId: string, patch: Partial<DesignerFabricationPartForm>) {
    if (designer.layers.fabrication.locked) return;
    updateDesigner({
      ...designer,
      fabricationParts: designer.fabricationParts.map((part) => part.id === partId ? { ...part, ...patch } : part)
    });
  }

  function patchFabricationPath(pathId: string, patch: Partial<DesignerFabricationPathForm>) {
    const current = designer.fabricationPaths.find((path) => path.id === pathId);
    const part = current ? designer.fabricationParts.find((entry) => entry.id === current.partId) : null;
    if (!current || designer.layers.fabrication.locked || part?.locked || current.locked && !Object.keys(patch).every((key) => key === "locked" || key === "visible")) return;
    updateDesigner({
      ...designer,
      fabricationPaths: designer.fabricationPaths.map((path) => path.id === pathId ? { ...path, ...patch } : path)
    });
  }

  function createTextAt(point: DesignerPoint) {
    const targetLayer: DesignerProjectionLayer = tool === "zone_text" ? "zones" : tool === "face_graphic_text" ? "faceGraphic" : "reference";
    const layerKey = targetLayer === "reference" ? "artwork" : targetLayer;
    if (designer.layers[layerKey].locked || !designer.layers[layerKey].visible) return;
    const next = nextDesignerItemNumber(designer.texts, "text_");
    const font = designerFontResource(DEFAULT_DESIGNER_FONT_ID)!;
    const text: DesignerText = {
      id: `text_${next}`,
      name: `Text ${next}`,
      text: "Text",
      fontId: font.id,
      fontHash: font.hash,
      fontSizeMm: 30,
      trackingMm: 0,
      lineHeight: 1.2,
      alignment: "left",
      x: point.x,
      y: point.y,
      targetLayer,
      visible: true,
      locked: false,
      opacity: 1
    };
    updateDesigner({ ...designer, texts: [...designer.texts, text] });
    setSelection({ type: "text", id: text.id });
    setFabricationNotice("Editable text created. Convert it to paths when the typography is final.");
  }

  function patchText(textId: string, patch: Partial<DesignerText>) {
    const current = designer.texts.find((entry) => entry.id === textId);
    if (!current) return;
    const layerKey = current.targetLayer === "reference" ? "artwork" : current.targetLayer;
    if (designer.layers[layerKey].locked || current.locked && !Object.keys(patch).every((key) => key === "locked" || key === "visible")) return;
    const requestedFont = patch.fontId ? designerFontResource(patch.fontId) : null;
    updateDesigner({
      ...designer,
      texts: designer.texts.map((entry) => entry.id === textId ? {
        ...entry,
        ...patch,
        ...(requestedFont ? { fontId: requestedFont.id, fontHash: requestedFont.hash } : {})
      } : entry)
    });
  }

  async function convertTextToPaths(textId: string) {
    const text = designer.texts.find((entry) => entry.id === textId);
    const resource = text ? designerFontResource(text.fontId) : null;
    if (!text || !resource || resource.hash !== text.fontHash) {
      setFabricationNotice("Text conversion blocked: its controlled font resource is unresolved.");
      return;
    }
    const layerKey = text.targetLayer === "reference" ? "artwork" : text.targetLayer;
    if (designer.layers[layerKey].locked) return;
    try {
      const response = await fetch(designerFontUrl(resource.id));
      if (!response.ok) throw new Error("Font resource unavailable");
      const fontData = await response.arrayBuffer();
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", fontData))).map((value) => value.toString(16).padStart(2, "0")).join("");
      if (`sha256:${digest}` !== resource.hash) throw new Error("Font resource hash mismatch");
      const resultGeometryId = `geometry_text_outline_${text.id}`;
      const { designerTextToGeometry } = await import("@/lib/lighting/designer-text-geometry");
      const geometry = designerTextToGeometry(text, fontData, resultGeometryId);
      if (!geometry) {
        setFabricationNotice("Text has no visible glyphs to convert.");
        return;
      }
      const shape = designerGeometryAsShape(geometry);
      const texts = designer.texts.filter((entry) => entry.id !== text.id);
      if (text.targetLayer === "reference") {
        const next = nextDesignerItemNumber(designer.buildAreas, "build_area_");
        const item: DesignerBuildAreaForm = { id: `build_area_${next}`, geometryId: resultGeometryId, name: text.name, ...shape, visible: true, locked: false, opacity: text.opacity };
        updateDesigner({ ...designer, texts, buildAreas: [...designer.buildAreas, item] });
        setSelection({ type: "build_area", id: item.id });
        setGeometrySelections([{ type: "build_area", id: item.id }]);
      } else if (text.targetLayer === "zones") {
        const next = nextDesignerItemNumber(designer.zones, "zone_");
        const item: DesignerZoneForm = { id: `zone_${next}`, geometryId: resultGeometryId, name: text.name, ...shape, visible: true, locked: false, opacity: text.opacity };
        updateDesigner({ ...designer, texts, zones: [...designer.zones, item] });
        setSelection({ type: "zone", id: item.id });
        setGeometrySelections([{ type: "zone", id: item.id }]);
      } else {
        const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
        const item: DesignerFaceGraphicForm = { id: `face_graphic_${next}`, geometryId: resultGeometryId, name: text.name, ...shape, passMode: "translucent", filterColor: "#FFFFFF", visible: true, locked: false, opacity: text.opacity };
        updateDesigner({ ...designer, texts, faceGraphics: [...designer.faceGraphics, item] });
        setSelection({ type: "face_graphic", id: item.id });
        setGeometrySelections([{ type: "face_graphic", id: item.id }]);
      }
      setFabricationNotice("Text converted to deterministic compound Bezier paths. Undo restores editable text.");
    } catch (error) {
      setFabricationNotice(error instanceof Error ? error.message : "Text conversion failed.");
    }
  }

  function patchProjection(projectionId: string, patch: Partial<DesignerProjection>) {
    const current = designer.projections.find((projection) => projection.id === projectionId);
    if (!current) return;
    const layerKey = current.targetLayer === "reference" ? "artwork" : current.targetLayer;
    if (designer.layers[layerKey].locked) return;
    const sourceGeometryId = patch.sourceGeometryId ?? current.sourceGeometryId;
    if (wouldCreateDesignerProjectionCycle(designer, projectionId, sourceGeometryId)) {
      setFabricationNotice("Projection cycle rejected. Choose a source outside this dependency chain.");
      return;
    }
    updateDesigner({ ...designer, projections: designer.projections.map((projection) => projection.id === projectionId ? { ...projection, ...patch, linked: true } : projection) });
  }

  function patchDerivedGeometry(derivedId: string, patch: Partial<DesignerDerivedGeometry>) {
    const current = designer.derivedGeometries.find((operation) => operation.id === derivedId);
    if (!current) return;
    const layerKey = current.targetLayer === "reference" ? "artwork" : current.targetLayer;
    if (designer.layers[layerKey].locked) return;
    const sourceGeometryId = patch.sourceGeometryId ?? current.sourceGeometryId;
    if (wouldCreateDesignerDerivedGeometryCycle(designer, derivedId, sourceGeometryId)) {
      setFabricationNotice("Derived-operation cycle rejected. Choose a source outside this dependency chain.");
      return;
    }
    const sourceName = projectionSourceOptions.find((entry) => entry.geometryId === current.sourceGeometryId)?.label.replace(/^.* · /, "");
    const nextPatch = current.targetLayer === "faceGraphic" && current.operation === "offset" && typeof patch.distanceMm === "number" && sourceName
      ? { ...patch, name: updatedDesignerOffsetName(sourceName, current.name, current.distanceMm, patch.distanceMm) }
      : patch;
    updateDesigner({ ...designer, derivedGeometries: designer.derivedGeometries.map((operation) => operation.id === derivedId ? { ...operation, ...nextPatch } : operation) });
  }

  function createDerivedFilletGeometry() {
    const sourceGeometryId = selectedGeometryId;
    if (!sourceGeometryId) return;
    const targetLayer: DesignerProjectionLayer = selectedBuildArea ? "reference"
      : selectedZone ? "zones"
        : selectedFaceGraphic ? "faceGraphic"
          : selectedProjection?.targetLayer ?? selectedDerivedGeometry?.targetLayer ?? "faceGraphic";
    const layerKey = targetLayer === "reference" ? "artwork" : targetLayer;
    if (designer.layers[layerKey].locked) return;
    const next = nextDesignerItemNumber(designer.derivedGeometries, "derived_");
    const sourceLabel = projectionSourceOptions.find((entry) => entry.geometryId === sourceGeometryId)?.label.replace(/^.* · /, "") ?? `Geometry ${next}`;
    const derived: DesignerDerivedGeometry = {
      id: `derived_${next}`,
      name: targetLayer === "faceGraphic"
        ? designerDerivedGeometryName(sourceLabel, "fillet")
        : `${sourceLabel} fillet`,
      geometryId: `geometry_derived_${next}`,
      sourceGeometryId,
      targetLayer,
      operation: "fillet",
      radiusMm: 2,
      ...(targetLayer === "faceGraphic" ? {
        passMode: selectedFaceGraphic?.passMode ?? selectedDerivedGeometry?.passMode ?? "translucent",
        filterColor: selectedFaceGraphic?.filterColor ?? selectedDerivedGeometry?.filterColor ?? "#FFFFFF"
      } : {}),
      visible: true
    };
    updateDesigner({ ...designer, derivedGeometries: [...designer.derivedGeometries, derived] });
    setActiveLayer(targetLayer === "reference" ? "artwork" : targetLayer);
    setSelection({ type: "derived_geometry", id: derived.id });
    setGeometrySelections([{ type: "derived_geometry", id: derived.id }]);
    setFabricationNotice("Fillet profile created with a live source link.");
  }

  function createIndependentOffsetGeometry() {
    const sourceGeometryId = selectedGeometryId;
    if (!sourceGeometryId) return;
    const targetLayer: DesignerProjectionLayer = selectedBuildArea ? "reference"
      : selectedZone ? "zones"
        : selectedFaceGraphic ? "faceGraphic"
          : selectedProjection?.targetLayer ?? selectedDerivedGeometry?.targetLayer ?? "faceGraphic";
    const layerKey = targetLayer === "reference" ? "artwork" : targetLayer;
    if (designer.layers[layerKey].locked) return;

    const derivedNumber = nextDesignerItemNumber(designer.derivedGeometries, "derived_");
    const sourceLabel = projectionSourceOptions.find((entry) => entry.geometryId === sourceGeometryId)?.label.replace(/^.* · /, "") ?? `Geometry ${derivedNumber}`;
    const name = designerDerivedGeometryName(sourceLabel, "offset", designer.offsetDistanceMm);
    const sourceResolution = resolveDesignerGeometryReference(designer, sourceGeometryId);
    if (!sourceResolution.geometry) {
      setFabricationNotice("Offset source geometry is unavailable.");
      return;
    }
    const ephemeralOffset: DesignerDerivedGeometry = {
      id: `derived_${derivedNumber}`,
      name,
      geometryId: `geometry_derived_${derivedNumber}`,
      sourceGeometryId,
      targetLayer,
      operation: "offset",
      distanceMm: designer.offsetDistanceMm,
      join: designer.offsetJoin,
      miterLimit: 4,
      visible: true
    };
    const resolved = resolveDesignerDerivedGeometry({ ...designer, derivedGeometries: [...designer.derivedGeometries, ephemeralOffset] }, ephemeralOffset.id);
    if (!resolved.geometry) {
      setFabricationNotice(resolved.issue === "collapsed"
        ? `Offset ${designer.offsetDistanceMm} mm collapses this profile.`
        : "Offset could not be created from this profile.");
      return;
    }

    const shape = designerGeometryAsShape(resolved.geometry);
    if (targetLayer === "reference") {
      const next = nextDesignerItemNumber(designer.buildAreas, "build_area_");
      const item: DesignerBuildAreaForm = { id: `build_area_${next}`, name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, buildAreas: [...designer.buildAreas, item] });
      setSelection({ type: "build_area", id: item.id });
      setGeometrySelections([{ type: "build_area", id: item.id }]);
      editableNativeOffsetRef.current = { target: "build_area", id: item.id, sourceGeometry: sourceResolution.geometry, sourceName: sourceLabel };
    } else if (targetLayer === "zones") {
      const next = nextDesignerItemNumber(designer.zones, "zone_");
      const item: DesignerZoneForm = { id: `zone_${next}`, name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, zones: [...designer.zones, item] });
      setSelection({ type: "zone", id: item.id });
      setGeometrySelections([{ type: "zone", id: item.id }]);
      editableNativeOffsetRef.current = { target: "zone", id: item.id, sourceGeometry: sourceResolution.geometry, sourceName: sourceLabel };
    } else {
      const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
      const item: DesignerFaceGraphicForm = {
        id: `face_graphic_${next}`,
        name,
        ...shape,
        passMode: selectedFaceGraphic?.passMode ?? selectedDerivedGeometry?.passMode ?? "translucent",
        filterColor: selectedFaceGraphic?.filterColor ?? selectedDerivedGeometry?.filterColor ?? "#FFFFFF",
        visible: true,
        locked: false,
        opacity: 1
      };
      updateDesigner({ ...designer, faceGraphics: [...designer.faceGraphics, item] });
      setSelection({ type: "face_graphic", id: item.id });
      setGeometrySelections([{ type: "face_graphic", id: item.id }]);
      editableNativeOffsetRef.current = { target: "face_graphic", id: item.id, sourceGeometry: sourceResolution.geometry, sourceName: sourceLabel };
    }
    setFabricationNotice(`Independent offset created at ${designer.offsetDistanceMm} mm${resolved.warnings.length ? ` · ${resolved.warnings.join(" · ")}` : ""}.`);
  }

  function patchOffsetSettings(patch: Partial<Pick<DesignerForm, "offsetDistanceMm" | "offsetJoin">>) {
    const offsetDistanceMm = patch.offsetDistanceMm ?? designer.offsetDistanceMm;
    const offsetJoin = patch.offsetJoin ?? designer.offsetJoin;
    const editable = editableNativeOffsetRef.current;
    if (!editable || selection?.type !== editable.target || selection.id !== editable.id) {
      patchDesigner({ offsetDistanceMm, offsetJoin });
      return;
    }

    const ephemeralId = "__editable_native_offset__";
    const sourceGeometry = editable.sourceGeometry;
    const ephemeralOffset: DesignerDerivedGeometry = {
      id: ephemeralId,
      name: ephemeralId,
      geometryId: `geometry_${ephemeralId}`,
      sourceGeometryId: sourceGeometry.id,
      targetLayer: editable.target === "build_area" ? "reference" : editable.target === "zone" ? "zones" : "faceGraphic",
      operation: "offset",
      distanceMm: offsetDistanceMm,
      join: offsetJoin,
      miterLimit: 4,
      visible: true
    };
    const calculationDesigner: DesignerForm = {
      ...designer,
      geometries: [...(designer.geometries ?? []).filter((geometry) => geometry.id !== sourceGeometry.id), sourceGeometry],
      derivedGeometries: [...designer.derivedGeometries.filter((operation) => operation.id !== ephemeralId), ephemeralOffset]
    };
    const resolved = resolveDesignerDerivedGeometry(calculationDesigner, ephemeralId);
    if (!resolved.geometry) {
      setFabricationNotice(resolved.issue === "collapsed"
        ? `Offset ${offsetDistanceMm} mm collapses this profile.`
        : "Offset could not be recalculated from its creation profile.");
      return;
    }

    const shape = designerGeometryAsShape(resolved.geometry);
    const renamed = (currentName: string) => updatedDesignerOffsetName(editable.sourceName, currentName, designer.offsetDistanceMm, offsetDistanceMm);
    const nextDesigner: DesignerForm = editable.target === "build_area"
      ? { ...designer, offsetDistanceMm, offsetJoin, buildAreas: designer.buildAreas.map((entry) => entry.id === editable.id ? { ...entry, ...shape, name: renamed(entry.name) } : entry) }
      : editable.target === "zone"
        ? { ...designer, offsetDistanceMm, offsetJoin, zones: designer.zones.map((entry) => entry.id === editable.id ? { ...entry, ...shape, name: renamed(entry.name) } : entry) }
        : { ...designer, offsetDistanceMm, offsetJoin, faceGraphics: designer.faceGraphics.map((entry) => entry.id === editable.id ? { ...entry, ...shape, name: renamed(entry.name) } : entry) };
    updateDesigner(nextDesigner);
    setFabricationNotice(`Offset updated to ${offsetDistanceMm} mm${resolved.warnings.length ? ` · ${resolved.warnings.join(" · ")}` : ""}.`);
  }

  function applyDirectFillet(target: DesignerFilletCornerTarget) {
    if (target.type === "channel") return;
    const editableTarget: EditableNativeFillet["target"] = {
      type: target.type,
      id: target.id,
      cornerIndex: target.cornerIndex
    };
    const owner = target.type === "build_area"
      ? designer.buildAreas.find((entry) => entry.id === target.id)
      : target.type === "zone"
        ? designer.zones.find((entry) => entry.id === target.id)
        : designer.faceGraphics.find((entry) => entry.id === target.id);
    const layerLocked = target.type === "build_area"
      ? designer.layers.artwork.locked
      : target.type === "zone"
        ? designer.layers.zones.locked
        : designer.layers.faceGraphic.locked || owner?.locked === true;
    if (!owner || layerLocked) return;
    const sourceGeometry = owner.geometryId ? designer.geometries?.find((geometry) => geometry.id === owner.geometryId) : null;
    if (!sourceGeometry) {
      setFabricationNotice("Fillet source geometry is unavailable.");
      return;
    }

    const requestedRadiusMm = Math.max(0, activeDirectFilletRadiusMmRef.current);
    const result = applyDesignerNativeFillet(designer, target, requestedRadiusMm);
    const appliedRadiusMm = result.appliedRadiusMm;
    if (!result.applied || typeof appliedRadiusMm !== "number") {
      setFabricationNotice(result.warnings[0] ?? "Fillet was not applied because this node has no usable tangent corner.");
      return;
    }
    editableNativeFilletRef.current = { target: editableTarget, sourceGeometry };
    updateDesigner(result.designer);
    setSelection({ type: target.type, id: target.id, pointIndex: target.cornerIndex });
    setGeometrySelections([{ type: target.type, id: target.id }]);
    const applied = Number(appliedRadiusMm.toFixed(3));
    setFabricationNotice(`Fillet R${applied} mm applied exactly to the selected node.`);
  }

  function patchDirectFilletRadius(radiusMm: number) {
    const requestedRadiusMm = Math.max(0, radiusMm);
    setDirectFilletRadiusMm(requestedRadiusMm);
    setDirectFilletRadiusSource("custom");
    activeDirectFilletRadiusMmRef.current = requestedRadiusMm;
    recalculateDirectFilletRadius(requestedRadiusMm, requestedRadiusMm);
  }

  function selectDirectFilletRadiusSource(source: "custom" | "router_bit") {
    const requestedRadiusMm = source === "router_bit" ? designer.fabricationCutterDiameterMm / 2 : directFilletRadiusMm;
    setDirectFilletRadiusSource(source);
    activeDirectFilletRadiusMmRef.current = requestedRadiusMm;
    recalculateDirectFilletRadius(requestedRadiusMm);
  }

  function recalculateDirectFilletRadius(radiusMm: number, customRadiusMm?: number) {
    const requestedRadiusMm = Math.max(0, radiusMm);
    const settingsDesigner = typeof customRadiusMm === "number"
      ? { ...designer, filletRadiusMm: customRadiusMm }
      : designer;
    const editable = editableNativeFilletRef.current;
    if (!editable || tool !== "fillet" || selection?.type !== editable.target.type || selection.id !== editable.target.id || selection.pointIndex !== editable.target.cornerIndex) {
      if (settingsDesigner !== designer) updateDesigner(settingsDesigner);
      return;
    }

    if (requestedRadiusMm === 0) {
      const shape = designerGeometryAsShape(editable.sourceGeometry);
      const restored: DesignerForm = editable.target.type === "build_area"
        ? { ...settingsDesigner, buildAreas: settingsDesigner.buildAreas.map((entry) => entry.id === editable.target.id ? { ...entry, ...shape } : entry) }
        : editable.target.type === "zone"
          ? { ...settingsDesigner, zones: settingsDesigner.zones.map((entry) => entry.id === editable.target.id ? { ...entry, ...shape } : entry) }
          : { ...settingsDesigner, faceGraphics: settingsDesigner.faceGraphics.map((entry) => entry.id === editable.target.id ? { ...entry, ...shape } : entry) };
      updateDesigner(restored);
      setSelection({ type: editable.target.type, id: editable.target.id, pointIndex: editable.target.cornerIndex });
      setFabricationNotice("Fillet removed from the selected node.");
      return;
    }

    const sourceGeometry = editable.sourceGeometry;
    const calculationDesigner: DesignerForm = {
      ...settingsDesigner,
      geometries: [...(settingsDesigner.geometries ?? []).filter((geometry) => geometry.id !== sourceGeometry.id), sourceGeometry]
    };
    const result = applyDesignerNativeFillet(calculationDesigner, editable.target, requestedRadiusMm);
    if (!result.applied || typeof result.appliedRadiusMm !== "number") {
      if (settingsDesigner !== designer) updateDesigner(settingsDesigner);
      setFabricationNotice(result.warnings[0] ?? "Fillet could not be recalculated for the selected node.");
      return;
    }
    updateDesigner(result.designer);
    setSelection({ type: editable.target.type, id: editable.target.id, pointIndex: editable.target.cornerIndex });
    const applied = Number(result.appliedRadiusMm.toFixed(3));
    setFabricationNotice(`Fillet updated exactly to R${applied} mm on the selected node.`);
  }

  function toggleDirectFilletTool() {
    if (tool === "fillet") {
      setTool("select");
      return;
    }
    setTool("fillet");
    if (!selectedDirectFilletTarget) return;
    const editable = editableNativeFilletRef.current;
    const alreadyEditingSelectedNode = editable?.target.type === selectedDirectFilletTarget.type
      && editable.target.id === selectedDirectFilletTarget.id
      && editable.target.cornerIndex === selectedDirectFilletTarget.cornerIndex;
    if (!alreadyEditingSelectedNode) applyDirectFillet(selectedDirectFilletTarget);
  }

  function selectedChannelSourceGeometries() {
    const canonical = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
    return geometrySelections.flatMap((entry) => {
      if (entry.type === "projection") {
        const resolved = resolveDesignerProjectionGeometry(designer, entry.id);
        return resolved.geometry ? [resolved.geometry] : [];
      }
      if (entry.type === "derived_geometry") {
        const resolved = resolveDesignerDerivedGeometry(designer, entry.id);
        return resolved.geometry ? [resolved.geometry] : [];
      }
      const owner = entry.type === "build_area"
        ? designer.buildAreas.find((candidate) => candidate.id === entry.id)
        : entry.type === "zone"
          ? designer.zones.find((candidate) => candidate.id === entry.id)
          : designer.faceGraphics.find((candidate) => candidate.id === entry.id);
      const geometry = owner?.geometryId ? canonical.get(owner.geometryId) : null;
      return geometry ? [geometry] : [];
    });
  }

  function createChannelsFromSelectedGeometry() {
    if (designer.layers.zones.locked || !geometrySelections.length) return;
    const geometries = selectedChannelSourceGeometries();
    if (geometries.length !== geometrySelections.length) {
      setFabricationNotice("Channel creation blocked: one selected path is missing or broken.");
      return;
    }
    const result = channelPathsFromGeometries(geometries, channelPathAlignment, designer.channelRouterDiameterMm, channelPathOffsetMm);
    if (result.issue === "branch") {
      setFabricationNotice("Channel creation blocked: the selected paths contain a branch. Trace each route manually as an independent Channel.");
      return;
    }
    if (result.issue === "offset") {
      setFabricationNotice("Channel creation blocked: this offset collapses or requires a closed source contour.");
      return;
    }
    if (result.issue || !result.paths.length) {
      setFabricationNotice("Channel creation blocked: select at least one usable path.");
      return;
    }
    const firstNumber = nextDesignerItemNumber(designer.channels, "channel_");
    const sourceZoneName = geometrySelections.length === 1 && geometrySelections[0].type === "zone"
      ? designer.zones.find((zone) => zone.id === geometrySelections[0].id)?.name
      : undefined;
    const channels = result.paths.map((path, index): DesignerChannelForm => ({
      id: `channel_${firstNumber + index}`,
      name: generatedChannelName(sourceZoneName, `Channel ${firstNumber + index}`, channelPathAlignment, channelPathOffsetMm),
      points: path.points,
      pathMode: path.pathMode,
      widthMm: channelWidthForRouterDiameter(designer.channelRouterDiameterMm),
      closed: path.closed,
      cap: "round",
      fabricationSurface: channelCreationSurface,
      visible: true,
      locked: false,
      opacity: 1
    }));
    updateDesigner({ ...designer, channels: [...designer.channels, ...channels] });
    const selected = channels.at(-1)!;
    setSelection({ type: "channel", id: selected.id });
    setGeometrySelections([]);
    setTool("select");
    setFabricationNotice(`${channels.length} Channel${channels.length === 1 ? "" : "s"} created from ${geometrySelections.length} selected path${geometrySelections.length === 1 ? "" : "s"}.`);
  }

  function generateLedStringFromSelectedChannel() {
    if (!selectedChannel || designer.layers.strings.locked) return;
    const route = createLedStringFromChannel(selectedChannel, designer, false, selectedChannelPointIndex ?? 0);
    if (!route) {
      setFabricationNotice("LED string creation blocked: this Channel has no usable center path.");
      return;
    }
    updateDesigner({ ...designer, routes: [...designer.routes, route] });
    setSelectedRouteIds([route.id]);
    setSelection({ type: "route", id: route.id });
    setActiveLayer("strings");
    setRouteSurfaceView(route.designSurface ?? "rear");
    const widthWarning = designer.ledPcbWidthMm > selectedChannel.widthMm
      ? ` · Warning: ${designer.ledPcbWidthMm} mm PCB is wider than the ${selectedChannel.widthMm} mm Channel.`
      : "";
    setFabricationNotice(`${route.name} created independently from the Channel${widthWarning}`);
  }

  function selectedZoneSourceGeometry() {
    if (!selectedZone?.geometryId) return { geometry: null, issue: "missing" as const };
    const source = resolveDesignerGeometryReference(designer, selectedZone.geometryId);
    if (!source.geometry) return { geometry: null, issue: "missing" as const };
    return { geometry: source.geometry, issue: null };
  }

  function selectedZoneAlignedPaths(widthMm: number) {
    const source = selectedZoneSourceGeometry();
    if (!source.geometry) return { paths: [], issue: source.issue };
    return channelPathsFromGeometries([source.geometry], channelPathAlignment, widthMm, channelPathOffsetMm);
  }

  function generateOffsetChannelsFromSelectedZone() {
    if (!selectedZone || designer.layers.zones.locked || designer.systemSublayers.channels.locked) return;
    const result = selectedZoneAlignedPaths(designer.channelRouterDiameterMm);
    if (result.issue || !result.paths.length) {
      setFabricationNotice(result.issue === "offset"
        ? `Channel creation blocked: ${channelPathAlignment} offset ${channelPathOffsetMm} mm collapses this profile.`
        : "Channel creation blocked: this Zone has no usable closed profile.");
      return;
    }
    const firstNumber = nextDesignerItemNumber(designer.channels, "channel_");
    const surface = routeSurfaceView === "front" || routeSurfaceView === "rear" ? routeSurfaceView : channelCreationSurface;
    const channels = result.paths.map((path, index): DesignerChannelForm => ({
      id: `channel_${firstNumber + index}`,
      name: generatedChannelName(selectedZone.name, `Channel ${firstNumber + index}`, channelPathAlignment, channelPathOffsetMm),
      points: path.points,
      pathMode: path.pathMode,
      widthMm: channelWidthForRouterDiameter(designer.channelRouterDiameterMm),
      closed: path.closed,
      cap: "round",
      fabricationSurface: surface,
      visible: true,
      locked: false,
      opacity: 1
    }));
    updateDesigner({
      ...designer,
      channels: [...designer.channels, ...channels],
      systemSublayers: { ...designer.systemSublayers, channels: { ...designer.systemSublayers.channels, visible: true } }
    });
    const selected = channels.at(-1)!;
    setSelection({ type: "channel", id: selected.id });
    setGeometrySelections([]);
    setActiveLayer("zones");
    setActiveLayerTarget({ scope: "channels", sublayerId: null });
    const placement = channelPathAlignment === "inside" || channelPathAlignment === "outside"
      ? `${channelPathAlignment} offset ${channelPathOffsetMm} mm`
      : `${channelPathAlignment} alignment`;
    setFabricationNotice(`${channels.length} independent Channel${channels.length === 1 ? "" : "s"} created with ${placement} from ${selectedZone.name}.`);
  }

  function generateOffsetStringsFromSelectedZone() {
    if (!selectedZone || designer.layers.strings.locked || designer.systemSublayers.strings.locked) return;
    const result = selectedZoneAlignedPaths(designer.ledPcbWidthMm);
    if (result.issue || !result.paths.length) {
      setFabricationNotice(result.issue === "offset"
        ? `LED string creation blocked: ${channelPathAlignment} offset ${channelPathOffsetMm} mm collapses this profile.`
        : "LED string creation blocked: this Zone has no usable closed profile.");
      return;
    }
    const surface = routeSurfaceView === "front" || routeSurfaceView === "rear" ? routeSurfaceView : channelCreationSurface;
    const routes = createLedStringsFromZonePaths(selectedZone, result.paths, designer, surface);
    if (!routes.length) {
      setFabricationNotice("LED string creation blocked: the offset produced no usable route.");
      return;
    }
    updateDesigner({
      ...designer,
      routes: [...designer.routes, ...routes],
      layers: { ...designer.layers, strings: { ...designer.layers.strings, visible: true } },
      systemSublayers: { ...designer.systemSublayers, strings: { ...designer.systemSublayers.strings, visible: true } }
    });
    setRouteSurfaceView(surface);
    const placement = channelPathAlignment === "inside" || channelPathAlignment === "outside"
      ? `${channelPathAlignment} offset ${channelPathOffsetMm} mm`
      : `${channelPathAlignment} alignment`;
    setFabricationNotice(`${routes.length} independent LED string${routes.length === 1 ? "" : "s"} created with ${placement} and assigned to ${selectedZone.name}.`);
  }

  function generateLightboxZoneFromSelectedChannel() {
    if (!selectedChannel || designer.layers.zones.locked) return;
    const profiles: DesignerLightboxProfile[] = [
      ...designer.buildAreas.map((entry) => ({ name: entry.name, geometryId: entry.geometryId })),
      ...designer.zones.map((entry) => ({ name: entry.name, geometryId: entry.geometryId })),
      ...designer.faceGraphics.map((entry) => ({ name: entry.name, geometryId: entry.geometryId })),
      ...designer.fabricationPaths.filter((entry) => entry.closed !== false).map((entry) => ({ name: entry.name, geometryId: entry.geometryId })),
      ...designer.projections.map((entry) => ({ name: entry.name, geometryId: entry.geometryId })),
      ...designer.derivedGeometries.map((entry) => ({ name: entry.name, geometryId: entry.geometryId }))
    ].flatMap((entry) => {
      if (!entry.geometryId || entry.geometryId === selectedChannel.geometryId) return [];
      const resolved = resolveDesignerGeometryReference(designer, entry.geometryId);
      return resolved.geometry && resolved.geometry.closed !== false ? [{ name: entry.name, geometry: resolved.geometry }] : [];
    });
    const next = nextDesignerItemNumber(designer.zones, "zone_");
    const result = generateDesignerLightboxZone(
      selectedChannel,
      profiles,
      `zone_${next}`,
      designer.zones.map((zone) => zone.name)
    );
    if (!result.zone) {
      const message = result.issue === "open-channel"
        ? "Lightbox Zone creation requires a closed Channel."
        : result.issue === "missing-profile"
          ? "Lightbox Zone creation requires a closed profile containing the complete Channel footprint."
          : "Lightbox Zone creation failed because this Channel has no usable internal region.";
      setFabricationNotice(message);
      return;
    }
    updateDesigner({ ...designer, zones: [...designer.zones, result.zone] });
    setSelection({ type: "zone", id: result.zone.id });
    setGeometrySelections([{ type: "zone", id: result.zone.id }]);
    setMarqueeChannelIds([]);
    setActiveLayer("zones");
    setTool("select");
    setFabricationNotice(`${result.zone.name} created independently from ${result.profileName}.`);
  }

  function breakDerivedGeometryLink(derivedId: string) {
    const operation = designer.derivedGeometries.find((entry) => entry.id === derivedId);
    const resolved = operation ? resolveDesignerDerivedGeometry(designer, operation.id) : null;
    if (!operation || !resolved?.geometry) {
      setFabricationNotice("Cannot materialize an unresolved derived profile. Repair its source or parameters first.");
      return;
    }
    const layerKey = operation.targetLayer === "reference" ? "artwork" : operation.targetLayer;
    if (designer.layers[layerKey].locked) return;
    const shape = designerGeometryAsShape(resolved.geometry);
    const derivedGeometries = designer.derivedGeometries.filter((entry) => entry.id !== derivedId);
    if (operation.targetLayer === "reference") {
      const next = nextDesignerItemNumber(designer.buildAreas, "build_area_");
      const item: DesignerBuildAreaForm = { id: `build_area_${next}`, name: operation.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, derivedGeometries, buildAreas: [...designer.buildAreas, item] });
      setSelection({ type: "build_area", id: item.id });
      setGeometrySelections([{ type: "build_area", id: item.id }]);
    } else if (operation.targetLayer === "zones") {
      const next = nextDesignerItemNumber(designer.zones, "zone_");
      const item: DesignerZoneForm = { id: `zone_${next}`, name: operation.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, derivedGeometries, zones: [...designer.zones, item] });
      setSelection({ type: "zone", id: item.id });
      setGeometrySelections([{ type: "zone", id: item.id }]);
    } else {
      const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
      const item: DesignerFaceGraphicForm = { id: `face_graphic_${next}`, name: operation.name, ...shape, passMode: operation.passMode ?? "translucent", filterColor: operation.filterColor ?? "#FFFFFF", visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, derivedGeometries, faceGraphics: [...designer.faceGraphics, item] });
      setSelection({ type: "face_graphic", id: item.id });
      setGeometrySelections([{ type: "face_graphic", id: item.id }]);
    }
    setFabricationNotice("Derived link broken. The resolved profile is now independently editable.");
  }

  function projectSelectedGeometry() {
    if (!selectedGeometryId) return;
    const next = nextDesignerItemNumber(designer.projections, "projection_");
    const sourceLabel = projectionSourceOptions.find((entry) => entry.geometryId === selectedGeometryId)?.label.replace(/^.* · /, "") ?? `Geometry ${next}`;
    const nativeTargetLayer: DesignerProjectionLayer = projectionTargetLayer === "fabrication" ? "reference" : projectionTargetLayer;
    const projection: DesignerProjection = {
      id: `projection_${next}`,
      name: selectedChannel ? `${sourceLabel} perimeter` : nativeTargetLayer === "faceGraphic" ? designerProjectionName(sourceLabel) : `${sourceLabel} projection`,
      geometryId: `geometry_projection_${next}`,
      sourceGeometryId: selectedGeometryId,
      targetLayer: nativeTargetLayer,
      linked: true,
      visible: true
    };
    const resolved = resolveDesignerProjectionGeometry(
      { ...designer, projections: [...designer.projections, projection] },
      projection.id,
      projectionTargetLayer
    );
    if (!resolved.geometry) {
      setFabricationNotice("Projection could not be created because its source geometry is unresolved.");
      return;
    }
    const shape = designerGeometryAsShape(resolved.geometry);
    if (projectionTargetLayer === "fabrication") {
      const existingPart = projectionFabricationPartId !== "new"
        ? designer.fabricationParts.find((part) => part.id === projectionFabricationPartId)
        : undefined;
      const partNumber = nextDesignerItemNumber(designer.fabricationParts, "fabrication_part_");
      const part: DesignerFabricationPartForm = existingPart ?? {
        id: `fabrication_part_${partNumber}`,
        name: projectionFabricationPartName.trim() || `Fabrication part ${partNumber}`,
        material: "Unspecified",
        thicknessMm: 3,
        machiningSide: "front",
        visible: true,
        locked: false,
        opacity: 1
      };
      const pathNumber = nextDesignerItemNumber(designer.fabricationPaths, "fabrication_path_");
      const path: DesignerFabricationPathForm = {
        id: `fabrication_path_${pathNumber}`,
        name: selectedChannel ? `${sourceLabel} centerline` : `${sourceLabel} projection`,
        partId: part.id,
        ...shape,
        operation: projectionFabricationOperation,
        visible: true,
        locked: false,
        opacity: 1
      };
      updateDesigner({
        ...designer,
        layers: { ...designer.layers, fabrication: { ...designer.layers.fabrication, visible: true } },
        fabricationParts: existingPart ? designer.fabricationParts : [...designer.fabricationParts, part],
        fabricationPaths: [...designer.fabricationPaths, path]
      });
      setProjectionFabricationPartId(part.id);
      setFabricationNotice(`Independent ${projectionFabricationOperation} path created in ${part.name}; source layer and selection preserved.`);
      return;
    }
    if (projectionTargetLayer === "reference") {
      const next = nextDesignerItemNumber(designer.buildAreas, "build_area_");
      const buildArea: DesignerBuildAreaForm = { id: `build_area_${next}`, name: projection.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({
        ...designer,
        layers: {
          ...designer.layers,
          artwork: { ...designer.layers.artwork, visible: true },
          reference: { ...designer.layers.reference, visible: true }
        },
        buildAreas: [...designer.buildAreas, buildArea]
      });
    } else if (projectionTargetLayer === "zones") {
      const next = nextDesignerItemNumber(designer.zones, "zone_");
      const zone: DesignerZoneForm = { id: `zone_${next}`, name: projection.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({
        ...designer,
        layers: { ...designer.layers, zones: { ...designer.layers.zones, visible: true } },
        zones: [...designer.zones, zone]
      });
    } else {
      const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
      const element: DesignerFaceGraphicForm = { id: `face_graphic_${next}`, name: projection.name, ...shape, passMode: "translucent", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 };
      updateDesigner({
        ...designer,
        layers: { ...designer.layers, faceGraphic: { ...designer.layers.faceGraphic, visible: true } },
        faceGraphics: [...designer.faceGraphics, element]
      });
    }
    setFabricationNotice(`Independent projection created in ${projectionTargetLayer === "faceGraphic" ? "Face Graphic" : projectionTargetLayer === "zones" ? "Diffusors" : "Reference"}; source layer and selection preserved.`);
  }

  function groupSelectedGeometry() {
    if (!canGroupGeometrySelection || selectedVectorGroup) return;
    const memberKeys = new Set(geometrySelections.map(designerGeometrySelectionKey));
    const next = nextDesignerItemNumber(designer.vectorGroups, "vector_group_");
    updateDesigner({
      ...designer,
      vectorGroups: [
        ...designer.vectorGroups.filter((group) => !group.members.some((member) => memberKeys.has(designerGeometrySelectionKey(member)))),
        {
          id: `vector_group_${next}`,
          name: `Vector Group ${next}`,
          members: geometrySelections.filter(isDesignerVectorGroupMember).map((selection) => ({ type: selection.type, id: selection.id }))
        }
      ]
    });
    setFabricationNotice(`${geometrySelections.length} vectors grouped. Select any member to recover the complete group.`);
  }

  function ungroupSelectedGeometry() {
    if (!selectedVectorGroup) return;
    updateDesigner({ ...designer, vectorGroups: designer.vectorGroups.filter((group) => group.id !== selectedVectorGroup.id) });
    setFabricationNotice(`${selectedVectorGroup.name} ungrouped; its vectors remain selected and unchanged.`);
  }

  function applyBooleanOperation(operation: DesignerBooleanOperation) {
    if (geometrySelections.length < 2) return;
    const paper = window.paper;
    if (!paper) {
      setFabricationNotice("The geometry engine is still loading. Try the boolean operation again.");
      return;
    }
    const geometryById = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
    const operands = geometrySelections.map((entry): { selection: DesignerGeometrySelection; geometry: DesignerGeometry | null; target: DesignerProjectionLayer; name: string } => {
      if (entry.type === "projection") {
        const projection = designer.projections.find((candidate) => candidate.id === entry.id);
        return { selection: entry, geometry: projection ? resolveDesignerProjectionGeometry(designer, projection.id).geometry : null, target: projection?.targetLayer ?? "faceGraphic", name: projection?.name ?? entry.id };
      }
      if (entry.type === "derived_geometry") {
        const operation = designer.derivedGeometries.find((candidate) => candidate.id === entry.id);
        return { selection: entry, geometry: operation ? resolveDesignerDerivedGeometry(designer, operation.id).geometry : null, target: operation?.targetLayer ?? "faceGraphic", name: operation?.name ?? entry.id };
      }
      const owner = entry.type === "build_area"
        ? designer.buildAreas.find((candidate) => candidate.id === entry.id)
        : entry.type === "zone"
          ? designer.zones.find((candidate) => candidate.id === entry.id)
          : designer.faceGraphics.find((candidate) => candidate.id === entry.id);
      return {
        selection: entry,
        geometry: owner?.geometryId ? geometryById.get(owner.geometryId) ?? null : null,
        target: entry.type === "build_area" ? "reference" : entry.type === "zone" ? "zones" : "faceGraphic",
        name: owner?.name ?? entry.id
      };
    });
    const target = operands[0]?.target;
    if (!target || operands.some((operand) => operand.target !== target)) {
      setFabricationNotice("Boolean operations require closed geometry from the same target layer.");
      return;
    }
    const layerKey = target === "reference" ? "artwork" : target;
    if (designer.layers[layerKey].locked) return;
    if (operands.some((operand) => !operand.geometry)) {
      setFabricationNotice("Boolean operation blocked: one selected geometry is missing or broken.");
      return;
    }
    const operationLabel = operation === "union" ? "Union" : operation === "subtract" ? "Subtract" : operation === "intersect" ? "Intersect" : "Exclude";
    const nextNumber = target === "reference"
      ? nextDesignerItemNumber(designer.buildAreas, "build_area_")
      : target === "zones"
        ? nextDesignerItemNumber(designer.zones, "zone_")
        : nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
    const resultObjectId = target === "reference" ? `build_area_${nextNumber}` : target === "zones" ? `zone_${nextNumber}` : `face_graphic_${nextNumber}`;
    const geometryId = `geometry_${target === "reference" ? "build_area" : target === "zones" ? "zone" : "face_graphic"}_${resultObjectId}`;
    const result = applyDesignerBooleanOperation(paper, operands.map((operand) => operand.geometry!), operation, geometryId);
    if (!result.geometry) {
      const issueLabels = result.issues.map((issue) => issue === "open-profile" ? "open profile" : issue === "self-intersection" ? "self-intersection" : issue === "duplicate-contour" ? "duplicate contour" : "empty result");
      setFabricationNotice(`Boolean operation blocked: ${issueLabels.join(", ") || "invalid topology"}.`);
      return;
    }
    const shape = designerGeometryAsShape(result.geometry);
    const removedBuildAreas = new Set(geometrySelections.filter((entry) => entry.type === "build_area").map((entry) => entry.id));
    const removedZones = new Set(geometrySelections.filter((entry) => entry.type === "zone").map((entry) => entry.id));
    const removedFaceGraphics = new Set(geometrySelections.filter((entry) => entry.type === "face_graphic").map((entry) => entry.id));
    const removedSelectionKeys = new Set(geometrySelections.map(designerGeometrySelectionKey));
    const retainedVectorGroups = designer.vectorGroups.filter((group) => !group.members.some((member) => removedSelectionKeys.has(designerGeometrySelectionKey(member))));
    if (target === "reference") {
      const base = designer.buildAreas.find((entry) => removedBuildAreas.has(entry.id));
      const item: DesignerBuildAreaForm = { ...shape, id: resultObjectId, geometryId, name: `${operationLabel} ${nextNumber}`, visible: true, locked: false, opacity: base?.opacity ?? 1 };
      updateDesigner({ ...designer, buildAreas: [...designer.buildAreas.filter((entry) => !removedBuildAreas.has(entry.id)), item], vectorGroups: retainedVectorGroups });
      setSelection({ type: "build_area", id: item.id });
      setGeometrySelections([{ type: "build_area", id: item.id }]);
    } else if (target === "zones") {
      const base = designer.zones.find((entry) => removedZones.has(entry.id));
      const item: DesignerZoneForm = { ...shape, id: resultObjectId, geometryId, name: `${operationLabel} ${nextNumber}`, visible: true, locked: false, opacity: base?.opacity ?? 1 };
      const groups = designer.groups.map((group) => ({
        ...group,
        members: group.members.reduce<DesignerGroupForm["members"]>((members, member) => {
          const nextMember = member.type === "zone" && removedZones.has(member.id) ? { type: "zone" as const, id: item.id } : member;
          return members.some((candidate) => candidate.type === nextMember.type && candidate.id === nextMember.id) ? members : [...members, nextMember];
        }, [])
      }));
      updateDesigner({
        ...designer,
        zones: [...designer.zones.filter((entry) => !removedZones.has(entry.id)), item],
        vectorGroups: retainedVectorGroups,
        groups,
        lightSources: designer.lightSources.map((source) => source.targetType === "zone" && removedZones.has(source.targetId) ? { ...source, targetId: item.id } : source)
      });
      setSelection({ type: "zone", id: item.id });
      setGeometrySelections([{ type: "zone", id: item.id }]);
    } else {
      const base = designer.faceGraphics.find((entry) => removedFaceGraphics.has(entry.id));
      const item: DesignerFaceGraphicForm = { ...shape, id: resultObjectId, geometryId, name: designerBooleanResultName(operands[0].name, operation), passMode: base?.passMode ?? "translucent", filterColor: base?.filterColor ?? "#FFFFFF", visible: true, locked: false, opacity: base?.opacity ?? 1 };
      updateDesigner({ ...designer, faceGraphics: [...designer.faceGraphics.filter((entry) => !removedFaceGraphics.has(entry.id)), item], vectorGroups: retainedVectorGroups });
      setSelection({ type: "face_graphic", id: item.id });
      setGeometrySelections([{ type: "face_graphic", id: item.id }]);
    }
    setFabricationNotice(`${operationLabel} created with ${result.geometry.contours?.length ?? 1} contour(s).`);
  }

  function patchRoute(routeId: string, patch: Partial<DesignerRouteForm>) {
    if (designer.layers.strings.locked) return;
    updateDesigner({
      ...designer,
      routes: designer.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route))
    });
    if (patch.id && patch.id !== routeId) setSelection({ type: "route", id: patch.id });
  }

  function patchChannel(channelId: string, patch: Partial<DesignerChannelForm>) {
    if (designer.layers.zones.locked) return;
    updateDesigner({
      ...designer,
      channels: designer.channels.map((channel) => (channel.id === channelId ? { ...channel, ...patch } : channel))
    });
    if (patch.id && patch.id !== channelId) setSelection({ type: "channel", id: patch.id });
  }

  function removeChannel(channelId: string) {
    updateDesigner({
      ...designer,
      channels: designer.channels.filter((channel) => channel.id !== channelId),
      lightSources: designer.lightSources.filter((source) => !(source.targetType === "channel" && source.targetId === channelId)),
      groups: designer.groups.map((group) => ({
        ...group,
        members: group.members.filter((member) => !(member.type === "channel" && member.id === channelId))
      }))
    });
    setSelection(null);
    setFabricationNotice("Channel deleted.");
  }

  function addGroup(initialMembers: DesignerGroupForm["members"] = []) {
    const groups = designer.groups ?? [];
    const usedIds = new Set(groups.map((group) => group.id));
    let index = groups.length + 1;
    while (usedIds.has(`group_${index}`)) index += 1;
    const zoneIds = new Set(designer.zones.map((zone) => zone.id));
    const channelIds = new Set(designer.channels.map((channel) => channel.id));
    const members = initialMembers.filter((member, memberIndex) =>
      (member.type === "zone" && zoneIds.has(member.id) || member.type === "channel" && channelIds.has(member.id))
      && initialMembers.findIndex((candidate) => candidate.type === member.type && candidate.id === member.id) === memberIndex
    );
    const group: DesignerGroupForm = { id: `group_${index}`, name: `Effect target ${index}`, members };
    updateDesigner({ ...designer, groups: [...groups, group] });
    setFabricationNotice(`Effect target ${index} created${members.length ? ` with ${members.length} selected object${members.length === 1 ? "" : "s"}` : ""}. Drag Zones or Channels into it, then Compile.`);
  }

  function patchGroup(groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? []).map((group) => (group.id === groupId ? { ...group, ...patch } : group))
    });
  }

  function removeGroup(groupId: string) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? [])
        .filter((group) => group.id !== groupId)
        .map((group) => ({ ...group, members: group.members.filter((member) => !(member.type === "group" && member.id === groupId)) }))
    });
    setFabricationNotice("Group deleted.");
  }

  function toggleGroupMember(groupId: string, memberType: "zone" | "channel" | "group", memberId: string) {
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? []).map((group) => {
        if (group.id !== groupId) return group;
        const exists = group.members.some((member) => member.type === memberType && member.id === memberId);
        return {
          ...group,
          members: exists
            ? group.members.filter((member) => !(member.type === memberType && member.id === memberId))
            : [...group.members, { type: memberType, id: memberId }]
        };
      })
    });
  }

  function addObjectsToGroup(groupId: string, memberType: "zone" | "channel", objectIds: string[]) {
    const validIds = new Set((memberType === "zone" ? designer.zones : designer.channels).map((object) => object.id));
    updateDesigner({
      ...designer,
      groups: (designer.groups ?? []).map((group) => {
        if (group.id !== groupId) return group;
        const existing = new Set(group.members.filter((member) => member.type === memberType).map((member) => member.id));
        const additions = objectIds.filter((id) => validIds.has(id) && !existing.has(id)).map((id) => ({ type: memberType, id }));
        return additions.length ? { ...group, members: [...group.members, ...additions] } : group;
      })
    });
  }

  function selectGroupMember(memberType: "zone" | "channel", memberId: string) {
    const exists = memberType === "zone"
      ? designer.zones.some((zone) => zone.id === memberId)
      : designer.channels.some((channel) => channel.id === memberId);
    if (!exists) return;
    setActiveLayer("zones");
    setTool("select");
    setSelection({ type: memberType, id: memberId });
  }

  function updateBuildAreaPoint(buildAreaId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    const point = buildArea ? designerShapePointLocation(buildArea, pointIndex)?.point : null;
    if (!buildArea || !point) return;
    patchBuildArea(buildAreaId, updatePolygonPoint(buildArea, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function updateZonePoint(zoneId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    const point = zone ? designerShapePointLocation(zone, pointIndex)?.point : null;
    if (!zone || !point) return;
    patchZone(zoneId, updatePolygonPoint(zone, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function updateFaceGraphicPoint(elementId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    const point = element ? designerShapePointLocation(element, pointIndex)?.point : null;
    if (!element || !point) return;
    patchFaceGraphic(elementId, updatePolygonPoint(element, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "face_graphic", id: elementId, pointIndex });
  }

  function setBuildAreaNodeType(buildAreaId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    patchBuildArea(buildAreaId, setPolygonNodeType(buildArea, pointIndex, nodeType));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function setZoneNodeType(zoneId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    patchZone(zoneId, setPolygonNodeType(zone, pointIndex, nodeType));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function setFaceGraphicNodeType(elementId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    if (!element || designer.layers.faceGraphic.locked || element.locked) return;
    patchFaceGraphic(elementId, setPolygonNodeType(element, pointIndex, nodeType));
    setSelection({ type: "face_graphic", id: elementId, pointIndex });
  }

  function insertBuildAreaPoint(buildAreaId: string, insertIndex: number, point: DesignerPoint) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    patchBuildArea(buildAreaId, insertPolygonPoint(buildArea, insertIndex, point, interactionSnapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: insertIndex });
    setFabricationNotice("Reference polygon point inserted.");
  }

  function insertZonePoint(zoneId: string, insertIndex: number, point: DesignerPoint) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    patchZone(zoneId, insertPolygonPoint(zone, insertIndex, point, interactionSnapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex: insertIndex });
    setFabricationNotice("Zone polygon point inserted.");
  }

  function insertFaceGraphicPoint(elementId: string, insertIndex: number, point: DesignerPoint) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    if (!element || designer.layers.faceGraphic.locked || element.locked) return;
    patchFaceGraphic(elementId, insertPolygonPoint(element, insertIndex, point, interactionSnapCm));
    setSelection({ type: "face_graphic", id: elementId, pointIndex: insertIndex });
    setFabricationNotice("Face Graphic point inserted.");
  }

  function deleteBuildAreaPoint(buildAreaId: string, pointIndex: number) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    if (!buildArea || designer.layers.artwork.locked) return;
    const location = designerShapePointLocation(buildArea, pointIndex);
    if (!location || location.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextBuildArea = deletePolygonPoint(buildArea, pointIndex);
    patchBuildArea(buildAreaId, nextBuildArea);
    const nextIndex = Math.min(pointIndex, Math.max(0, designerShapePointCount(nextBuildArea) - 1));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: nextIndex });
    setFabricationNotice("Reference polygon point deleted.");
  }

  function deleteZonePoint(zoneId: string, pointIndex: number) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    const location = designerShapePointLocation(zone, pointIndex);
    if (!location || location.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextZone = deletePolygonPoint(zone, pointIndex);
    patchZone(zoneId, nextZone);
    const nextIndex = Math.min(pointIndex, Math.max(0, designerShapePointCount(nextZone) - 1));
    setSelection({ type: "zone", id: zoneId, pointIndex: nextIndex });
    setFabricationNotice("Zone polygon point deleted.");
  }

  function deleteFaceGraphicPoint(elementId: string, pointIndex: number) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    if (!element || designer.layers.faceGraphic.locked || element.locked) return;
    const location = designerShapePointLocation(element, pointIndex);
    if (!location || location.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const next = deletePolygonPoint(element, pointIndex);
    patchFaceGraphic(elementId, next);
    setSelection({ type: "face_graphic", id: elementId, pointIndex: Math.min(pointIndex, Math.max(0, designerShapePointCount(next) - 1)) });
  }

  function setChannelNodeType(channelId: string, pointIndex: number, nodeType: DesignerPointNodeType) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    patchChannel(channelId, setChannelNodeTypePath(channel, pointIndex, nodeType));
    setSelection({ type: "channel", id: channelId, pointIndex });
  }

  function setChannelNodeRadius(channelId: string, pointIndex: number, radiusMm: number) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked || !Number.isFinite(radiusMm)) return;
    const value = Math.max(0, radiusMm);
    patchChannel(channelId, {
      points: channel.points.map((point, index) => index === pointIndex
        ? { ...point, ...(value > 0 ? { radiusMm: value } : { radiusMm: undefined }) }
        : point)
    });
    setSelection({ type: "channel", id: channelId, pointIndex });
    setFabricationNotice(value > 0 ? `Fillet ${value} mm applied to the selected Channel node.` : "Fillet removed from the selected Channel node.");
  }

  function insertChannelPoint(channelId: string, insertIndex: number, point: DesignerPoint) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    patchChannel(channelId, insertChannelPointPath(channel, insertIndex, point, interactionSnapCm));
    setSelection({ type: "channel", id: channelId, pointIndex: insertIndex });
    setFabricationNotice("Channel point inserted.");
  }

  function deleteChannelPoint(channelId: string, pointIndex: number) {
    const channel = designer.channels.find((entry) => entry.id === channelId);
    if (!channel || designer.layers.zones.locked) return;
    if (channel.points.length <= 2) {
      setFabricationNotice("Channel needs at least 2 points.");
      return;
    }
    const nextChannel = deleteChannelPointPath(channel, pointIndex);
    patchChannel(channelId, nextChannel);
    const nextIndex = Math.min(pointIndex, Math.max(0, nextChannel.points.length - 1));
    setSelection({ type: "channel", id: channelId, pointIndex: nextIndex });
    setFabricationNotice("Channel point deleted.");
  }

  function updateRoutePoint(routeId: string, pointIndex: number, patch: Partial<{ x: number; y: number }>) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route) return;
    patchRoute(routeId, { points: route.points.map((point, index) => (index === pointIndex ? { ...point, ...patch } : point)) });
  }

  function insertRoutePoint(routeId: string, point: DesignerPoint) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route) return;
    const insertIndex = nearestRouteInsertIndex(route, point);
    const nextPoint = { x: snapValue(point.x, interactionSnapCm), y: snapValue(point.y, interactionSnapCm) };
    patchRoute(routeId, { points: [...route.points.slice(0, insertIndex), nextPoint, ...route.points.slice(insertIndex)] });
    setSelection({ type: "route", id: routeId, pointIndex: insertIndex });
  }

  function deleteRoutePoint(routeId: string, pointIndex: number) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route || route.points.length <= 2 || pointIndex <= 0 || pointIndex >= route.points.length - 1) return;
    patchRoute(routeId, { points: route.points.filter((_, index) => index !== pointIndex) });
    setSelection({ type: "route", id: routeId });
    setFabricationNotice("String node deleted.");
  }

  function splitRoute(routeId: string, pointIndex: number) {
    const route = designer.routes.find((entry) => entry.id === routeId);
    if (!route || pointIndex <= 0 || pointIndex >= route.points.length - 1) return;
    const next = designer.routes.length + 1;
    const firstRoute = { ...route, points: route.points.slice(0, pointIndex + 1) };
    const secondRoute = {
      ...route,
      id: `${route.id}_cut_${next}`,
      name: `${route.name} cut`,
      points: route.points.slice(pointIndex)
    };
    updateDesigner({
      ...designer,
      routes: designer.routes.flatMap((entry) => entry.id === routeId ? [firstRoute, secondRoute] : [entry])
    });
    focusCreatedCanvasObject({ type: "route", id: secondRoute.id });
  }

  function handleCutRoutePoint(routeId: string, pointIndex: number) {
    splitRoute(routeId, pointIndex);
    setTool("select");
  }

  function detachSelectedRoutePoint() {
    if (!selectedRoute || typeof selectedRoutePointIndex !== "number") return;
    const result = detachSolderedRoutePoint(
      designer.routes,
      designer.controller,
      selectedRoute.id,
      selectedRoutePointIndex,
      designer.snapCm
    );
    if (!result.changed) return;
    updateDesigner({ ...designer, routes: result.routes });
    setSelection({ type: "route", id: result.routeId, pointIndex: result.pointIndex });
    setFabricationNotice("Solder joint detached; routes were preserved.");
  }

  function autoSolderRoutePoint(routeId: string, pointIndex: number, finalPoint?: DesignerPoint, allowSolder = false) {
    const routes = finalPoint ? moveRoutePointWithRetraction(designer.routes, routeId, pointIndex, finalPoint, 0.02) : designer.routes;
    const route = routes.find((entry) => entry.id === routeId);
    const effectivePointIndex = route && pointIndex !== 0 ? Math.min(pointIndex, route.points.length - 1) : pointIndex;
    if (!route || !isRouteTerminal(route, effectivePointIndex)) {
      return;
    }
    if (!allowSolder) {
      if (finalPoint) updateDesigner({ ...designer, routes });
      setSelection({ type: "route", id: routeId, pointIndex: effectivePointIndex });
      return;
    }
    const controllerPort = findMatchingControllerPort(designer.controller, routes, routeId, effectivePointIndex, designer.snapCm);
    if (controllerPort !== null) {
      updateDesigner({
        ...designer,
        routes: routes.map((entry) => (
          entry.id === routeId
            ? {
              ...entry,
              points: entry.points.map((point, index) => index === effectivePointIndex ? { ...point, joint: true } : point)
            }
            : entry
        ))
      });
      setFabricationNotice(`Data cable soldered to controller output ${controllerPort + 1}.`);
      return;
    }
    const matchingTerminal = findMatchingSolderTerminal(routes, routeId, effectivePointIndex, designer.snapCm);
    if (matchingTerminal) {
      solderRouteTerminals({ routeId, pointIndex: effectivePointIndex }, matchingTerminal, routes);
      return;
    }
    if (finalPoint) updateDesigner({ ...designer, routes });
    setFabricationNotice("Place a green and red terminal on the same snap point to solder.");
  }

  function moveSolderedTerminals(terminals: DesignerRouteTerminal[], finalPoint: DesignerPoint) {
    updateDesigner({
      ...designer,
      routes: moveRouteTerminals(designer.routes, terminals, { ...finalPoint, joint: true })
    });
    setFabricationNotice("Soldered joint moved.");
  }

  function connectSelectedStrings() {
    if (stringConnectionPlan.reason || !stringConnectionPlan.upstream || !stringConnectionPlan.downstream) return;
    const upstream = stringConnectionPlan.upstream;
    const downstream = stringConnectionPlan.downstream;
    const start = upstream.points[upstream.points.length - 1];
    const end = downstream.points[0];
    if (!start || !end) return;
    const cable = createRouteFromDraft("data_cable", start, end, designer, upstream.designSurface ?? "rear");
    const middleX = snapValue((start.x + end.x) / 2, designer.snapCm);
    const cableDraftPoints: DesignerPoint[] = [
      { ...start, joint: true },
      { x: middleX, y: start.y },
      { x: middleX, y: end.y },
      { ...end, joint: true }
    ];
    const cablePoints = cableDraftPoints.reduce<DesignerPoint[]>((points, point) => {
      const previous = points[points.length - 1];
      if (previous && previous.x === point.x && previous.y === point.y) {
        points[points.length - 1] = { ...previous, ...point, joint: previous.joint || point.joint ? true : undefined };
      }
      else points.push(point);
      return points;
    }, []);
    const connectedCable = {
      ...cable,
      name: `${upstream.name} → ${downstream.name}`,
      points: cablePoints
    };
    updateDesigner({
      ...designer,
      routes: [
        ...designer.routes.map((route) => {
          if (route.id === upstream.id) return { ...route, points: route.points.map((point, index) => index === route.points.length - 1 ? { ...point, joint: true } : point) };
          if (route.id === downstream.id) return { ...route, points: route.points.map((point, index) => index === 0 ? { ...point, joint: true } : point) };
          return route;
        }),
        connectedCable
      ]
    });
    setSelectedRouteIds([connectedCable.id]);
    setSelection({ type: "route", id: connectedCable.id });
    setFabricationNotice(`${upstream.name} connected to ${downstream.name} on output ${stringConnectionPlan.output}.`);
  }

  function solderRouteTerminals(source: DesignerRouteTerminal, target: DesignerRouteTerminal, routeSet = designer.routes) {
    const sourceRoute = routeSet.find((route) => route.id === source.routeId);
    const targetRoute = routeSet.find((route) => route.id === target.routeId);
    if (!sourceRoute || !targetRoute || sourceRoute.id === targetRoute.id) return;
    if (!canSolderRoutes(sourceRoute, source.pointIndex, targetRoute, target.pointIndex, designer.snapCm)) {
      return;
    }

    const sourcePoint = sourceRoute.points[source.pointIndex];
    const targetPoint = targetRoute.points[target.pointIndex];
    const solderPoint = {
      x: snapValue((sourcePoint.x + targetPoint.x) / 2, designer.snapCm),
      y: snapValue((sourcePoint.y + targetPoint.y) / 2, designer.snapCm),
      joint: true
    };
    if (sourceRoute.kind !== targetRoute.kind) {
      updateDesigner({
        ...designer,
        routes: moveRouteTerminals(routeSet, [source, target], solderPoint)
      });
      setSelection({ type: "route", id: source.routeId, pointIndex: source.pointIndex });
      setFabricationNotice("Cable and LED string snapped and soldered.");
      return;
    }
    const sourcePoints = sourceRoute.points.map((point, index) => index === source.pointIndex ? solderPoint : point);
    const targetPoints = targetRoute.points.map((point, index) => index === target.pointIndex ? solderPoint : point);
    const sourceAtStart = source.pointIndex === 0;
    const targetAtStart = target.pointIndex === 0;
    const orientedSource = sourceAtStart ? [...sourcePoints].reverse() : sourcePoints;
    const orientedTarget = targetAtStart ? targetPoints : [...targetPoints].reverse();
    const mergedRoute = {
      ...sourceRoute,
      name: `${sourceRoute.name} soldered`,
      points: [...orientedSource, ...orientedTarget.slice(1)]
    };
    updateDesigner({
      ...designer,
      routes: routeSet.flatMap((route) => {
        if (route.id === sourceRoute.id) return [mergedRoute];
        if (route.id === targetRoute.id) return [];
        return [route];
      })
    });
    setSelection({ type: "route", id: mergedRoute.id });
    setFabricationNotice("Routes snapped and soldered.");
  }

  function deleteSelection() {
    if (!selection) return;
    if (selectedVectorGroup) {
      const buildAreaIds = new Set(selectedVectorGroup.members.filter((member) => member.type === "build_area").map((member) => member.id));
      const zoneIds = new Set(selectedVectorGroup.members.filter((member) => member.type === "zone").map((member) => member.id));
      const faceGraphicIds = new Set(selectedVectorGroup.members.filter((member) => member.type === "face_graphic").map((member) => member.id));
      const layerLocked = buildAreaIds.size > 0 && designer.layers.artwork.locked
        || zoneIds.size > 0 && designer.layers.zones.locked
        || faceGraphicIds.size > 0 && (designer.layers.faceGraphic.locked || designer.faceGraphics.some((entry) => faceGraphicIds.has(entry.id) && entry.locked));
      if (layerLocked) return;
      updateDesigner({
        ...designer,
        buildAreas: designer.buildAreas.filter((entry) => !buildAreaIds.has(entry.id)),
        zones: designer.zones.filter((entry) => !zoneIds.has(entry.id)),
        faceGraphics: designer.faceGraphics.filter((entry) => !faceGraphicIds.has(entry.id)),
        vectorGroups: designer.vectorGroups.filter((group) => group.id !== selectedVectorGroup.id),
        groups: designer.groups.map((group) => ({ ...group, members: group.members.filter((member) => !(member.type === "zone" && zoneIds.has(member.id))) })),
        lightSources: designer.lightSources
          .filter((source) => !(source.targetType === "zone" && zoneIds.has(source.targetId)))
          .map((source) => source.receiverType === "build_area" && source.receiverId && buildAreaIds.has(source.receiverId)
            || source.receiverType === "zone" && source.receiverId && zoneIds.has(source.receiverId)
            ? { ...source, receiverType: "canvas", receiverId: undefined }
            : source)
      });
      setSelection(null);
      setGeometrySelections([]);
      setFabricationNotice(`${selectedVectorGroup.name} and its ${selectedVectorGroup.members.length} vectors deleted.`);
      return;
    }
    if (selection.type === "work_line") {
      if (typeof selection.pointIndex === "number") {
        deleteWorkLinePoint(selection.id, selection.pointIndex);
        return;
      }
      updateDesigner({ ...designer, workLines: designer.workLines.filter((line) => line.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Work line deleted.");
      return;
    }
    if (selection.type === "artwork") {
      if (designer.layers.artwork.locked) return;
      updateDesigner({ ...designer, artwork: designer.artwork.filter((artwork) => artwork.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Artwork reference deleted.");
      return;
    }
    if (selection.type === "build_area") {
      if (designer.layers.artwork.locked) return;
      if (typeof selection.pointIndex === "number") {
        deleteBuildAreaPoint(selection.id, selection.pointIndex);
        return;
      }
      updateDesigner({
        ...designer,
        buildAreas: designer.buildAreas.filter((buildArea) => buildArea.id !== selection.id),
        lightSources: designer.lightSources.map((source) => source.receiverType === "build_area" && source.receiverId === selection.id ? { ...source, receiverType: "canvas", receiverId: undefined } : source)
      });
      setSelection(null);
      return;
    }
    if (selection.type === "light_source" && designer.layers.lightSources.locked) return;
    if (selection.type === "route" && designer.layers.strings.locked) return;
    if (selection.type === "zone" && typeof selection.pointIndex === "number") {
      deleteZonePoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "face_graphic" && typeof selection.pointIndex === "number") {
      deleteFaceGraphicPoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "channel" && typeof selection.pointIndex === "number") {
      deleteChannelPoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "zone") {
      const zones = designer.zones.filter((zone) => zone.id !== selection.id);
      updateDesigner({
        ...designer,
        zones,
        lightSources: designer.lightSources
          .filter((source) => !(source.targetType === "zone" && source.targetId === selection.id))
          .map((source) => source.receiverType === "zone" && source.receiverId === selection.id ? { ...source, receiverType: "canvas", receiverId: undefined } : source),
        groups: (designer.groups ?? []).map((group) => ({
          ...group,
          members: group.members.filter((member) => !(member.type === "zone" && member.id === selection.id))
        }))
      });
      setSelection(null);
    }
    if (selection.type === "face_graphic") {
      updateDesigner({ ...designer, faceGraphics: designer.faceGraphics.filter((element) => element.id !== selection.id) });
      setSelection(null);
      return;
    }
    if (selection.type === "fabrication_path") {
      const path = designer.fabricationPaths.find((entry) => entry.id === selection.id);
      const part = path ? designer.fabricationParts.find((entry) => entry.id === path.partId) : null;
      if (designer.layers.fabrication.locked || path?.locked || part?.locked) return;
      updateDesigner({ ...designer, fabricationPaths: designer.fabricationPaths.filter((entry) => entry.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Fabrication path deleted.");
      return;
    }
    if (selection.type === "projection") {
      const projection = designer.projections.find((entry) => entry.id === selection.id);
      const layerKey = projection?.targetLayer === "reference" ? "artwork" : projection?.targetLayer;
      if (layerKey && designer.layers[layerKey].locked) return;
      updateDesigner({ ...designer, projections: designer.projections.filter((projection) => projection.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Projected reference deleted.");
      return;
    }
    if (selection.type === "derived_geometry") {
      const operation = designer.derivedGeometries.find((entry) => entry.id === selection.id);
      const layerKey = operation?.targetLayer === "reference" ? "artwork" : operation?.targetLayer;
      if (layerKey && designer.layers[layerKey].locked) return;
      updateDesigner({ ...designer, derivedGeometries: designer.derivedGeometries.filter((entry) => entry.id !== selection.id) });
      setSelection(null);
      setGeometrySelections([]);
      setFabricationNotice("Derived profile deleted. Downstream references remain recoverable as broken links.");
      return;
    }
    if (selection.type === "text") {
      const text = designer.texts.find((entry) => entry.id === selection.id);
      if (!text || designer.layers[text.targetLayer === "reference" ? "artwork" : text.targetLayer].locked || text.locked) return;
      updateDesigner({ ...designer, texts: designer.texts.filter((entry) => entry.id !== selection.id) });
      setSelection(null);
      setFabricationNotice("Editable text deleted.");
      return;
    }
    if (selection.type === "channel") {
      removeChannel(selection.id);
      return;
    }
    if (selection.type === "light_source") {
      updateDesigner({ ...designer, lightSources: designer.lightSources.filter((source) => source.id !== selection.id) });
      setSelection(null);
      return;
    }
    if (selection.type === "route" && typeof selection.pointIndex === "number") {
      deleteRoutePoint(selection.id, selection.pointIndex);
      return;
    }
    if (selection.type === "route") {
      updateDesigner(deleteDesignerRoute(designer, selection.id));
      setSelection(null);
      setSelectedRouteIds([]);
      setFabricationNotice("Electrical route deleted.");
      return;
    }
  }

  function copySelection() {
    if (selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "channel" || selection.type === "face_graphic" || selection.type === "route")) setClipboard(selection);
  }

  function focusCreatedCanvasObject(nextSelection: Exclude<DesignerSelection, null>) {
    setSelection(nextSelection);
    setGeometrySelections(isDesignerGeometrySelection(nextSelection) ? [nextSelection] : []);
    setMarqueeChannelIds([]);
    setSelectedRouteIds(nextSelection.type === "route" ? [nextSelection.id] : []);
    const layer = designerLayerForSelection(nextSelection);
    if (layer) setActiveLayer(layer);
    setTool("select");
    setLayersPanelOpen(true);
  }

  function pasteSelection() {
    if (!clipboard) return;
    if (clipboard.type === "artwork") {
      const source = designer.artwork.find((artwork) => artwork.id === clipboard.id);
      if (!source) return;
      const next = designer.artwork.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, x: source.x + designer.snapCm, y: source.y + designer.snapCm };
      updateDesigner({
        ...designer,
        artwork: insertDesignerCopyAbove(designer.artwork, source.id, copy),
        sublayers: inheritDesignerSublayerForCopy(designer.sublayers, "artwork", source.id, copy.id)
      });
      focusCreatedCanvasObject({ type: "artwork", id: copy.id });
    }
    if (clipboard.type === "zone") {
      const source = designer.zones.find((zone) => zone.id === clipboard.id);
      if (!source) return;
      const next = nextDesignerItemNumber(designer.zones, `${source.id}_copy_`);
      const copy = {
        ...source,
        geometryId: undefined,
        id: `${source.id}_copy_${next}`,
        name: `${source.name} Copy`,
        x: source.x + designer.snapCm,
        y: source.y + designer.snapCm,
        points: source.points?.map((point) => ({ ...point, x: point.x + designer.snapCm, y: point.y + designer.snapCm })),
        contours: source.contours?.map((contour) => ({ ...contour, points: contour.points.map((point) => ({ ...point, x: point.x + designer.snapCm, y: point.y + designer.snapCm })) }))
      };
      updateDesigner({
        ...designer,
        zones: insertDesignerCopyAbove(designer.zones, source.id, copy),
        sublayers: inheritDesignerSublayerForCopy(designer.sublayers, "zones", source.id, copy.id)
      });
      focusCreatedCanvasObject({ type: "zone", id: copy.id });
    }
    if (clipboard.type === "face_graphic") {
      const source = designer.faceGraphics.find((element) => element.id === clipboard.id);
      if (!source) return;
      const next = nextDesignerItemNumber(designer.faceGraphics, `${source.id}_copy_`);
      const copy = {
        ...source,
        geometryId: undefined,
        id: `${source.id}_copy_${next}`,
        name: `${source.name} Copy`,
        x: source.x + designer.snapCm,
        y: source.y + designer.snapCm,
        points: source.points?.map((point) => ({ ...point, x: point.x + designer.snapCm, y: point.y + designer.snapCm })),
        contours: source.contours?.map((contour) => ({ ...contour, points: contour.points.map((point) => ({ ...point, x: point.x + designer.snapCm, y: point.y + designer.snapCm })) }))
      };
      updateDesigner({
        ...designer,
        faceGraphics: insertDesignerCopyAbove(designer.faceGraphics, source.id, copy),
        sublayers: inheritDesignerSublayerForCopy(designer.sublayers, "faceGraphic", source.id, copy.id)
      });
      focusCreatedCanvasObject({ type: "face_graphic", id: copy.id });
    }
    if (clipboard.type === "channel") {
      const source = designer.channels.find((channel) => channel.id === clipboard.id);
      if (!source) return;
      const next = nextDesignerItemNumber(designer.channels, `${source.id}_copy_`);
      const copy = {
        ...source,
        geometryId: undefined,
        id: `${source.id}_copy_${next}`,
        name: `${source.name} Copy`,
        points: source.points.map((point) => ({ ...point, x: point.x + designer.snapCm, y: point.y + designer.snapCm }))
      };
      updateDesigner({
        ...designer,
        channels: insertDesignerCopyAbove(designer.channels, source.id, copy),
        sublayers: inheritDesignerSublayerForCopy(designer.sublayers, "channels", source.id, copy.id)
      });
      focusCreatedCanvasObject({ type: "channel", id: copy.id });
    }
    if (clipboard.type === "route") {
      const source = designer.routes.find((route) => route.id === clipboard.id);
      if (!source) return;
      const next = designer.routes.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, points: source.points.map((point) => ({ x: point.x + designer.snapCm, y: point.y + designer.snapCm })) };
      const scope = source.kind === "data_cable" ? "dataCables" : "strings";
      updateDesigner({
        ...designer,
        routes: insertDesignerCopyAbove(designer.routes, source.id, copy),
        sublayers: inheritDesignerSublayerForCopy(designer.sublayers, scope, source.id, copy.id)
      });
      focusCreatedCanvasObject({ type: "route", id: copy.id });
    }
  }

  function zoomToFit() {
    setViewport(fitViewportToDesigner(designer));
  }

  async function compileLayout() {
    if (compiling || saving) return;
    const compileStartedAt = performance.now();
    setCompiling(true);
    setFabricationNotice("Compiling physical layout…");
    try {
      await waitForCompileIndicatorPaint();
      const nextDocument = await compileDesignerDocument(normalizeDefaultSignLayout(documentRef.current));
      replaceDocument(nextDocument);
      discardRuntimeArtifacts();
      const layout = nextDocument.compiledLayout;
      setFabricationNotice(layout?.validation.errors.length
        ? layout.validation.errors[0]
        : `Compiled: ${layout?.pixelMap.length ?? 0} mapped pixels across ${layout?.outputs.filter((output) => output.pixelCount > 0).length ?? 0} outputs.`);
      await save(nextDocument);
    } catch (error) {
      setFabricationNotice(error instanceof Error ? `Compile failed: ${error.message}` : "Compile failed.");
    } finally {
      const indicatorRemainingMs = MIN_COMPILE_INDICATOR_MS - (performance.now() - compileStartedAt);
      if (indicatorRemainingMs > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, indicatorRemainingMs));
      }
      setCompiling(false);
    }
  }

  function openAnimationViewer() {
    setAnimationViewerViewport(fitViewportToDesigner(designer));
    setAnimationViewerOpen(true);
    if (!animationResultRef.current?.ok) void previewAnimation();
  }

  function stopAnimationViewer() {
    setAnimationPlaying(false);
    playerSurfaceRef.current?.stop();
    updateLiveDocument((current) => ({ ...current, previewTimeMs: 0 }), { recordHistory: false });
  }

  function cancelScheduledAnimationPreview() {
    if (animationPreviewTimerRef.current !== null) {
      window.clearTimeout(animationPreviewTimerRef.current);
      animationPreviewTimerRef.current = null;
    }
    pendingAnimationPreviewRef.current = null;
  }

  function flushScheduledAnimationPreview() {
    if (animationTimelineInteractionRef.current) return;
    if (animationPreviewTimerRef.current !== null) {
      window.clearTimeout(animationPreviewTimerRef.current);
      animationPreviewTimerRef.current = null;
    }
    const pending = pendingAnimationPreviewRef.current;
    pendingAnimationPreviewRef.current = null;
    if (pending) void previewAnimation(pending.document, { play: pending.play });
  }

  function scheduleAnimationPreview(sourceDocument: PartituraDocument, options: { play: boolean; immediate?: boolean }) {
    pendingAnimationPreviewRef.current = { document: sourceDocument, play: options.play };
    if (animationPreviewTimerRef.current !== null) {
      window.clearTimeout(animationPreviewTimerRef.current);
      animationPreviewTimerRef.current = null;
    }
    if (animationTimelineInteractionRef.current) return;
    animationPreviewTimerRef.current = window.setTimeout(
      flushScheduledAnimationPreview,
      options.immediate ? 0 : ANIMATION_PREVIEW_DEBOUNCE_MS
    );
  }

  function beginAnimationTimelineInteraction() {
    animationTimelineInteractionRef.current = true;
    if (animationPreviewTimerRef.current !== null) {
      window.clearTimeout(animationPreviewTimerRef.current);
      animationPreviewTimerRef.current = null;
    }
  }

  function endAnimationTimelineInteraction() {
    animationTimelineInteractionRef.current = false;
    flushScheduledAnimationPreview();
  }

  async function previewAnimation(sourceDocument = documentRef.current, options: { play?: boolean } = {}) {
    cancelScheduledAnimationPreview();
    animationGenerationAbortRef.current?.abort();
    const abortController = new AbortController();
    animationGenerationAbortRef.current = abortController;
    const generationId = ++animationGenerationIdRef.current;
    const shouldPlay = options.play ?? true;
    setAnimationGenerating(true);
    try {
      const compiledDocument = normalizeDefaultSignLayout(sourceDocument);
      const compileIsFresh = Boolean(
        compiledDocument.compiledLayout
        && compiledDocument.compiledDesignerSignature === designerCompileSignature(compiledDocument.designer)
      );
      if (!compileIsFresh || !compiledDocument.compiledLayout || compiledDocument.compiledLayout.validation.errors.length) {
        animationResumePlaybackRef.current = false;
        setAnimationPlaying(false);
        setAnimationResult(null);
        setFabricationNotice("Compile the Designer without electrical errors before animating.");
        return;
      }
      const previewDocument = { ...compiledDocument, previewTimeMs: initialAnimationPreviewTime(compiledDocument) };
      const request = await compressedJsonRequest(previewDocument);
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: request.headers,
        body: request.body,
        signal: abortController.signal
      });
      const payload = (await response.json()) as ApiResult;
      if (generationId !== animationGenerationIdRef.current) return;
      animationResultRef.current = payload;
      setAnimationResult(payload);
      if (payload.ok) {
        animationResumePlaybackRef.current = false;
        setAnimationPlaying(shouldPlay);
        setFabricationNotice(`Animation ready: ${payload.partitura?.pixelMap.length ?? 0} mapped pixels.`);
      } else {
        animationResumePlaybackRef.current = false;
        setAnimationPlaying(false);
        setFabricationNotice(payload.message ?? payload.validation?.errors[0]?.message ?? "Animation generation failed.");
      }
      return payload;
    } catch (error) {
      if (abortController.signal.aborted) return undefined;
      if (generationId !== animationGenerationIdRef.current) return;
      const message = error instanceof Error ? error.message : "Animation generation failed.";
      animationResumePlaybackRef.current = false;
      setAnimationPlaying(false);
      setFabricationNotice(message);
      setAnimationResult({ ok: false, message, validation: { errors: [], warnings: [] } });
      return undefined;
    } finally {
      if (animationGenerationAbortRef.current === abortController) animationGenerationAbortRef.current = null;
      if (generationId === animationGenerationIdRef.current) setAnimationGenerating(false);
    }
  }

  async function publishScene() {
    setShareSubmitting(true);
    setShareError(null);
    try {
      const generated = await generateAndSaveAnimation();
      if (!generated) throw new Error("The generated partitura could not be saved.");
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privacy: sharePolicy,
          profile: sharePolicy === "review" ? "review-720p30" : "social-1080p30",
          rightsConfirmed: sharePolicy === "public" && shareRightsConfirmed
        })
      });
      const payload = await response.json() as { publication?: ScenePublication; message?: string };
      if (!response.ok || !payload.publication) throw new Error(payload.message ?? "Unable to create the share.");
      setSharePublication(payload.publication);
      setFabricationNotice("Render queued. The share will activate when the video is ready.");
    } catch (error) {
      setShareError(error instanceof Error ? error.message : "Unable to create the share.");
    } finally {
      setShareSubmitting(false);
    }
  }

  async function generateAndSaveAnimation() {
    const saved = await save(documentRef.current);
    if (!saved) return null;
    const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}/generate`, {
      method: "POST"
    });
    const generated = await response.json() as ApiResult & { saved?: { status: PersistedPartitura["status"]; updatedAt: string } };
    if (!response.ok || !generated.ok || !generated.partitura) {
      setShareError(generated.message ?? "Generate a valid partitura before sharing.");
      return null;
    }
    animationResultRef.current = generated;
    setAnimationResult(generated);
    generatedPartituraStaleRef.current = false;
    setPartitura((current) => ({
      ...current,
      status: generated.saved?.status ?? "validated",
      updatedAt: generated.saved?.updatedAt ?? current.updatedAt,
      generatedPartitura: generated.partitura,
      validationReport: generated.validation
    }));
    setFabricationNotice(`partitura.v2 generated and saved · ${generated.partitura.pixelMap.length} pixels.`);
    return generated.partitura;
  }

  async function revokeCurrentShare() {
    if (!sharePublication) return;
    const response = await fetch(`/api/lighting/scene-shares/${encodeURIComponent(sharePublication.shareId)}`, { method: "DELETE" });
    if (!response.ok) {
      setShareError("Unable to revoke the link.");
      return;
    }
    setSharePublication((current) => current ? { ...current, revoked: true, shareUrl: null } : current);
  }

  function previewAnimationAt(timeMs: number) {
    const nextTimeMs = Math.max(0, Math.round(timeMs));
    setAnimationPlaying(false);
    updateLiveDocument((current) => ({ ...current, previewTimeMs: nextTimeMs }), { recordHistory: false });
    playerSurfaceRef.current?.seek(nextTimeMs);
  }

  function beginAnimationTimelineResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = Math.min(animationTimelineHeight, maximumTimelineHeight(window.innerHeight));
    setAnimationTimelineCollapsed(false);
    const move = (moveEvent: PointerEvent) => {
      setAnimationTimelineHeight(Math.min(maximumTimelineHeight(window.innerHeight), Math.max(140, startHeight - (moveEvent.clientY - startY))));
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
  }

  function patchOpticalTreatment(treatmentId: string, patch: Partial<DesignerOpticalTreatment>) {
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return {
        ...current,
        designer: {
          ...currentDesigner,
          lightSources: currentDesigner.lightSources.map((treatment) => treatment.id === treatmentId ? { ...treatment, ...patch, ...(patch.mode ? { stringIds: [] } : {}) } : treatment)
        }
      };
    });
  }

  function addOpticalTreatment(mode: DesignerOpticalMode) {
    if (!selectedOpticalTarget || selectedOpticalTreatments.some((treatment) => treatment.mode === mode)) return;
    const treatment = {
      ...createDefaultOpticalTreatment(selectedOpticalTarget.type, selectedOpticalTarget.id, mode),
      name: `${selectedZone?.name ?? selectedChannel?.name ?? selectedOpticalTarget.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`
    };
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      if (currentDesigner.lightSources.some((entry) => entry.id === treatment.id)) return current;
      return { ...current, designer: { ...currentDesigner, lightSources: [...currentDesigner.lightSources, treatment] } };
    });
  }

  function removeOpticalTreatment(treatmentId: string) {
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return { ...current, designer: { ...currentDesigner, lightSources: currentDesigner.lightSources.filter((treatment) => treatment.id !== treatmentId) } };
    });
  }

  function setSelectedOpticalMode(mode: DesignerOpticalMode, enabled: boolean) {
    if (!selectedOpticalTargets.length) return;
    const selectedKeys = new Set(selectedOpticalTargets.map((target) => `${target.type}:${target.id}`));
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      const existingKeys = new Set<string>();
      const lightSources = currentDesigner.lightSources.map((source) => {
        const key = `${source.targetType}:${source.targetId}`;
        if (source.mode !== mode || !selectedKeys.has(key)) return source;
        existingKeys.add(key);
        return source.enabled === enabled ? source : { ...source, enabled };
      });
      if (enabled) {
        selectedOpticalTargets.forEach((target) => {
          const key = `${target.type}:${target.id}`;
          if (existingKeys.has(key)) return;
          const targetName = target.type === "zone"
            ? currentDesigner.zones.find((zone) => zone.id === target.id)?.name
            : currentDesigner.channels.find((channel) => channel.id === target.id)?.name;
          const source = {
            ...createDefaultOpticalTreatment(target.type, target.id, mode),
            name: `${targetName ?? target.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`
          };
          lightSources.push(source);
        });
      }
      return { ...current, designer: { ...currentDesigner, lightSources } };
    });
  }

  function patchSelectedOpticalMode(mode: DesignerOpticalMode, patch: Partial<DesignerOpticalTreatment>) {
    if (!selectedOpticalTargets.length) return;
    const selectedKeys = new Set(selectedOpticalTargets.map((target) => `${target.type}:${target.id}`));
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return {
        ...current,
        designer: {
          ...currentDesigner,
          lightSources: currentDesigner.lightSources.map((source) => (
            source.mode === mode && source.enabled && selectedKeys.has(`${source.targetType}:${source.targetId}`)
              ? { ...source, ...patch }
              : source
          ))
        }
      };
    });
  }

  function updateAnimationDocument(nextDocument: PartituraDocument) {
    const resumePlayback = animationPlaying || animationResumePlaybackRef.current;
    const previewTimeMs = playerStatus?.timeMs ?? nextDocument.previewTimeMs;
    const clipEnablementChanged = clipEnablementSignature(documentRef.current) !== clipEnablementSignature(nextDocument);
    if (nextDocument !== documentRef.current) recordDesignerHistory(documentRef.current);
    replaceDocument(nextDocument);
    animationResumePlaybackRef.current = resumePlayback;
    if (animationPlaying) setAnimationPlaying(false);

    // A superseded HTTP response must never install an older clip arrangement.
    // Pointer drags are regenerated once on release instead of once per move.
    animationGenerationAbortRef.current?.abort();
    animationGenerationAbortRef.current = null;
    animationGenerationIdRef.current += 1;
    setAnimationGenerating(false);

    if (clipEnablementChanged) {
      // A muted clip must stop contributing immediately. Do not leave the old
      // frame visible while its replacement runtime is prepared.
      animationResultRef.current = null;
      setAnimationResult(null);
    }
    generatedPartituraStaleRef.current = true;
    setPartitura((current) => (
      current.generatedPartitura === undefined ? current : { ...current, generatedPartitura: undefined }
    ));
    scheduleAnimationPreview(
      { ...nextDocument, previewTimeMs },
      { play: resumePlayback, immediate: clipEnablementChanged }
    );
  }

  const canCopySelection = Boolean(selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "channel" || selection.type === "face_graphic" || selection.type === "route"));
  const canPasteSelection = Boolean(clipboard && (
    selectedArtwork && clipboard.type === "artwork"
    || (selectedZone || selectedChannel) && (clipboard.type === "zone" || clipboard.type === "channel")
    || selectedFaceGraphic && clipboard.type === "face_graphic"
    || selectedRoute && clipboard.type === "route"
  ));
  const canDeleteSelection = Boolean(selection)
    && selection?.type !== "controller"
    && !(selection?.type === "artwork" && designer.layers.artwork.locked)
    && !(selection?.type === "build_area" && designer.layers.artwork.locked)
    && !(selection?.type === "projection" && selectedProjection && designer.layers[selectedProjection.targetLayer === "reference" ? "artwork" : selectedProjection.targetLayer].locked)
    && !(selection?.type === "derived_geometry" && selectedDerivedGeometry && designer.layers[selectedDerivedGeometry.targetLayer === "reference" ? "artwork" : selectedDerivedGeometry.targetLayer].locked)
    && !(selection?.type === "text" && selectedText && (designer.layers[selectedText.targetLayer === "reference" ? "artwork" : selectedText.targetLayer].locked || selectedText.locked))
    && !(selection?.type === "light_source" && designer.layers.lightSources.locked)
    && !(selection?.type === "route" && designer.layers.strings.locked);
  const selectedArtworkCanCreateZones = Boolean(selectedArtwork && selectedArtworkAsset && (selectedArtworkAsset.mimeType.toLowerCase().includes("svg") || selectedArtworkAsset.fileName.toLowerCase().endsWith(".svg")));
  function changeConstructionSide(view: DesignerRouteSurfaceView) {
    setRouteSurfaceView(view);
    if (view !== "both") {
      setRouteCreationSurface(view);
      setChannelCreationSurface(view);
    }
    if (view !== "both" && selectedChannel && (selectedChannel.fabricationSurface ?? "front") !== view) {
      setSelection(null);
      setGeometrySelections([]);
      setMarqueeChannelIds([]);
    }
    if (view !== "both" && selectedRoute && (selectedRoute.designSurface ?? "rear") !== view) setSelection(null);
  }

  function focusCompileIssueTarget(target: DesignerCompileIssueTarget) {
    const route = target.type === "route" ? designer.routes.find((entry) => entry.id === target.id) : null;
    const zone = target.type === "zone" ? designer.zones.find((entry) => entry.id === target.id) : null;
    const channel = target.type === "channel" ? designer.channels.find((entry) => entry.id === target.id) : null;
    const controller = target.type === "controller" ? designer.controller : null;
    if (!route && !zone && !channel && !controller) return;

    setCompileIssuesOpen(false);
    setEditorMode("design");
    setTool("select");
    if (route) changeConstructionSide(route.designSurface === "front" ? "front" : "rear");
    if (channel) changeConstructionSide(channel.fabricationSurface === "rear" ? "rear" : "front");
    const nextSelection: DesignerSelection = route
      ? { type: "route", id: route.id }
      : zone
        ? { type: "zone", id: zone.id }
        : channel
          ? { type: "channel", id: channel.id }
          : { type: "controller", id: designer.controller.id };
    selectDesignerItem(nextSelection);
    if (target.action === "lighting_setup" && (zone || channel)) setLightingEditorOpen(true);

    const bounds = route
      ? routeBounds([route])
      : zone
        ? { minX: zone.x, minY: zone.y, maxX: zone.x + zone.width, maxY: zone.y + zone.height }
        : channel
          ? routeBounds([{ id: channel.id, name: channel.name, kind: "data_cable", points: channel.points }])
          : controller
            ? { minX: controller.x, minY: controller.y, maxX: controller.x + controller.width, maxY: controller.y + controller.height }
            : null;
    if (!bounds) return;
    const objectWidth = Math.max(1, bounds.maxX - bounds.minX);
    const objectHeight = Math.max(1, bounds.maxY - bounds.minY);
    const padding = Math.max(3, Math.max(objectWidth, objectHeight) * 0.18);
    const aspect = Math.max(0.1, activeViewport.width / activeViewport.height);
    const width = Math.max(Math.min(activeViewport.width, 45), objectWidth + padding * 2, (objectHeight + padding * 2) * aspect);
    const height = width / aspect;
    setViewport(clampViewport({
      x: (bounds.minX + bounds.maxX) / 2 - width / 2,
      y: (bounds.minY + bounds.maxY) / 2 - height / 2,
      width,
      height
    }, designer));
  }

  function compileIssueTargetIcon(target: DesignerCompileIssueTarget) {
    if (target.type === "route") {
      const route = designer.routes.find((entry) => entry.id === target.id);
      return route?.kind === "data_cable" ? <Cable className="h-3.5 w-3.5" /> : <Waypoints className="h-3.5 w-3.5" />;
    }
    if (target.type === "zone") return <CircleDot className="h-3.5 w-3.5" />;
    if (target.type === "channel") return <Waves className="h-3.5 w-3.5" />;
    return <Cpu className="h-3.5 w-3.5" />;
  }

  function compileIssueTargetTone(target: DesignerCompileIssueTarget) {
    if (target.type === "route") {
      const route = designer.routes.find((entry) => entry.id === target.id);
      return route?.kind === "data_cable"
        ? "!border-emerald-500 !bg-emerald-100 !text-emerald-800 dark:!bg-emerald-950/40 dark:!text-emerald-300"
        : "!border-amber-500 !bg-amber-100 !text-amber-900 dark:!bg-amber-950/40 dark:!text-amber-300";
    }
    if (target.type === "zone") return "!border-sky-500 !bg-sky-100 !text-sky-800 dark:!bg-sky-950/40 dark:!text-sky-300";
    if (target.type === "channel") return "!border-amber-500 !bg-amber-100 !text-amber-900 dark:!bg-amber-950/40 dark:!text-amber-300";
    return "!border-slate-400 !bg-slate-100 !text-slate-700 dark:!bg-slate-900/50 dark:!text-slate-300";
  }

  function compileIssueLightingHostEditor(issue: DesignerCompileIssue) {
    if (!issue.id.includes("shared-pixels:")) return null;
    const routeTarget = issue.targets.find((target) => target.type === "route");
    const route = routeTarget ? designer.routes.find((entry) => entry.id === routeTarget.id && entry.kind === "led_string") : null;
    if (!route) return null;
    const candidates = issue.targets
      .filter((target): target is DesignerCompileIssueTarget & { type: "zone" | "channel" } => target.type === "zone" || target.type === "channel")
      .filter((target, index, entries) => entries.findIndex((entry) => entry.type === target.type && entry.id === target.id) === index);
    if (candidates.length < 2) return null;
    const value = route.lightingHost ? `${route.lightingHost.type}:${route.lightingHost.id}` : "auto";
    const currentHostIsCandidate = !route.lightingHost || candidates.some((target) => target.type === route.lightingHost?.type && target.id === route.lightingHost?.id);
    return (
      <label className="mt-3 grid gap-1.5 rounded-md border border-amber-500/35 bg-card/80 p-2 text-xs font-semibold text-foreground">
        <span>Lighting host for {route.name}</span>
        <select className="h-9 rounded-md border border-input bg-card px-3 text-sm font-normal text-foreground" value={value} onChange={(event) => {
          if (event.target.value === "auto") {
            patchRoute(route.id, { lightingHost: undefined });
            return;
          }
          const separator = event.target.value.indexOf(":");
          const type = event.target.value.slice(0, separator);
          const id = event.target.value.slice(separator + 1);
          if ((type === "zone" || type === "channel") && id) patchRoute(route.id, { lightingHost: { type, id } });
        }}>
          <option value="auto">Auto · geometry</option>
          {!currentHostIsCandidate ? <option value={value}>Current · {route.lightingHost?.id}</option> : null}
          {candidates.map((target) => <option key={`${target.type}:${target.id}`} value={`${target.type}:${target.id}`}>{target.type === "zone" ? "Zone" : "Channel"} · {target.label}</option>)}
        </select>
        <span className="font-normal text-muted-foreground">Choose the physical owner of this string, then Compile again.</span>
      </label>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border-2 bg-card px-2 whitespace-nowrap">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" density="compact" type="button" className="shrink-0 px-2">
            <Link href="/partituras/designer">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <div className="min-w-0 pr-1">
            <div className="max-w-[220px] truncate text-body-sm font-semibold">{partitura.name}</div>
          </div>
        </div>
        <div className="flex h-8 shrink-0 items-center rounded-md border border-input bg-surface-2 p-0.5">
          <button type="button" className={`flex h-7 items-center gap-1 rounded px-2 text-body-sm ${editorMode === "design" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover"}`} onClick={() => setEditorMode("design")}>
            <MousePointer2 className="h-3.5 w-3.5" /> Design
          </button>
          <button type="button" disabled={editorMode !== "animate" && !canAnimate} title={!canAnimate && editorMode !== "animate" ? "Compile the current Designer without electrical errors to enable Animate" : "Open animation timeline"} className={`flex h-7 items-center gap-1 rounded px-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-40 ${editorMode === "animate" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover"}`} onClick={() => setEditorMode("animate")}>
            <Play className="h-3.5 w-3.5" /> Animate
          </button>
        </div>

        <div className="h-7 w-px shrink-0 bg-border" />
        {editorMode === "design" ? (
          <>
            <details ref={setupDetailsRef} className="group relative shrink-0" onToggle={(event) => {
              if (event.currentTarget.open) {
                setLedStripSetupDraft(ledStripSetupDraftFromDesigner(designer));
                setSelectedLedStripProfileId(designer.stripConfiguration?.sourceProfileId ?? "");
              } else {
                setLedStripSetupDraft(null);
                setSelectedLedStripProfileId(designer.stripConfiguration?.sourceProfileId ?? "");
              }
            }}>
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-card px-2 text-body-sm hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <Settings2 className="h-4 w-4" /> Setup
              </summary>
              <div className="absolute left-0 top-10 z-50 max-h-[calc(100vh-5rem)] w-[560px] max-w-[calc(100vw-2rem)] space-y-3 overflow-x-hidden overflow-y-auto rounded-lg border border-border-2 bg-card p-4 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Canvas</div>
                  <Button type="button" variant="ghost" className="h-7 w-7 px-0" title="Close Setup" aria-label="Close Setup" onClick={cancelLedStripSetupDraft}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <ToolbarField label="Units">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.rulerUnit} onChange={(event) => patchDesigner({ rulerUnit: event.target.value as DesignerForm["rulerUnit"] })}>
                    <option value="cm">cm</option>
                    <option value="in">inches</option>
                  </select>
                </ToolbarField>
                <div className="flex items-center gap-3">
                  <ToolbarNumber label="W" value={designer.canvasWidthCm} suffix="cm" onChange={(canvasWidthCm) => patchDesigner({ canvasWidthCm })} />
                  <ToolbarNumber label="H" value={designer.canvasHeightCm} suffix="cm" onChange={(canvasHeightCm) => patchDesigner({ canvasHeightCm })} />
                </div>
                <ToolbarNumber label="Snap" value={designer.snapCm} suffix="cm" onChange={(snapCm) => patchDesigner({ snapCm })} />
                <label className="flex cursor-pointer items-center justify-between gap-3 text-body-sm">
                  <span>Show work lines</span>
                  <input type="checkbox" checked={designer.workLinesVisible} onChange={(event) => patchDesigner({ workLinesVisible: event.target.checked })} className="h-4 w-4 accent-teal-600" />
                </label>
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alignment / calibration</div>
                <label className="flex cursor-pointer items-center justify-between gap-3 text-body-sm">
                  <span>Alignment marks</span>
                  <input type="checkbox" checked={designer.alignmentMarks.enabled} onChange={(event) => patchDesigner({ alignmentMarks: { ...designer.alignmentMarks, enabled: event.target.checked } })} className="h-4 w-4 accent-blue-600" />
                </label>
                {designer.alignmentMarks.enabled ? (
                  <>
                    <div className="flex items-center gap-3">
                      <ToolbarNumber label="Origin X" value={designer.alignmentMarks.originXcm} suffix="cm" onChange={(originXcm) => patchDesigner({ alignmentMarks: { ...designer.alignmentMarks, originXcm: Math.max(0, originXcm) } })} />
                      <ToolbarNumber label="Origin Y" value={designer.alignmentMarks.originYcm} suffix="cm" onChange={(originYcm) => patchDesigner({ alignmentMarks: { ...designer.alignmentMarks, originYcm: Math.max(0, originYcm) } })} />
                    </div>
                    <ToolbarNumber label="Measured spacing" value={designer.alignmentMarks.spacingMm} suffix="mm" onChange={(spacingMm) => patchDesigner({ alignmentMarks: { ...designer.alignmentMarks, spacingMm: Math.max(0.001, spacingMm) } })} />
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-body-sm">
                      <span>Lock marks</span>
                      <input type="checkbox" checked={designer.alignmentMarks.locked} onChange={(event) => patchDesigner({ alignmentMarks: { ...designer.alignmentMarks, locked: event.target.checked } })} className="h-4 w-4 accent-blue-600" />
                    </label>
                    <p className="text-meta text-muted-foreground">Drag either guide to move the orthogonal set. The spacing remains exact.</p>
                  </>
                ) : null}
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CNC fabrication</div>
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-center gap-3">
                  <ToolbarField label="Router bit preset" className="min-w-0">
                    <select className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-body-sm" value={fabricationCutterPreset ? String(fabricationCutterPreset) : "custom"} onChange={(event) => {
                      if (event.target.value !== "custom") patchDesigner({ fabricationCutterDiameterMm: Number(event.target.value) });
                    }}>
                      <option value="1.5">Ø1.5 mm</option>
                      <option value="2">Ø2 mm</option>
                      <option value="3">Ø3 mm</option>
                      <option value="3.175">Ø3.175 mm · 1/8 in</option>
                      <option value="4">Ø4 mm</option>
                      <option value="6">Ø6 mm</option>
                      <option value="6.35">Ø6.35 mm · 1/4 in</option>
                      <option value="custom">Custom</option>
                    </select>
                  </ToolbarField>
                  <ToolbarField label="Router bit unit" className="min-w-0 justify-end">
                    <select className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.fabricationCutterUnit} onChange={(event) => patchDesigner({ fabricationCutterUnit: event.target.value as DesignerForm["fabricationCutterUnit"] })}>
                      <option value="mm">mm</option>
                      <option value="in">inches</option>
                      <option value="cm">cm</option>
                    </select>
                  </ToolbarField>
                </div>
                <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] items-center gap-3">
                  <ToolbarNumber label="Router bit diameter" value={cutterDiameterForDisplay(designer.fabricationCutterDiameterMm, designer.fabricationCutterUnit)} suffix={designer.fabricationCutterUnit} onChange={(value) => patchDesigner({ fabricationCutterDiameterMm: Math.max(0.001, cutterDiameterFromDisplay(value, designer.fabricationCutterUnit)) })} />
                  <ToolbarNumber label="Hole diameter" value={designer.holeDiameterMm} suffix="mm" onChange={(holeDiameterMm) => patchDesigner({ holeDiameterMm: Math.max(0.001, holeDiameterMm) })} />
                </div>
                <ToolbarField label="Channel router bit">
                  <select className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-body-sm" value={channelRouterPreset ? String(channelRouterPreset.diameterMm) : "current"} onChange={(event) => {
                    if (event.target.value !== "current") patchDesigner({ channelRouterDiameterMm: channelWidthForRouterDiameter(Number(event.target.value)) });
                  }}>
                    {!channelRouterPreset ? <option value="current">Current · {designer.channelRouterDiameterMm} mm · {(designer.channelRouterDiameterMm / 25.4).toFixed(3)} in</option> : null}
                    {CHANNEL_ROUTER_BIT_PRESETS.map((preset) => <option key={preset.diameterMm} value={preset.diameterMm}>Ø {preset.label}</option>)}
                  </select>
                </ToolbarField>
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">LED layout</div>
                <p className="text-meta text-muted-foreground">Changes in this section preview live on the canvas. Apply them to update the partitura.</p>
                <div className="flex items-end gap-2">
                  <ToolbarField label="Strip preset" className="min-w-0 flex-1">
                    <select className="h-8 min-w-0 flex-1 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedLedStripProfileId} onChange={(event) => previewSelectedLedStripProfile(event.target.value)}>
                      <option value="">Custom / current values</option>
                      {ledStripProfiles.length ? null : <option value="catalog-unavailable" disabled>Catalog unavailable</option>}
                      {ledStripProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                    </select>
                  </ToolbarField>
                </div>
                <p className="text-meta text-muted-foreground">
                  Preview: {ledStripPreviewDesigner.stripConfiguration?.name ?? "Custom LED strip"}
                  {ledStripPreviewDesigner.stripConfiguration?.construction === "continuous"
                    ? ledStripPreviewDesigner.stripConfiguration.cutMode === "free_cut"
                      ? " · Free cut"
                      : ` · ${formatDecimal(ledStripPreviewDesigner.stripConfiguration.cutSegmentLengthMm ?? 100)} mm per cut`
                    : ` · ${formatDecimal(ledStripPreviewDesigner.stripConfiguration?.physicalLedsPerCutSegment ?? 1)} LEDs per cut`}
                </p>
                <div className="grid grid-cols-2 items-center gap-3">
                  <ToolbarNumber label="Pixels/m" value={ledStripPreviewDesigner.addressablePixelsPerMeter} onChange={(addressablePixelsPerMeter) => patchCustomLedStripConfiguration({ addressablePixelsPerMeter })} />
                  <ToolbarNumber label="LEDs/m" value={ledStripPreviewDesigner.ledsPerMeter} onChange={(physicalLedsPerMeter) => patchCustomLedStripConfiguration({ physicalLedsPerMeter })} />
                </div>
                {ledStripPreviewDesigner.stripConfiguration?.construction === "continuous" ? <div className="grid grid-cols-2 items-center gap-3">
                  <ToolbarField label="Cut mode">
                    <select className="h-8 min-w-0 rounded-md border border-input bg-card px-2 text-body-sm" value={ledStripPreviewDesigner.stripConfiguration.cutMode} onChange={(event) => patchCustomLedStripConfiguration({ cutMode: event.target.value === "free_cut" ? "free_cut" : "marked_segments" })}>
                      <option value="marked_segments">Marked segments</option>
                      <option value="free_cut">Free cut</option>
                    </select>
                  </ToolbarField>
                  <ToolbarNumber label="Voltage" value={ledStripPreviewDesigner.stripConfiguration?.voltageV ?? 5} suffix="V" onChange={(voltageV) => patchCustomLedStripConfiguration({ voltageV: Math.max(0.1, voltageV) })} />
                </div> : <div className="grid grid-cols-2 items-center gap-3">
                  <ToolbarNumber label="LEDs / pixel" value={ledStripPreviewDesigner.stripConfiguration?.physicalLedsPerAddressablePixel ?? 1} onChange={(physicalLedsPerAddressablePixel) => patchCustomLedStripConfiguration({ physicalLedsPerAddressablePixel: Math.max(0.1, physicalLedsPerAddressablePixel) })} />
                  <ToolbarNumber label="LEDs / cut" value={ledStripPreviewDesigner.stripConfiguration?.physicalLedsPerCutSegment ?? 1} onChange={(physicalLedsPerCutSegment) => patchCustomLedStripConfiguration({ physicalLedsPerCutSegment: Math.max(0.1, physicalLedsPerCutSegment) })} />
                </div>}
                {ledStripPreviewDesigner.stripConfiguration?.construction !== "continuous" ? <ToolbarNumber label="Voltage" value={ledStripPreviewDesigner.stripConfiguration?.voltageV ?? 5} suffix="V" onChange={(voltageV) => patchCustomLedStripConfiguration({ voltageV: Math.max(0.1, voltageV) })} /> : null}
                {stripConsistencyNotice ? <p className="text-meta text-amber-700 dark:text-amber-300">{stripConsistencyNotice}</p> : null}
                {ledStripPreviewDesigner.stripConfiguration?.construction === "continuous" && ledStripPreviewDesigner.stripConfiguration.cutMode !== "free_cut" ? <ToolbarNumber label="Cut segment" value={ledStripPreviewDesigner.stripConfiguration.cutSegmentLengthMm ?? 100} suffix="mm" onChange={(cutSegmentLengthMm) => patchCustomLedStripConfiguration({ cutSegmentLengthMm: Math.max(0.1, cutSegmentLengthMm) })} /> : null}
                <div className="grid grid-cols-2 items-center gap-3">
                  <ToolbarNumber label="LED package" value={ledStripPreviewDesigner.ledPackageSizeMm} suffix="mm" onChange={(ledPackageSizeMm) => patchCustomLedStripConfiguration({ ledPackageSizeMm: Math.max(0.1, ledPackageSizeMm) })} />
                  <ToolbarNumber label="PCB width" value={ledStripPreviewDesigner.ledPcbWidthMm} suffix="mm" onChange={(pcbWidthMm) => patchCustomLedStripConfiguration({ pcbWidthMm: Math.max(0.1, pcbWidthMm) })} />
                </div>
                <div className="flex justify-end gap-2 border-t border-border pt-3">
                  <Button type="button" variant="outline" density="compact" onClick={cancelLedStripSetupDraft}>Cancel</Button>
                  <Button type="button" density="compact" disabled={!ledStripSetupDirty} onClick={applyLedStripSetupDraft}>Apply changes</Button>
                </div>
              </div>
            </details>
            <Button type="button" variant={snapToGrid ? "default" : "outline"} density="compact" className="px-2" title={snapToGrid ? `Snap to grid enabled (${designer.snapCm} cm)` : "Snap to grid disabled"} aria-label="Snap to grid" aria-pressed={snapToGrid} onClick={() => setSnapToGrid((enabled) => !enabled)}>
              <Magnet className="h-4 w-4" />
            </Button>
            <Button type="button" variant={designer.rulerVisible ? "default" : "outline"} density="compact" className="px-2" title="Show or hide rulers" aria-pressed={designer.rulerVisible} onClick={() => patchDesigner({ rulerVisible: !designer.rulerVisible })}>
              <Ruler className="h-4 w-4" /><span className="hidden 2xl:inline">Ruler</span>
            </Button>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Fit canvas to view" aria-label="Fit canvas to view" onClick={zoomToFit}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant={layersPanelOpen ? "default" : "outline"} density="compact" className="px-2" title={layersPanelOpen ? "Close Layers panel" : "Open Layers panel"} aria-label="Layers" onClick={() => setLayersPanelOpen((open) => !open)}>
              <Layers className="h-4 w-4" /> <span className="hidden xl:inline">{activeLayer ? ACTIVE_LAYER_LABELS[activeLayer] : "Layers"}</span>
            </Button>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Validate and export fabrication geometry" onClick={() => { setFabricationExportResult(null); setFabricationNotice("Ready to export"); setFabricationExportOpen(true); }}>
              <Download className="h-4 w-4" /> <span className="hidden xl:inline">Export</span>
            </Button>
          </>
        ) : (
          <>
            <ToolbarField label="Preview">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={animationDiffuser} onChange={(event) => setAnimationDiffuser(event.target.value as DesignerAnimationDiffuser)}>
                <option value="as_built">As built</option>
                <option value="led_map">LED map</option>
              </select>
            </ToolbarField>
            <label className={`flex h-8 items-center gap-2 rounded-md border border-border-2 bg-card px-2 text-body-sm font-medium ${animationDiffuser === "as_built" ? "cursor-pointer text-ink-secondary hover:border-border-strong hover:bg-surface-hover hover:text-foreground" : "cursor-not-allowed text-muted-foreground opacity-60"}`} title="Enable or bypass the Face Graphic stencil in this preview">
              <input
                type="checkbox"
                checked={animationFaceMaskEnabled}
                disabled={animationDiffuser !== "as_built"}
                onChange={(event) => setAnimationFaceMaskEnabled(event.target.checked)}
                className="h-4 w-4 cursor-pointer accent-blue-600 disabled:cursor-not-allowed"
              />
              <span>Face mask</span>
            </label>
            <ToolbarField label="Outlines">
              <select
                className="h-8 rounded-md border border-input bg-card px-2 text-body-sm"
                value={diffuserSettings.outlineMode}
                title="Choose which zone and channel outlines are shown"
                onChange={(event) => setDiffuserSettings((current) => ({ ...current, outlineMode: event.target.value as DiffuserRenderSettings["outlineMode"] }))}
              >
                <option value="all">All</option>
                <option value="active">Active sources</option>
                <option value="zones">Zones</option>
                <option value="channels">Channels</option>
                <option value="none">None</option>
              </select>
            </ToolbarField>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Open fullscreen viewer" onClick={openAnimationViewer}>
              <Maximize2 className="h-4 w-4" /> <span className="hidden xl:inline">Viewer</span>
            </Button>
            <Button type="button" variant="outline" density="compact" className="px-2" disabled={animationGenerating || saving} title="Generate and save the firmware partitura" onClick={() => void generateAndSaveAnimation()}>
              <Sparkles className="h-4 w-4" /> <span className="hidden xl:inline">Generate</span>
            </Button>
            <Button type="button" variant="outline" density="compact" className="px-2" title="Render a video or create a controlled share" onClick={() => { setShareError(null); setShareOpen(true); }}>
              <Share2 className="h-4 w-4" /> <span className="hidden xl:inline">Share</span>
            </Button>
          </>
        )}

        <div className="ml-auto flex min-w-0 shrink items-center gap-1.5" aria-live="polite">
          {compileIsCurrent && compileIssueCount ? (
            <Button
              type="button"
              variant="outline"
              density="compact"
              className={`px-2 ${compileErrors.length ? "border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20" : "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"}`}
              title={`Review ${compileIssueCount} compile ${compileIssueCount === 1 ? "issue" : "issues"}`}
              aria-label={`Review ${compileIssueCount} compile ${compileIssueCount === 1 ? "issue" : "issues"}`}
              onClick={() => setCompileIssuesOpen(true)}
            >
              <AlertCircle className="h-4 w-4" /> Review issues ({compileIssueCount})
            </Button>
          ) : null}
          <span className="hidden max-w-[160px] truncate text-meta text-muted-foreground 2xl:inline" title={fabricationNotice}>{fabricationNotice}</span>
          <ThemeToggle compact />
          <Button type="button" variant="outline" density="compact" className="px-2" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo" disabled={!undoHistoryRef.current.length} onClick={undoDesignerChange}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" density="compact" className="px-2" title="Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y)" aria-label="Redo" disabled={!redoHistoryRef.current.length} onClick={redoDesignerChange}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="outline" density="compact" className={`px-2 ${compileIsCurrent && !compiling ? "text-muted-foreground" : "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950"}`} onClick={() => void compileLayout()} disabled={compiling || saving || compileIsCurrent} title={compileControlLabel} aria-label={compileControlLabel} aria-busy={compiling}>
            {compiling ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Hammer className="h-4 w-4" />} <span>{compileControlLabel}</span>
          </Button>
          <Button type="button" variant="outline" density="compact" className={`px-2 ${hasUnsavedChanges ? "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950" : "text-muted-foreground"}`} onClick={() => void save()} disabled={compiling || saving || !hasUnsavedChanges} title={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"} aria-label={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"}>
            <Save className="h-4 w-4" /> <span className="hidden xl:inline">{saving ? "Saving" : "Save"}</span>
          </Button>
        </div>
      </header>

      {compiling ? (
        <div
          className="fixed right-4 top-14 z-[100] flex items-center gap-2 rounded-md border border-amber-400 bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl"
          role="status"
          aria-live="assertive"
          aria-label="Compiling physical layout"
        >
          <LoaderCircle className="h-4 w-4 animate-spin" />
          Compiling physical layout…
        </div>
      ) : null}

      {editorMode === "design" ? <div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-3 whitespace-nowrap">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
        {!selection || nodeCreationToolActive || tool === "move" || tool === "path_trim" || tool === "work_line" ? (
          <>
            <span className="shrink-0 text-body-sm font-semibold text-foreground">{DESIGNER_TOOL_LABELS[tool]}</span>
            <div className="h-6 w-px shrink-0 bg-border" />
          </>
        ) : null}
        {editorMode === "design" && (!selection || nodeCreationToolActive || tool === "move" || tool === "path_trim" || tool === "work_line") ? <span className="text-body-sm text-muted-foreground">{designerToolInstruction(tool)}{tool === "work_line" ? " · Artwork / Reference" : activeLayer ? ` · ${ACTIVE_LAYER_LABELS[activeLayer]} layer` : " · Choose a layer to begin"}</span> : null}
        {editorMode === "design" && tool === "move" ? (
          <ToolbarField label="Fixed axis">
            <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={moveAxis} onChange={(event) => setMoveAxis(event.target.value as DesignerMoveAxis)}>
              <option value="x">X only</option>
              <option value="y">Y only</option>
            </select>
          </ToolbarField>
        ) : null}
        {editorMode === "design" && nodeCreationToolActive ? (
          <ToolbarField label="New node">
            <NodeTypePicker value={nodeCreationType} onChange={setNodeCreationType} />
          </ToolbarField>
        ) : null}
        {editorMode === "design" && nodeCreationToolActive && tool === "channel_bezier" ? (
          <>
            <ToolbarField label="Create on">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-60" value={channelCreationSurface} disabled={routeSurfaceView !== "both"} onChange={(event) => setChannelCreationSurface(event.target.value === "rear" ? "rear" : "front")}>
                <option value="front">Front</option>
                <option value="rear">Rear</option>
              </select>
            </ToolbarField>
            <ToolbarField label="From path">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={channelPathAlignment} onChange={(event) => setChannelPathAlignment(event.target.value as ChannelPathAlignment)}>
                <option value="left">Left edge</option>
                <option value="center">Center</option>
                <option value="right">Right edge</option>
                <option value="inside">Inside offset</option>
                <option value="outside">Outside offset</option>
              </select>
            </ToolbarField>
            {channelPathAlignment === "inside" || channelPathAlignment === "outside" ? <ToolbarNumber label="Offset" value={channelPathOffsetMm} suffix="mm" onChange={(value) => setChannelPathOffsetMm(Math.max(0, value))} /> : null}
            <Button type="button" variant="outline" density="compact" disabled={!geometrySelections.length || designer.layers.zones.locked} title={geometrySelections.length ? "Create one Channel per non-branching connected chain" : "Select one or more source paths before activating Channel"} onClick={createChannelsFromSelectedGeometry}>
              <Waves className="h-4 w-4" /> Generate Channel
            </Button>
          </>
        ) : null}
        {editorMode === "design" && activeSelectedRouteIds.length === 2 && selectedLedStringIds.length === 2 ? (
          <>
            <Badge>2 strings</Badge>
            <Button type="button" variant="outline" density="compact" disabled={Boolean(stringConnectionPlan.reason) || designer.layers.strings.locked} title={stringConnectionPlan.reason ?? `Connect output ${stringConnectionPlan.output} with a soldered data cable`} onClick={connectSelectedStrings}>
              <Cable className="h-4 w-4" /> Connect strings
            </Button>
          </>
        ) : null}
        {!hasMultipleCanvasSelection ? <>
        <fieldset disabled={editorMode === "design" && selectedObjectLocked} className="contents">
        {editorMode === "design" && selectedWorkLine ? (
          <>
            <ToolbarField label="Owner">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedWorkLine.layer ?? ""} onChange={(event) => patchWorkLine(selectedWorkLine.id, { layer: (event.target.value || undefined) as DesignerWorkLineForm["layer"] })}>
                <option value="">Global</option>
                <option value="artwork">Artwork</option>
                <option value="zones">Diffusors</option>
                <option value="faceGraphic">Face Graphic</option>
              </select>
            </ToolbarField>
            {typeof selectedWorkLinePointIndex === "number" && selectedWorkLinePoint ? (
              <Badge>Point {selectedWorkLinePointIndex + 1}</Badge>
            ) : null}
          </>
        ) : editorMode === "design" && selectedArtwork ? (
          <>
            <ToolbarField label="Image">
              <select className="h-8 max-w-60 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedArtwork.assetId} onChange={(event) => patchArtwork(selectedArtwork.id, { assetId: event.target.value })}>
                <option value="">— No image —</option>
                {projectAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>)}
              </select>
            </ToolbarField>
            <ToolbarNumber label="W" value={selectedArtwork.width} suffix="cm" onChange={(width) => patchArtwork(selectedArtwork.id, { width })} />
            <ToolbarNumber label="H" value={selectedArtwork.height} suffix="cm" onChange={(height) => patchArtwork(selectedArtwork.id, { height })} />
          </>
        ) : editorMode === "design" && selectedFabricationPart ? (
          <>
            <ToolbarField label="Name">
              <input className="h-8 w-44 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFabricationPart.name} disabled={selectedFabricationPart.locked} onChange={(event) => patchFabricationPart(selectedFabricationPart.id, { name: event.target.value })} />
            </ToolbarField>
            <ToolbarField label="Side">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFabricationPart.machiningSide} disabled={selectedFabricationPart.locked} onChange={(event) => patchFabricationPart(selectedFabricationPart.id, { machiningSide: event.target.value === "rear" ? "rear" : "front" })}>
                <option value="front">Front</option><option value="rear">Rear</option>
              </select>
            </ToolbarField>
            <ToolbarField label="Material">
              <input className="h-8 w-36 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFabricationPart.material} disabled={selectedFabricationPart.locked} onChange={(event) => patchFabricationPart(selectedFabricationPart.id, { material: event.target.value })} />
            </ToolbarField>
            <ToolbarNumber label="Thickness" value={selectedFabricationPart.thicknessMm} suffix="mm" onChange={(thicknessMm) => patchFabricationPart(selectedFabricationPart.id, { thicknessMm: Math.max(0.1, thicknessMm) })} />
          </>
        ) : editorMode === "design" && selectedText ? (
          <>
            <ToolbarField label="Text">
              <textarea key={`${selectedText.id}:${selectedText.text}`} className="h-8 w-56 resize-none rounded-md border border-input bg-card px-2 py-1 text-body-sm leading-5" defaultValue={selectedText.text} onBlur={(event) => patchText(selectedText.id, { text: event.target.value })} />
            </ToolbarField>
            <ToolbarField label="Font">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedText.fontId} onChange={(event) => patchText(selectedText.id, { fontId: event.target.value })}>
                {DESIGNER_FONT_CATALOG.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}
              </select>
            </ToolbarField>
            <ToolbarNumber label="Size" value={selectedText.fontSizeMm} suffix="mm" onChange={(fontSizeMm) => patchText(selectedText.id, { fontSizeMm: Math.max(1, fontSizeMm) })} />
            <ToolbarNumber label="Track" value={selectedText.trackingMm} suffix="mm" onChange={(trackingMm) => patchText(selectedText.id, { trackingMm })} />
            <ToolbarNumber label="Line" value={selectedText.lineHeight} onChange={(lineHeight) => patchText(selectedText.id, { lineHeight: Math.max(0.5, lineHeight) })} />
            <ToolbarField label="Align">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedText.alignment} onChange={(event) => patchText(selectedText.id, { alignment: event.target.value as DesignerText["alignment"] })}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </ToolbarField>
            <Badge>{designerFontResource(selectedText.fontId)?.hash.slice(0, 15) ?? "Unresolved font"}</Badge>
          </>
        ) : editorMode === "design" && selectedBuildArea ? (
          <>
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedBuildArea.shape} onChange={(event) => patchBuildArea(selectedBuildArea.id, { shape: event.target.value as DesignerBuildAreaForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedBuildAreaPointIndex === "number" && selectedBuildAreaPointLocation ? (
              <>
                <Badge>{selectedBuildArea.contours?.length ? `Contour ${selectedBuildAreaPointLocation.contourIndex + 1} · ` : ""}Point {selectedBuildAreaPointLocation.pointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedBuildAreaPointLocation.point.nodeType ?? (selectedBuildArea.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setBuildAreaNodeType(selectedBuildArea.id, selectedBuildAreaPointIndex, nodeType)} />
                </ToolbarField>
              </>
            ) : selectedBuildArea.shape === "rect" || selectedBuildArea.shape === "ellipse" ? (
              <>
                <PrimitiveDimensionNumber label={selectedBuildArea.shape === "ellipse" ? "ØW" : "W"} value={selectedBuildArea.width} onCommit={(width) => patchBuildArea(selectedBuildArea.id, { width })} />
                <PrimitiveDimensionNumber label={selectedBuildArea.shape === "ellipse" ? "ØH" : "H"} value={selectedBuildArea.height} onCommit={(height) => patchBuildArea(selectedBuildArea.id, { height })} />
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedFabricationPath ? (
          <>
            <Badge>Fabrication Path</Badge>
            <ToolbarField label="Part">
              <select className="h-8 max-w-48 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFabricationPath.partId} onChange={(event) => patchFabricationPath(selectedFabricationPath.id, { partId: event.target.value })}>
                {designer.fabricationParts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
              </select>
            </ToolbarField>
            <ToolbarField label="Operation">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFabricationPath.operation} onChange={(event) => patchFabricationPath(selectedFabricationPath.id, { operation: event.target.value as DesignerFabricationOperation })}>
                <option value="cut">Cut</option><option value="pocket">Pocket</option><option value="drill">Drill</option><option value="engrave">Engrave</option><option value="reference">Reference only</option>
              </select>
            </ToolbarField>
            {selectedFabricationPath.operation === "pocket" || selectedFabricationPath.operation === "engrave" ? <ToolbarNumber label="Depth" value={selectedFabricationPath.depthMm ?? 1} suffix="mm" onChange={(depthMm) => patchFabricationPath(selectedFabricationPath.id, { depthMm: Math.max(0, depthMm) })} /> : null}
          </>
        ) : editorMode === "design" && selectedLightSource ? (
          <>
            <Badge>{selectedLightSource.mode === "front" ? "Front Source" : selectedLightSource.mode === "halo" ? "Halo Source" : "Wall Wash Source"}</Badge>
            <Button type="button" variant="outline" density="compact" onClick={() => setLightingEditorOpen(true)}>
              <Sparkles className="h-4 w-4" /> Configure source
            </Button>
          </>
        ) : editorMode === "design" && selectedFaceGraphic ? (
          <>
            <ToolbarField label="Pass">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFaceGraphic.passMode} onChange={(event) => patchFaceGraphic(selectedFaceGraphic.id, { passMode: event.target.value as DesignerFaceGraphicForm["passMode"] })}>
                <option value="translucent">Translucent</option>
                <option value="clear">Clear</option>
                <option value="opaque">Opaque</option>
              </select>
            </ToolbarField>
            {selectedFaceGraphic.passMode === "translucent" ? <ToolbarField label="Filter color"><input type="color" className="h-8 w-12 rounded border border-input bg-card p-1" value={selectedFaceGraphic.filterColor} onChange={(event) => patchFaceGraphic(selectedFaceGraphic.id, { filterColor: event.target.value.toUpperCase() })} /></ToolbarField> : null}
            {typeof selectedFaceGraphicPointIndex === "number" && selectedFaceGraphicPointLocation ? (
              <>
                <Badge>{selectedFaceGraphic.contours?.length ? `Contour ${selectedFaceGraphicPointLocation.contourIndex + 1} · ` : ""}Point {selectedFaceGraphicPointLocation.pointIndex + 1}</Badge>
                <ToolbarField label="Node"><NodeTypePicker value={selectedFaceGraphicPointLocation.point.nodeType ?? (selectedFaceGraphic.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setFaceGraphicNodeType(selectedFaceGraphic.id, selectedFaceGraphicPointIndex, nodeType)} /></ToolbarField>
              </>
            ) : null}
            {selectedFaceGraphic.shape === "rect" || selectedFaceGraphic.shape === "ellipse" ? (
              <>
                <PrimitiveDimensionNumber label={selectedFaceGraphic.shape === "ellipse" ? "ØW" : "W"} value={selectedFaceGraphic.width} onCommit={(width) => patchFaceGraphic(selectedFaceGraphic.id, { width })} />
                <PrimitiveDimensionNumber label={selectedFaceGraphic.shape === "ellipse" ? "ØH" : "H"} value={selectedFaceGraphic.height} onCommit={(height) => patchFaceGraphic(selectedFaceGraphic.id, { height })} />
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedZone ? (
          <>
            {typeof selectedZonePointIndex === "number" && selectedZonePointLocation ? (
              <>
                <Badge>{selectedZone.contours?.length ? `Contour ${selectedZonePointLocation.contourIndex + 1} · ` : ""}Point {selectedZonePointLocation.pointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedZonePointLocation.point.nodeType ?? (selectedZone.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setZoneNodeType(selectedZone.id, selectedZonePointIndex, nodeType)} />
                </ToolbarField>
              </>
            ) : null}
            {selectedZone.shape === "rect" || selectedZone.shape === "ellipse" ? (
              <>
                <PrimitiveDimensionNumber label={selectedZone.shape === "ellipse" ? "ØW" : "W"} value={selectedZone.width} onCommit={(width) => patchZone(selectedZone.id, { width })} />
                <PrimitiveDimensionNumber label={selectedZone.shape === "ellipse" ? "ØH" : "H"} value={selectedZone.height} onCommit={(height) => patchZone(selectedZone.id, { height })} />
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedChannel ? (
          <>
            <Button type="button" variant="outline" density="compact" disabled={designer.layers.zones.locked || !selectedChannel.closed} title={!selectedChannel.closed ? "Close the Channel before generating its internal lightbox Zone" : "Create an independent Zone from the region enclosed by this Channel"} onClick={generateLightboxZoneFromSelectedChannel}>
              <CircleDot className="h-4 w-4" /> Generate lightbox Zone
            </Button>
            <Button type="button" variant="outline" density="compact" disabled={designer.layers.strings.locked} title={selectedChannel.closed ? "The selected Channel point becomes the electrical seam" : "Create an independent LED string on this Channel centerline"} onClick={generateLedStringFromSelectedChannel}>
              <Waypoints className="h-4 w-4" /> Generate LED string
            </Button>
            {typeof selectedChannelPointIndex === "number" && selectedChannelPoint ? (
              <>
                <Badge>Point {selectedChannelPointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedChannelNodeType} onChange={(nodeType) => setChannelNodeType(selectedChannel.id, selectedChannelPointIndex, nodeType)} />
                </ToolbarField>
                {selectedChannelPointCanFillet ? <ToolbarNumber label="Fillet" value={selectedChannelPoint.radiusMm ?? 0} suffix="mm" onChange={(radiusMm) => setChannelNodeRadius(selectedChannel.id, selectedChannelPointIndex, radiusMm)} /> : null}
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedController ? (
          <ToolbarNumber label="Ports" value={selectedController.dataOutputs} onChange={(dataOutputs) => patchController({ dataOutputs: Math.max(1, Math.round(dataOutputs)) })} />
        ) : editorMode === "design" && selectedRoute ? (
          <>
            {selectedRoute.kind === "led_string" ? <ToolbarField label="Lighting host">
              <select className="h-8 max-w-52 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedRouteLightingHostValue} onChange={(event) => {
                if (event.target.value === "auto") {
                  patchRoute(selectedRoute.id, { lightingHost: undefined });
                  return;
                }
                const separator = event.target.value.indexOf(":");
                const type = event.target.value.slice(0, separator);
                const id = event.target.value.slice(separator + 1);
                if ((type === "zone" || type === "channel") && id) patchRoute(selectedRoute.id, { lightingHost: { type, id } });
              }}>
                <option value="auto">Auto · geometry</option>
                {!selectedRouteLightingHostExists ? <option value={selectedRouteLightingHostValue}>Missing host · {selectedRoute.lightingHost?.id}</option> : null}
                <optgroup label="Zones">
                  {designer.zones.map((zone) => <option key={zone.id} value={`zone:${zone.id}`}>{zone.name}</option>)}
                </optgroup>
                <optgroup label="Channels">
                  {designer.channels.map((channel) => <option key={channel.id} value={`channel:${channel.id}`}>{channel.name}</option>)}
                </optgroup>
              </select>
            </ToolbarField> : null}
            <ToolbarField label="Type">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedRoute.kind} onChange={(event) => patchRoute(selectedRoute.id, { kind: event.target.value as DesignerRouteKind })}>
                <option value="led_string">LED string</option>
                <option value="data_cable">Data cable</option>
              </select>
            </ToolbarField>
            <ToolbarField label="Surface">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedRoute.designSurface ?? "rear"} onChange={(event) => {
                const designSurface = event.target.value === "front" ? "front" : "rear";
                patchRoute(selectedRoute.id, { designSurface });
                setRouteSurfaceView(designSurface);
                setRouteCreationSurface(designSurface);
                setChannelCreationSurface(designSurface);
              }}>
                <option value="rear">Rear</option>
                <option value="front">Front</option>
              </select>
            </ToolbarField>
          </>
        ) : null}
        </fieldset>
        {selectedArtworkCanCreateZones && selectedArtwork ? (
          <Button type="button" variant="outline" density="compact" disabled={importingSvgZones || designer.layers.zones.locked} title={designer.layers.zones.locked ? "Unlock Diffusors before creating Zones" : "Create editable Zones from every closed path in this SVG"} onClick={() => void createZonesFromArtworkSvg(selectedArtwork.id)}>
            <Spline className="h-4 w-4" /> {importingSvgZones ? "Importing…" : "Create Zones"}
          </Button>
        ) : null}
        {selectedWorkLine ? <Button type="button" variant="outline" density="compact" onClick={generateWorkLineHoles}><Circle className="h-4 w-4" /> Generate Holes</Button> : null}
        {selectedText ? <Button type="button" variant="outline" density="compact" onClick={() => void convertTextToPaths(selectedText.id)}>Convert to paths</Button> : null}
        {editorMode === "design" && tool === "fillet" && directFilletAvailable ? (
          <>
            <ToolbarField label="Radius source">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={directFilletRadiusSource} onChange={(event) => selectDirectFilletRadiusSource(event.target.value as "custom" | "router_bit")}>
                <option value="custom">Custom</option>
                <option value="router_bit">
                  Router bit · Ø{Number(designer.fabricationCutterDiameterMm.toFixed(3))} mm → R{Number((designer.fabricationCutterDiameterMm / 2).toFixed(3))} mm
                </option>
              </select>
            </ToolbarField>
            <ToolbarNumber label="Radius" value={activeDirectFilletRadiusMm} suffix="mm" onChange={patchDirectFilletRadius} />
            <span role="status" className="max-w-80 whitespace-normal text-meta leading-tight text-muted-foreground" title={fabricationNotice}>{fabricationNotice}</span>
          </>
        ) : null}
        {editorMode === "design" && selectedGeometryId && !selectedChannel && !selectedProjectionSourceChannel ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            <ToolbarNumber label="Offset" value={designer.offsetDistanceMm} suffix="mm" onChange={(offsetDistanceMm) => patchOffsetSettings({ offsetDistanceMm })} />
            <ToolbarField label="Join">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.offsetJoin} onChange={(event) => patchOffsetSettings({ offsetJoin: event.target.value as DesignerForm["offsetJoin"] })}>
                <option value="round">Round</option><option value="miter">Miter</option><option value="bevel">Bevel</option>
              </select>
            </ToolbarField>
            <Button type="button" variant="outline" density="compact" title="Create an independent offset from this profile" onClick={createIndependentOffsetGeometry}><Tally2 className="h-4 w-4" /> Offset Path</Button>
            {selectedZone ? <>
              <div className="h-6 w-px shrink-0 bg-border" />
              <ToolbarField label="Alignment">
                <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={channelPathAlignment} onChange={(event) => setChannelPathAlignment(event.target.value as ChannelPathAlignment)}>
                  <option value="left">Left edge</option>
                  <option value="center">Center</option>
                  <option value="right">Right edge</option>
                  <option value="inside">Inside offset</option>
                  <option value="outside">Outside offset</option>
                </select>
              </ToolbarField>
              {channelPathAlignment === "inside" || channelPathAlignment === "outside" ? <ToolbarNumber label="Alignment offset" value={channelPathOffsetMm} suffix="mm" onChange={(value) => setChannelPathOffsetMm(Math.max(0, value))} /> : null}
              {routeSurfaceView === "both" ? <ToolbarField label="Create on">
                <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={channelCreationSurface} onChange={(event) => setChannelCreationSurface(event.target.value === "rear" ? "rear" : "front")}>
                  <option value="front">Front</option>
                  <option value="rear">Rear</option>
                </select>
              </ToolbarField> : null}
              <Button type="button" variant="outline" density="compact" disabled={designer.layers.zones.locked || designer.systemSublayers.channels.locked} title="Create an independent Channel using the selected alignment" onClick={generateOffsetChannelsFromSelectedZone}><Waves className="h-4 w-4" /> Generate Channel</Button>
              <Button type="button" variant="outline" density="compact" disabled={designer.layers.strings.locked || designer.systemSublayers.strings.locked} title="Create an independent LED string using the selected alignment and assign it to this Zone" onClick={generateOffsetStringsFromSelectedZone}><Waypoints className="h-4 w-4" /> Generate LED string</Button>
            </> : null}
            {!directFilletAvailable ? <Button type="button" variant="outline" density="compact" onClick={createDerivedFilletGeometry}><Radius className="h-4 w-4" /> Fillet</Button> : null}
          </>
        ) : null}
        {editorMode === "design" && selectedDerivedGeometry ? (
          <>
            <span
              className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${selectedDerivedGeometryResolution?.issue ? "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300" : selectedDerivedGeometryResolution?.warnings.length ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300" : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}
              title={selectedDerivedGeometryStatus}
              aria-label={selectedDerivedGeometryStatus}
              role="status"
            >
              <AlertCircle className="h-4 w-4" />
            </span>
            <ToolbarField label="Source">
              <select className="h-8 max-w-64 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedDerivedGeometry.sourceGeometryId} onChange={(event) => patchDerivedGeometry(selectedDerivedGeometry.id, { sourceGeometryId: event.target.value })}>
                {!projectionSourceOptions.some((entry) => entry.geometryId === selectedDerivedGeometry.sourceGeometryId) ? <option value={selectedDerivedGeometry.sourceGeometryId}>Missing · {selectedDerivedGeometry.sourceGeometryId}</option> : null}
                {projectionSourceOptions.filter((entry) => entry.geometryId !== selectedDerivedGeometry.geometryId).map((entry) => <option key={entry.geometryId} value={entry.geometryId}>{entry.label}</option>)}
              </select>
            </ToolbarField>
            {selectedDerivedGeometry.targetLayer === "faceGraphic" ? (
              <>
                <ToolbarField label="Pass">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedDerivedGeometry.passMode ?? "translucent"} onChange={(event) => patchDerivedGeometry(selectedDerivedGeometry.id, { passMode: event.target.value as DesignerFaceGraphicForm["passMode"] })}>
                    <option value="translucent">Translucent</option>
                    <option value="clear">Clear</option>
                    <option value="opaque">Opaque</option>
                  </select>
                </ToolbarField>
                {(selectedDerivedGeometry.passMode ?? "translucent") === "translucent" ? <ToolbarField label="Filter color"><input type="color" className="h-8 w-12 rounded border border-input bg-card p-1" value={selectedDerivedGeometry.filterColor ?? "#FFFFFF"} onChange={(event) => patchDerivedGeometry(selectedDerivedGeometry.id, { filterColor: event.target.value.toUpperCase() })} /></ToolbarField> : null}
              </>
            ) : null}
            {selectedDerivedGeometry.operation === "offset" ? (
              <>
                <ToolbarNumber label="Offset" value={selectedDerivedGeometry.distanceMm ?? 0} suffix="mm" onChange={(distanceMm) => patchDerivedGeometry(selectedDerivedGeometry.id, { distanceMm })} />
                <ToolbarField label="Join">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedDerivedGeometry.join ?? "round"} onChange={(event) => patchDerivedGeometry(selectedDerivedGeometry.id, { join: event.target.value as NonNullable<DesignerDerivedGeometry["join"]> })}>
                    <option value="round">Round</option><option value="miter">Miter</option><option value="bevel">Bevel</option>
                  </select>
                </ToolbarField>
              </>
            ) : (
              <>
                <ToolbarNumber label="Radius" value={selectedDerivedGeometry.radiusMm ?? 0} suffix="mm" onChange={(radiusMm) => patchDerivedGeometry(selectedDerivedGeometry.id, { radiusMm: Math.max(0, radiusMm) })} />
                <ToolbarField label="Corners">
                  <input key={`${selectedDerivedGeometry.id}:${selectedDerivedGeometry.cornerIndices?.join(",") ?? "all"}`} className="h-8 w-28 rounded-md border border-input bg-card px-2 text-body-sm" defaultValue={selectedDerivedGeometry.cornerIndices?.map((index) => index + 1).join(",") ?? "all"} onBlur={(event) => {
                    const value = event.target.value.trim().toLowerCase();
                    patchDerivedGeometry(selectedDerivedGeometry.id, { cornerIndices: !value || value === "all" ? undefined : value.split(",").map((part) => Number(part.trim()) - 1).filter((index) => Number.isInteger(index) && index >= 0) });
                  }} />
                </ToolbarField>
              </>
            )}
            {selectedDerivedGeometry.operation === "fillet" ? <Button type="button" variant="outline" density="compact" disabled={!selectedDerivedGeometryResolution?.geometry} onClick={() => breakDerivedGeometryLink(selectedDerivedGeometry.id)}>Break Link</Button> : null}
          </>
        ) : editorMode === "design" && selectedProjection ? (
          <>
            <Badge className={selectedProjectionResolution?.issue ? "border border-amber-500/50 bg-amber-500/10 text-amber-700" : "border border-cyan-500/50 bg-cyan-500/10 text-cyan-700"}>{selectedProjectionResolution?.issue === "cycle" ? "Cycle" : selectedProjectionResolution?.issue === "broken" ? "Broken reference" : selectedProjectionResolution?.issue === "collapsed" ? "Source collapsed" : selectedProjectionResolution?.issue === "invalid-topology" ? "Invalid source topology" : "Linked · read only"}</Badge>
            <ToolbarField label="Source">
              <select className="h-8 max-w-64 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedProjection.sourceGeometryId} onChange={(event) => patchProjection(selectedProjection.id, { sourceGeometryId: event.target.value })}>
                {!projectionSourceOptions.some((entry) => entry.geometryId === selectedProjection.sourceGeometryId) ? <option value={selectedProjection.sourceGeometryId}>Missing · {selectedProjection.sourceGeometryId}</option> : null}
                {projectionSourceOptions.filter((entry) => entry.geometryId !== selectedProjection.geometryId).map((entry) => <option key={entry.geometryId} value={entry.geometryId}>{entry.label}</option>)}
              </select>
            </ToolbarField>
          </>
        ) : null}
        {editorMode === "design" && selectedGeometryId && !selectedDerivedGeometry && !selectedProjection ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            <ToolbarField label="Project to">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={projectionTargetLayer} onChange={(event) => setProjectionTargetLayer(event.target.value as DesignerProjectionLayer | "fabrication")}>
                <option value="faceGraphic">Face Graphic</option><option value="zones">Diffusors</option><option value="reference">Reference</option><option value="fabrication">Fabrication Plans</option>
              </select>
            </ToolbarField>
            {projectionTargetLayer === "fabrication" ? (
              <>
                <ToolbarField label="Part">
                  <select className="h-8 max-w-48 rounded-md border border-input bg-card px-2 text-body-sm" value={projectionFabricationPartId} onChange={(event) => setProjectionFabricationPartId(event.target.value)}>
                    <option value="new">+ New fabrication part</option>
                    {designer.fabricationParts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
                  </select>
                </ToolbarField>
                {projectionFabricationPartId === "new" ? <ToolbarField label="Name"><input className="h-8 w-44 rounded-md border border-input bg-card px-2 text-body-sm" value={projectionFabricationPartName} onChange={(event) => setProjectionFabricationPartName(event.target.value)} /></ToolbarField> : null}
                <ToolbarField label="Operation">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={projectionFabricationOperation} onChange={(event) => setProjectionFabricationOperation(event.target.value as DesignerFabricationOperation)}>
                    <option value="cut">Cut</option><option value="pocket">Pocket</option><option value="drill">Drill</option><option value="engrave">Engrave</option><option value="reference">Reference only</option>
                  </select>
                </ToolbarField>
              </>
            ) : null}
            <Button type="button" variant="outline" density="compact" onClick={projectSelectedGeometry}><Layers2 className="h-4 w-4" /> Project Geometry</Button>
          </>
        ) : null}
        </> : (
          <>
            <Badge>{selectedCanvasCount} selected</Badge>
            {marqueeChannelIds.length === 0 ? <div className="flex h-8 items-center overflow-hidden rounded-md border border-border-2 bg-card">
              {selectedVectorGroup ? (
                <button type="button" className="flex h-8 items-center justify-center gap-1.5 border-r border-border px-2 hover:bg-surface-hover" title="Ungroup · keep every vector unchanged and remove only the authoring group" aria-label="Ungroup selected vectors" onClick={ungroupSelectedGeometry}><Ungroup className="h-4 w-4" /><span>Ungroup</span></button>
              ) : (
                <button type="button" className="flex h-8 items-center justify-center gap-1.5 border-r border-border px-2 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50" title={canGroupGeometrySelection ? "Group · select and move these vectors as one authoring unit" : "Group requires editable vectors from the same layer"} aria-label="Group selected vectors" disabled={!canGroupGeometrySelection} onClick={groupSelectedGeometry}><Group className="h-4 w-4" /><span>Group</span></button>
              )}
              <button type="button" className="flex h-8 items-center justify-center gap-1.5 border-r border-border px-2 hover:bg-surface-hover" title="Union · merge all selected profiles" aria-label="Union selected profiles" onClick={() => applyBooleanOperation("union")}><BooleanSquaresIcon operation="union" className="h-4 w-4" /><span>Union</span></button>
              <button type="button" className="flex h-8 items-center justify-center gap-1.5 border-r border-border px-2 hover:bg-surface-hover" title="Subtract · remove later selections from the first profile" aria-label="Subtract selected profiles" onClick={() => applyBooleanOperation("subtract")}><BooleanSquaresIcon operation="subtract" className="h-4 w-4" /><span>Subtract</span></button>
              <button type="button" className="flex h-8 items-center justify-center gap-1.5 border-r border-border px-2 hover:bg-surface-hover" title="Intersect · keep only overlapping material" aria-label="Intersect selected profiles" onClick={() => applyBooleanOperation("intersect")}><BooleanSquaresIcon operation="intersect" className="h-4 w-4" /><span>Intersect</span></button>
              <button type="button" className="flex h-8 items-center justify-center gap-1.5 px-2 hover:bg-surface-hover" title="Exclude · keep areas belonging to exactly one profile" aria-label="Exclude selected profiles" onClick={() => applyBooleanOperation("exclude")}><BooleanSquaresIcon operation="exclude" className="h-4 w-4" /><span>Exclude</span></button>
            </div> : <Badge>Selection includes Channels</Badge>}
          </>
        )}
          </div>
        </div>
        {!hasMultipleCanvasSelection && (canCopySelection || canDeleteSelection) ? (
          <div className="ml-2 flex shrink-0 items-center gap-1 border-l border-border pl-2">
            {canCopySelection ? <Button type="button" variant="outline" density="compact" title="Copy selected object (Ctrl/Cmd+C)" aria-label="Copy selected object" className="w-8 px-0" onClick={copySelection}><Copy className="h-4 w-4" /></Button> : null}
            {canCopySelection ? <Button type="button" variant="outline" density="compact" title={canPasteSelection ? "Paste copied object (Ctrl/Cmd+V)" : "Paste becomes available after copying a compatible object"} aria-label="Paste copied object" disabled={!canPasteSelection} className="w-8 px-0" onClick={pasteSelection}><ClipboardPaste className="h-4 w-4" /></Button> : null}
            {canDeleteSelection ? <Button type="button" variant="destructive" density="compact" title="Delete selection" aria-label="Delete selection" className="w-8 px-0" onClick={deleteSelection}><Trash2 className="h-4 w-4" /></Button> : null}
          </div>
        ) : null}
      </div> : null}
      <div
        className={`grid min-h-0 flex-1 ${editorMode === "animate" ? "grid-cols-[minmax(0,1fr)_380px]" : "grid-cols-[56px_minmax(0,1fr)]"}`}
        style={editorMode === "design" && layersPanelOpen ? { gridTemplateColumns: `56px minmax(0, 1fr) ${layersPanelWidth}px` } : undefined}
      >
        {editorMode === "design" ? <aside className="flex min-h-0 flex-col border-r border-border-2 bg-card py-2">
          <div className="flex shrink-0 flex-col items-center gap-2 px-2">
          <ToolButton active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
          <ToolButton active={tool === "move"} label="Move · fixed X/Y axis; Ctrl releases both axes" icon={Move} onClick={() => setTool("move")} />
            <ToolButton active={tool === "pan"} label="Pan" icon={Hand} onClick={() => setTool("pan")} />
          <ToolButton active={tool === "measure"} label="Measure distance" icon={RulerDimensionLineIcon} onClick={() => setTool("measure")} />
          </div>
          <div className="mx-3 my-2 h-px shrink-0 bg-border" />
          {editorMode === "design" ? <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2">
          {activeLayerTarget?.scope === "workLines" ? (
            <ToolButton active={tool === "work_line"} label="Work line · continuous construction reference" icon={SquareCenterlineDashedVertical} onClick={() => {
              if (!designer.layers.artwork.visible) setArtworkVisibility(true);
              else if (!designer.workLinesVisible) setArtworkFolderVisibility("workLines", true);
              setTool("work_line");
            }} disabled={activeLayerTargetLocked} />
          ) : null}
          {activeLayerTarget?.scope === "artwork" ? (
            <>
              <ToolButton
                active={tool === "image_place"}
                label="Image (place a container, then pick its image in the panel)"
                icon={ImageIcon}
                disabled={activeLayerTargetLocked}
                onClick={() => {
                  ensureActiveLayerTargetVisible();
                  setTool("image_place");
                }}
              />
            </>
          ) : null}
          {activeLayerTarget?.scope === "reference" ? (
            <>
              <ToolButton active={tool === "build_area_rect"} label="Rectangle Build Area (drag on canvas)" icon={Square} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("build_area_rect"); }} />
              <ToolButton active={tool === "build_area_ellipse"} label="Ellipse Build Area (drag on canvas)" icon={Circle} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("build_area_ellipse"); }} />
              <ToolButton active={tool === "build_area_polygon"} label="Polygon Build Area" icon={PenLine} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("build_area_polygon"); }} />
              <ToolButton active={tool === "build_area_bezier"} label="Bezier Build Area" icon={Spline} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("build_area_bezier"); }} />
            </>
          ) : null}
          {activeLayerTarget?.scope === "zones" || activeLayerTarget?.scope === "channels" ? (
            <>
              {activeLayerTarget.scope === "zones" ? <>
                <ToolButton active={tool === "zone_rect"} label="Rectangle Zone (drag on canvas)" icon={Square} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("zone_rect"); }} />
                <ToolButton active={tool === "zone_ellipse"} label="Ellipse Zone (drag on canvas)" icon={Circle} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("zone_ellipse"); }} />
                <ToolButton active={tool === "zone_polygon"} label="Draw a polygon vector" icon={VectorPolygonIcon} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("zone_polygon"); }} />
              </> : null}
              {activeLayerTarget.scope === "channels" ? <ToolButton active={tool === "channel_bezier"} label="Channel (neon flex trace)" icon={Waves} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("channel_bezier"); }} /> : null}
            </>
          ) : null}
          {activeLayerTarget?.scope === "faceGraphic" ? (
            <>
              <ToolButton active={tool === "face_graphic_rect"} label="Rectangle Face Graphic (drag on canvas)" icon={Square} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("face_graphic_rect"); }} />
              <ToolButton active={tool === "face_graphic_ellipse"} label="Ellipse Face Graphic (drag on canvas)" icon={Circle} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("face_graphic_ellipse"); }} />
              <ToolButton active={tool === "face_graphic_polygon"} label="Polygon Face Graphic" icon={PenLine} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("face_graphic_polygon"); }} />
              <ToolButton active={tool === "face_graphic_bezier"} label="Bezier Face Graphic" icon={Spline} disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("face_graphic_bezier"); }} />
            </>
          ) : null}
          {!hasMultipleCanvasSelection && (pathTrimAvailable || directFilletAvailable) ? <div className="my-0.5 h-px w-6 shrink-0 bg-border" /> : null}
          {!hasMultipleCanvasSelection && pathTrimAvailable ? (
            <ToolButton active={tool === "path_trim"} label="Trim selected path" icon={Scissors} disabled={selectedObjectLocked} onClick={() => setTool(tool === "path_trim" ? "select" : "path_trim")} />
          ) : null}
          {!hasMultipleCanvasSelection && directFilletAvailable ? (
            <ToolButton active={tool === "fillet"} label="Fillet selected path" icon={Radius} disabled={selectedObjectLocked} onClick={toggleDirectFilletTool} />
          ) : null}
          {activeLayerTarget?.scope === "strings" || activeLayerTarget?.scope === "dataCables" ? (
            <>
              {activeLayerTarget.scope === "strings" ? <ToolButton active={tool === "led_string"} label="LED string" icon={Waypoints} tone="amber" disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("led_string"); }} /> : null}
              {activeLayerTarget.scope === "dataCables" ? <ToolButton active={tool === "data_cable"} label="Data cable" icon={Cable} tone="green" disabled={activeLayerTargetLocked} onClick={() => { ensureActiveLayerTargetVisible(); setTool("data_cable"); }} /> : null}
              <ToolButton
                active={tool === "cut"}
                label={typeof selectedRoutePointIndex === "number" && selectedRoute?.points[selectedRoutePointIndex]?.joint ? "Detach solder joint" : "Cut route"}
                icon={Scissors}
                disabled={activeLayerTargetLocked}
                onClick={() => {
                  if (typeof selectedRoutePointIndex === "number" && selectedRoute?.points[selectedRoutePointIndex]?.joint) {
                    detachSelectedRoutePoint();
                    return;
                  }
                  setTool("cut");
                }}
              />
            </>
          ) : null}
          </div> : <div className="min-h-0 flex-1" />}
        </aside> : null}

        <main className={`min-w-0 overflow-hidden bg-muted ${editorMode === "animate" ? "flex flex-col p-0" : "p-2"} ${editorMode === "animate" && animationViewerOpen ? "fixed inset-0 z-50 bg-background" : ""}`}>
          {editorMode === "animate" && animationViewerOpen ? (
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border-2 bg-card px-4">
              <Button type="button" variant="outline" className="h-9" onClick={() => setAnimationViewerOpen(false)}>
                <ArrowLeft className="h-4 w-4" />
                Return
              </Button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-sm font-semibold">{partitura.name}</div>
                <div className="truncate font-mono text-[10px] uppercase text-muted-foreground">{document.scenes.find((scene) => scene.id === document.activeSceneId)?.name ?? document.activeSceneId}</div>
              </div>
              <Badge>{document.compiledLayout?.pixelMap.length ?? 0} px</Badge>
              <Button
                type="button"
                className="h-9"
                disabled={animationGenerating}
                onClick={() => {
                  if (!animationResult?.ok) void previewAnimation();
                  else setAnimationPlaying((current) => !current);
                }}
              >
                {animationPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {animationGenerating ? "Preparing" : animationPlaying ? "Pause" : "Play"}
              </Button>
              <Button type="button" variant="outline" className="h-9" disabled={!animationResult?.ok} onClick={stopAnimationViewer}>
                <RotateCcw className="h-4 w-4" />
                Stop
              </Button>
            </header>
          ) : null}
          <div className={editorMode === "animate" ? "min-h-0 flex-1" : "h-full"}>
          {editorMode === "design" ? <DesignerStudioCanvas
            designer={canvasDesigner}
            snapToGrid={snapToGrid}
            faceGraphicVinylPreview={faceGraphicVinylPreview}
            routeSurfaceView={routeSurfaceView}
            routeCreationSurface={routeCreationSurface}
            channelCreationSurface={channelCreationSurface}
            activeLayer={activeLayer}
            tool={tool}
            onToolChange={setTool}
            moveAxis={moveAxis}
            nodeCreationType={nodeCreationType}
            channelRouterDiameterMm={designer.channelRouterDiameterMm}
            channelGenerationPreview={channelGenerationPreview}
            viewport={activeViewport}
            artworkUrls={artworkUrls}
            selectedArtworkId={selectedArtwork?.id}
            selectedWorkLineId={selectedWorkLine?.id}
            selectedWorkLinePointIndex={selectedWorkLinePointIndex}
            selectedBuildAreaId={selectedBuildArea?.id}
            selectedBuildAreaPointIndex={selectedBuildAreaPointIndex}
            selectedZoneId={selectedZone?.id}
            selectedZonePointIndex={selectedZonePointIndex}
            selectedFaceGraphicId={selectedFaceGraphic?.id}
            selectedFaceGraphicPointIndex={selectedFaceGraphicPointIndex}
            selectedFabricationPathId={selectedFabricationPath?.id}
            selectedProjectionId={selectedProjection?.id}
            selectedDerivedGeometryId={selectedDerivedGeometry?.id}
            selectedTextId={selectedText?.id}
            selectedChannelId={selectedChannel?.id}
            selectedChannelPointIndex={selectedChannelPointIndex}
            selectedRouteId={selectedRoute?.id}
            selectedRouteIds={activeSelectedRouteIds}
            selectedRoutePointIndex={selectedRoutePointIndex}
            selectedController={Boolean(selectedController)}
            selectedGeometryKeys={selectedGeometryKeys}
            onViewportChange={setViewport}
            onChange={updateDesignerFromCanvas}
            onSelect={selectDesignerItem}
            onMarqueeSelect={selectDesignerMarqueeItems}
            onInsertBuildAreaPoint={insertBuildAreaPoint}
            onInsertZonePoint={insertZonePoint}
            onInsertFaceGraphicPoint={insertFaceGraphicPoint}
            onInsertChannelPoint={insertChannelPoint}
            onInsertRoutePoint={insertRoutePoint}
            onPlaceImage={placeImageAt}
            onCreateText={createTextAt}
            onFilletCorner={applyDirectFillet}
            onCutRoutePoint={handleCutRoutePoint}
            onRoutePointDragEnd={autoSolderRoutePoint}
            onSolderedTerminalsDragEnd={moveSolderedTerminals}
          /> : document.compiledLayout && animationResult?.ok && animationResult.partitura ? <Suspense fallback={<div className="grid h-full place-items-center p-8 text-body-sm text-muted-foreground">Loading player…</div>}><PlayerSurface
            ref={playerSurfaceRef}
            partitura={animationResult.partitura}
            designer={designer}
            layout={document.compiledLayout}
            viewport={animationViewerOpen ? animationViewerViewport ?? activeViewport : activeViewport}
            activeSceneId={document.activeSceneId}
            playing={animationPlaying}
            presentation={animationDiffuser}
            faceMaskEnabled={animationFaceMaskEnabled}
            settings={diffuserSettings}
            selection={selection}
            onViewportChange={animationViewerOpen ? setAnimationViewerViewport : setViewport}
            onSelect={selectDesignerItem}
            onStatus={setPlayerStatus}
          /></Suspense> : <div className="grid h-full place-items-center p-8 text-center text-body-sm text-muted-foreground">
            {animationGenerating ? "Preparing the partitura runtime…" : "Compile and generate the partitura to start the player."}
          </div>}
          </div>
        </main>
        {editorMode === "animate" ? (
          <aside className="flex min-h-0 flex-col border-l border-border-2 bg-surface">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{selectedAnimationLightSource ? `Calibration · ${clipLightSourceModeLabel(selectedAnimationLightSource.mode)}` : selectedAnimationGroupTarget ? `${selectedAnimationGroupTarget.side === "front" ? "Front" : "Rear"} Effect target · ${selectedOpticalTargets.length} targets` : selectedAnimationGlobalMode ? `All ${clipLightSourceModeLabel(selectedAnimationGlobalMode)} clip` : selectedAnimationTargetsFullSign ? "Legacy Full sign clip" : selectedOpticalTargets.length > 1 ? `Calibration · ${selectedOpticalTargets.length} targets` : selectedOpticalTarget ? `Calibration · ${selectedZone?.name ?? selectedChannel?.name}` : "Lighting calibration"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{selectedAnimationLightSource ? `${selectedAnimationLightSource.name} · selected clip source` : selectedAnimationGroupTarget ? "Shared calibration for the selected Effect target side." : selectedAnimationGlobalMode ? `Calibrate the ${selectedOpticalTargets.length} selected ${selectedOpticalTargets.length === 1 ? "target" : "targets"}, or select objects on the canvas to narrow the override.` : selectedAnimationTargetsFullSign ? "Ambiguous legacy target; replace it with a source-specific clip." : selectedOpticalTarget ? (selectedOpticalTargets.length > 1 ? "Shared calibration · mixed values remain unchanged" : "Tune existing sources · construction stays in Design") : "Select a zone or channel"}</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedAnimationTargetsFullSign ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">This legacy global target does not identify a lighting mode. Replace it with All Front, All Halo-Lit or All Wall Wash before applying calibration.</div> : (selectedAnimationGlobalMode || selectedAnimationGroupTarget) && animationOpticalTargetEntries.length ? <MultiLightingMountsEditor
                  entries={animationOpticalTargetEntries}
                  designer={designer}
                  calibrationOnly
                  modes={selectedAnimationGlobalMode ? [selectedAnimationGlobalMode] : selectedAnimationGroupTarget?.side === "front" ? ["front"] : ["halo", "wall_wash"]}
                  onSetMode={setSelectedOpticalMode}
                  onPatchMode={patchSelectedOpticalMode}
                /> : selectedAnimationLightSource ? <LightingMountsEditor
                  treatments={animationOpticalTreatments}
                  designer={designer}
                  compact
                  calibrationOnly
                  onAdd={addOpticalTreatment}
                  onChange={patchOpticalTreatment}
                  onRemove={removeOpticalTreatment}
                /> : selectedOpticalTargets.length > 1 ? <MultiLightingMountsEditor
                  entries={selectedOpticalTargetEntries}
                  designer={designer}
                  calibrationOnly
                  onSetMode={setSelectedOpticalMode}
                  onPatchMode={patchSelectedOpticalMode}
                /> : selectedOpticalTarget ? <LightingMountsEditor
                  treatments={selectedOpticalTreatments}
                  designer={designer}
                  compact
                  calibrationOnly
                  onAdd={addOpticalTreatment}
                  onChange={patchOpticalTreatment}
                  onRemove={removeOpticalTreatment}
                /> : <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Select a zone or channel to calibrate its existing light sources.</div>}
            </div>
          </aside>
        ) : null}
        {editorMode === "design" && layersPanelOpen ? (
          <DesignerLayersPanel
            designer={designer}
            activeLayer={activeLayer}
            activeLayerTarget={activeLayerTarget}
            selection={selection}
            selectedGeometryKeys={selectedGeometryKeys}
            selectedRouteIds={activeSelectedRouteIds}
            routeSummaries={routeSummaries}
            routeOutputs={routeOutputs}
            faceGraphicVinylPreview={faceGraphicVinylPreview}
            routeSurfaceView={routeSurfaceView}
            onActivateLayer={activateDesignerLayer}
            onActivateLayerTarget={activateDesignerLayerTarget}
            onPatchLayer={patchDesignerLayer}
            onPatchLayers={patchDesignerLayers}
            onSetArtworkVisibility={setArtworkVisibility}
            onSetArtworkFolderVisibility={setArtworkFolderVisibility}
            onPatchWorkLine={patchWorkLine}
            onToggleFaceGraphicVinylPreview={() => setFaceGraphicVinylPreview((active) => !active)}
            onRouteSurfaceViewChange={changeConstructionSide}
            assets={projectAssets}
            onUploadArtwork={uploadArtwork}
            onPatchArtwork={patchArtwork}
            onPatchBuildArea={patchBuildAreaVisual}
            onPatchZone={patchZoneVisual}
            onPatchFaceGraphic={patchFaceGraphic}
            onAddFabricationPart={addFabricationPart}
            onPatchFabricationPart={patchFabricationPart}
            onPatchFabricationPath={patchFabricationPath}
            onPatchProjection={patchProjection}
            onPatchDerivedGeometry={patchDerivedGeometry}
            onPatchText={patchText}
            onAddGroup={addGroup}
            onPatchGroup={patchGroup}
            onRemoveGroup={removeGroup}
            onAddObjectsToGroup={addObjectsToGroup}
            onToggleGroupMember={toggleGroupMember}
            onSelectGroupMember={selectGroupMember}
            onOpenLighting={openLightingSetup}
            onPatchChannel={patchChannel}
            onPatchController={patchController}
            onPatchRoute={patchRoute}
            onReorderItems={reorderDesignerItems}
            onAddSublayer={addDesignerSublayer}
            onPatchSystemSublayer={patchDesignerSystemSublayer}
            onPatchSublayer={patchDesignerSublayer}
            onRemoveSublayer={deleteDesignerSublayer}
            onAssignObjectsToSublayer={assignObjectsToDesignerSublayer}
            onSelect={selectDesignerItem}
            width={layersPanelWidth}
            onWidthChange={setLayersPanelWidth}
            onClose={() => setLayersPanelOpen(false)}
          />
        ) : null}
      </div>
      {editorMode === "animate" ? (
        <>
          <div className="h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface-2 hover:bg-blue-200" title="Drag to resize · double-click to collapse or expand" onPointerDown={beginAnimationTimelineResize} onDoubleClick={() => setAnimationTimelineCollapsed((current) => !current)} />
          <Suspense fallback={<div className="h-10 border-t border-border bg-surface-2" />}><DesignerAnimateTimeline
            document={document}
            effects={effectCatalog}
            selectedTargetIds={selectedAnimationTargetIds}
            previewTimeMs={playerStatus?.timeMs ?? document.previewTimeMs}
            height={animationTimelineCollapsed ? 40 : animationTimelineHeight}
            collapsed={animationTimelineCollapsed}
            onToggleCollapsed={() => setAnimationTimelineCollapsed((current) => !current)}
            onChange={updateAnimationDocument}
            onPreview={() => void previewAnimation()}
            onPreviewTimeChange={previewAnimationAt}
            previewing={animationGenerating}
            playing={animationPlaying}
            hasPreview={Boolean(animationResult?.ok && animationResult.partitura)}
            onEditInteractionStart={beginAnimationTimelineInteraction}
            onEditInteractionEnd={endAnimationTimelineInteraction}
            onClipTargetSelect={selectAnimationClipTarget}
            onSelectedClipTargetChange={setSelectedAnimationClipTargetId}
            onTogglePlayback={() => {
              if (!animationResult?.ok) void previewAnimation();
              else setAnimationPlaying((current) => !current);
            }}
          /></Suspense>
        </>
      ) : null}
      <Modal
        open={editorMode === "design" && lightingEditorOpen && Boolean(selectedOpticalTarget)}
        title={`Lighting · ${selectedZone?.name ?? selectedChannel?.name ?? "Selection"}`}
        description="Physical light mounts belong to this zone/channel. Clips only provide color and animation."
        onClose={() => setLightingEditorOpen(false)}
        className="max-w-4xl"
      >
        <LightingMountsEditor
          treatments={selectedOpticalTreatments}
          designer={designer}
          compiledLayout={compileIsCurrent ? document.compiledLayout : undefined}
          compileIsCurrent={compileIsCurrent}
          onAdd={addOpticalTreatment}
          onChange={patchOpticalTreatment}
          onRemove={removeOpticalTreatment}
        />
      </Modal>
      <Modal
        open={fabricationExportOpen}
        title="Fabrication export"
        description="Validated vector interchange at physical 1:1 scale. Construction projections, artwork and electrical topology are excluded."
        onClose={() => setFabricationExportOpen(false)}
        className="max-w-4xl"
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {([
              ["includeReference", "Reference / substrate", "Build areas and resolved derived profiles"],
              ["includeZones", "Zones", "Closed zone profiles, text and resolved derived profiles"],
              ["includeChannels", "Channels", "Router-bit centerline toolpaths"],
              ["includeFaceGraphic", "Face Graphic", "Masks grouped by pass mode and filter color"],
              ["includeFabricationPlans", "Fabrication Plans", "One output file per visible physical part"]
            ] as const).map(([key, label, detail]) => (
              <label key={key} className="flex cursor-pointer gap-3 rounded-md border border-border-2 bg-card p-3">
                <input
                  type="checkbox"
                  checked={fabricationExportOptions[key]}
                  onChange={(event) => { setFabricationExportOptions((current) => ({ ...current, [key]: event.target.checked })); setFabricationExportResult(null); }}
                  className="mt-0.5 h-4 w-4 accent-blue-600"
                />
                <span><span className="block text-body-sm font-semibold">{label}</span><span className="mt-1 block text-meta text-muted-foreground">{detail}</span></span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 rounded-md border border-border-2 bg-surface-2 p-3 sm:grid-cols-2">
            <ToolbarNumber label="DXF curve tolerance" value={fabricationExportOptions.flattenToleranceMm} suffix="mm" onChange={(flattenToleranceMm) => { setFabricationExportOptions((current) => ({ ...current, flattenToleranceMm })); setFabricationExportResult(null); }} />
            <ToolbarNumber label="Small-feature guidance" value={fabricationExportOptions.minimumFeatureMm} suffix="mm" onChange={(minimumFeatureMm) => { setFabricationExportOptions((current) => ({ ...current, minimumFeatureMm })); setFabricationExportResult(null); }} />
          </div>
          <label className={`flex gap-3 rounded-md border border-border-2 p-3 ${designer.alignmentMarks.enabled ? "cursor-pointer bg-card" : "cursor-not-allowed bg-surface-2 opacity-60"}`}>
            <input
              type="checkbox"
              checked={designer.alignmentMarks.enabled && fabricationExportOptions.includeAlignmentMarks}
              disabled={!designer.alignmentMarks.enabled}
              onChange={(event) => { setFabricationExportOptions((current) => ({ ...current, includeAlignmentMarks: event.target.checked })); setFabricationExportResult(null); }}
              className="mt-0.5 h-4 w-4 accent-blue-600"
            />
            <span><span className="block text-body-sm font-semibold">Include alignment marks in every file</span><span className="mt-1 block text-meta text-muted-foreground">Exports the identical orthogonal set on ALIGNMENT_GUIDES_NO_CUT with {designer.alignmentMarks.spacingMm} mm measured spacing.</span></span>
          </label>
          {fabricationExportResult ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{fabricationExportResult.pathCount} paths</Badge>
                <Badge>{fabricationExportResult.layerCount} output files</Badge>
                <Badge className="font-mono">sha256:{fabricationExportResult.sourceChecksum.slice(0, 12)}…</Badge>
              </div>
              {fabricationExportResult.issues.length ? (
                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-border-2 p-3">
                  {fabricationExportResult.issues.map((issue, index) => (
                    <div key={`${issue.code}:${issue.objectId ?? index}`} className={`rounded-md border px-3 py-2 text-body-sm ${issue.severity === "error" ? "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200" : "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100"}`}>
                      <span className="font-semibold uppercase">{issue.severity}</span> · {issue.message}
                    </div>
                  ))}
                </div>
              ) : <Alert title="Fabrication geometry valid" variant="success">No blocking errors or guidance warnings were found.</Alert>}
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">SVG preserves native Bezier paths and compound contours. DXF flattens curves deterministically to closed millimeter polylines using the selected tolerance.</p>
          )}
          <div className="space-y-1 text-meta text-muted-foreground">
            <p role="status">{fabricationNotice}</p>
            <p>Each selected layer is saved separately in your browser&apos;s configured downloads folder. Fabrication Plans uses the exact physical-part name, such as <span className="font-mono">Acrílico superior.svg</span>; the other categories keep generated names such as <span className="font-mono">{partitura.partituraKey.replace(/[^A-Za-z0-9_-]+/g, "_")}-fabrication-zones.svg</span>.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={() => setFabricationExportOpen(false)}>Cancel</Button>
            <Button type="button" variant="outline" disabled={fabricationExporting} onClick={() => void exportFabrication("dxf")}><Download className="h-4 w-4" /> {fabricationExporting ? "Validating…" : "Export DXF"}</Button>
            <Button type="button" disabled={fabricationExporting} onClick={() => void exportFabrication("svg")}><Download className="h-4 w-4" /> {fabricationExporting ? "Validating…" : "Export SVG"}</Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={shareOpen}
        title="Share scene"
        description="The worker renders the same partitura and visual scene as the browser player. Viewers receive video by default, not the editor runtime."
        onClose={() => setShareOpen(false)}
        className="max-w-2xl"
      >
        {sharePublication ? (
          <div className="space-y-4">
            <Alert
              title={sharePublication.revoked ? "Link revoked" : sharePublication.status === "ready" ? "Share ready" : sharePublication.status === "failed" ? "Render failed" : "Render queued"}
              variant={sharePublication.revoked ? "warning" : sharePublication.status === "ready" ? "success" : sharePublication.status === "failed" ? "error" : "info"}
            >
              {sharePublication.revoked
                ? "The external link no longer resolves."
                : sharePublication.status === "ready"
                  ? "The immutable video and poster are available."
                  : sharePublication.status === "failed"
                    ? sharePublication.errorSummary ?? "The renderer exhausted its retries."
                    : "You can close this window; rendering continues in the background."}
            </Alert>
            {sharePublication.shareUrl && !sharePublication.revoked ? (
              <div className="rounded-md border border-border-2 bg-surface-2 p-3">
                <div className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">Share link</div>
                <div className="mt-2 break-all font-mono text-body-sm">{sharePublication.shareUrl}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(new URL(sharePublication.shareUrl!, window.location.origin).toString())}><Copy className="h-4 w-4" /> Copy link</Button>
                  <Button asChild type="button"><a href={sharePublication.shareUrl} target="_blank" rel="noreferrer">Open</a></Button>
                </div>
              </div>
            ) : sharePublication.policy === "private" && !sharePublication.revoked ? (
              <p className="text-body-sm text-muted-foreground">Private renders stay in the tenant media bucket and do not create an external link.</p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => { setSharePublication(null); setShareError(null); }}>Create another</Button>
              {!sharePublication.revoked ? <Button type="button" variant="outline" className="border-red-500/50 text-red-700 hover:bg-red-500/10 dark:text-red-300" onClick={() => void revokeCurrentShare()}>Revoke link</Button> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-body-sm font-semibold">Access policy</legend>
              {([
                ["private", "Private render", "Stored for this tenant only; no external URL."],
                ["review", "Client review", "Opaque, revocable and non-indexed review link."],
                ["unlisted", "Unlisted", "Stable non-indexed link; anyone with the URL can view."],
                ["public", "Public", "Public CDN page with social video metadata; can be indexed and reshared."]
              ] as const).map(([value, label, detail]) => (
                <label key={value} className={`flex cursor-pointer gap-3 rounded-md border p-3 ${sharePolicy === value ? "border-blue-500 bg-blue-500/10" : "border-border-2 bg-card"}`}>
                  <input type="radio" name="share-policy" value={value} checked={sharePolicy === value} onChange={() => { setSharePolicy(value); setShareRightsConfirmed(false); }} className="mt-1 h-4 w-4 accent-blue-600" />
                  <span><span className="block text-body-sm font-semibold">{label}</span><span className="mt-0.5 block text-meta text-muted-foreground">{detail}</span></span>
                </label>
              ))}
            </fieldset>
            {sharePolicy === "public" ? (
              <label className="flex gap-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-body-sm">
                <input type="checkbox" checked={shareRightsConfirmed} onChange={(event) => setShareRightsConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
                <span>I confirm that this scene may be publicly distributed and that I have the necessary client, artwork and brand rights.</span>
              </label>
            ) : null}
            {shareError ? <Alert title="Unable to publish" variant="error">{shareError}</Alert> : null}
            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button type="button" variant="outline" onClick={() => setShareOpen(false)}>Cancel</Button>
              <Button type="button" disabled={shareSubmitting || sharePolicy === "public" && !shareRightsConfirmed} onClick={() => void publishScene()}><Share2 className="h-4 w-4" /> {shareSubmitting ? "Preparing…" : "Generate and render"}</Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={compileIssuesOpen}
        title="Designer Compile Issues"
        description="Electrical errors block Animate. Warnings are informational. For overlapping Lighting Setups, assign Lighting host directly in each warning card."
        onClose={() => setCompileIssuesOpen(false)}
      >
        <div className="space-y-4">
          {compileErrorDetails.length ? (
            <Alert title="Errors" variant="error">
              <ul className="space-y-3">
                {compileErrorDetails.map((issue) => (
                  <li key={issue.id} className="rounded-md border border-destructive/25 bg-background/35 p-3">
                    {issue.targets[0] ? (
                      <button type="button" className="w-full text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Locate ${issue.targets[0].label}`} onClick={() => focusCompileIssueTarget(issue.targets[0])}>{issue.message}</button>
                    ) : <p>{issue.message}</p>}
                    {issue.targets.length ? <div className="mt-2 flex flex-wrap gap-1.5">{issue.targets.map((target, index) => (
                      <Button key={`${target.type}:${target.id}:${index}`} type="button" variant="outline" density="compact" className={`h-7 px-2 text-xs ${compileIssueTargetTone(target)}`} title={target.type === "route" ? `Select ${target.label} and assign its Lighting host` : `Locate ${target.label}`} onClick={() => focusCompileIssueTarget(target)}>
                        {compileIssueTargetIcon(target)} {target.label}
                      </Button>
                    ))}</div> : null}
                    {compileIssueLightingHostEditor(issue)}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {compileWarningDetails.length ? (
            <Alert title="Warnings" variant="warning">
              <ul className="space-y-3">
                {compileWarningDetails.map((issue) => (
                  <li key={issue.id} className="rounded-md border border-amber-500/25 bg-background/35 p-3">
                    {issue.targets[0] ? (
                      <button type="button" className="w-full text-left underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={`Locate ${issue.targets[0].label}`} onClick={() => focusCompileIssueTarget(issue.targets[0])}>{issue.message}</button>
                    ) : <p>{issue.message}</p>}
                    {issue.targets.length ? <div className="mt-2 flex flex-wrap gap-1.5">{issue.targets.map((target, index) => (
                      <Button key={`${target.type}:${target.id}:${index}`} type="button" variant="outline" density="compact" className={`h-7 px-2 text-xs ${compileIssueTargetTone(target)}`} title={target.type === "route" ? `Select ${target.label} and assign its Lighting host` : `Locate ${target.label}`} onClick={() => focusCompileIssueTarget(target)}>
                        {compileIssueTargetIcon(target)} {target.label}
                      </Button>
                    ))}</div> : null}
                    {compileIssueLightingHostEditor(issue)}
                  </li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {!compileIssueCount ? (
            <Alert title="No issues" variant="success">
              The current compiled layout has no reported errors or warnings.
            </Alert>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
function clipLightSourceModeLabel(mode: DesignerOpticalMode) {
  if (mode === "front") return "Front";
  if (mode === "halo") return "Halo-Lit";
  return "Wall Wash";
}

function MultiLightingMountsEditor({ entries, designer, calibrationOnly = false, modes: requestedModes, onSetMode, onPatchMode }: {
  entries: Array<OpticalTargetRef & { name: string; treatments: DesignerOpticalTreatment[] }>;
  designer: DesignerForm;
  calibrationOnly?: boolean;
  modes?: DesignerOpticalMode[];
  onSetMode: (mode: DesignerOpticalMode, enabled: boolean) => void;
  onPatchMode: (mode: DesignerOpticalMode, patch: Partial<DesignerOpticalTreatment>) => void;
}) {
  const modes = ([
    { mode: "front", label: "Front" },
    { mode: "halo", label: "Halo-Lit" },
    { mode: "wall_wash", label: "Wall Washer" }
  ] satisfies Array<{ mode: DesignerOpticalMode; label: string }>).filter(({ mode }) => !requestedModes || requestedModes.includes(mode));
  const routeNames = new Map(designer.routes.map((route) => [route.id, route.name]));
  return (
    <div className="space-y-4">
      {!calibrationOnly ? <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Lighting modes</legend>
        <div className="grid gap-2">
          {modes.map(({ mode, label }) => {
            const enabledCount = entries.filter((entry) => entry.treatments.some((source) => source.mode === mode && source.enabled)).length;
            const allEnabled = enabledCount === entries.length;
            const mixed = enabledCount > 0 && !allEnabled;
            return (
              <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${enabledCount ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-surface-2"}`}>
                <input
                  type="checkbox"
                  ref={(input) => { if (input) input.indeterminate = mixed; }}
                  checked={allEnabled}
                  onChange={(event) => onSetMode(mode, event.target.checked)}
                />
                <span className="font-medium">{label}</span>
                <span className="ml-auto text-[11px]">{mixed ? `${enabledCount}/${entries.length}` : allEnabled ? "Enabled" : "Off"}</span>
              </label>
            );
          })}
        </div>
      </fieldset> : null}
      {modes.map(({ mode, label }) => {
        const sources = entries.flatMap((entry) => entry.treatments.filter((source) => source.mode === mode && source.enabled));
        if (!sources.length) return null;
        const assignedStrings = Array.from(new Set(sources.flatMap((source) => source.stringIds)));
        const materials = sources.map((source) => source.material);
        const material = commonValue(materials);
        return (
          <section key={mode} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{label}</div>
              <Badge>{sources.length === entries.length ? `${entries.length} targets` : `${sources.length}/${entries.length} targets`}</Badge>
            </div>
            {!calibrationOnly ? <div className="space-y-1 text-xs text-muted-foreground">
              <div className="font-medium">Assigned strings</div>
              <div>{assignedStrings.length ? assignedStrings.map((id) => routeNames.get(id) ?? id).join(", ") : "No strings assigned"}</div>
            </div> : null}
            {mode === "front" ? (
              <>
                {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Material
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={material.mixed ? "" : material.value} onChange={(event) => {
                    if (!event.target.value) return;
                    const nextMaterial = event.target.value as DesignerOpticalTreatment["material"];
                    onPatchMode(mode, nextMaterial === "silicone"
                      ? { material: nextMaterial, sourceDistanceCm: 0.5, transmissionPct: 55, beamAngleDeg: 115, softnessCm: 0 }
                      : { material: nextMaterial });
                  }}>
                    {material.mixed ? <option value="">Mixed</option> : null}
                    <option value="none">LED Pixels</option>
                    <option value="silicone">Silicone Strip</option>
                    <option value="milky_white">Milky White</option>
                    <option value="day_night">Day/Night</option>
                  </select>
                </label> : null}
                <MixedDiffuserSlider label="Distance to diffusor" values={sources.map((source) => source.sourceDistanceCm)} min={0.5} max={30} step={0.5} suffix="cm" onChange={(sourceDistanceCm) => onPatchMode(mode, { sourceDistanceCm })} />
                <MixedDiffuserSlider label="Intensity" values={sources.map((source) => source.intensity)} min={0.1} max={3} step={0.05} onChange={(intensity) => onPatchMode(mode, { intensity })} />
                <MixedDiffuserSlider label="Softness" values={sources.map((source) => source.softnessCm)} min={0} max={10} step={0.25} suffix="cm" onChange={(softnessCm) => onPatchMode(mode, { softnessCm })} />
                {!material.mixed && material.value === "silicone" ? <>
                  <MixedDiffuserSlider label="Transmission" values={sources.map((source) => source.transmissionPct)} min={35} max={90} step={1} suffix="%" onChange={(transmissionPct) => onPatchMode(mode, { transmissionPct })} />
                  <MixedDiffuserSlider label="Beam" values={sources.map((source) => source.beamAngleDeg)} min={90} max={180} step={5} suffix="°" onChange={(beamAngleDeg) => onPatchMode(mode, { beamAngleDeg })} />
                </> : null}
              </>
            ) : (
              <>
                <MixedDiffuserSlider label="Intensity" values={sources.map((source) => source.intensity)} min={0.05} max={3} step={0.01} onChange={(intensity) => onPatchMode(mode, { intensity })} />
                <MixedDiffuserSlider label="Spread" values={sources.map((source) => source.spreadCm)} min={0} max={30} step={0.1} suffix="cm" onChange={(spreadCm) => onPatchMode(mode, { spreadCm })} />
                <MixedDiffuserSlider label="Softness" values={sources.map((source) => source.softnessCm)} min={0} max={20} step={0.1} suffix="cm" onChange={(softnessCm) => onPatchMode(mode, { softnessCm })} />
                {mode === "halo" ? <>
                  <MixedDiffuserSlider label="Wall gap" values={sources.map((source) => source.sourceDistanceCm)} min={0} max={30} step={0.1} suffix="cm" onChange={(sourceDistanceCm) => onPatchMode(mode, { sourceDistanceCm })} />
                  <MixedColorField label="Face color" values={sources.map((source) => source.faceColor)} onChange={(faceColor) => onPatchMode(mode, { faceColor })} />
                </> : null}
                {mode === "wall_wash" ? <>
                  <MixedDiffuserSlider label="Direction" values={sources.map((source) => source.directionDeg)} min={-180} max={180} step={5} suffix="°" onChange={(directionDeg) => onPatchMode(mode, { directionDeg })} />
                  <MixedDiffuserSlider label="Throw" values={sources.map((source) => source.throwCm)} min={1} max={120} step={1} suffix="cm" onChange={(throwCm) => onPatchMode(mode, { throwCm })} />
                  <MixedDiffuserSlider label="Beam" values={sources.map((source) => source.beamAngleDeg)} min={5} max={150} step={5} suffix="°" onChange={(beamAngleDeg) => onPatchMode(mode, { beamAngleDeg })} />
                  <MixedDiffuserSlider label="Falloff" values={sources.map((source) => source.falloff)} min={0.25} max={4} step={0.05} onChange={(falloff) => onPatchMode(mode, { falloff })} />
                </> : null}
                {!calibrationOnly ? <MixedReceiverField values={sources} designer={designer} onChange={(patch) => onPatchMode(mode, patch)} /> : null}
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}

function commonValue<T>(values: T[]) {
  const value = values[0];
  return { value, mixed: values.some((entry) => entry !== value) };
}

function MixedDiffuserSlider({ label, values, min, max, step, suffix = "", onChange }: {
  label: string; values: number[]; min: number; max: number; step: number; suffix?: string; onChange: (value: number) => void;
}) {
  const current = commonValue(values);
  return <DiffuserSlider label={`${label}${current.mixed ? " · Mixed" : ""}`} value={current.value ?? min} min={min} max={max} step={step} suffix={suffix} onChange={onChange} />;
}

function MixedColorField({ label, values, onChange }: { label: string; values: string[]; onChange: (value: string) => void }) {
  const current = commonValue(values);
  return <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">{label}{current.mixed ? " · Mixed" : ""}<input type="color" value={current.value ?? "#000000"} onChange={(event) => onChange(event.target.value)} /></label>;
}

function MixedReceiverField({ values, designer, onChange }: { values: DesignerOpticalTreatment[]; designer: DesignerForm; onChange: (patch: Partial<DesignerOpticalTreatment>) => void }) {
  const receivers = values.map((source) => source.receiverType === "canvas" ? "canvas" : `${source.receiverType}:${source.receiverId ?? ""}`);
  const receiver = commonValue(receivers);
  return (
    <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
      Receiver{receiver.mixed ? " · Mixed" : ""}
      <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={receiver.mixed ? "" : receiver.value} onChange={(event) => {
        if (!event.target.value) return;
        const [receiverType, receiverId] = event.target.value.split(":");
        onChange({ receiverType: receiverType as DesignerOpticalTreatment["receiverType"], receiverId: receiverId || undefined });
      }}>
        {receiver.mixed ? <option value="">Mixed</option> : null}
        <option value="canvas">Canvas</option>
        {designer.buildAreas.map((area) => <option key={area.id} value={`build_area:${area.id}`}>Area: {area.name}</option>)}
        {designer.zones.map((zone) => <option key={zone.id} value={`zone:${zone.id}`}>Zone: {zone.name}</option>)}
      </select>
    </label>
  );
}

function LightingMountsEditor({ treatments, designer, compiledLayout, compileIsCurrent = true, compact = false, calibrationOnly = false, onAdd, onChange, onRemove }: {
  treatments: DesignerOpticalTreatment[];
  designer: DesignerForm;
  compiledLayout?: PartituraDocument["compiledLayout"];
  compileIsCurrent?: boolean;
  compact?: boolean;
  calibrationOnly?: boolean;
  onAdd: (mode: DesignerOpticalMode) => void;
  onChange: (id: string, patch: Partial<DesignerOpticalTreatment>) => void;
  onRemove: (id: string) => void;
}) {
  const modes: Array<{ mode: DesignerOpticalMode; label: string }> = [
    { mode: "front", label: "Front" },
    { mode: "halo", label: "Halo-Lit" },
    { mode: "wall_wash", label: "Wall Washer" }
  ];
  const enabledTreatments = treatments.filter((treatment) => treatment.enabled);
  const ledStrings = designer.routes.filter((route) => route.kind === "led_string");
  return (
    <div className="space-y-4">
      {!calibrationOnly ? <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">Lighting modes</legend>
        <div className="grid gap-2">
        {modes.map(({ mode, label }) => {
          const treatment = treatments.find((entry) => entry.mode === mode);
          const checked = treatment?.enabled === true;
          return (
            <label key={mode} className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card text-muted-foreground hover:bg-surface-2"}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => {
                  if (treatment) onChange(treatment.id, { enabled: event.target.checked });
                  else if (event.target.checked) onAdd(mode);
                }}
              />
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-[11px]">{checked ? "Enabled" : "Off"}</span>
            </label>
          );
        })}
        </div>
      </fieldset> : null}
      {!enabledTreatments.length ? <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{calibrationOnly ? "No light sources are configured for this target. Add them in Design." : "Enable a lighting mode to configure it."}</div> : null}
      {enabledTreatments.map((treatment) => {
        const receiverValue = treatment.receiverType === "canvas" ? "canvas" : `${treatment.receiverType}:${treatment.receiverId ?? ""}`;
        const title = treatment.mode === "front" ? "Front" : treatment.mode === "halo" ? "Halo-Lit" : "Wall Washer";
        const assignedStrings = compiledStringIdsForSource(compiledLayout, treatment.id)
          .map((id) => ledStrings.find((route) => route.id === id)?.name ?? id);
        return (
          <section key={treatment.id} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{title}</div>
              {!calibrationOnly ? <Button type="button" variant="destructive" className="h-8 text-xs" onClick={() => onRemove(treatment.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button> : null}
            </div>
            {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Source name
              <input className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={treatment.name} onChange={(event) => onChange(treatment.id, { name: event.target.value })} />
            </label> : null}
            {!calibrationOnly ? <div className="grid gap-2 text-xs font-medium text-muted-foreground">
              <span>Assigned strings · compiled automatically</span>
              <div className="rounded border border-border-2 bg-surface-2 px-3 py-2 font-normal text-foreground">
                {!compileIsCurrent ? "Compile to update the orthogonal mapping."
                  : assignedStrings.length ? assignedStrings.join(", ")
                    : "No compatible strings cross this target on the required surface."}
              </div>
            </div> : null}
            {treatment.mode === "front" ? (
              <>
                {!calibrationOnly ? <label className="grid max-w-sm gap-1.5 text-xs font-medium text-muted-foreground">
                  Material
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={treatment.material} onChange={(event) => {
                    const material = event.target.value as DesignerOpticalTreatment["material"];
                    onChange(treatment.id, material === "silicone"
                      ? { material, sourceDistanceCm: 0.5, transmissionPct: 55, beamAngleDeg: 115, softnessCm: 0 }
                      : { material });
                  }}>
                    <option value="none">LED Pixels</option>
                    <option value="silicone">Silicone Strip</option>
                    <option value="milky_white">Milky White</option>
                    <option value="day_night">Day/Night</option>
                  </select>
                </label> : null}
                <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
                  <DiffuserSlider label="Intensity" value={treatment.intensity} min={0.1} max={3} step={0.05} onChange={(intensity) => onChange(treatment.id, { intensity })} />
                  <DiffuserSlider label="Distance to diffusor" value={treatment.sourceDistanceCm} min={0.5} max={treatment.material === "silicone" ? 3 : 30} step={0.5} suffix="cm" onChange={(sourceDistanceCm) => onChange(treatment.id, { sourceDistanceCm })} />
                  <DiffuserSlider label="Softness" value={treatment.softnessCm} min={0} max={10} step={0.25} suffix="cm" onChange={(softnessCm) => onChange(treatment.id, { softnessCm })} />
                  {treatment.material === "silicone" ? <>
                    <DiffuserSlider label="Transmission" value={treatment.transmissionPct} min={35} max={90} step={1} suffix="%" onChange={(transmissionPct) => onChange(treatment.id, { transmissionPct })} />
                    <DiffuserSlider label="Beam" value={treatment.beamAngleDeg} min={90} max={180} step={5} suffix="°" onChange={(beamAngleDeg) => onChange(treatment.id, { beamAngleDeg })} />
                  </> : null}
                </div>
                {treatment.material === "none" ? <p className="text-xs text-muted-foreground">Individual addressable pixels remain visible. Distance and softness are retained for later diffuser selection in Design.</p> : null}
              </>
            ) : (
              <div className={compact ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>
                <DiffuserSlider label="Intensity" value={treatment.intensity} min={0.05} center={treatment.mode === "halo" ? 0.3 : undefined} max={3} step={0.01} onChange={(intensity) => onChange(treatment.id, { intensity })} />
                <DiffuserSlider label="Spread" value={treatment.spreadCm} min={0} center={treatment.mode === "halo" ? 3 : undefined} max={30} step={0.1} suffix="cm" onChange={(spreadCm) => onChange(treatment.id, { spreadCm })} />
                <DiffuserSlider label="Softness" value={treatment.softnessCm} min={0} center={treatment.mode === "halo" ? 0.5 : undefined} max={20} step={0.1} suffix="cm" onChange={(softnessCm) => onChange(treatment.id, { softnessCm })} />
                {treatment.mode === "halo" ? <DiffuserSlider label="Wall gap" value={treatment.sourceDistanceCm} min={0} center={0.5} max={30} step={0.1} suffix="cm" onChange={(sourceDistanceCm) => onChange(treatment.id, { sourceDistanceCm })} /> : null}
                {treatment.mode === "wall_wash" ? (
                  <>
                    <DiffuserSlider label="Direction" value={treatment.directionDeg} min={-180} max={180} step={5} suffix="°" onChange={(directionDeg) => onChange(treatment.id, { directionDeg })} />
                    <DiffuserSlider label="Throw" value={treatment.throwCm} min={1} max={120} step={1} suffix="cm" onChange={(throwCm) => onChange(treatment.id, { throwCm })} />
                    <DiffuserSlider label="Beam" value={treatment.beamAngleDeg} min={5} max={150} step={5} suffix="°" onChange={(beamAngleDeg) => onChange(treatment.id, { beamAngleDeg })} />
                    <DiffuserSlider label="Falloff" value={treatment.falloff} min={0.25} max={4} step={0.05} onChange={(falloff) => onChange(treatment.id, { falloff })} />
                  </>
                ) : null}
                {treatment.mode === "halo" ? <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">Face color <input type="color" value={treatment.faceColor} onChange={(event) => onChange(treatment.id, { faceColor: event.target.value })} /></label> : null}
                {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
                  Receiver
                  <select className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={receiverValue} onChange={(event) => {
                    const [receiverType, receiverId] = event.target.value.split(":");
                    onChange(treatment.id, { receiverType: receiverType as DesignerOpticalTreatment["receiverType"], receiverId: receiverId || undefined });
                  }}>
                    <option value="canvas">Canvas</option>
                    {designer.buildAreas.map((area) => <option key={area.id} value={`build_area:${area.id}`}>Area: {area.name}</option>)}
                    {designer.zones.map((zone) => <option key={zone.id} value={`zone:${zone.id}`}>Zone: {zone.name}</option>)}
                  </select>
                </label> : null}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DiffuserSlider({ label, value, min, center, max, step, suffix = "", onChange }: { label: string; value: number; min: number; center?: number; max: number; step: number; suffix?: string; onChange: (value: number) => void }) {
  const displayValue = Math.abs(value - Math.round(value)) < 0.001 ? String(Math.round(value)) : value.toFixed(step < 0.1 ? 2 : 1);
  const centerValue = center ?? min;
  const centered = typeof center === "number" && centerValue > min && centerValue < max;
  const sliderValue = centered ? centeredSliderPosition(value, min, centerValue, max) : value;
  return (
    <label className="flex w-full min-w-0 items-center gap-1.5">
      <span className="w-[112px] shrink-0 text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      <span className="relative flex min-w-0 flex-1 items-center">
        {centered ? <span className="pointer-events-none absolute left-1/2 h-3 w-px bg-muted-foreground/60" /> : null}
        <input
          className="h-2 min-w-0 flex-1 accent-primary"
          type="range"
          min={centered ? 0 : min}
          max={centered ? 1000 : max}
          step={centered ? 1 : step}
          value={sliderValue}
          onChange={(event) => {
            const raw = centered ? centeredSliderValue(Number(event.target.value), min, centerValue, max) : Number(event.target.value);
            onChange(clamp(Math.round(raw / step) * step, min, max));
          }}
        />
      </span>
      <span className="min-w-8 text-left font-mono text-[11px] text-muted-foreground">{displayValue}{suffix}</span>
    </label>
  );
}

function centeredSliderPosition(value: number, min: number, center: number, max: number) {
  const bounded = clamp(value, min, max);
  if (bounded <= center) return 500 * (bounded - min) / (center - min);
  return 500 + 500 * Math.log(bounded / center) / Math.log(max / center);
}

function centeredSliderValue(position: number, min: number, center: number, max: number) {
  const bounded = clamp(position, 0, 1000);
  if (bounded <= 500) return min + (center - min) * bounded / 500;
  return center * Math.pow(max / center, (bounded - 500) / 500);
}

function maximumTimelineHeight(viewportHeight: number) {
  const animateChromeHeight = 94;
  return Math.min(420, Math.max(140, (viewportHeight - animateChromeHeight) * 0.45));
}

function initialAnimationPreviewTime(document: PartituraDocument) {
  const scene = document.scenes.find((entry) => entry.id === document.activeSceneId) ?? document.scenes[0];
  if (!scene) return Math.max(0, document.previewTimeMs);
  if (document.previewTimeMs > 0) return Math.min(document.previewTimeMs, Math.max(0, scene.durationMs - 1));
  const visibleClip = scene.clips
    .filter((clip) => clip.enabled !== false && clip.effect !== "off" && clip.durationMs > 0)
    .sort((left, right) => left.startMs - right.startMs || left.layer - right.layer)[0];
  if (!visibleClip) return 0;
  return Math.min(Math.max(0, scene.durationMs - 1), visibleClip.startMs + Math.floor(visibleClip.durationMs / 2));
}

function clipEnablementSignature(document: PartituraDocument) {
  return document.scenes
    .flatMap((scene) => scene.clips.map((clip) => `${scene.id}:${clip.id}:${clip.enabled !== false ? 1 : 0}`))
    .join("|");
}

function reorderById<T extends { id: string }>(items: T[], activeId: string, overId: string) {
  const from = items.findIndex((item) => item.id === activeId);
  const to = items.findIndex((item) => item.id === overId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

function reorderRoutesWithinKind<T extends { id: string; kind: string }>(routes: T[], activeId: string, overId: string) {
  const active = routes.find((route) => route.id === activeId);
  const over = routes.find((route) => route.id === overId);
  if (!active || !over || active.kind !== over.kind) return routes;
  const sameKind = reorderById(routes.filter((route) => route.kind === active.kind), activeId, overId);
  let index = 0;
  return routes.map((route) => route.kind === active.kind ? sameKind[index++] : route);
}
