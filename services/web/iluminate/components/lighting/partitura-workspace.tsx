"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Partitura } from "@iluminate/lighting-core";
import { AlertCircle, ArrowLeft, Cable, Circle, Copy, Download, Hammer, Hand, Image as ImageIcon, Layers, Lock, Magnet, Maximize2, MousePointer2, Pause, PenLine, Play, Plus, Redo2, Ruler, Route, RotateCcw, Save, Scissors, Settings2, Share2, Sparkles, Spline, Square, Trash2, Undo2, Waves, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { buildDocumentFromDesigner, designerCompileSignature } from "./designer/designer-compiler";
import { DesignerAnimateTimeline } from "./designer/designer-animate-timeline";
import { designerClipTargetIdsForSelection } from "./designer/designer-animation-selection";
import {
  clamp,
  fitViewportToDesigner,
  nextDesignerItemNumber,
  snapValue
} from "./designer/designer-geometry";
import {
  applyDesignerBooleanOperation,
  deleteChannelPoint as deleteChannelPointPath,
  deletePolygonPoint,
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
  detachSolderedRoutePoint,
  findMatchingControllerPort,
  findMatchingSolderTerminal,
  findNearbyControllerPort,
  findNearbySolderTerminal,
  isRouteTerminal,
  moveRoutePoint,
  moveRouteTerminals,
  nearestRouteInsertIndex,
  resolveRouteOutputs,
  routeLengthCm,
  sameSnapPoint,
  sampleRouteLedDots,
  summarizeRoute
} from "./designer/electrical/designer-electrical-engine";
import { DesignerStudioCanvas, type DesignerAnimationDiffuser } from "./designer/designer-paper-canvas";
import { DEFAULT_DIFFUSER_RENDER_SETTINGS, type DiffuserRenderSettings } from "./player/optical-model";
import { DesignerLayersPanel, NodeTypePicker, ToolbarField, ToolbarNumber, ToolButton } from "./designer/designer-ui";
import { designerLayerForSelection, designerSelectionForClipTarget, type DesignerActiveLayer, type DesignerRouteTerminal, type DesignerSelection, type DesignerTool, type DesignerViewport } from "./designer/types";
import type { EffectDefinition, EffectParameterDefinition } from "@/lib/lighting/effect-catalog";
import { installClientDebugHandlers, recordClientDebug } from "@/lib/client-debug";
import {
  canonicalizeDesignerGeometry,
  clonePartituraDocument,
  createDefaultOpticalTreatment,
  createClipIdentity,
  ClipParams,
  ClipForm,
  DesignerArtworkForm,
  DesignerBuildAreaForm,
  DesignerChannelForm,
  DesignerControllerForm,
  DesignerDerivedGeometry,
  DesignerForm,
  DesignerFaceGraphicForm,
  DesignerGroupForm,
  DesignerGeometry,
  DesignerLayerSettings,
  DesignerLayersForm,
  DesignerOpticalMode,
  DesignerOpticalTreatment,
  DesignerPoint,
  DesignerPointNodeType,
  DesignerProjection,
  DesignerProjectionLayer,
  DesignerRouteKind,
  DesignerRouteForm,
  DesignerText,
  DesignerZoneForm,
  nextEmptyClipLayer,
  normalizeDefaultSignLayout,
  designerGeometryAsShape,
  resolveDesignerDerivedGeometry,
  resolveDesignerProjectionGeometry,
  wouldCreateDesignerDerivedGeometryCycle,
  wouldCreateDesignerProjectionCycle,
  PartituraDocument,
  PersistedPartitura,
  SceneForm
} from "@/lib/lighting/partitura-model";
import { DEFAULT_DESIGNER_FONT_ID, DESIGNER_FONT_CATALOG, designerFontResource, designerFontUrl } from "@/lib/lighting/designer-font-catalog";
import { designerTextToGeometry } from "@/lib/lighting/designer-text-geometry";
import { DEFAULT_FABRICATION_EXPORT_OPTIONS, generateDesignerFabricationExport, type FabricationExportFormat, type FabricationExportOptions, type FabricationExportResult } from "./designer/fabrication/designer-fabrication-export";
import { canvasInteractionSnapCm, CHANNEL_ROUTER_BIT_PRESETS, channelWidthForRouterDiameter } from "./designer/canvas/designer-tool-policy";
import { PlayerSurface, type PlayerSurfaceHandle } from "./player/player-surface";
import type { PlayerStatus } from "./player/player-controller";

type ProjectAsset = {
  id: string;
  fileName: string;
  mimeType: string;
};

type DesignerGeometrySelection = Extract<Exclude<DesignerSelection, null>, { type: "build_area" | "zone" | "face_graphic" | "projection" | "derived_geometry" }>;

function isDesignerGeometrySelection(selection: DesignerSelection): selection is DesignerGeometrySelection {
  return selection?.type === "build_area" || selection?.type === "zone" || selection?.type === "face_graphic" || selection?.type === "projection" || selection?.type === "derived_geometry";
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

const DESIGNER_HISTORY_LIMIT = 100;

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "scenes", label: "Scenes" },
  { id: "simulator", label: "Simulator" }
];
const GENERATED_PARTITURA_UNSPECIFIED = Symbol("generated-partitura-unspecified");
const ACTIVE_LAYER_LABELS: Record<DesignerActiveLayer, string> = {
  artwork: "Artwork",
  reference: "Reference",
  zones: "Zones",
  faceGraphic: "Face Graphic",
  lightSources: "Light Sources",
  hardware: "Hardware",
  strings: "Strings"
};

const DESIGNER_TOOL_LABELS: Record<DesignerTool, string> = {
  select: "Select",
  pan: "Pan",
  measure: "Measure",
  image_place: "Image",
  build_area_rect: "Rectangle reference",
  build_area_ellipse: "Ellipse reference",
  build_area_polygon: "Polygon reference",
  build_area_bezier: "Bezier reference",
  reference_text: "Reference text",
  zone_rect: "Rectangle zone",
  zone_ellipse: "Ellipse zone",
  zone_polygon: "Polygon zone",
  zone_bezier: "Bezier zone",
  zone_text: "Zone text",
  channel_bezier: "Channel",
  face_graphic_rect: "Rectangle face graphic",
  face_graphic_ellipse: "Ellipse face graphic",
  face_graphic_polygon: "Polygon face graphic",
  face_graphic_bezier: "Bezier face graphic",
  face_graphic_text: "Face Graphic text",
  led_string: "LED string",
  data_cable: "Data cable",
  cut: "Cut route"
};

function MeasuringTapeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M4 16V8a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v8" />
      <path d="M4 16h13v5H7a3 3 0 0 1-3-3v-2Z" />
      <circle cx="10.5" cy="10" r="2" />
      <path d="M17 16h4v5h-4M19 16v2M8 18v3M11 18v2M14 18v3" />
    </svg>
  );
}

function designerToolInstruction(tool: DesignerTool) {
  if (tool === "select") return "Click an object to edit its properties";
  if (tool === "pan") return "Drag the canvas to move the view";
  if (tool === "measure") return "Drag between two points to measure";
  if (tool === "image_place") return "Drag on the canvas to place the image container";
  if (tool === "reference_text" || tool === "zone_text" || tool === "face_graphic_text") return "Click to place editable text";
  if (tool === "build_area_rect" || tool === "build_area_ellipse" || tool === "zone_rect" || tool === "zone_ellipse" || tool === "face_graphic_rect" || tool === "face_graphic_ellipse") return "Drag on the canvas to create it";
  if (tool === "build_area_polygon" || tool === "build_area_bezier" || tool === "zone_polygon" || tool === "zone_bezier" || tool === "channel_bezier" || tool === "face_graphic_polygon" || tool === "face_graphic_bezier") return "Click to add nodes and close the path to finish";
  if (tool === "led_string" || tool === "data_cable") return "Click to draw the route";
  return "Click a route point to split it";
}

const FABRICATION_CUTTER_PRESETS_MM = [1.5, 2, 3, 3.175, 4, 6, 6.35] as const;

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
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePolicy, setSharePolicy] = useState<SharePolicy>("review");
  const [shareRightsConfirmed, setShareRightsConfirmed] = useState(false);
  const [shareSubmitting, setShareSubmitting] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [sharePublication, setSharePublication] = useState<ScenePublication | null>(null);
  const setupDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const [tool, setTool] = useState<DesignerTool>("select");
  const [snapToGrid, setSnapToGrid] = useState(true);
  // No work plane is active until the operator picks a category in the Layers
  // panel. Until then the canvas must not select or drag any object.
  const [activeLayer, setActiveLayer] = useState<DesignerActiveLayer | null>(null);
  const [projectionTargetLayer, setProjectionTargetLayer] = useState<DesignerProjectionLayer>("faceGraphic");
  const [selection, setSelection] = useState<DesignerSelection>(null);
  const [geometrySelections, setGeometrySelections] = useState<DesignerGeometrySelection[]>([]);
  const [opticalTargetSelection, setOpticalTargetSelection] = useState<OpticalTargetRef[]>([]);
  const undoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const redoHistoryRef = useRef<DesignerHistoryEntry[]>([]);
  const historyInteractionIdRef = useRef(0);
  const historyRecordedInteractionRef = useRef<number | null>(null);
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
  const [lightingEditorOpen, setLightingEditorOpen] = useState(false);
  const [animationTimelineHeight, setAnimationTimelineHeight] = useState(260);
  const [animationTimelineCollapsed, setAnimationTimelineCollapsed] = useState(false);
  const [animationDiffuser, setAnimationDiffuser] = useState<DesignerAnimationDiffuser>("as_built");
  const [diffuserSettings, setDiffuserSettings] = useState<DiffuserRenderSettings>(DEFAULT_DIFFUSER_RENDER_SETTINGS);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [assetsVersion, setAssetsVersion] = useState(0);
  const artworkUrls = useMemo(() => Object.fromEntries(projectAssets.map((asset) => [asset.id, `/api/lighting/projects/${encodeURIComponent(document.projectId)}/assets/${encodeURIComponent(asset.id)}`])), [document.projectId, projectAssets]);

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => installClientDebugHandlers(), []);

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
  const interactionSnapCm = canvasInteractionSnapCm(designer.snapCm, snapToGrid);
  const fabricationCutterPreset = FABRICATION_CUTTER_PRESETS_MM.find((diameter) => Math.abs(diameter - designer.fabricationCutterDiameterMm) < 1e-6);
  const channelRouterPreset = CHANNEL_ROUTER_BIT_PRESETS.find((preset) => Math.abs(preset.diameterMm - designer.channelRouterDiameterMm) < 1e-6);
  const selectedArtwork = selection?.type === "artwork" ? designer.artwork.find((artwork) => artwork.id === selection.id) ?? null : null;
  const selectedBuildArea = selection?.type === "build_area" ? designer.buildAreas.find((buildArea) => buildArea.id === selection.id) ?? null : null;
  const selectedBuildAreaPointIndex = selection?.type === "build_area" ? selection.pointIndex : undefined;
  const selectedLightSource = selection?.type === "light_source" ? designer.lightSources.find((source) => source.id === selection.id) ?? null : null;
  const selectedZone = selection?.type === "zone" ? designer.zones.find((zone) => zone.id === selection.id) ?? null : selectedLightSource?.targetType === "zone" ? designer.zones.find((zone) => zone.id === selectedLightSource.targetId) ?? null : null;
  const selectedZonePointIndex = selection?.type === "zone" ? selection.pointIndex : undefined;
  const selectedFaceGraphic = selection?.type === "face_graphic" ? designer.faceGraphics.find((element) => element.id === selection.id) ?? null : null;
  const selectedFaceGraphicPointIndex = selection?.type === "face_graphic" ? selection.pointIndex : undefined;
  const selectedProjection = selection?.type === "projection" ? designer.projections.find((projection) => projection.id === selection.id) ?? null : null;
  const selectedProjectionResolution = selectedProjection ? resolveDesignerProjectionGeometry(designer, selectedProjection.id) : null;
  const selectedDerivedGeometry = selection?.type === "derived_geometry" ? designer.derivedGeometries.find((operation) => operation.id === selection.id) ?? null : null;
  const selectedDerivedGeometryResolution = selectedDerivedGeometry ? resolveDesignerDerivedGeometry(designer, selectedDerivedGeometry.id) : null;
  const selectedText = selection?.type === "text" ? designer.texts.find((entry) => entry.id === selection.id) ?? null : null;
  const selectedChannel = selection?.type === "channel" ? designer.channels.find((channel) => channel.id === selection.id) ?? null : selectedLightSource?.targetType === "channel" ? designer.channels.find((channel) => channel.id === selectedLightSource.targetId) ?? null : null;
  const selectedChannelRouterPreset = selectedChannel ? CHANNEL_ROUTER_BIT_PRESETS.find((preset) => Math.abs(preset.diameterMm - selectedChannel.widthMm) < 1e-6) : null;
  const selectedChannelPointIndex = selection?.type === "channel" ? selection.pointIndex : undefined;
  const selectedChannelPoint = selectedChannel && typeof selectedChannelPointIndex === "number" ? selectedChannel.points[selectedChannelPointIndex] : null;
  const selectedChannelNodeType = selectedChannelPoint?.nodeType ?? (selectedChannel?.pathMode === "bezier" ? "smooth" : "corner");
  const selectedChannelPointCanFillet = Boolean(selectedChannel && typeof selectedChannelPointIndex === "number"
    && (selectedChannel.closed || selectedChannelPointIndex > 0 && selectedChannelPointIndex < selectedChannel.points.length - 1)
    && (selectedChannelNodeType === "corner" || selectedChannelNodeType === "straight"));
  const selectedRoute = selection?.type === "route" ? designer.routes.find((route) => route.id === selection.id) ?? null : null;
  const selectedRoutePointIndex = selection?.type === "route" ? selection.pointIndex : undefined;
  const selectedController = selection?.type === "controller" ? designer.controller : null;
  const selectedObjectLocked = selection?.type === "artwork" || selection?.type === "build_area"
    ? designer.layers.artwork.locked
    : selection?.type === "zone" || selection?.type === "channel"
      ? designer.layers.zones.locked
      : selection?.type === "face_graphic"
        ? designer.layers.faceGraphic.locked || selectedFaceGraphic?.locked === true
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
  const selectedGeometryId = selectedBuildArea?.geometryId ?? selectedZone?.geometryId ?? selectedFaceGraphic?.geometryId ?? selectedProjection?.geometryId ?? selectedDerivedGeometry?.geometryId;
  const selectedCompoundContours = selectedBuildArea?.contours ?? selectedZone?.contours ?? selectedFaceGraphic?.contours;
  const projectionSourceOptions = [
    ...designer.buildAreas.map((entry) => ({ geometryId: entry.geometryId, label: `Reference · ${entry.name}` })),
    ...designer.zones.map((entry) => ({ geometryId: entry.geometryId, label: `Zone · ${entry.name}` })),
    ...designer.faceGraphics.map((entry) => ({ geometryId: entry.geometryId, label: `Face Graphic · ${entry.name}` })),
    ...designer.projections.map((entry) => ({ geometryId: entry.geometryId, label: `Projection · ${entry.name}` })),
    ...designer.derivedGeometries.map((entry) => ({ geometryId: entry.geometryId, label: `${entry.operation === "offset" ? "Offset" : "Fillet"} · ${entry.name}` }))
  ].filter((entry): entry is { geometryId: string; label: string } => Boolean(entry.geometryId));
  const selectedGeometryKeys = geometrySelections.map((entry) => `${entry.type}:${entry.id}`);
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
  const selectedAnimationTargetIds = useMemo(
    () => designerClipTargetIdsForSelection(designer, selection),
    [designer, selection]
  );
  const routeSummaries = designer.routes.map((route) => summarizeRoute(route, designer));
  const routeOutputs = resolveRouteOutputs(designer.controller, designer.routes, designer.snapCm);
  const totalGeneratedPixels = routeSummaries.reduce((total, route) => total + route.pixels, 0);
  const ledsPerAddressablePixel = designer.ledsPerMeter / Math.max(1, designer.addressablePixelsPerMeter);
  const activeViewport = viewport ?? { x: 0, y: 0, width: designer.canvasWidthCm, height: designer.canvasHeightCm };
  const compileIsCurrent = Boolean(document.compiledLayout && document.compiledDesignerSignature === designerCompileSignature(designer));
  const compileErrors = document.compiledLayout?.validation.errors ?? [];
  const compileWarnings = document.compiledLayout?.validation.warnings ?? [];
  const compileIssueCount = compileErrors.length + compileWarnings.length;
  const canAnimate = compileIsCurrent && compileErrors.length === 0;
  const hasUnsavedChanges = persistedDocumentSignature(document) !== savedDocumentSignatureRef.current;

  useEffect(() => {
    if (viewport) return;
    setViewport(fitViewportToDesigner(designer));
  }, [designer.canvasHeightCm, designer.canvasWidthCm, viewport]);

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
      if (event.key.toLowerCase() === "h") setTool("pan");
      if (activeLayer === "zones" && event.key.toLowerCase() === "r") setTool("zone_rect");
      if (activeLayer === "zones" && event.key.toLowerCase() === "e") setTool("zone_ellipse");
      if (activeLayer === "zones" && event.key.toLowerCase() === "p") setTool("zone_polygon");
      if (activeLayer === "zones" && event.key.toLowerCase() === "b") setTool("zone_bezier");
      if (activeLayer === "zones" && event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey) setTool("channel_bezier");
      if (activeLayer === "faceGraphic" && event.key.toLowerCase() === "r") setTool("face_graphic_rect");
      if (activeLayer === "faceGraphic" && event.key.toLowerCase() === "e") setTool("face_graphic_ellipse");
      if (activeLayer === "faceGraphic" && event.key.toLowerCase() === "p") setTool("face_graphic_polygon");
      if (activeLayer === "faceGraphic" && event.key.toLowerCase() === "b") setTool("face_graphic_bezier");
      if (activeLayer === "artwork" && event.key.toLowerCase() === "i") setTool("image_place");
      if ((activeLayer === "artwork" || activeLayer === "reference") && event.key.toLowerCase() === "p") setTool("build_area_polygon");
      if ((activeLayer === "artwork" || activeLayer === "reference") && event.key.toLowerCase() === "b") setTool("build_area_bezier");
      if (activeLayer === "strings" && event.key.toLowerCase() === "l") setTool("led_string");
      if (activeLayer === "strings" && event.key.toLowerCase() === "d") setTool("data_cable");
      if (activeLayer === "strings" && event.key.toLowerCase() === "x") setTool("cut");
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

  async function save(nextDocument?: PartituraDocument, generatedPartitura: unknown | typeof GENERATED_PARTITURA_UNSPECIFIED = GENERATED_PARTITURA_UNSPECIFIED) {
    const normalizedDocument = normalizeDefaultSignLayout(nextDocument ?? documentRef.current);
    const persistedGeneratedPartitura = generatedPartitura !== GENERATED_PARTITURA_UNSPECIFIED
      ? generatedPartitura
      : generatedPartituraStaleRef.current ? null : partitura.generatedPartitura;
    setSaving(true);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: partitura.name,
          status: partitura.status,
          document: normalizedDocument,
          generatedPartitura: persistedGeneratedPartitura ?? null,
          validationReport: partitura.validationReport ?? {}
        })
      });
      const payload = (await response.json()) as { partitura?: PersistedPartitura };
      if (!response.ok || !payload.partitura) {
        setFabricationNotice("Unable to save the partitura.");
        return false;
      }
      if (payload.partitura) {
        generatedPartituraStaleRef.current = false;
        setPartitura(payload.partitura);
        const savedDocument = clonePartituraDocument(payload.partitura.document);
        savedDocumentSignatureRef.current = persistedDocumentSignature(savedDocument);
        replaceDocument(savedDocument);
      }
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
      const content = format === "svg" ? result.svg : result.dxf;
      const blob = new Blob([content], { type: format === "svg" ? "image/svg+xml;charset=utf-8" : "application/dxf;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${partitura.partituraKey.replace(/[^A-Za-z0-9_-]+/g, "_")}-fabrication.${format}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setFabricationNotice(`${format.toUpperCase()} exported · ${result.pathCount} paths${warningCount ? ` · ${warningCount} warnings` : ""}`);
    } finally {
      setFabricationExporting(false);
    }
  }

  function commitCanonicalDesigner(canonical: DesignerForm, options: { recordHistory?: boolean } = {}) {
    const invalidatesRuntime = designerCompileSignature(designer) !== designerCompileSignature(canonical);
    updateLiveDocument((current) => ({ ...current, designer: canonical }), { invalidateRuntime: invalidatesRuntime, recordHistory: options.recordHistory });
  }

  function updateDesigner(nextDesigner: DesignerForm, options: { recordHistory?: boolean } = {}) {
    commitCanonicalDesigner(canonicalizeDesignerGeometry(nextDesigner), options);
  }

  function patchDesigner(patch: Partial<DesignerForm>) {
    updateDesigner({ ...designer, ...patch });
  }

  function patchDesignerLayer(layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) {
    patchDesignerLayers([layer], patch);
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
    updateDesigner({ ...designer, artwork: designer.artwork.map((entry) => (entry.id === artworkId ? { ...entry, ...patch } : entry)) });
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
      const projection = nextSelection?.type === "projection" ? designer.projections.find((entry) => entry.id === nextSelection.id) : null;
      const derived = nextSelection?.type === "derived_geometry" ? designer.derivedGeometries.find((entry) => entry.id === nextSelection.id) : null;
      const text = nextSelection?.type === "text" ? designer.texts.find((entry) => entry.id === nextSelection.id) : null;
      const geometryTarget = projection?.targetLayer ?? derived?.targetLayer ?? text?.targetLayer;
      const selectionLayer = geometryTarget ? geometryTarget === "reference" ? "artwork" : geometryTarget : designerLayerForSelection(nextSelection);
      if (additive && isDesignerGeometrySelection(nextSelection) && selectionLayer) {
        const sameLayer = geometrySelections.every((entry) => {
          const selectedProjection = entry.type === "projection" ? designer.projections.find((projectionEntry) => projectionEntry.id === entry.id) : null;
          const selectedDerived = entry.type === "derived_geometry" ? designer.derivedGeometries.find((operation) => operation.id === entry.id) : null;
          const selectedTarget = selectedProjection?.targetLayer ?? selectedDerived?.targetLayer;
          const layer = selectedTarget ? selectedTarget === "reference" ? "artwork" : selectedTarget : designerLayerForSelection(entry);
          return layer === selectionLayer;
        });
        const base = sameLayer ? geometrySelections : [];
        const exists = base.some((entry) => entry.type === nextSelection.type && entry.id === nextSelection.id);
        const nextSelections = exists
          ? base.filter((entry) => entry.type !== nextSelection.type || entry.id !== nextSelection.id)
          : [...base, nextSelection];
        setGeometrySelections(nextSelections);
        setSelection(nextSelections.at(-1) ?? null);
        setActiveLayer(selectionLayer);
        setLayersPanelOpen(true);
        return;
      }
      setGeometrySelections(isDesignerGeometrySelection(nextSelection) ? [nextSelection] : []);
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

  function activateDesignerLayer(layer: DesignerActiveLayer) {
    setActiveLayer(layer);
    setTool("select");
    setSelection(null);
    setGeometrySelections([]);
  }

  function openLightingSetup(target: OpticalTargetRef) {
    selectDesignerItem({ type: target.type, id: target.id });
    setLightingEditorOpen(true);
  }

  function patchController(patch: Partial<DesignerControllerForm>) {
    if (designer.layers.hardware.locked) return;
    updateDesigner({ ...designer, controller: { ...designer.controller, ...patch, id: "controller" } });
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
    updateDesigner({ ...designer, derivedGeometries: designer.derivedGeometries.map((operation) => operation.id === derivedId ? { ...operation, ...patch } : operation) });
  }

  function createDerivedGeometry(operation: DesignerDerivedGeometry["operation"]) {
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
      name: `${sourceLabel} ${operation}`,
      geometryId: `geometry_derived_${next}`,
      sourceGeometryId,
      targetLayer,
      operation,
      ...(operation === "offset" ? { distanceMm: 2, join: "round" as const, miterLimit: 4 } : { radiusMm: 2 }),
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
    setFabricationNotice(`${operation === "offset" ? "Offset" : "Fillet"} profile created with a live source link.`);
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
    const layerKey = projectionTargetLayer === "reference" ? "artwork" : projectionTargetLayer;
    if (designer.layers[layerKey].locked) return;
    const next = nextDesignerItemNumber(designer.projections, "projection_");
    const sourceLabel = projectionSourceOptions.find((entry) => entry.geometryId === selectedGeometryId)?.label.replace(/^.* · /, "") ?? `Geometry ${next}`;
    const projection: DesignerProjection = {
      id: `projection_${next}`,
      name: `${sourceLabel} projection`,
      geometryId: `geometry_projection_${next}`,
      sourceGeometryId: selectedGeometryId,
      targetLayer: projectionTargetLayer,
      linked: true,
      visible: true
    };
    updateDesigner({ ...designer, projections: [...designer.projections, projection] });
    setActiveLayer(projectionTargetLayer === "reference" ? "artwork" : projectionTargetLayer);
    setSelection({ type: "projection", id: projection.id });
    setFabricationNotice(`Linked projection created in ${projectionTargetLayer === "faceGraphic" ? "Face Graphic" : projectionTargetLayer === "zones" ? "Diffusors" : "Reference"}.`);
  }

  function breakProjectionLink(projectionId: string) {
    const projection = designer.projections.find((entry) => entry.id === projectionId);
    const resolved = projection ? resolveDesignerProjectionGeometry(designer, projection.id) : null;
    if (!projection || !resolved?.geometry) {
      setFabricationNotice("Cannot break a projection with an unresolved source. Relink it first.");
      return;
    }
    const layerKey = projection.targetLayer === "reference" ? "artwork" : projection.targetLayer;
    if (designer.layers[layerKey].locked) return;
    const shape = designerGeometryAsShape(resolved.geometry);
    const projections = designer.projections.filter((entry) => entry.id !== projectionId);
    if (projection.targetLayer === "reference") {
      const next = nextDesignerItemNumber(designer.buildAreas, "build_area_");
      const buildArea: DesignerBuildAreaForm = { id: `build_area_${next}`, name: projection.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, projections, buildAreas: [...designer.buildAreas, buildArea] });
      setSelection({ type: "build_area", id: buildArea.id });
    } else if (projection.targetLayer === "zones") {
      const next = nextDesignerItemNumber(designer.zones, "zone_");
      const zone: DesignerZoneForm = { id: `zone_${next}`, name: projection.name, ...shape, visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, projections, zones: [...designer.zones, zone] });
      setSelection({ type: "zone", id: zone.id });
    } else {
      const next = nextDesignerItemNumber(designer.faceGraphics, "face_graphic_");
      const element: DesignerFaceGraphicForm = { id: `face_graphic_${next}`, name: projection.name, ...shape, passMode: "translucent", filterColor: "#FFFFFF", visible: true, locked: false, opacity: 1 };
      updateDesigner({ ...designer, projections, faceGraphics: [...designer.faceGraphics, element] });
      setSelection({ type: "face_graphic", id: element.id });
    }
    setFabricationNotice("Projection link broken. The geometry is now an independent editable object.");
  }

  function applyBooleanOperation(operation: DesignerBooleanOperation) {
    if (geometrySelections.length < 2) return;
    const paper = window.paper;
    if (!paper) {
      setFabricationNotice("The geometry engine is still loading. Try the boolean operation again.");
      return;
    }
    const geometryById = new Map((designer.geometries ?? []).map((geometry) => [geometry.id, geometry]));
    const operands = geometrySelections.map((entry): { selection: DesignerGeometrySelection; geometry: DesignerGeometry | null; target: DesignerProjectionLayer } => {
      if (entry.type === "projection") {
        const projection = designer.projections.find((candidate) => candidate.id === entry.id);
        return { selection: entry, geometry: projection ? resolveDesignerProjectionGeometry(designer, projection.id).geometry : null, target: projection?.targetLayer ?? "faceGraphic" };
      }
      if (entry.type === "derived_geometry") {
        const operation = designer.derivedGeometries.find((candidate) => candidate.id === entry.id);
        return { selection: entry, geometry: operation ? resolveDesignerDerivedGeometry(designer, operation.id).geometry : null, target: operation?.targetLayer ?? "faceGraphic" };
      }
      const owner = entry.type === "build_area"
        ? designer.buildAreas.find((candidate) => candidate.id === entry.id)
        : entry.type === "zone"
          ? designer.zones.find((candidate) => candidate.id === entry.id)
          : designer.faceGraphics.find((candidate) => candidate.id === entry.id);
      return {
        selection: entry,
        geometry: owner?.geometryId ? geometryById.get(owner.geometryId) ?? null : null,
        target: entry.type === "build_area" ? "reference" : entry.type === "zone" ? "zones" : "faceGraphic"
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
    if (target === "reference") {
      const base = designer.buildAreas.find((entry) => removedBuildAreas.has(entry.id));
      const item: DesignerBuildAreaForm = { ...shape, id: resultObjectId, geometryId, name: `${operationLabel} ${nextNumber}`, visible: true, locked: false, opacity: base?.opacity ?? 1 };
      updateDesigner({ ...designer, buildAreas: [...designer.buildAreas.filter((entry) => !removedBuildAreas.has(entry.id)), item] });
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
        groups,
        lightSources: designer.lightSources.map((source) => source.targetType === "zone" && removedZones.has(source.targetId) ? { ...source, targetId: item.id } : source)
      });
      setSelection({ type: "zone", id: item.id });
      setGeometrySelections([{ type: "zone", id: item.id }]);
    } else {
      const base = designer.faceGraphics.find((entry) => removedFaceGraphics.has(entry.id));
      const item: DesignerFaceGraphicForm = { ...shape, id: resultObjectId, geometryId, name: `${operationLabel} ${nextNumber}`, passMode: base?.passMode ?? "translucent", filterColor: base?.filterColor ?? "#FFFFFF", visible: true, locked: false, opacity: base?.opacity ?? 1 };
      updateDesigner({ ...designer, faceGraphics: [...designer.faceGraphics.filter((entry) => !removedFaceGraphics.has(entry.id)), item] });
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
      lightSources: designer.lightSources.filter((source) => !(source.targetType === "channel" && source.targetId === channelId))
    });
    setSelection(null);
    setFabricationNotice("Channel deleted.");
  }

  function addGroup() {
    const groups = designer.groups ?? [];
    const usedIds = new Set(groups.map((group) => group.id));
    let index = groups.length + 1;
    while (usedIds.has(`group_${index}`)) index += 1;
    const members = designer.zones.map((zone) => ({ type: "zone" as const, id: zone.id }));
    const group: DesignerGroupForm = { id: `group_${index}`, name: `Group ${index}`, members };
    updateDesigner({ ...designer, groups: [...groups, group] });
    setFabricationNotice(`Group ${index} created with ${members.length} zones. Uncheck the ones to exclude, then Compile.`);
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

  function toggleGroupMember(groupId: string, memberType: "zone" | "group", memberId: string) {
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

  function selectGroupZone(zoneId: string) {
    if (!designer.zones.some((zone) => zone.id === zoneId)) return;
    setActiveLayer("zones");
    setTool("select");
    setSelection({ type: "zone", id: zoneId });
  }

  function updateBuildAreaPoint(buildAreaId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const buildArea = designer.buildAreas.find((entry) => entry.id === buildAreaId);
    const point = buildArea?.points?.[pointIndex];
    if (!buildArea || !point) return;
    patchBuildArea(buildAreaId, updatePolygonPoint(buildArea, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex });
  }

  function updateZonePoint(zoneId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    const point = zone?.points?.[pointIndex];
    if (!zone || !point) return;
    patchZone(zoneId, updatePolygonPoint(zone, pointIndex, { ...point, ...patch }, designer.snapCm));
    setSelection({ type: "zone", id: zoneId, pointIndex });
  }

  function updateFaceGraphicPoint(elementId: string, pointIndex: number, patch: Partial<DesignerPoint>) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    const point = element?.points?.[pointIndex];
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
    if (!buildArea.points || buildArea.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextBuildArea = deletePolygonPoint(buildArea, pointIndex);
    patchBuildArea(buildAreaId, nextBuildArea);
    const nextIndex = Math.min(pointIndex, Math.max(0, (nextBuildArea.points?.length ?? 1) - 1));
    setSelection({ type: "build_area", id: buildAreaId, pointIndex: nextIndex });
    setFabricationNotice("Reference polygon point deleted.");
  }

  function deleteZonePoint(zoneId: string, pointIndex: number) {
    const zone = designer.zones.find((entry) => entry.id === zoneId);
    if (!zone || designer.layers.zones.locked) return;
    if (!zone.points || zone.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const nextZone = deletePolygonPoint(zone, pointIndex);
    patchZone(zoneId, nextZone);
    const nextIndex = Math.min(pointIndex, Math.max(0, (nextZone.points?.length ?? 1) - 1));
    setSelection({ type: "zone", id: zoneId, pointIndex: nextIndex });
    setFabricationNotice("Zone polygon point deleted.");
  }

  function deleteFaceGraphicPoint(elementId: string, pointIndex: number) {
    const element = designer.faceGraphics.find((entry) => entry.id === elementId);
    if (!element || designer.layers.faceGraphic.locked || element.locked) return;
    if (!element.points || element.points.length <= 3) {
      setFabricationNotice("Polygon needs at least 3 points.");
      return;
    }
    const next = deletePolygonPoint(element, pointIndex);
    patchFaceGraphic(elementId, next);
    setSelection({ type: "face_graphic", id: elementId, pointIndex: Math.min(pointIndex, Math.max(0, (next.points?.length ?? 1) - 1)) });
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
    setSelection({ type: "route", id: secondRoute.id });
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

  function autoSolderRoutePoint(routeId: string, pointIndex: number, finalPoint?: DesignerPoint) {
    const routes = finalPoint ? moveRoutePoint(designer.routes, routeId, pointIndex, finalPoint) : designer.routes;
    const route = routes.find((entry) => entry.id === routeId);
    if (!route || !isRouteTerminal(route, pointIndex)) {
      return;
    }
    const point = route.points[pointIndex];
    const portSpacingCm = designer.controller.height / Math.max(1, designer.controller.dataOutputs + 1);
    const captureRadiusCm = Math.max(0.65, Math.min(1.5, portSpacingCm * 0.45));
    const nearbyControllerPort = findNearbyControllerPort(designer.controller, route, pointIndex, point, captureRadiusCm, designer.snapCm);
    if (nearbyControllerPort) {
      updateDesigner({
        ...designer,
        routes: routes.map((entry) => (
          entry.id === routeId
            ? {
              ...entry,
              points: entry.points.map((entryPoint, index) => index === pointIndex ? { ...entryPoint, ...nearbyControllerPort.point, joint: true } : entryPoint)
            }
            : entry
        ))
      });
      setFabricationNotice(`Data cable soldered to controller output ${nearbyControllerPort.portIndex + 1}.`);
      return;
    }
    const matchingTerminal = findMatchingSolderTerminal(routes, routeId, pointIndex, designer.snapCm)
      ?? findNearbySolderTerminal(routes, routeId, pointIndex, point, captureRadiusCm);
    if (matchingTerminal) {
      solderRouteTerminals({ routeId, pointIndex }, matchingTerminal, routes);
      return;
    }
    const controllerPort = findMatchingControllerPort(designer.controller, routes, routeId, pointIndex, designer.snapCm);
    if (controllerPort !== null) {
      updateDesigner({
        ...designer,
        routes: routes.map((entry) => (
          entry.id === routeId
            ? {
              ...entry,
              points: entry.points.map((point, index) => index === pointIndex ? { ...point, joint: true } : point)
            }
            : entry
        ))
      });
      setFabricationNotice(`Data cable soldered to controller output ${controllerPort + 1}.`);
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
    if (selection.type === "zone" && designer.layers.zones.locked) return;
    if (selection.type === "face_graphic" && (designer.layers.faceGraphic.locked || designer.faceGraphics.find((entry) => entry.id === selection.id)?.locked)) return;
    if (selection.type === "channel" && designer.layers.zones.locked) return;
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
    if (selection.type === "route" && designer.routes.length > 1) {
      const routes = clearFloatingTerminalJoints(
        designer.routes.filter((route) => route.id !== selection.id),
        designer.controller,
        designer.snapCm
      );
      updateDesigner({
        ...designer,
        routes,
        lightSources: designer.lightSources.map((source) => ({ ...source, stringIds: source.stringIds.filter((id) => id !== selection.id) }))
      });
      setSelection(null);
    }
  }

  function copySelection() {
    if (selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "face_graphic" || selection.type === "route")) setClipboard(selection);
  }

  function pasteSelection() {
    if (!clipboard) return;
    if (clipboard.type === "artwork") {
      const source = designer.artwork.find((artwork) => artwork.id === clipboard.id);
      if (!source) return;
      const next = designer.artwork.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, x: source.x + designer.snapCm, y: source.y + designer.snapCm };
      updateDesigner({ ...designer, artwork: [...designer.artwork, copy] });
      setActiveLayer("artwork");
      setSelection({ type: "artwork", id: copy.id });
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
      updateDesigner({ ...designer, zones: [...designer.zones, copy] });
      setSelection({ type: "zone", id: copy.id });
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
      updateDesigner({ ...designer, faceGraphics: [...designer.faceGraphics, copy] });
      setSelection({ type: "face_graphic", id: copy.id });
    }
    if (clipboard.type === "route") {
      const source = designer.routes.find((route) => route.id === clipboard.id);
      if (!source) return;
      const next = designer.routes.length + 1;
      const copy = { ...source, id: `${source.id}_copy_${next}`, name: `${source.name} Copy`, points: source.points.map((point) => ({ x: point.x + designer.snapCm, y: point.y + designer.snapCm })) };
      updateDesigner({ ...designer, routes: [...designer.routes, copy] });
      setSelection({ type: "route", id: copy.id });
    }
  }

  function zoomToFit() {
    setViewport(fitViewportToDesigner(designer));
  }

  function compileLayout() {
    const nextDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(documentRef.current));
    replaceDocument(nextDocument);
    discardRuntimeArtifacts();
    const layout = nextDocument.compiledLayout;
    setFabricationNotice(layout?.validation.errors.length
      ? layout.validation.errors[0]
      : `Compiled: ${layout?.pixelMap.length ?? 0} mapped pixels across ${layout?.outputs.filter((output) => output.pixelCount > 0).length ?? 0} outputs.`);
    void save(nextDocument, null);
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

  async function previewAnimation(sourceDocument = documentRef.current, options: { play?: boolean } = {}) {
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
        setAnimationPlaying(false);
        setAnimationResult(null);
        setFabricationNotice("Compile the Designer without electrical errors before animating.");
        return;
      }
      const previewDocument = { ...compiledDocument, previewTimeMs: initialAnimationPreviewTime(compiledDocument) };
      replaceDocument(previewDocument);
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewDocument)
      });
      const payload = (await response.json()) as ApiResult;
      if (generationId !== animationGenerationIdRef.current) return;
      animationResultRef.current = payload;
      setAnimationResult(payload);
      if (payload.ok) {
        setAnimationPlaying(shouldPlay);
        setFabricationNotice(`Animation ready: ${payload.partitura?.pixelMap.length ?? 0} mapped pixels.`);
      } else {
        setAnimationPlaying(false);
        setFabricationNotice(payload.message ?? payload.validation?.errors[0]?.message ?? "Animation generation failed.");
      }
      return payload;
    } catch (error) {
      if (generationId !== animationGenerationIdRef.current) return;
      const message = error instanceof Error ? error.message : "Animation generation failed.";
      setAnimationPlaying(false);
      setFabricationNotice(message);
      setAnimationResult({ ok: false, message, validation: { errors: [], warnings: [] } });
      return undefined;
    } finally {
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
    const generated = await previewAnimation(documentRef.current, { play: false });
    if (!generated?.ok || !generated.partitura) {
      setShareError(generated?.message ?? "Generate a valid partitura before sharing.");
      return null;
    }
    const saved = await save(documentRef.current, generated.partitura);
    if (!saved) return null;
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
    recordClientDebug("optical_treatment_patch", {
      target: selectedOpticalTarget ? `${selectedOpticalTarget.type}:${selectedOpticalTarget.id}` : null,
      treatmentId,
      patch
    });
    updateLiveDocument((current) => {
      const currentDesigner = current.designer ?? designer;
      return {
        ...current,
        designer: {
          ...currentDesigner,
          lightSources: currentDesigner.lightSources.map((treatment) => treatment.id === treatmentId ? { ...treatment, ...patch } : treatment)
        }
      };
    });
  }

  function addOpticalTreatment(mode: DesignerOpticalMode) {
    if (!selectedOpticalTarget || selectedOpticalTreatments.some((treatment) => treatment.mode === mode)) return;
    const treatment = {
      ...createDefaultOpticalTreatment(selectedOpticalTarget.type, selectedOpticalTarget.id, mode),
      name: `${selectedZone?.name ?? selectedChannel?.name ?? selectedOpticalTarget.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`,
      stringIds: Array.from(new Set((document.compiledLayout?.zones.find((zone) => zone.id === selectedOpticalTarget.id)?.pixelIds ?? [])
        .map((pixelId) => document.compiledLayout?.pixelMap.find((pixel) => pixel.id === pixelId)?.stringId)
        .filter((stringId): stringId is string => Boolean(stringId))))
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
            name: `${targetName ?? target.id} · ${mode === "front" ? "Front" : mode === "halo" ? "Halo" : "Wall Wash"}`,
            stringIds: Array.from(new Set((current.compiledLayout?.zones.find((zone) => zone.id === target.id)?.pixelIds ?? [])
              .map((pixelId) => current.compiledLayout?.pixelMap.find((pixel) => pixel.id === pixelId)?.stringId)
              .filter((stringId): stringId is string => Boolean(stringId))))
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
    const hadPreview = Boolean(animationResultRef.current?.ok);
    const resumePlayback = animationPlaying;
    const previewTimeMs = playerStatus?.timeMs ?? nextDocument.previewTimeMs;
    const clipEnablementChanged = clipEnablementSignature(documentRef.current) !== clipEnablementSignature(nextDocument);
    if (nextDocument !== documentRef.current) recordDesignerHistory(documentRef.current);
    replaceDocument(nextDocument);
    if (hadPreview) {
      // Structural timeline edits must not compete with the active frame loop.
      // Pause while the replacement partitura is generated, then resume only
      // after the new runtime artifact is installed.
      if (resumePlayback) setAnimationPlaying(false);
      if (clipEnablementChanged) {
        // A muted clip must stop contributing immediately. Do not let playback
        // continue from the previously generated partitura while its replacement
        // is being rendered.
        animationResultRef.current = null;
        setAnimationResult(null);
      }
      // Keep the last valid frame visible while regenerating. Clearing it here
      // made every color edit appear as the renderer's neutral gray fallback.
      generatedPartituraStaleRef.current = true;
      setPartitura((current) => (
        current.generatedPartitura === undefined ? current : { ...current, generatedPartitura: undefined }
      ));
      void previewAnimation({ ...nextDocument, previewTimeMs }, { play: resumePlayback });
    } else {
      discardRuntimeArtifacts();
    }
  }

  const canCopySelection = Boolean(selection && (selection.type === "artwork" || selection.type === "zone" || selection.type === "face_graphic" || selection.type === "route"));
  const canDeleteSelection = Boolean(selection)
    && selection?.type !== "controller"
    && !(selection?.type === "artwork" && designer.layers.artwork.locked)
    && !(selection?.type === "build_area" && designer.layers.artwork.locked)
    && !(selection?.type === "zone" && designer.layers.zones.locked)
    && !(selection?.type === "face_graphic" && (designer.layers.faceGraphic.locked || selectedFaceGraphic?.locked))
    && !(selection?.type === "projection" && selectedProjection && designer.layers[selectedProjection.targetLayer === "reference" ? "artwork" : selectedProjection.targetLayer].locked)
    && !(selection?.type === "derived_geometry" && selectedDerivedGeometry && designer.layers[selectedDerivedGeometry.targetLayer === "reference" ? "artwork" : selectedDerivedGeometry.targetLayer].locked)
    && !(selection?.type === "text" && selectedText && (designer.layers[selectedText.targetLayer === "reference" ? "artwork" : selectedText.targetLayer].locked || selectedText.locked))
    && !(selection?.type === "channel" && designer.layers.zones.locked)
    && !(selection?.type === "light_source" && designer.layers.lightSources.locked)
    && !(selection?.type === "route" && designer.layers.strings.locked);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border-2 bg-card px-2 whitespace-nowrap">
        <div className="flex min-w-0 items-center gap-2">
          <Button asChild variant="outline" density="compact" type="button" className="shrink-0 px-2">
            <Link href={`/partituras/generator/${encodeURIComponent(partitura.id)}`}>
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
            <details ref={setupDetailsRef} className="group relative shrink-0">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-input bg-card px-2 text-body-sm hover:bg-surface-hover [&::-webkit-details-marker]:hidden">
                <Settings2 className="h-4 w-4" /> Setup
              </summary>
              <div className="absolute left-0 top-10 z-50 w-72 space-y-3 rounded-lg border border-border-2 bg-card p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Canvas</div>
                  <Button type="button" variant="ghost" className="h-7 w-7 px-0" title="Close Setup" aria-label="Close Setup" onClick={() => { if (setupDetailsRef.current) setupDetailsRef.current.open = false; }}>
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
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">CNC fabrication</div>
                <ToolbarField label="Cutter preset">
                  <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={fabricationCutterPreset ? String(fabricationCutterPreset) : "custom"} onChange={(event) => {
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
                <div className="flex items-center gap-3">
                  <ToolbarNumber label="Cutter diameter" value={cutterDiameterForDisplay(designer.fabricationCutterDiameterMm, designer.fabricationCutterUnit)} suffix={designer.fabricationCutterUnit} onChange={(value) => patchDesigner({ fabricationCutterDiameterMm: Math.max(0.001, cutterDiameterFromDisplay(value, designer.fabricationCutterUnit)) })} />
                  <ToolbarField label="Cutter unit">
                    <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={designer.fabricationCutterUnit} onChange={(event) => patchDesigner({ fabricationCutterUnit: event.target.value as DesignerForm["fabricationCutterUnit"] })}>
                      <option value="mm">mm</option>
                      <option value="in">inches</option>
                      <option value="cm">cm</option>
                    </select>
                  </ToolbarField>
                </div>
                <div className="border-t border-border pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">LED layout</div>
                <div className="flex items-center gap-3">
                  <ToolbarNumber label="Pixels/m" value={designer.addressablePixelsPerMeter} onChange={(addressablePixelsPerMeter) => patchDesigner({ addressablePixelsPerMeter, ledDensityPerMeter: addressablePixelsPerMeter })} />
                  <ToolbarNumber label="LEDs/m" value={designer.ledsPerMeter} onChange={(ledsPerMeter) => patchDesigner({ ledsPerMeter })} />
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
            <Button type="button" variant="outline" density="compact" className="px-2" title="Validate and export fabrication geometry" onClick={() => { setFabricationExportResult(null); setFabricationExportOpen(true); }}>
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
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border-2 bg-card px-2 text-body-sm font-medium text-ink-secondary hover:border-border-strong hover:bg-surface-hover hover:text-foreground" title="Show or hide zone and channel outlines">
              <input
                type="checkbox"
                checked={diffuserSettings.showOutlines}
                onChange={(event) => setDiffuserSettings((current) => ({ ...current, showOutlines: event.target.checked }))}
                className="h-4 w-4 cursor-pointer accent-blue-600"
              />
              <span>Outlines</span>
            </label>
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

        <div className="ml-auto flex min-w-0 shrink items-center gap-1.5">
          <Badge className={`hidden shrink-0 xl:inline-flex ${compileIsCurrent ? (compileErrors.length ? "border border-destructive/50 bg-destructive/10 text-destructive" : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300") : "border border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200"}`}>
            {compileIsCurrent ? (compileErrors.length ? `${compileErrors.length} errors` : `${document.compiledLayout?.pixelMap.length ?? 0} px`) : "Compile required"}
          </Badge>
          {compileIsCurrent && compileIssueCount ? (
            <Button type="button" variant="outline" density="compact" className="px-2" title={`${compileIssueCount} compile issues`} onClick={() => setCompileIssuesOpen(true)}>
              <AlertCircle className="h-4 w-4" /> {compileIssueCount}
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
          <Button type="button" variant="outline" density="compact" className={`px-2 ${compileIsCurrent ? "text-muted-foreground" : "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950"}`} onClick={compileLayout} disabled={saving || compileIsCurrent} title={compileIsCurrent ? "Layout is compiled and current" : "Compile pending Designer changes"} aria-label={compileIsCurrent ? "Layout compiled" : "Compile pending Designer changes"}>
            <Hammer className="h-4 w-4" /> <span className="hidden xl:inline">{compileIsCurrent ? "Compiled" : "Compile"}</span>
          </Button>
          <Button type="button" variant="outline" density="compact" className={`px-2 ${hasUnsavedChanges ? "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950" : "text-muted-foreground"}`} onClick={() => void save()} disabled={saving || !hasUnsavedChanges} title={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"} aria-label={saving ? "Saving changes" : hasUnsavedChanges ? "Save pending changes" : "All changes are saved"}>
            <Save className="h-4 w-4" /> <span className="hidden xl:inline">{saving ? "Saving" : "Save"}</span>
          </Button>
        </div>
      </header>

      {editorMode === "design" ? <div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-3 whitespace-nowrap">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="flex min-w-max items-center gap-2">
        <span className="shrink-0 text-body-sm font-semibold text-foreground">
          {selectedArtwork?.name ?? selectedBuildArea?.name ?? selectedLightSource?.name ?? selectedFaceGraphic?.name ?? selectedProjection?.name ?? selectedDerivedGeometry?.name ?? selectedText?.name ?? selectedZone?.name ?? selectedChannel?.name ?? selectedController?.name ?? selectedRoute?.name ?? (editorMode === "design" ? DESIGNER_TOOL_LABELS[tool] : "Animate")}
        </span>
        <div className="h-6 w-px shrink-0 bg-border" />
        {editorMode === "design" && !selection ? <span className="text-body-sm text-muted-foreground">{designerToolInstruction(tool)}{activeLayer ? ` · ${ACTIVE_LAYER_LABELS[activeLayer]} layer` : " · Choose a layer to begin"}</span> : null}
        {editorMode === "design" && !selection && tool === "channel_bezier" ? (
          <>
            <ToolbarField label="Router bit Ø">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={channelRouterPreset ? String(channelRouterPreset.diameterMm) : "current"} onChange={(event) => {
                if (event.target.value !== "current") patchDesigner({ channelRouterDiameterMm: channelWidthForRouterDiameter(Number(event.target.value)) });
              }}>
                {!channelRouterPreset ? <option value="current">Current · {designer.channelRouterDiameterMm} mm · {(designer.channelRouterDiameterMm / 25.4).toFixed(3)} in</option> : null}
                {CHANNEL_ROUTER_BIT_PRESETS.map((preset) => <option key={preset.diameterMm} value={preset.diameterMm}>Ø {preset.label}</option>)}
              </select>
            </ToolbarField>
          </>
        ) : null}
        {editorMode === "design" && selection && selectedObjectLocked ? <Badge className="border border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300">Locked · inspect only</Badge> : null}
        <fieldset disabled={editorMode === "design" && selectedObjectLocked} className="contents">
        {editorMode === "design" && selectedArtwork ? (
          <>
            <ToolbarNumber label="X" value={selectedArtwork.x} suffix="cm" onChange={(x) => patchArtwork(selectedArtwork.id, { x })} />
            <ToolbarNumber label="Y" value={selectedArtwork.y} suffix="cm" onChange={(y) => patchArtwork(selectedArtwork.id, { y })} />
            <ToolbarNumber label="W" value={selectedArtwork.width} suffix="cm" onChange={(width) => patchArtwork(selectedArtwork.id, { width })} />
            <ToolbarNumber label="H" value={selectedArtwork.height} suffix="cm" onChange={(height) => patchArtwork(selectedArtwork.id, { height })} />
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
            <ToolbarNumber label="X" value={selectedText.x} suffix="cm" onChange={(x) => patchText(selectedText.id, { x })} />
            <ToolbarNumber label="Y" value={selectedText.y} suffix="cm" onChange={(y) => patchText(selectedText.id, { y })} />
            <Badge>{designerFontResource(selectedText.fontId)?.hash.slice(0, 15) ?? "Unresolved font"}</Badge>
            <Button type="button" variant="outline" density="compact" onClick={() => void convertTextToPaths(selectedText.id)}>Convert to paths</Button>
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
            {typeof selectedBuildAreaPointIndex === "number" && selectedBuildArea.points?.[selectedBuildAreaPointIndex] ? (
              <>
                <Badge>Point {selectedBuildAreaPointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedBuildArea.points[selectedBuildAreaPointIndex].nodeType ?? (selectedBuildArea.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setBuildAreaNodeType(selectedBuildArea.id, selectedBuildAreaPointIndex, nodeType)} />
                </ToolbarField>
                <ToolbarNumber label="PX" value={selectedBuildArea.points[selectedBuildAreaPointIndex].x} suffix="cm" onChange={(x) => updateBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedBuildArea.points[selectedBuildAreaPointIndex].y} suffix="cm" onChange={(y) => updateBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex, { y })} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedBuildArea.points?.length ?? 0) <= 3} onClick={() => deleteBuildAreaPoint(selectedBuildArea.id, selectedBuildAreaPointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : (
              <>
                <ToolbarNumber label="X" value={selectedBuildArea.x} suffix="cm" onChange={(x) => patchBuildArea(selectedBuildArea.id, { x })} />
                <ToolbarNumber label="Y" value={selectedBuildArea.y} suffix="cm" onChange={(y) => patchBuildArea(selectedBuildArea.id, { y })} />
                <ToolbarNumber label="W" value={selectedBuildArea.width} suffix="cm" onChange={(width) => patchBuildArea(selectedBuildArea.id, { width })} />
                <ToolbarNumber label="H" value={selectedBuildArea.height} suffix="cm" onChange={(height) => patchBuildArea(selectedBuildArea.id, { height })} />
              </>
            )}
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
            <Badge>Face Graphic</Badge>
            {!selectedFaceGraphic.locked ? <Button type="button" variant="outline" density="compact" onClick={() => patchFaceGraphic(selectedFaceGraphic.id, { locked: true })}><Lock className="h-4 w-4" /> Lock</Button> : null}
            <ToolbarField label="Pass">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFaceGraphic.passMode} onChange={(event) => patchFaceGraphic(selectedFaceGraphic.id, { passMode: event.target.value as DesignerFaceGraphicForm["passMode"] })}>
                <option value="translucent">Translucent</option>
                <option value="clear">Clear</option>
                <option value="opaque">Opaque</option>
              </select>
            </ToolbarField>
            {selectedFaceGraphic.passMode === "translucent" ? <ToolbarField label="Filter color"><input type="color" className="h-8 w-12 rounded border border-input bg-card p-1" value={selectedFaceGraphic.filterColor} onChange={(event) => patchFaceGraphic(selectedFaceGraphic.id, { filterColor: event.target.value.toUpperCase() })} /></ToolbarField> : null}
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedFaceGraphic.shape} onChange={(event) => patchFaceGraphic(selectedFaceGraphic.id, { shape: event.target.value as DesignerFaceGraphicForm["shape"] })}>
                <option value="rect">Rectangle</option><option value="ellipse">Ellipse</option><option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedFaceGraphicPointIndex === "number" && selectedFaceGraphic.points?.[selectedFaceGraphicPointIndex] ? (
              <>
                <Badge>Point {selectedFaceGraphicPointIndex + 1}</Badge>
                <ToolbarField label="Node"><NodeTypePicker value={selectedFaceGraphic.points[selectedFaceGraphicPointIndex].nodeType ?? (selectedFaceGraphic.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setFaceGraphicNodeType(selectedFaceGraphic.id, selectedFaceGraphicPointIndex, nodeType)} /></ToolbarField>
                <ToolbarNumber label="PX" value={selectedFaceGraphic.points[selectedFaceGraphicPointIndex].x} suffix="cm" onChange={(x) => updateFaceGraphicPoint(selectedFaceGraphic.id, selectedFaceGraphicPointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedFaceGraphic.points[selectedFaceGraphicPointIndex].y} suffix="cm" onChange={(y) => updateFaceGraphicPoint(selectedFaceGraphic.id, selectedFaceGraphicPointIndex, { y })} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedFaceGraphic.points?.length ?? 0) <= 3} onClick={() => deleteFaceGraphicPoint(selectedFaceGraphic.id, selectedFaceGraphicPointIndex)}><Trash2 className="h-4 w-4" /> Point</Button>
              </>
            ) : <>
              <ToolbarNumber label="X" value={selectedFaceGraphic.x} suffix="cm" onChange={(x) => patchFaceGraphic(selectedFaceGraphic.id, { x })} />
              <ToolbarNumber label="Y" value={selectedFaceGraphic.y} suffix="cm" onChange={(y) => patchFaceGraphic(selectedFaceGraphic.id, { y })} />
              <ToolbarNumber label="W" value={selectedFaceGraphic.width} suffix="cm" onChange={(width) => patchFaceGraphic(selectedFaceGraphic.id, { width })} />
              <ToolbarNumber label="H" value={selectedFaceGraphic.height} suffix="cm" onChange={(height) => patchFaceGraphic(selectedFaceGraphic.id, { height })} />
            </>}
          </>
        ) : editorMode === "design" && selectedZone ? (
          <>
            <ToolbarField label="Shape">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedZone.shape} onChange={(event) => patchZone(selectedZone.id, { shape: event.target.value as DesignerZoneForm["shape"] })}>
                <option value="rect">Rectangle</option>
                <option value="ellipse">Ellipse</option>
                <option value="polygon">Polygon</option>
              </select>
            </ToolbarField>
            {typeof selectedZonePointIndex === "number" && selectedZone.points?.[selectedZonePointIndex] ? (
              <>
                <Badge>Point {selectedZonePointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedZone.points[selectedZonePointIndex].nodeType ?? (selectedZone.pathMode === "bezier" ? "smooth" : "corner")} onChange={(nodeType) => setZoneNodeType(selectedZone.id, selectedZonePointIndex, nodeType)} />
                </ToolbarField>
                <ToolbarNumber label="PX" value={selectedZone.points[selectedZonePointIndex].x} suffix="cm" onChange={(x) => updateZonePoint(selectedZone.id, selectedZonePointIndex, { x })} />
                <ToolbarNumber label="PY" value={selectedZone.points[selectedZonePointIndex].y} suffix="cm" onChange={(y) => updateZonePoint(selectedZone.id, selectedZonePointIndex, { y })} />
                <Button type="button" variant="outline" density="compact" disabled={(selectedZone.points?.length ?? 0) <= 3} onClick={() => deleteZonePoint(selectedZone.id, selectedZonePointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : (
              <>
                <ToolbarNumber label="X" value={selectedZone.x} onChange={(x) => patchZone(selectedZone.id, { x })} />
                <ToolbarNumber label="Y" value={selectedZone.y} onChange={(y) => patchZone(selectedZone.id, { y })} />
                <ToolbarNumber label="W" value={selectedZone.width} onChange={(width) => patchZone(selectedZone.id, { width })} />
                <ToolbarNumber label="H" value={selectedZone.height} onChange={(height) => patchZone(selectedZone.id, { height })} />
              </>
            )}
          </>
        ) : editorMode === "design" && selectedChannel ? (
          <>
            <ToolbarField label="Router bit Ø">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedChannelRouterPreset ? String(selectedChannelRouterPreset.diameterMm) : "current"} onChange={(event) => {
                if (event.target.value !== "current") patchChannel(selectedChannel.id, { widthMm: channelWidthForRouterDiameter(Number(event.target.value)) });
              }}>
                {!selectedChannelRouterPreset ? <option value="current">Current · {selectedChannel.widthMm} mm · {(selectedChannel.widthMm / 25.4).toFixed(3)} in</option> : null}
                {CHANNEL_ROUTER_BIT_PRESETS.map((preset) => <option key={preset.diameterMm} value={preset.diameterMm}>Ø {preset.label}</option>)}
              </select>
            </ToolbarField>
            <ToolbarField label="Path">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedChannel.closed ? "closed" : "open"} onChange={(event) => patchChannel(selectedChannel.id, { closed: event.target.value === "closed" })}>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
              </select>
            </ToolbarField>
            <ToolbarField label="Ends">
              <select disabled={selectedChannel.closed} className="h-8 rounded-md border border-input bg-card px-2 text-body-sm disabled:cursor-not-allowed disabled:opacity-50" value={selectedChannel.cap} onChange={(event) => patchChannel(selectedChannel.id, { cap: event.target.value as DesignerChannelForm["cap"] })}>
                <option value="butt">Straight</option>
                <option value="round">Round</option>
              </select>
            </ToolbarField>
            {typeof selectedChannelPointIndex === "number" && selectedChannelPoint ? (
              <>
                <Badge>Point {selectedChannelPointIndex + 1}</Badge>
                <ToolbarField label="Node">
                  <NodeTypePicker value={selectedChannelNodeType} onChange={(nodeType) => setChannelNodeType(selectedChannel.id, selectedChannelPointIndex, nodeType)} />
                </ToolbarField>
                {selectedChannelPointCanFillet ? <ToolbarNumber label="Fillet" value={selectedChannelPoint.radiusMm ?? 0} suffix="mm" onChange={(radiusMm) => setChannelNodeRadius(selectedChannel.id, selectedChannelPointIndex, radiusMm)} /> : null}
                <Button type="button" variant="outline" density="compact" disabled={(selectedChannel.points?.length ?? 0) <= 2} onClick={() => deleteChannelPoint(selectedChannel.id, selectedChannelPointIndex)}>
                  <Trash2 className="h-4 w-4" />
                  Point
                </Button>
              </>
            ) : null}
          </>
        ) : editorMode === "design" && selectedController ? (
          <>
            <ToolbarNumber label="X" value={selectedController.x} onChange={(x) => patchController({ x })} />
            <ToolbarNumber label="Y" value={selectedController.y} onChange={(y) => patchController({ y })} />
            <ToolbarNumber label="Ports" value={selectedController.dataOutputs} onChange={(dataOutputs) => patchController({ dataOutputs: Math.max(1, Math.round(dataOutputs)) })} />
          </>
        ) : editorMode === "design" && selectedRoute ? (
          <>
            <ToolbarField label="Type">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={selectedRoute.kind} onChange={(event) => patchRoute(selectedRoute.id, { kind: event.target.value as DesignerRouteKind })}>
                <option value="led_string">LED string</option>
                <option value="data_cable">Data cable</option>
              </select>
            </ToolbarField>
          </>
        ) : null}
        </fieldset>
        {editorMode === "design" && selectedCompoundContours?.length ? <Badge>Compound · {selectedCompoundContours.length} contours · even-odd</Badge> : null}
        {editorMode === "design" && geometrySelections.length >= 2 ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            <Badge>{geometrySelections.length} profiles</Badge>
            <Button type="button" variant="outline" density="compact" title="Merge all selected profiles" onClick={() => applyBooleanOperation("union")}>Union</Button>
            <Button type="button" variant="outline" density="compact" title="Subtract later selections from the first selected profile" onClick={() => applyBooleanOperation("subtract")}>Subtract</Button>
            <Button type="button" variant="outline" density="compact" title="Keep only overlapping material" onClick={() => applyBooleanOperation("intersect")}>Intersect</Button>
            <Button type="button" variant="outline" density="compact" title="Keep areas belonging to exactly one profile; nested profiles produce the same hole as Subtract" onClick={() => applyBooleanOperation("exclude")}>Exclude</Button>
          </>
        ) : null}
        {editorMode === "design" && selectedGeometryId ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            <Button type="button" variant="outline" density="compact" title="Create a live offset derived from this profile" onClick={() => createDerivedGeometry("offset")}>Offset Path</Button>
            <Button type="button" variant="outline" density="compact" title="Create a live fillet profile, then adjust its radius" onClick={() => createDerivedGeometry("fillet")}>Fillet</Button>
          </>
        ) : null}
        {editorMode === "design" && selectedDerivedGeometry ? (
          <>
            <Badge className={selectedDerivedGeometryResolution?.issue ? "border border-amber-500/50 bg-amber-500/10 text-amber-700" : "border border-emerald-500/50 bg-emerald-500/10 text-emerald-700"}>
              {selectedDerivedGeometryResolution?.issue === "cycle" ? "Cycle" : selectedDerivedGeometryResolution?.issue === "broken" ? "Broken source" : selectedDerivedGeometryResolution?.issue === "collapsed" ? "Collapsed" : selectedDerivedGeometryResolution?.issue === "invalid-topology" ? "Invalid topology" : "Live derived profile"}
            </Badge>
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
                {selectedDerivedGeometry.join === "miter" ? <ToolbarNumber label="Miter limit" value={selectedDerivedGeometry.miterLimit ?? 4} onChange={(miterLimit) => patchDerivedGeometry(selectedDerivedGeometry.id, { miterLimit: Math.max(1, miterLimit) })} /> : null}
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
            {selectedDerivedGeometryResolution?.warnings.map((warning) => <span key={warning} title={warning}><Badge className="border border-amber-500/50 bg-amber-500/10 text-amber-700">{warning}</Badge></span>)}
            <Button type="button" variant="outline" density="compact" disabled={!selectedDerivedGeometryResolution?.geometry} onClick={() => breakDerivedGeometryLink(selectedDerivedGeometry.id)}>Break Link</Button>
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
            <Button type="button" variant="outline" density="compact" disabled={!selectedProjectionResolution?.geometry} onClick={() => breakProjectionLink(selectedProjection.id)}>Break Link</Button>
          </>
        ) : editorMode === "design" && selectedGeometryId ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            <ToolbarField label="Project to">
              <select className="h-8 rounded-md border border-input bg-card px-2 text-body-sm" value={projectionTargetLayer} onChange={(event) => setProjectionTargetLayer(event.target.value as DesignerProjectionLayer)}>
                <option value="faceGraphic">Face Graphic</option><option value="zones">Diffusors</option><option value="reference">Reference</option>
              </select>
            </ToolbarField>
            <Button type="button" variant="outline" density="compact" onClick={projectSelectedGeometry}><Spline className="h-4 w-4" /> Project Geometry</Button>
          </>
        ) : null}
        {editorMode === "design" && (canCopySelection || clipboard || canDeleteSelection) ? (
          <>
            <div className="h-6 w-px shrink-0 bg-border" />
            {canCopySelection ? (
              <Button type="button" variant="outline" density="compact" title="Copy selected object (Ctrl/Cmd+C)" className="px-2" onClick={copySelection}>
                <Copy className="h-3.5 w-3.5" /> Copy
              </Button>
            ) : null}
            {clipboard ? (
              <Button type="button" variant="outline" density="compact" title="Paste copied object (Ctrl/Cmd+V)" className="px-2" onClick={pasteSelection}>
                Paste
              </Button>
            ) : null}
            {canDeleteSelection ? (
              <Button type="button" variant="outline" density="compact" title="Delete selected object" className="px-2 text-destructive hover:text-destructive" onClick={deleteSelection}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </Button>
            ) : null}
          </>
        ) : null}
          </div>
        </div>
      </div> : null}
      <div className={`grid min-h-0 flex-1 ${editorMode === "animate" ? "grid-cols-[minmax(0,1fr)_380px]" : layersPanelOpen ? "grid-cols-[56px_minmax(0,1fr)_320px]" : "grid-cols-[56px_minmax(0,1fr)]"}`}>
        {editorMode === "design" ? <aside className="flex min-h-0 flex-col border-r border-border-2 bg-card py-2">
          <div className="flex shrink-0 flex-col items-center gap-2 px-2">
          <ToolButton active={tool === "select"} label="Select" icon={MousePointer2} onClick={() => setTool("select")} />
            <ToolButton active={tool === "pan"} label="Pan" icon={Hand} onClick={() => setTool("pan")} />
          <ToolButton active={tool === "measure"} label="Measure distance" icon={MeasuringTapeIcon} onClick={() => setTool("measure")} />
          </div>
          <div className="mx-3 my-2 h-px shrink-0 bg-border" />
          {editorMode === "design" ? <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2">
          {activeLayer === "artwork" ? (
            <>
              <ToolButton
                active={tool === "image_place"}
                label="Image (place a container, then pick its image in the panel)"
                icon={ImageIcon}
                disabled={designer.layers.artwork.locked}
                onClick={() => {
                  ensureLayerVisible("artwork");
                  setTool("image_place");
                }}
              />
            </>
          ) : null}
          {activeLayer === "artwork" || activeLayer === "reference" ? (
            <>
              <ToolButton active={tool === "build_area_rect"} label="Rectangle Build Area (drag on canvas)" icon={Square} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_rect"); }} />
              <ToolButton active={tool === "build_area_ellipse"} label="Ellipse Build Area (drag on canvas)" icon={Circle} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_ellipse"); }} />
              <ToolButton active={tool === "build_area_polygon"} label="Polygon Build Area" icon={PenLine} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_polygon"); }} />
              <ToolButton active={tool === "build_area_bezier"} label="Bezier Build Area" icon={Spline} disabled={designer.layers.artwork.locked} onClick={() => { ensureLayerVisible("artwork"); setTool("build_area_bezier"); }} />
            </>
          ) : null}
          {activeLayer === "zones" ? (
            <>
              <ToolButton active={tool === "zone_rect"} label="Rectangle Zone (drag on canvas)" icon={Square} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_rect")} />
              <ToolButton active={tool === "zone_ellipse"} label="Ellipse Zone (drag on canvas)" icon={Circle} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_ellipse")} />
              <ToolButton active={tool === "zone_polygon"} label="Polygon Zone" icon={PenLine} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_polygon")} />
              <ToolButton active={tool === "zone_bezier"} label="Bezier Zone" icon={Spline} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("zone_bezier")} />
              <ToolButton active={tool === "channel_bezier"} label="Channel (neon flex trace)" icon={Waves} disabled={designer.layers.zones.locked || !designer.layers.zones.visible} onClick={() => setTool("channel_bezier")} />
            </>
          ) : null}
          {activeLayer === "faceGraphic" ? (
            <>
              <ToolButton active={tool === "face_graphic_rect"} label="Rectangle Face Graphic (drag on canvas)" icon={Square} disabled={designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible} onClick={() => setTool("face_graphic_rect")} />
              <ToolButton active={tool === "face_graphic_ellipse"} label="Ellipse Face Graphic (drag on canvas)" icon={Circle} disabled={designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible} onClick={() => setTool("face_graphic_ellipse")} />
              <ToolButton active={tool === "face_graphic_polygon"} label="Polygon Face Graphic" icon={PenLine} disabled={designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible} onClick={() => setTool("face_graphic_polygon")} />
              <ToolButton active={tool === "face_graphic_bezier"} label="Bezier Face Graphic" icon={Spline} disabled={designer.layers.faceGraphic.locked || !designer.layers.faceGraphic.visible} onClick={() => setTool("face_graphic_bezier")} />
            </>
          ) : null}
          {activeLayer === "strings" ? (
            <>
              <ToolButton active={tool === "led_string"} label="LED string" icon={Route} tone="amber" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("led_string")} />
              <ToolButton active={tool === "data_cable"} label="Data cable" icon={Cable} tone="green" disabled={designer.layers.strings.locked || !designer.layers.strings.visible} onClick={() => setTool("data_cable")} />
              <ToolButton
                active={tool === "cut"}
                label={typeof selectedRoutePointIndex === "number" && selectedRoute?.points[selectedRoutePointIndex]?.joint ? "Detach solder joint" : "Cut route"}
                icon={Scissors}
                disabled={designer.layers.strings.locked || !designer.layers.strings.visible}
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
            designer={designer}
            snapToGrid={snapToGrid}
            activeLayer={activeLayer}
            tool={tool}
            onToolChange={setTool}
            channelRouterDiameterMm={designer.channelRouterDiameterMm}
            viewport={activeViewport}
            artworkUrls={artworkUrls}
            selectedArtworkId={selectedArtwork?.id}
            selectedBuildAreaId={selectedBuildArea?.id}
            selectedBuildAreaPointIndex={selectedBuildAreaPointIndex}
            selectedZoneId={selectedZone?.id}
            selectedZonePointIndex={selectedZonePointIndex}
            selectedFaceGraphicId={selectedFaceGraphic?.id}
            selectedFaceGraphicPointIndex={selectedFaceGraphicPointIndex}
            selectedProjectionId={selectedProjection?.id}
            selectedDerivedGeometryId={selectedDerivedGeometry?.id}
            selectedTextId={selectedText?.id}
            selectedChannelId={selectedChannel?.id}
            selectedChannelPointIndex={selectedChannelPointIndex}
            selectedRouteId={selectedRoute?.id}
            selectedRoutePointIndex={selectedRoutePointIndex}
            selectedController={Boolean(selectedController)}
            selectedGeometryKeys={selectedGeometryKeys}
            onViewportChange={setViewport}
            onChange={updateDesigner}
            onSelect={selectDesignerItem}
            onInsertBuildAreaPoint={insertBuildAreaPoint}
            onInsertZonePoint={insertZonePoint}
            onInsertFaceGraphicPoint={insertFaceGraphicPoint}
            onInsertChannelPoint={insertChannelPoint}
            onInsertRoutePoint={insertRoutePoint}
            onPlaceImage={placeImageAt}
            onCreateText={createTextAt}
            onCutRoutePoint={handleCutRoutePoint}
            onRoutePointDragEnd={autoSolderRoutePoint}
            onSolderedTerminalsDragEnd={moveSolderedTerminals}
          /> : document.compiledLayout && animationResult?.ok && animationResult.partitura ? <PlayerSurface
            ref={playerSurfaceRef}
            partitura={animationResult.partitura}
            designer={designer}
            layout={document.compiledLayout}
            viewport={animationViewerOpen ? animationViewerViewport ?? activeViewport : activeViewport}
            activeSceneId={document.activeSceneId}
            playing={animationPlaying}
            presentation={animationDiffuser}
            settings={diffuserSettings}
            selection={selection}
            onViewportChange={animationViewerOpen ? setAnimationViewerViewport : setViewport}
            onSelect={selectDesignerItem}
            onStatus={setPlayerStatus}
          /> : <div className="grid h-full place-items-center p-8 text-center text-body-sm text-muted-foreground">
            {animationGenerating ? "Preparing the partitura runtime…" : "Compile and generate the partitura to start the player."}
          </div>}
          </div>
        </main>
        {editorMode === "animate" ? (
          <aside className="flex min-h-0 flex-col border-l border-border-2 bg-surface">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b bg-surface-2 px-4 py-3">
              <div>
                <div className="text-sm font-medium">{selectedOpticalTargets.length > 1 ? `Calibration · ${selectedOpticalTargets.length} targets` : selectedOpticalTarget ? `Calibration · ${selectedZone?.name ?? selectedChannel?.name}` : "Lighting calibration"}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{selectedOpticalTarget ? (selectedOpticalTargets.length > 1 ? "Shared calibration · mixed values remain unchanged" : "Tune existing sources · construction stays in Design") : "Select a zone or channel"}</div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedOpticalTargets.length > 1 ? <MultiLightingMountsEditor
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
            selection={selection}
            routeSummaries={routeSummaries}
            routeOutputs={routeOutputs}
            onActivateLayer={activateDesignerLayer}
            onPatchLayer={patchDesignerLayer}
            onPatchLayers={patchDesignerLayers}
            assets={projectAssets}
            onUploadArtwork={uploadArtwork}
            onPatchArtwork={patchArtwork}
            onPatchBuildArea={patchBuildAreaVisual}
            onPatchZone={patchZoneVisual}
            onPatchFaceGraphic={patchFaceGraphic}
            onPatchProjection={patchProjection}
            onPatchDerivedGeometry={patchDerivedGeometry}
            onPatchText={patchText}
            onAddGroup={addGroup}
            onPatchGroup={patchGroup}
            onRemoveGroup={removeGroup}
            onToggleGroupMember={toggleGroupMember}
            onSelectZone={selectGroupZone}
            onOpenLighting={openLightingSetup}
            onPatchChannel={patchChannel}
            onPatchController={patchController}
            onPatchRoute={patchRoute}
            onReorderItems={reorderDesignerItems}
            onSelect={selectDesignerItem}
            onClose={() => setLayersPanelOpen(false)}
          />
        ) : null}
      </div>
      {editorMode === "animate" ? (
        <>
          <div className="h-1.5 shrink-0 cursor-row-resize border-t border-border bg-surface-2 hover:bg-blue-200" title="Drag to resize · double-click to collapse or expand" onPointerDown={beginAnimationTimelineResize} onDoubleClick={() => setAnimationTimelineCollapsed((current) => !current)} />
          <DesignerAnimateTimeline
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
            onClipTargetSelect={(targetId) => {
              selectDesignerItem(targetId ? designerSelectionForClipTarget(designer, targetId) : null);
            }}
            onTogglePlayback={() => {
              if (!animationResult?.ok) void previewAnimation();
              else setAnimationPlaying((current) => !current);
            }}
          />
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
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              ["includeReference", "Reference / substrate", "Build areas and resolved derived profiles"],
              ["includeZones", "Diffusors", "Zones, channels, text and derived profiles"],
              ["includeFaceGraphic", "Face Graphic", "Masks grouped by pass mode and filter color"]
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
          {fabricationExportResult ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge>{fabricationExportResult.pathCount} paths</Badge>
                <Badge>{fabricationExportResult.layerCount} output layers</Badge>
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
        description="Electrical errors block Animate. Warnings are informational and do not block playback."
        onClose={() => setCompileIssuesOpen(false)}
      >
        <div className="space-y-4">
          {compileErrors.length ? (
            <Alert title="Errors" variant="error">
              <ul className="list-disc space-y-1 pl-5">
                {compileErrors.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
          {compileWarnings.length ? (
            <Alert title="Warnings" variant="warning">
              <ul className="list-disc space-y-1 pl-5">
                {compileWarnings.map((issue) => (
                  <li key={issue}>{issue}</li>
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

export function PartituraWorkspace({ initialPartitura }: { initialPartitura: PersistedPartitura }) {
  const searchParams = useSearchParams();
  const [partitura, setPartitura] = useState(initialPartitura);
  const [document, setDocument] = useState<PartituraDocument>(() => normalizeDefaultSignLayout(initialPartitura.document));
  const [effectCatalog, setEffectCatalog] = useState<EffectCatalog>({});
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") === "scenes" ? "scenes" : "overview");
  const [result, setResult] = useState<ApiResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [playerOpen, setPlayerOpen] = useState(false);

  const activeScene = useMemo(
    () => document.scenes.find((scene) => scene.id === document.activeSceneId) ?? document.scenes[0],
    [document.activeSceneId, document.scenes]
  );
  const clipCount = document.scenes.reduce((total, scene) => total + scene.clips.length, 0);
  const ledCount = document.compiledLayout?.pixelMap.length ?? 0;

  useEffect(() => {
    let cancelled = false;

    async function loadEffects() {
      const response = await fetch("/api/lighting/effects", { cache: "no-store" });
      const payload = (await response.json()) as { effects?: EffectCatalog };
      if (!cancelled) setEffectCatalog(payload.effects ?? {});
    }

    void loadEffects();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(nextDocument = document, patch: Partial<PersistedPartitura> = {}) {
    const normalizedDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(nextDocument));
    setSaving(true);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partitura.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: patch.name ?? partitura.name,
          status: patch.status ?? partitura.status,
          document: normalizedDocument,
          generatedPartitura: patch.generatedPartitura ?? partitura.generatedPartitura ?? null,
          validationReport: patch.validationReport ?? partitura.validationReport ?? {}
        })
      });
      const payload = (await response.json()) as { partitura?: PersistedPartitura };
      if (payload.partitura) {
        setPartitura(payload.partitura);
        setDocument(clonePartituraDocument(payload.partitura.document));
      }
    } finally {
      setSaving(false);
    }
  }

  async function generate(openPlayer = false) {
    const normalizedDocument = buildDocumentFromDesigner(normalizeDefaultSignLayout(document));
    setDocument(normalizedDocument);
    setGenerating(true);
    try {
      const response = await fetch("/api/lighting/partituras/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(normalizedDocument)
      });
      const payload = (await response.json()) as ApiResult;
      setResult(payload);
      if (payload.ok) {
        await save(normalizedDocument, {
          status: "validated",
          generatedPartitura: payload.partitura,
          validationReport: payload.validation
        });
      }
      if (openPlayer) setPlayerOpen(true);
    } finally {
      setGenerating(false);
    }
  }

  function patchDocument(patch: Partial<PartituraDocument>) {
    setDocument((current) => ({ ...current, ...patch }));
  }

  function openPlayerForScene(sceneId?: string) {
    if (sceneId) {
      setDocument((current) => ({ ...current, activeSceneId: sceneId, previewTimeMs: 0 }));
    }
    setPlayerOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge>{partitura.clientName}</Badge>
            <Badge>{partitura.status}</Badge>
            <Badge>partitura.v2</Badge>
          </div>
          <h1 className="text-page-title font-light">{partitura.name}</h1>
          <p className="mt-2 max-w-3xl text-page-subtitle text-muted-foreground">
            Partitura workspace for scenes and firmware-facing simulator validation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" type="button">
            <Link href="/partituras/generator">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>
          <Button variant="outline" type="button" onClick={() => setPlayerOpen(true)}>
            <Play className="h-4 w-4" />
            Player
          </Button>
          <Button type="button" onClick={() => save()} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Saving" : "Save"}
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-border-2 bg-card px-4 py-3">
        <Tabs items={tabs} value={activeTab} onValueChange={setActiveTab} className="max-w-full overflow-x-auto" />
      </div>

      {activeTab === "overview" ? (
        <OverviewTab
          partitura={partitura}
          document={document}
          ledCount={ledCount}
          clipCount={clipCount}
          onNameChange={(name) => setPartitura((current) => ({ ...current, name }))}
        />
      ) : activeTab === "scenes" ? (
        <ScenesTab effectCatalog={effectCatalog} document={document} activeScene={activeScene} onChange={setDocument} onOpenPlayer={openPlayerForScene} />
      ) : (
        <SimulatorTab
          result={result}
          generating={generating}
          onGenerate={() => generate(false)}
          onOpenPlayer={() => generate(true)}
        />
      )}

      <PlayerModal
        open={playerOpen}
        onClose={() => setPlayerOpen(false)}
        document={document}
        result={result}
        generating={generating}
        onGenerate={() => generate(false)}
      />
    </div>
  );
}

function OverviewTab({
  partitura,
  document,
  ledCount,
  clipCount,
  onNameChange
}: {
  partitura: PersistedPartitura;
  document: PartituraDocument;
  ledCount: number;
  clipCount: number;
  onNameChange: (name: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Scenes" value={document.scenes.length} />
        <Metric label="Clips" value={clipCount} />
        <Metric label="Mapped pixels" value={document.compiledLayout?.pixelMap.length ?? 0} />
        <Metric label="LEDs" value={ledCount} />
      </div>
      <Card>
        <CardHeader>
          <div className="text-card-title font-medium">Partitura Summary</div>
          <div className="mt-1 text-body-sm text-muted-foreground">Editable identity and current persisted state.</div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={partitura.name} onChange={(event) => onNameChange(event.target.value)} />
          </Field>
          <Field label="Project document ID">
            <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={document.projectId} readOnly />
          </Field>
          <ReadOnly label="Partitura key" value={partitura.partituraKey} />
          <ReadOnly label="Updated" value={new Date(partitura.updatedAt).toLocaleString()} />
        </CardContent>
      </Card>
    </div>
  );
}

function ScenesTab({
  effectCatalog,
  document,
  activeScene,
  onChange,
  onOpenPlayer
}: {
  effectCatalog: EffectCatalog;
  document: PartituraDocument;
  activeScene?: SceneForm;
  onChange: (document: PartituraDocument) => void;
  onOpenPlayer: (sceneId?: string) => void;
}) {
  const sceneTargets = buildSceneTargets(document);
  const targetOptions = sceneTargets.map((target) => [target.id, `${target.name} · ${target.detail}`] as const);
  const targetSummaries = Object.fromEntries(sceneTargets.map((target) => [target.id, target]));
  const activeSceneIndex = Math.max(0, document.scenes.findIndex((scene) => scene.id === document.activeSceneId));
  const [selectedClipIndex, setSelectedClipIndex] = useState(0);
  const sortedClips = (activeScene?.clips ?? [])
    .map((clip, index) => ({ clip, index }))
    .sort((left, right) => left.clip.layer - right.clip.layer || left.clip.startMs - right.clip.startMs);
  const selectedClip = activeScene?.clips[selectedClipIndex] ?? activeScene?.clips[0];
  const selectedClipActualIndex = activeScene?.clips[selectedClipIndex] ? selectedClipIndex : 0;

  function updateScene(index: number, patch: Partial<SceneForm>) {
    const previousId = document.scenes[index]?.id;
    const scenes = document.scenes.map((scene, sceneIndex) => (sceneIndex === index ? { ...scene, ...patch } : scene));
    const activeSceneId = previousId && document.activeSceneId === previousId && patch.id ? patch.id : document.activeSceneId;
    onChange({ ...document, scenes, activeSceneId });
  }

  function addScene() {
    const nextIndex = document.scenes.length + 1;
    const scene = { id: `scene_${nextIndex}`, name: `Scene ${nextIndex}`, loop: true, durationMs: 4000, clips: [] };
    onChange({ ...document, scenes: [...document.scenes, scene], activeSceneId: scene.id });
  }

  function removeScene(index: number) {
    if (document.scenes.length <= 1) return;
    const removed = document.scenes[index];
    const scenes = document.scenes.filter((_, sceneIndex) => sceneIndex !== index);
    onChange({ ...document, scenes, activeSceneId: removed?.id === document.activeSceneId ? scenes[0]?.id ?? "normal" : document.activeSceneId });
  }

  function updateClip(index: number, patch: Partial<ClipForm>) {
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.id === document.activeSceneId
          ? { ...scene, clips: scene.clips.map((clip, clipIndex) => (clipIndex === index ? { ...clip, ...patch } : clip)) }
          : scene
      )
    });
  }

  function addClip() {
    const clips = activeScene?.clips ?? [];
    const layer = activeScene ? nextEmptyClipLayer(activeScene) : 0;
    const identity = createClipIdentity(clips);
    const clip: ClipForm = {
      id: identity.id,
      name: identity.name,
      enabled: true,
      target: sceneTargets[0]?.id ?? "full_sign",
      coordinateSpace: "local",
      effect: "solid",
      blend: "max",
      startMs: 0,
      durationMs: activeScene?.durationMs ?? 4000,
      layer,
      params: defaultParamsForEffect(effectCatalog, "solid", document.accentColor)
    };
    onChange({
      ...document,
      scenes: document.scenes.map((scene) => (scene.id === document.activeSceneId ? { ...scene, laneCount: Math.max(scene.laneCount ?? 1, layer + 1), clips: [...scene.clips, clip] } : scene))
    });
    setSelectedClipIndex(clips.length);
  }

  function removeClip(index: number) {
    onChange({
      ...document,
      scenes: document.scenes.map((scene) =>
        scene.id === document.activeSceneId ? { ...scene, clips: scene.clips.filter((_, clipIndex) => clipIndex !== index) } : scene
      )
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-card-title font-medium">Scenes</div>
                <div className="mt-1 text-body-sm text-muted-foreground">{document.scenes.length} timeline{document.scenes.length === 1 ? "" : "s"}</div>
              </div>
              <Button type="button" onClick={addScene}>
                <Plus className="h-4 w-4" />
                New
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {document.scenes.map((scene, index) => (
              <button
                key={`${scene.id}:${index}`}
                type="button"
                className={`w-full rounded-md border p-3 text-left transition hover:bg-surface-hover ${scene.id === document.activeSceneId ? "border-ring bg-surface-2" : "border-border-2 bg-card"}`}
                onClick={() => onChange({ ...document, activeSceneId: scene.id })}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-body-sm font-medium">{scene.name}</span>
                  <Badge>{scene.loop ? "Loop" : "Once"}</Badge>
                </div>
                <div className="mt-1 font-mono text-meta text-muted-foreground">{scene.id}</div>
                <div className="mt-2 flex justify-between text-meta text-muted-foreground">
                  <span>{scene.clips.length} clips</span>
                  <span>{scene.durationMs} ms</span>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="text-card-title font-medium">Selected Scene</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{activeScene?.id ?? "-"}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Name">
              <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={activeScene?.name ?? ""} onChange={(event) => updateScene(activeSceneIndex, { name: event.target.value })} />
            </Field>
            <Field label="Scene ID">
              <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={activeScene?.id ?? ""} onChange={(event) => updateScene(activeSceneIndex, { id: event.target.value })} />
            </Field>
            <NumberField label="Duration ms" value={activeScene?.durationMs ?? 0} onChange={(durationMs) => updateScene(activeSceneIndex, { durationMs })} />
            <label className="flex items-center gap-2 text-body-sm">
              <input type="checkbox" checked={activeScene?.loop ?? false} onChange={(event) => updateScene(activeSceneIndex, { loop: event.target.checked })} />
              Loop scene
            </label>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => activeScene ? onOpenPlayer(activeScene.id) : undefined}>
                <Play className="h-4 w-4" />
                Player
              </Button>
              <Button type="button" variant="ghost" className="h-9 w-9 px-0" title="Delete scene" onClick={() => removeScene(activeSceneIndex)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <EditableTable title={`Clips in ${activeScene?.name ?? "scene"}`} description="Layered events rendered by the selected scene." onAdd={addClip}>
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[24%]" />
            <col className="w-[180px]" />
            <col className="w-[120px]" />
            <col className="w-[70px]" />
            <col className="w-[70px]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-border-2 text-left text-grid-header font-semibold text-ink-muted">
              <th className="px-2 py-1.5">Clip</th>
              <th className="px-2 py-1.5">Target</th>
              <th className="px-2 py-1.5">Effect</th>
              <th className="px-2 py-1.5 text-right">Time</th>
              <th className="px-2 py-1.5 text-right">Layer</th>
              <th className="px-2 py-1.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(activeScene?.clips ?? []).map((clip, index) => (
              <tr key={`${clip.id}:${index}`} className={`border-b last:border-0 hover:bg-surface-hover ${index === selectedClipActualIndex ? "bg-surface-2" : ""}`} onClick={() => setSelectedClipIndex(index)}>
                <td className="px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-body-sm font-medium">{clip.name}</div>
                    <div className="truncate font-mono text-[10px] leading-3 text-muted-foreground">{clip.id}</div>
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-body-sm">{targetSummaries[clip.target]?.name ?? clip.target}</div>
                    <div className="truncate text-[10px] leading-3 text-muted-foreground">{targetSummaries[clip.target]?.detail ?? "Unmapped target"}</div>
                  </div>
                </td>
                <td className="px-2 py-1.5"><GridSelect value={clip.effect} options={effectOptions(effectCatalog)} onChange={(effect) => updateClip(index, { effect, params: defaultParamsForEffect(effectCatalog, effect, document.accentColor) })} /></td>
                <td className="px-2 py-1.5 text-right font-mono text-meta">{clip.startMs}-{clip.startMs + clip.durationMs}</td>
                <td className="px-2 py-1.5 text-right font-mono text-meta">{clip.layer}</td>
                <td className="px-2 py-1.5 text-right"><Button variant="ghost" className="h-7 w-7 px-0" type="button" title="Delete" onClick={() => removeClip(index)}><Trash2 className="h-3.5 w-3.5" /></Button></td>
              </tr>
            ))}
          </tbody>
        </EditableTable>

        <Card>
          <CardHeader>
            <div className="text-card-title font-medium">Effect Settings</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{selectedClip ? `${selectedClip.name} · ${effectCatalog[selectedClip.effect]?.label ?? selectedClip.effect}` : "Select a clip"}</div>
          </CardHeader>
          <CardContent className="space-y-5">
            {selectedClip ? (
              <>
                <ClipCommonSettings
                  clip={selectedClip}
                  targetOptions={targetOptions}
                  onChange={(patch) => updateClip(selectedClipActualIndex, patch)}
                />
                <EffectSettings
                  effectCatalog={effectCatalog}
                  clip={selectedClip}
                  accentColor={document.accentColor}
                  onChange={(params) => updateClip(selectedClipActualIndex, { params })}
                />
              </>
            ) : null}
            <div>
              <div className="mb-2 text-label font-medium text-ink-secondary">Scene Map</div>
            <div className="max-h-[620px] space-y-3 overflow-auto pr-1">
              {sortedClips.map(({ clip }) => {
                const target = targetSummaries[clip.target];
                return (
                  <button key={clip.id} type="button" className="w-full rounded-md border border-border-2 bg-card p-3 text-left hover:bg-surface-hover" onClick={() => setSelectedClipIndex(activeScene?.clips.findIndex((entry) => entry.id === clip.id) ?? 0)}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-body-sm font-medium">{clip.name}</div>
                        <div className="font-mono text-meta text-muted-foreground">{clip.id}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>L{clip.layer}</Badge>
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 text-body-sm">
                      <MapRow label="Target" value={target?.name ?? clip.target} />
                      <MapRow label="Map" value={target?.detail ?? "Missing Designer target"} />
                      <MapRow label="Time" value={`${clip.startMs}-${clip.startMs + clip.durationMs} ms`} />
                      <MapRow label="Effect" value={`${clip.effect} · ${clip.blend}`} />
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function buildSceneTargets(document: PartituraDocument) {
  const layout = document.compiledLayout;
  const sourceTargets = document.designer?.lightSources ?? [];
  const zoneTargets = document.designer?.zones ?? [];
  const groupTargets = document.designer?.groups ?? [];
  const channelTargets = document.designer?.channels ?? [];
  const mappedZones = new Map(layout?.zones.map((zone) => [zone.id, zone.pixelIds.length]) ?? []);

  return [
    { id: "full_sign", name: "Full sign", detail: `${layout?.pixelMap.length ?? 0} mapped pixels` },
    ...sourceTargets.map((source) => ({ id: source.id, name: source.name || source.id, detail: `${source.mode === "front" ? "Front" : source.mode === "halo" ? "Halo" : "Wall Wash"} · ${mappedZones.get(source.id) ?? 0} mapped pixels` })),
    ...zoneTargets.map((zone) => ({ id: zone.id, name: zone.name || zone.id, detail: `${mappedZones.get(zone.id) ?? 0} mapped pixels` })),
    ...channelTargets.map((channel) => ({ id: channel.id, name: channel.name || channel.id, detail: `Channel · ${mappedZones.get(channel.id) ?? 0} mapped pixels` })),
    ...groupTargets.map((group) => ({ id: group.id, name: group.name || group.id, detail: `Group · ${group.members.length} member${group.members.length === 1 ? "" : "s"}` }))
  ];
}

function effectOptions(effectCatalog: EffectCatalog) {
  const effects = Object.values(effectCatalog);
  return (effects.length ? effects : [{ id: "solid", label: "Solid" }]).map((effect) => [effect.id, effect.label] as const);
}

function defaultParamsForEffect(effectCatalog: EffectCatalog, effectId: string, accentColor: string): ClipParams {
  const definition = effectCatalog[effectId] ?? effectCatalog.solid;
  if (!definition) return {};
  return Object.fromEntries(
    Object.entries(definition.parameters).map(([key, parameter]) => [
      key,
      parameter.default ?? (parameter.type === "color" ? accentColor : parameter.type === "boolean" ? false : parameter.type === "select" ? parameter.options?.[0]?.value ?? "" : 0)
    ])
  );
}

function ClipCommonSettings({ clip, targetOptions, onChange }: { clip: ClipForm; targetOptions: readonly (readonly [string, string])[]; onChange: (patch: Partial<ClipForm>) => void }) {
  return (
    <div className="grid gap-3 border-b border-border-2 pb-4">
      <Field label="Name">
        <input className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.name} onChange={(event) => onChange({ name: event.target.value })} />
      </Field>
      <Field label="Clip ID">
        <input className="h-control w-full rounded-md border bg-card px-3 font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.id} onChange={(event) => onChange({ id: event.target.value })} />
      </Field>
      <Field label="Target">
        <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.target} onChange={(event) => onChange({ target: event.target.value })}>
          {targetOptions.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Start ms" value={clip.startMs} onChange={(startMs) => onChange({ startMs })} />
        <NumberField label="Duration ms" value={clip.durationMs} onChange={(durationMs) => onChange({ durationMs })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Layer" value={clip.layer} onChange={(layer) => onChange({ layer })} />
        <Field label="Blend">
          <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={clip.blend} onChange={(event) => onChange({ blend: event.target.value })}>
            {["replace", "max", "add", "multiply"].map((blend) => <option key={blend} value={blend}>{blend}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}

function EffectSettings({ effectCatalog, clip, accentColor, onChange }: { effectCatalog: EffectCatalog; clip: ClipForm; accentColor: string; onChange: (params: ClipParams) => void }) {
  const definition = effectCatalog[clip.effect] ?? effectCatalog.solid;
  if (!definition) {
    return <div className="rounded-md border border-dashed bg-surface-2 p-4 text-body-sm text-muted-foreground">Loading effect metadata.</div>;
  }
  const entries = Object.entries(definition.parameters);

  if (entries.length === 0) {
    return <div className="rounded-md border border-dashed bg-surface-2 p-4 text-body-sm text-muted-foreground">This effect has no configurable parameters.</div>;
  }

  function patchParam(key: string, value: ClipParams[string]) {
    onChange({ ...defaultParamsForEffect(effectCatalog, clip.effect, accentColor), ...clip.params, [key]: value });
  }

  return (
    <div className="grid gap-3">
      {entries.map(([key, parameter]) => (
        <EffectParamField key={key} name={key} definition={parameter} value={clip.params[key] ?? defaultParamsForEffect(effectCatalog, clip.effect, accentColor)[key]} onChange={(value) => patchParam(key, value)} />
      ))}
    </div>
  );
}

function EffectParamField({
  name,
  definition,
  value,
  onChange
}: {
  name: string;
  definition: EffectParameterDefinition;
  value: ClipParams[string];
  onChange: (value: ClipParams[string]) => void;
}) {
  const label = definition.label ?? name;
  const numericValue = typeof value === "number" ? value : Number(value ?? definition.default ?? 0);

  if (definition.type === "color") {
    return (
      <Field label={label}>
        <input type="color" className="h-control w-full rounded-md border bg-card p-1" value={typeof value === "string" ? value : String(definition.default ?? "#FFFFFF")} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }

  if (definition.type === "select") {
    return (
      <Field label={label}>
        <select className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={String(value ?? definition.default ?? "")} onChange={(event) => onChange(event.target.value)}>
          {(definition.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </Field>
    );
  }

  if (definition.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {label}
      </label>
    );
  }

  const step = definition.type === "integer" ? 1 : definition.type === "percent" ? 1 : 0.1;
  const displayValue = definition.type === "percent" ? Math.round(numericValue * 100) : numericValue;
  return (
    <Field label={`${label}${definition.unit ? ` (${definition.unit})` : definition.type === "percent" ? " (%)" : ""}`}>
      <input
        type="number"
        min={definition.type === "percent" ? (definition.min ?? 0) * 100 : definition.min}
        max={definition.type === "percent" ? (definition.max ?? 1) * 100 : definition.max}
        step={step}
        className="h-control w-full rounded-md border bg-card px-3 text-right font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring"
        value={displayValue}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(definition.type === "percent" ? next / 100 : definition.type === "integer" ? Math.round(next) : next);
        }}
      />
    </Field>
  );
}

function MapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-2">
      <span className="text-meta font-medium uppercase text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words font-mono text-meta text-foreground">{value}</span>
    </div>
  );
}


function SimulatorTab({
  result,
  generating,
  onGenerate,
  onOpenPlayer
}: {
  result: ApiResult | null;
  generating: boolean;
  onGenerate: () => void;
  onOpenPlayer: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-card-title font-medium">Simulator</div>
            <div className="mt-1 text-body-sm text-muted-foreground">Generate the firmware-facing partitura and open the larger player modal.</div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating" : "Generate"}
            </Button>
            <Button type="button" onClick={onOpenPlayer}>
              <Play className="h-4 w-4" />
              Open Player
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result ? (
          <div className="rounded-md border border-dashed bg-surface-2 p-8 text-center text-body-sm text-muted-foreground">
            Generate the partitura or open the player to render the first frame.
          </div>
        ) : result.ok ? (
          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="Default scene" value={result.partitura?.defaultScene ?? "-"} />
            <Metric label="Pixels" value={result.partitura?.pixelMap.length ?? 0} />
            <Metric label="Outputs" value={result.partitura?.outputs.filter((output) => output.pixelCount > 0).length ?? 0} />
            <Metric label="Contract" value={result.partitura?.schemaVersion ?? "-"} />
            <Metric label="Core" value={result.partitura?.requiredCoreVersion ?? "-"} />
          </div>
        ) : (
          <ValidationErrors result={result} />
        )}
      </CardContent>
    </Card>
  );
}

function PlayerModal({
  open,
  onClose,
  document,
  result,
  generating,
  onGenerate
}: {
  open: boolean;
  onClose: () => void;
  document: PartituraDocument;
  result: ApiResult | null;
  generating: boolean;
  onGenerate: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const playerRef = useRef<PlayerSurfaceHandle | null>(null);
  const designer = document.designer;
  const layout = document.compiledLayout;
  const [viewport, setViewport] = useState<DesignerViewport>(() => designer ? fitViewportToDesigner(designer) : { x: 0, y: 0, width: 1, height: 1 });
  const [status, setStatus] = useState<PlayerStatus | null>(null);

  useEffect(() => {
    if (!open) {
      setPlaying(false);
      return;
    }
    if (designer) setViewport(fitViewportToDesigner(designer));
  }, [designer, open]);

  return (
    <Modal open={open} title="Partitura Player" description="Worker-driven partitura.v2 preview for the active scene." onClose={onClose} className="max-w-[min(1500px,96vw)]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <Badge>Scene: {document.activeSceneId}</Badge>
            <Badge>{status?.pixelCount ?? result?.partitura?.pixelMap.length ?? 0} LEDs</Badge>
            <Badge>{Math.round(status?.timeMs ?? 0)} ms</Badge>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4" />
              {generating ? "Generating" : "Generate"}
            </Button>
            <Button type="button" onClick={() => setPlaying((current) => !current)} disabled={!result?.ok || !result.partitura}>
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {playing ? "Pause" : "Play"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setPlaying(false); playerRef.current?.stop(); }}>
              <RotateCcw className="h-4 w-4" />
              Stop
            </Button>
          </div>
        </div>
        {!result ? (
          <div className="rounded-md border border-dashed bg-surface-2 p-10 text-center text-body-sm text-muted-foreground">
            Generate a partitura to start the simulator.
          </div>
        ) : result.ok && result.partitura && designer && layout ? (
          <div className="h-[min(70vh,760px)] min-h-[420px] overflow-hidden rounded-md border border-border-2 bg-muted">
            <PlayerSurface
              ref={playerRef}
              partitura={result.partitura}
              designer={designer}
              layout={layout}
              viewport={viewport}
              activeSceneId={document.activeSceneId}
              playing={playing}
              presentation="as_built"
              settings={DEFAULT_DIFFUSER_RENDER_SETTINGS}
              onViewportChange={setViewport}
              onSelect={() => undefined}
              onStatus={setStatus}
            />
          </div>
        ) : (
          <ValidationErrors result={result} />
        )}
      </div>
    </Modal>
  );
}

function EditableTable({ title, description, onAdd, children }: { title: string; description: string; onAdd: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-card-title font-medium">{title}</div>
            <div className="mt-1 text-body-sm text-muted-foreground">{description}</div>
          </div>
          <Button type="button" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[520px] overflow-auto rounded-md border border-border-2">
          <table className="min-w-full border-collapse text-grid-cell">{children}</table>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-label font-medium text-ink-secondary">{label}</span>
      {children}
    </label>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <div className="text-label font-medium text-ink-secondary">{label}</div>
      <div className="h-control overflow-hidden rounded-md border bg-surface-2 px-3 py-2 font-mono text-body-sm">{value}</div>
    </div>
  );
}

function LongReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-label font-medium text-ink-secondary">{label}</div>
      <div className="min-h-control max-h-24 overflow-auto rounded-md border bg-surface-2 px-3 py-2 font-mono text-meta leading-5 text-ink-secondary break-words">
        {value}
      </div>
    </div>
  );
}

function NumberField({ label, value, min = 1, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  const [draftValue, setDraftValue] = useState(String(value));

  useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  return (
    <Field label={label}>
      <input
        type="number"
        min={min}
        className="h-control w-full rounded-md border bg-card px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring"
        value={draftValue}
        onBlur={() => {
          const next = Number(draftValue);
          if (!Number.isFinite(next) || draftValue.trim() === "") {
            setDraftValue(String(value));
            return;
          }
          const bounded = Math.max(min, Math.round(next));
          setDraftValue(String(bounded));
          onChange(bounded);
        }}
        onChange={(event) => {
          const nextDraft = event.target.value;
          setDraftValue(nextDraft);
          if (nextDraft.trim() === "") return;
          const next = Number(nextDraft);
          if (Number.isFinite(next) && next >= min) onChange(Math.round(next));
        }}
      />
    </Field>
  );
}

function MultiLightingMountsEditor({ entries, designer, calibrationOnly = false, onSetMode, onPatchMode }: {
  entries: Array<OpticalTargetRef & { name: string; treatments: DesignerOpticalTreatment[] }>;
  designer: DesignerForm;
  calibrationOnly?: boolean;
  onSetMode: (mode: DesignerOpticalMode, enabled: boolean) => void;
  onPatchMode: (mode: DesignerOpticalMode, patch: Partial<DesignerOpticalTreatment>) => void;
}) {
  const modes: Array<{ mode: DesignerOpticalMode; label: string }> = [
    { mode: "front", label: "Front" },
    { mode: "halo", label: "Halo-Lit" },
    { mode: "wall_wash", label: "Wall Washer" }
  ];
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
              <Badge>{sources.length === entries.length ? `${entries.length} zones` : `${sources.length}/${entries.length} zones`}</Badge>
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

function LightingMountsEditor({ treatments, designer, compact = false, calibrationOnly = false, onAdd, onChange, onRemove }: {
  treatments: DesignerOpticalTreatment[];
  designer: DesignerForm;
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
        return (
          <section key={treatment.id} className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="font-medium">{title}</div>
              {!calibrationOnly ? <Button type="button" variant="ghost" className="h-8 text-xs" onClick={() => onRemove(treatment.id)}><Trash2 className="mr-1 h-3.5 w-3.5" />Remove</Button> : null}
            </div>
            {!calibrationOnly ? <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Source name
              <input className="h-9 rounded-md border border-input bg-card px-3 text-sm text-foreground" value={treatment.name} onChange={(event) => onChange(treatment.id, { name: event.target.value })} />
            </label> : null}
            {!calibrationOnly ? <div className="grid gap-2 text-xs font-medium text-muted-foreground">
              <span>LED strings</span>
              {designer.routes.filter((route) => route.kind === "led_string").length ? designer.routes.filter((route) => route.kind === "led_string").map((route) => (
                <label key={route.id} className="flex items-center gap-2 rounded border border-border-2 bg-surface-2 px-2 py-1.5 font-normal text-foreground">
                  <input
                    type="checkbox"
                    checked={treatment.stringIds.includes(route.id)}
                    onChange={(event) => onChange(treatment.id, {
                      stringIds: event.target.checked
                        ? Array.from(new Set([...treatment.stringIds, route.id]))
                        : treatment.stringIds.filter((id) => id !== route.id)
                    })}
                  />
                  {route.name}
                </label>
              )) : <span className="font-normal">No LED strings available.</span>}
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
                  {treatment.material !== "none" ? <>
                    <DiffuserSlider label="Distance to diffusor" value={treatment.sourceDistanceCm} min={0.5} max={treatment.material === "silicone" ? 3 : 30} step={0.5} suffix="cm" onChange={(sourceDistanceCm) => onChange(treatment.id, { sourceDistanceCm })} />
                    {treatment.material === "silicone" ? (
                      <>
                        <DiffuserSlider label="Transmission" value={treatment.transmissionPct} min={35} max={90} step={1} suffix="%" onChange={(transmissionPct) => onChange(treatment.id, { transmissionPct })} />
                        <DiffuserSlider label="Beam" value={treatment.beamAngleDeg} min={90} max={180} step={5} suffix="°" onChange={(beamAngleDeg) => onChange(treatment.id, { beamAngleDeg })} />
                      </>
                    ) : <DiffuserSlider label="Softness" value={treatment.softnessCm} min={0} max={10} step={0.25} suffix="cm" onChange={(softnessCm) => onChange(treatment.id, { softnessCm })} />}
                  </> : null}
                </div>
                {treatment.material === "none" ? <p className="text-xs text-muted-foreground">Individual addressable pixels remain visible.</p> : null}
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

function GridInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <input className="h-8 w-full min-w-0 rounded-md border bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)} />;
}

function GridNumber({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <input type="number" step="any" className="h-8 w-20 rounded-md border bg-card px-2 text-right font-mono text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(Number(event.target.value))} />;
}

function GridSelect({ value, options, onChange }: { value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void }) {
  return (
    <select className="h-8 w-full min-w-0 rounded-md border bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring" value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map(([optionValue, label]) => <option key={optionValue} value={optionValue}>{label}</option>)}
    </select>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-label-sm font-medium uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-section-title font-semibold">{value}</div>
    </div>
  );
}

function ValidationErrors({ result }: { result: ApiResult }) {
  return (
    <Alert title="Partitura has validation errors" variant="error">
      <div className="mt-2 space-y-2">
        {result.validation.errors.map((issue) => (
          <div key={`${issue.code}:${issue.path}`} className="flex gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{issue.message}</span>
          </div>
        ))}
      </div>
    </Alert>
  );
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
