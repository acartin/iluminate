"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, type DragEndEvent, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlignEndHorizontal, AlignStartHorizontal, AlignVerticalJustifyCenter, Blend, Cable, ChevronDown, ChevronRight, CircleDot, Contrast, CornerDownRight, Cpu, Eye, EyeOff, FlipHorizontal as SquareCenterlineDashedVertical, GripVertical, Hammer, ImageIcon, Info, Layers, Layers3, Lightbulb, ListTree, Lock, Minus, PanelRightClose, Pencil, Plus, Route, Search, Sparkles, Spline, SquareDashed, Trash2, Type, Unlock, Upload, Waves, Waypoints, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { DesignerArtworkForm, DesignerBuildAreaForm, DesignerChannelForm, DesignerFaceGraphicForm, DesignerFabricationPartForm, DesignerFabricationPathForm, DesignerForm, DesignerGroupForm, DesignerLayerSettings, DesignerLayersForm, DesignerPointNodeType, DesignerSublayerForm, DesignerSublayerScope, DesignerSystemSublayerScope, DesignerText, DesignerWorkLineForm, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry, type DesignerDerivedGeometry, type DesignerProjection, type DesignerProjectionLayer } from "@/lib/lighting/partitura-model";
import { formatDecimal, rulerTicks } from "./designer-geometry";
import { channelMatchesSurfaceView, designerAdditiveSelectionRequested, designerLayerForSelection, routeMatchesSurfaceView, type DesignerActiveLayer, type DesignerLayerTarget, type DesignerRouteSummary, type DesignerRouteSurfaceView, type DesignerSelection, type DesignerViewport } from "./types";
import { designerSublayerForObject, designerSublayersInScope } from "./designer-sublayers";

export function ToolButton({
  label,
  icon: Icon,
  active = false,
  tone = "blue",
  disabled = false,
  onClick
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  tone?: "blue" | "amber" | "green";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const activeClass = {
    blue: "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200",
    amber: "border-amber-500 bg-amber-500 text-slate-950 shadow-sm ring-2 ring-amber-200",
    green: "border-emerald-500 bg-emerald-500 text-white shadow-sm ring-2 ring-emerald-200"
  }[tone];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-8 w-8 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? activeClass : "border-transparent bg-card text-ink-secondary hover:bg-surface-hover"}`}
    >
      {active ? <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-current ring-2 ring-white" /> : null}
      {(tone === "amber" || tone === "green") && !active ? <span className={`absolute bottom-0.5 h-1 w-4 rounded-full ${tone === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} /> : null}
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function DesignerLayersPanel({
  designer,
  activeLayer,
  activeLayerTarget,
  selection,
  selectedGeometryKeys,
  selectedRouteIds,
  routeSummaries,
  routeOutputs,
  assets,
  faceGraphicVinylPreview,
  routeSurfaceView,
  onActivateLayer,
  onActivateLayerTarget,
  onPatchLayer,
  onPatchLayers,
  onSetArtworkVisibility,
  onSetArtworkFolderVisibility,
  onPatchWorkLine,
  onToggleFaceGraphicVinylPreview,
  onRouteSurfaceViewChange,
  onUploadArtwork,
  onPatchArtwork,
  onPatchBuildArea,
  onPatchZone,
  onPatchFaceGraphic,
  onAddFabricationPart,
  onPatchFabricationPart,
  onPatchFabricationPath,
  onPatchProjection,
  onPatchDerivedGeometry,
  onPatchText,
  onAddGroup,
  onPatchGroup,
  onRemoveGroup,
  onAddObjectsToGroup,
  onToggleGroupMember,
  onSelectGroupMember,
  onOpenLighting,
  onPatchChannel,
  onPatchController,
  onPatchRoute,
  onReorderItems,
  onAddSublayer,
  onPatchSystemSublayer,
  onPatchSublayer,
  onRemoveSublayer,
  onAssignObjectsToSublayer,
  onSelect,
  width,
  onWidthChange,
  onClose
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer | null;
  activeLayerTarget: DesignerLayerTarget | null;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  selectedRouteIds: string[];
  routeSummaries: DesignerRouteSummary[];
  routeOutputs: Map<string, number>;
  assets: Array<{ id: string; fileName: string; mimeType: string }>;
  faceGraphicVinylPreview: boolean;
  routeSurfaceView: DesignerRouteSurfaceView;
  onActivateLayer: (layer: DesignerActiveLayer) => void;
  onActivateLayerTarget: (target: DesignerLayerTarget) => void;
  onPatchLayer: (layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) => void;
  onPatchLayers: (layers: Array<keyof DesignerLayersForm>, patch: Partial<DesignerLayerSettings>) => void;
  onSetArtworkVisibility: (visible: boolean) => void;
  onSetArtworkFolderVisibility: (folder: "workLines", visible: boolean) => void;
  onPatchWorkLine: (workLineId: string, patch: Partial<Pick<DesignerWorkLineForm, "name" | "layer" | "points">>) => void;
  onToggleFaceGraphicVinylPreview: () => void;
  onRouteSurfaceViewChange: (view: DesignerRouteSurfaceView) => void;
  onUploadArtwork: (file: File) => void | Promise<void>;
  onPatchArtwork: (artworkId: string, patch: Partial<DesignerArtworkForm>) => void;
  onPatchBuildArea: (buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchZone: (zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchFaceGraphic: (elementId: string, patch: Partial<DesignerFaceGraphicForm>) => void;
  onAddFabricationPart: () => void;
  onPatchFabricationPart: (partId: string, patch: Partial<DesignerFabricationPartForm>) => void;
  onPatchFabricationPath: (pathId: string, patch: Partial<DesignerFabricationPathForm>) => void;
  onPatchProjection: (projectionId: string, patch: Partial<DesignerProjection>) => void;
  onPatchDerivedGeometry: (derivedId: string, patch: Partial<DesignerDerivedGeometry>) => void;
  onPatchText: (textId: string, patch: Partial<DesignerText>) => void;
  onAddGroup: (members?: DesignerGroupForm["members"]) => void;
  onPatchGroup: (groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) => void;
  onRemoveGroup: (groupId: string) => void;
  onAddObjectsToGroup: (groupId: string, memberType: "zone" | "channel", objectIds: string[]) => void;
  onToggleGroupMember: (groupId: string, memberType: "zone" | "channel" | "group", memberId: string) => void;
  onSelectGroupMember: (memberType: "zone" | "channel", memberId: string) => void;
  onOpenLighting: (target: { type: "zone" | "channel"; id: string }) => void;
  onPatchChannel: (channelId: string, patch: Partial<Pick<DesignerChannelForm, "name" | "widthMm" | "closed" | "cap" | "visible">>) => void;
  onPatchController: (patch: Partial<Pick<DesignerForm["controller"], "name" | "visible">>) => void;
  onPatchRoute: (routeId: string, patch: Partial<Pick<DesignerForm["routes"][number], "name" | "visible">>) => void;
  onReorderItems: (layer: "artwork" | "reference" | "zones" | "channels" | "faceGraphic" | "strings", activeId: string, overId: string) => void;
  onAddSublayer: (scope: DesignerSublayerScope, objectIds?: string[]) => string;
  onPatchSystemSublayer: (scope: DesignerSystemSublayerScope, patch: Partial<{ visible: boolean; locked: boolean }>) => void;
  onPatchSublayer: (sublayerId: string, patch: Partial<Pick<DesignerSublayerForm, "name" | "visible" | "locked">>) => void;
  onRemoveSublayer: (sublayerId: string) => void;
  onAssignObjectsToSublayer: (scope: DesignerSublayerScope, objectIds: string[], sublayerId: string | null, beforeObjectId?: string) => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  width: number;
  onWidthChange: (width: number) => void;
  onClose: () => void;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [details, setDetails] = useState<DesignerLayerDetails | null>(null);
  const artworkFileInputRef = useRef<HTMLInputElement | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [expandedLayers, setExpandedLayers] = useState<Record<DesignerActiveLayer, boolean>>({
    artwork: false,
    reference: false,
    zones: false,
    faceGraphic: false,
    fabrication: false,
    lightSources: false,
    hardware: false,
    strings: false
  });
  const didMountRef = useRef(false);
  const [expandedStringGroups, setExpandedStringGroups] = useState({ data_cables: false, led_strings: false });
  const [expandedControllerGroup, setExpandedControllerGroup] = useState(false);
  const [expandedDiffusorGroups, setExpandedDiffusorGroups] = useState({ zones: false, channels: false });
  const [effectTargetsExpanded, setEffectTargetsExpanded] = useState(false);
  const [diffusorDragIds, setDiffusorDragIds] = useState<string[]>([]);
  const [diffusorDragMessage, setDiffusorDragMessage] = useState("");
  const [expandedArtworkGroups, setExpandedArtworkGroups] = useState({ images: false, reference: false, workLines: false });
  const [expandedFabricationParts, setExpandedFabricationParts] = useState<Record<string, boolean>>({});
  const [compact, setCompact] = useState(false);
  const searchExpansionSnapshotRef = useRef<null | {
    layers: Record<DesignerActiveLayer, boolean>;
    strings: typeof expandedStringGroups;
    diffusors: typeof expandedDiffusorGroups;
    artwork: typeof expandedArtworkGroups;
    controller: boolean;
    fabrication: Record<string, boolean>;
  }>(null);

  function activateLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: true }));
    onActivateLayer(layer);
  }

  function toggleLayer(layer: DesignerActiveLayer) {
    if (!expandedLayers[layer] && activeLayer === null) {
      activateLayer(layer);
      return;
    }
    setExpandedLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesSearch = (label: string, detail = "") => !normalizedSearch || `${label} ${detail}`.toLowerCase().includes(normalizedSearch);
  const searchResultCount = normalizedSearch ? [
    ...designer.artwork.map((entry) => entry.name),
    ...designer.buildAreas.map((entry) => entry.name),
    ...designer.workLines.map((entry) => entry.name),
    ...designer.zones.map((entry) => entry.name),
    ...designer.channels.map((entry) => entry.name),
    ...designer.routes.map((entry) => entry.name),
    designer.controller.name,
    ...designer.faceGraphics.map((entry) => entry.name),
    ...designer.fabricationParts.map((entry) => entry.name),
    ...designer.fabricationPaths.map((entry) => entry.name),
    ...designer.texts.map((entry) => entry.name),
    ...designer.projections.map((entry) => entry.name),
    ...designer.derivedGeometries.map((entry) => entry.name)
  ].filter((label) => label.toLowerCase().includes(normalizedSearch)).length : 0;
  const selectedIdsForScope = (scope: DesignerSublayerScope) => {
    if (scope === "artwork") return selection?.type === "artwork" ? [selection.id] : [];
    if (scope === "reference") return selectedGeometryKeys.filter((key) => key.startsWith("build_area:")).map((key) => key.slice("build_area:".length)).concat(selection?.type === "build_area" && !selectedGeometryKeys.includes(`build_area:${selection.id}`) ? [selection.id] : []);
    if (scope === "zones") return selectedGeometryKeys.filter((key) => key.startsWith("zone:")).map((key) => key.slice("zone:".length)).concat(selection?.type === "zone" && !selectedGeometryKeys.includes(`zone:${selection.id}`) ? [selection.id] : []);
    if (scope === "channels") return selectedGeometryKeys.filter((key) => key.startsWith("channel:")).map((key) => key.slice("channel:".length)).concat(selection?.type === "channel" && !selectedGeometryKeys.includes(`channel:${selection.id}`) ? [selection.id] : []);
    if (scope === "faceGraphic") return selectedGeometryKeys.filter((key) => key.startsWith("face_graphic:")).map((key) => key.slice("face_graphic:".length)).concat(selection?.type === "face_graphic" && !selectedGeometryKeys.includes(`face_graphic:${selection.id}`) ? [selection.id] : []);
    if (scope === "strings") return selectedRouteIds.filter((id) => designer.routes.find((route) => route.id === id)?.kind === "led_string");
    return selectedRouteIds.filter((id) => designer.routes.find((route) => route.id === id)?.kind === "data_cable");
  };

  useEffect(() => {
    // Start with every category collapsed; only auto-expand when the active
    // layer changes after the panel has mounted.
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (!activeLayer) return;
    setExpandedLayers((current) => ({ ...current, [activeLayer]: true }));
  }, [activeLayer]);

  useEffect(() => {
    if (!selection) return;
    if (selection.type === "work_line") {
      setExpandedLayers((current) => ({ ...current, artwork: true }));
      setExpandedArtworkGroups((current) => ({ ...current, workLines: true }));
      return;
    }
    if (selection.type === "build_area") {
      setExpandedLayers((current) => ({ ...current, artwork: true }));
      setExpandedArtworkGroups((current) => ({ ...current, reference: true }));
      return;
    }
    if (selection.type === "artwork") {
      setExpandedLayers((current) => ({ ...current, artwork: true }));
      setExpandedArtworkGroups((current) => ({ ...current, images: true }));
      return;
    }
    const referenceTarget = selection.type === "text"
      ? designer.texts.find((entry) => entry.id === selection.id)?.targetLayer
      : selection.type === "projection"
        ? designer.projections.find((entry) => entry.id === selection.id)?.targetLayer
        : selection.type === "derived_geometry"
          ? designer.derivedGeometries.find((entry) => entry.id === selection.id)?.targetLayer
          : null;
    if (referenceTarget === "reference") {
      setExpandedLayers((current) => ({ ...current, artwork: true }));
      setExpandedArtworkGroups((current) => ({ ...current, reference: true }));
      return;
    }
    const layer = designerLayerForSelection(selection);
    if (layer) setExpandedLayers((current) => ({ ...current, [layer]: true }));
    if (selection.type === "zone") {
      setExpandedDiffusorGroups((current) => ({ ...current, zones: true }));
    }
    if (selection.type === "channel") {
      setExpandedDiffusorGroups((current) => ({ ...current, channels: true }));
    }
    if (selection.type === "route") {
      const route = designer.routes.find((entry) => entry.id === selection.id);
      if (route?.kind === "data_cable") setExpandedStringGroups((current) => ({ ...current, data_cables: true }));
      if (route?.kind === "led_string") setExpandedStringGroups((current) => ({ ...current, led_strings: true }));
    }
    if (selection.type === "fabrication_path") {
      const path = designer.fabricationPaths.find((entry) => entry.id === selection.id);
      if (path) setExpandedFabricationParts((current) => ({ ...current, [path.partId]: true }));
    }
    if (selection.type === "controller") setExpandedControllerGroup(true);
  }, [selection]);

  const selectedEffectTargetMembers: DesignerGroupForm["members"] = [
    ...selectedIdsForScope("zones").map((id) => ({ type: "zone" as const, id })),
    ...selectedIdsForScope("channels").map((id) => ({ type: "channel" as const, id }))
  ];
  const effectTargets = <EffectTargetsSection
    groups={designer.groups ?? []}
    zones={designer.zones}
    channels={designer.channels}
    searchQuery={normalizedSearch}
    expanded={effectTargetsExpanded || Boolean(normalizedSearch)}
    onToggleExpanded={() => setEffectTargetsExpanded((current) => !current)}
    active={activeLayerTarget?.scope === "effectTargets"}
    onActivate={() => onActivateLayerTarget({ scope: "effectTargets", sublayerId: null })}
    selectedMember={selection?.type === "zone" || selection?.type === "channel" ? selection : undefined}
    onAdd={() => onAddGroup(selectedEffectTargetMembers)}
    onPatchGroup={onPatchGroup}
    onRemoveGroup={onRemoveGroup}
    onToggleGroupMember={onToggleGroupMember}
    onSelectMember={onSelectGroupMember}
  />;

  useEffect(() => {
    if (normalizedSearch && !searchExpansionSnapshotRef.current) {
      searchExpansionSnapshotRef.current = {
        layers: expandedLayers,
        strings: expandedStringGroups,
        diffusors: expandedDiffusorGroups,
        artwork: expandedArtworkGroups,
        controller: expandedControllerGroup,
        fabrication: expandedFabricationParts
      };
      setExpandedLayers((current) => Object.fromEntries(Object.keys(current).map((key) => [key, true])) as Record<DesignerActiveLayer, boolean>);
      setExpandedStringGroups({ data_cables: true, led_strings: true });
      setExpandedDiffusorGroups({ zones: true, channels: true });
      setExpandedArtworkGroups({ images: true, reference: true, workLines: true });
      setExpandedControllerGroup(true);
      setExpandedFabricationParts(Object.fromEntries(designer.fabricationParts.map((part) => [part.id, true])));
      return;
    }
    if (!normalizedSearch && searchExpansionSnapshotRef.current) {
      const snapshot = searchExpansionSnapshotRef.current;
      searchExpansionSnapshotRef.current = null;
      setExpandedLayers(snapshot.layers);
      setExpandedStringGroups(snapshot.strings);
      setExpandedDiffusorGroups(snapshot.diffusors);
      setExpandedArtworkGroups(snapshot.artwork);
      setExpandedControllerGroup(snapshot.controller);
      setExpandedFabricationParts(snapshot.fabrication);
    }
  }, [normalizedSearch]);

  useEffect(() => {
    const stored = window.localStorage.getItem("iluminate.layers.compact");
    if (stored === "true") setCompact(true);
  }, []);

  function toggleCompact() {
    setCompact((current) => {
      const next = !current;
      window.localStorage.setItem("iluminate.layers.compact", String(next));
      return next;
    });
  }

  function beginResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => onWidthChange(Math.min(520, Math.max(280, startWidth + startX - moveEvent.clientX)));
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
  }

  function diffusorDragScopeForObject(objectId: string): "zones" | "channels" | null {
    if (designer.zones.some((zone) => zone.id === objectId)) return "zones";
    if (designer.channels.some((channel) => channel.id === objectId)) return "channels";
    return null;
  }

  function handleDiffusorDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    setDiffusorDragIds([]);
    if (!overId || activeId === overId) return;
    const scope = diffusorDragScopeForObject(activeId);
    if (!scope || designer.layers.zones.locked || designer.systemSublayers[scope].locked || designerSublayerForObject(designer, scope, activeId)?.locked) return;
    const existing = new Set((scope === "zones" ? designer.zones : designer.channels)
      .filter((object) => scope === "zones" || channelMatchesSurfaceView((object as DesignerChannelForm).fabricationSurface, routeSurfaceView))
      .map((object) => object.id));
    const selectedIds = selectedIdsForScope(scope);
    const moving = selectedIds.includes(activeId) ? selectedIds.filter((id) => existing.has(id)) : [activeId];
    if (overId.startsWith("effect-target-drop:")) {
      onAddObjectsToGroup(overId.slice("effect-target-drop:".length), scope === "zones" ? "zone" : "channel", moving);
      setDiffusorDragMessage(`Added ${moving.length} ${scope === "zones" ? "Zone" : "Channel"}${moving.length === 1 ? "" : "s"} to the Effect target.`);
      return;
    }
    if (overId === `sublayer-root:${scope}`) {
      onAssignObjectsToSublayer(scope, moving, null);
      setDiffusorDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} to the root layer.`);
      return;
    }
    if (overId.startsWith("sublayer-drop:")) {
      const sublayerId = overId.slice("sublayer-drop:".length);
      if (!designer.sublayers.some((sublayer) => sublayer.id === sublayerId && sublayer.scope === scope)) return;
      onAssignObjectsToSublayer(scope, moving, sublayerId);
      setDiffusorDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} to a sublayer.`);
      return;
    }
    if (!existing.has(overId)) return;
    const activeSublayerId = designerSublayerForObject(designer, scope, activeId)?.id ?? null;
    const overSublayerId = designerSublayerForObject(designer, scope, overId)?.id ?? null;
    if (activeSublayerId !== overSublayerId) {
      onAssignObjectsToSublayer(scope, moving, overSublayerId, overId);
      setDiffusorDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} between layers.`);
    } else {
      onReorderItems(scope, activeId, overId);
      setDiffusorDragMessage("Layer order changed.");
    }
  }

  return (
    <aside role="tree" aria-label="Layers" className={`relative flex min-h-0 flex-col border-l border-border-2 bg-card ${compact ? "[&_.layer-tree-row]:h-7 [&_.layer-object-row]:min-h-7 [&_.layer-object-detail]:hidden" : ""}`}>
      <div className="absolute inset-y-0 left-0 z-30 w-1 cursor-col-resize hover:bg-blue-500/40" title="Resize Layers panel" onPointerDown={beginResize} />
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-2 text-body-sm font-semibold">
          <Layers className="h-4 w-4 text-blue-700" />
          Layers
        </div>
        <div className="flex items-center gap-1" title="Filter physical construction by mounting or fabrication side">
          <AssemblySurfaceViewToggle value={routeSurfaceView} onChange={onRouteSurfaceViewChange} />
          <button type="button" title={compact ? "Use comfortable layer rows" : "Use compact layer rows"} aria-pressed={compact} className={`flex h-7 w-7 items-center justify-center rounded ${compact ? "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "text-muted-foreground hover:bg-surface-hover"}`} onClick={toggleCompact}>
            <ListTree className="h-4 w-4" />
          </button>
          <button type="button" title="Close Layers panel" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover" onClick={onClose}>
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search objects"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        {normalizedSearch ? <>
          <span className="min-w-5 text-center font-mono text-[10px] text-muted-foreground" aria-live="polite">{searchResultCount}</span>
          <button type="button" title="Clear search" aria-label="Clear layer search" className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover" onClick={() => setSearchTerm("")}><X className="h-3.5 w-3.5" /></button>
        </> : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-auto py-1">
        <input
          ref={artworkFileInputRef}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg,image/webp,image/bmp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onUploadArtwork(file);
            event.target.value = "";
          }}
        />
        <LayerPanelSection
          label="Artwork"
          order={1}
          active={activeLayer === "artwork"}
          expanded={expandedLayers.artwork}
          layer={designer.layers.artwork}
          onActivate={() => activateLayer("artwork")}
          onToggle={() => toggleLayer("artwork")}
          onChange={(patch) => typeof patch.visible === "boolean" ? onSetArtworkVisibility(patch.visible) : onPatchLayer("artwork", patch)}
        >
          <RouteFolder
            label="Images"
            icon={ImageIcon}
            iconClassName="text-sky-600"
            active={activeLayerTarget?.scope === "artwork" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "artwork", sublayerId: null })}
            rootDropScope="artwork"
            count={designer.artwork.length}
            visible={designer.systemSublayers.artwork.visible}
            onToggleVisible={() => onPatchSystemSublayer("artwork", { visible: !designer.systemSublayers.artwork.visible })}
            locked={designer.systemSublayers.artwork.locked}
            onToggleLocked={() => onPatchSystemSublayer("artwork", { locked: !designer.systemSublayers.artwork.locked })}
            expanded={expandedArtworkGroups.images}
            onToggle={() => {
              setExpandedArtworkGroups((current) => ({ ...current, images: !current.images }));
            }}
            action={<>
              <button type="button" title="New Images sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("artwork", selectedIdsForScope("artwork"))}><Plus className="h-3.5 w-3.5" /></button>
              <button type="button" title="Upload image to assets" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => artworkFileInputRef.current?.click()}><Upload className="h-3.5 w-3.5" /></button>
            </>}
          >
            <SublayeredLayerList
              designer={designer}
              scope="artwork"
              searchActive={Boolean(normalizedSearch)}
              searchQuery={normalizedSearch}
              activeSublayerId={activeLayerTarget?.scope === "artwork" ? activeLayerTarget.sublayerId : null}
              onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "artwork", sublayerId })}
              ids={designer.artwork.map((artwork) => artwork.id)}
              selectedIds={selectedIdsForScope("artwork")}
              sensors={sensors}
              disabled={designer.layers.artwork.locked || designer.systemSublayers.artwork.locked}
              onReorder={(activeId, overId) => onReorderItems("artwork", activeId, overId)}
              onPatchSublayer={onPatchSublayer}
              onRemoveSublayer={onRemoveSublayer}
              onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("artwork", ids, sublayerId, beforeId)}
            >
              {designer.artwork.filter((artwork) => matchesSearch(artwork.name, assets.find((entry) => entry.id === artwork.assetId)?.fileName)).map((artwork) => {
                const asset = assets.find((entry) => entry.id === artwork.assetId);
                return (
                  <SortableLayerChildRow key={artwork.id} id={artwork.id} disabled={designer.layers.artwork.locked}>
                    <LayerChildRow
                      label={artwork.name}
                      detail={asset ? asset.fileName : "No image assigned"}
                      selected={selection?.type === "artwork" && selection.id === artwork.id}
                      color="blue"
                      icon={ImageIcon}
                      visible={artwork.visible}
                      onToggleVisible={() => onPatchArtwork(artwork.id, { visible: artwork.visible === false })}
                      onClick={() => {
                        activateLayer("artwork");
                        onSelect({ type: "artwork", id: artwork.id });
                      }}
                      onRename={(name) => onPatchArtwork(artwork.id, { name })}
                      onOpenDetails={() => setDetails({ type: "artwork", id: artwork.id })}
                    />
                  </SortableLayerChildRow>
                );
              })}
            </SublayeredLayerList>
          </RouteFolder>

          <RouteFolder
            label="Reference"
            icon={SquareDashed}
            iconClassName="text-violet-600"
            active={activeLayerTarget?.scope === "reference" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "reference", sublayerId: null })}
            rootDropScope="reference"
            count={designer.buildAreas.length
              + designer.texts.filter((text) => text.targetLayer === "reference").length
              + designer.projections.filter((projection) => projection.targetLayer === "reference").length
              + designer.derivedGeometries.filter((operation) => operation.targetLayer === "reference").length}
            visible={designer.systemSublayers.reference.visible}
            onToggleVisible={() => onPatchSystemSublayer("reference", { visible: !designer.systemSublayers.reference.visible })}
            locked={designer.systemSublayers.reference.locked}
            onToggleLocked={() => onPatchSystemSublayer("reference", { locked: !designer.systemSublayers.reference.locked })}
            expanded={expandedArtworkGroups.reference}
            onToggle={() => {
              setExpandedArtworkGroups((current) => ({ ...current, reference: !current.reference }));
            }}
            action={<button type="button" title="New Reference sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("reference", selectedIdsForScope("reference"))}><Plus className="h-3.5 w-3.5" /></button>}
          >
            <SublayeredLayerList
              designer={designer}
              scope="reference"
              searchActive={Boolean(normalizedSearch)}
              searchQuery={normalizedSearch}
              activeSublayerId={activeLayerTarget?.scope === "reference" ? activeLayerTarget.sublayerId : null}
              onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "reference", sublayerId })}
              ids={designer.buildAreas.map((buildArea) => buildArea.id)}
              selectedIds={selectedIdsForScope("reference")}
              sensors={sensors}
              disabled={designer.layers.artwork.locked || designer.systemSublayers.reference.locked}
              onReorder={(activeId, overId) => onReorderItems("reference", activeId, overId)}
              onPatchSublayer={onPatchSublayer}
              onRemoveSublayer={onRemoveSublayer}
              onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("reference", ids, sublayerId, beforeId)}
            >
              {designer.buildAreas.filter((buildArea) => matchesSearch(buildArea.name, buildArea.shape)).map((buildArea) => (
                <SortableLayerChildRow key={buildArea.id} id={buildArea.id} disabled={designer.layers.artwork.locked}>
                  <LayerChildRow
                    label={buildArea.name}
                    detail={`${buildArea.shape} · ${formatDecimal(buildArea.width)}x${formatDecimal(buildArea.height)} cm`}
                    selected={(selection?.type === "build_area" && selection.id === buildArea.id) || selectedGeometryKeys.includes(`build_area:${buildArea.id}`)}
                    color="violet"
                    visible={buildArea.visible}
                    onToggleVisible={() => onPatchBuildArea(buildArea.id, { visible: buildArea.visible === false })}
                    onClick={(event) => {
                      activateLayer("artwork");
                      onSelect({ type: "build_area", id: buildArea.id }, designerAdditiveSelectionRequested(event));
                    }}
                    onRename={(name) => onPatchBuildArea(buildArea.id, { name })}
                    onOpenDetails={() => setDetails({ type: "build_area", id: buildArea.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SublayeredLayerList>
            <TextRows designer={designer} targetLayer="reference" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchText} />
            <ProjectionRows designer={designer} targetLayer="reference" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchProjection} />
            <DerivedGeometryRows designer={designer} targetLayer="reference" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
          </RouteFolder>
          <RouteFolder
            label="Work Lines"
            icon={SquareCenterlineDashedVertical}
            iconClassName="text-emerald-600"
            active={activeLayerTarget?.scope === "workLines"}
            onActivate={() => onActivateLayerTarget({ scope: "workLines", sublayerId: null })}
            count={designer.workLines.length}
            expanded={expandedArtworkGroups.workLines}
            onToggle={() => {
              setExpandedArtworkGroups((current) => ({ ...current, workLines: !current.workLines }));
            }}
            visible={designer.workLinesVisible}
            onToggleVisible={() => onSetArtworkFolderVisibility("workLines", !designer.workLinesVisible)}
          >
            <WorkLineRows designer={designer} selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchWorkLine} />
          </RouteFolder>
        </LayerPanelSection>

        <LayerPanelSection
          label="Diffusors"
          order={3}
          active={activeLayer === "zones"}
          expanded={expandedLayers.zones}
          layer={designer.layers.zones}
          onActivate={() => activateLayer("zones")}
          onToggle={() => toggleLayer("zones")}
          onChange={(patch) => onPatchLayer("zones", patch)}
        >
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={(event) => {
              const activeId = String(event.active.id);
              const scope = diffusorDragScopeForObject(activeId);
              const selectedIds = scope ? selectedIdsForScope(scope) : [];
              setDiffusorDragIds(selectedIds.includes(activeId) ? selectedIds : [activeId]);
              setDiffusorDragMessage("");
            }}
            onDragCancel={() => setDiffusorDragIds([])}
            onDragEnd={handleDiffusorDragEnd}
          >
          <RouteFolder
            label="Zones"
            icon={CircleDot}
            iconClassName="text-sky-600"
            active={activeLayerTarget?.scope === "zones" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "zones", sublayerId: null })}
            rootDropScope="zones"
            count={designer.zones.length}
            visible={designer.systemSublayers.zones.visible}
            onToggleVisible={() => onPatchSystemSublayer("zones", { visible: !designer.systemSublayers.zones.visible })}
            locked={designer.systemSublayers.zones.locked}
            onToggleLocked={() => onPatchSystemSublayer("zones", { locked: !designer.systemSublayers.zones.locked })}
            expanded={expandedDiffusorGroups.zones}
            onToggle={() => setExpandedDiffusorGroups((current) => ({ ...current, zones: !current.zones }))}
            action={<button type="button" title="New Zones sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("zones", selectedIdsForScope("zones"))}><Plus className="h-3.5 w-3.5" /></button>}
          >
            <SublayeredLayerList
              designer={designer}
              scope="zones"
              searchActive={Boolean(normalizedSearch)}
              searchQuery={normalizedSearch}
              activeSublayerId={activeLayerTarget?.scope === "zones" ? activeLayerTarget.sublayerId : null}
              onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "zones", sublayerId })}
              ids={designer.zones.map((zone) => zone.id)}
              selectedIds={selectedIdsForScope("zones")}
              sensors={sensors}
              disabled={designer.layers.zones.locked || designer.systemSublayers.zones.locked}
              onReorder={(activeId, overId) => onReorderItems("zones", activeId, overId)}
              onPatchSublayer={onPatchSublayer}
              onRemoveSublayer={onRemoveSublayer}
              onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("zones", ids, sublayerId, beforeId)}
              withinDndContext
            >
              {designer.zones.filter((zone) => matchesSearch(zone.name, zone.shape)).map((zone) => (
                <SortableLayerChildRow key={zone.id} id={zone.id} disabled={designer.layers.zones.locked}>
                  <LayerChildRow
                    label={zone.name}
                    selected={(selection?.type === "zone" && selection.id === zone.id) || selectedGeometryKeys.includes(`zone:${zone.id}`)}
                    color="blue"
                    strongColor
                    visible={zone.visible}
                    onToggleVisible={() => onPatchZone(zone.id, { visible: zone.visible === false })}
                    onClick={(event) => {
                      activateLayer("zones");
                      onSelect({ type: "zone", id: zone.id }, designerAdditiveSelectionRequested(event));
                    }}
                    onRename={(name) => onPatchZone(zone.id, { name })}
                    onOpenDetails={() => setDetails({ type: "zone", id: zone.id })}
                    lightingCount={designer.lightSources.filter((source) => source.targetType === "zone" && source.targetId === zone.id && source.enabled).length}
                    onOpenLighting={() => onOpenLighting({ type: "zone", id: zone.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SublayeredLayerList>
          </RouteFolder>
          <RouteFolder
            label="Channels"
            icon={Waves}
            iconClassName="text-amber-600"
            active={activeLayerTarget?.scope === "channels" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "channels", sublayerId: null })}
            rootDropScope="channels"
            count={(designer.channels ?? []).filter((channel) => channelMatchesSurfaceView(channel.fabricationSurface, routeSurfaceView)).length}
            visible={designer.systemSublayers.channels.visible}
            onToggleVisible={() => onPatchSystemSublayer("channels", { visible: !designer.systemSublayers.channels.visible })}
            locked={designer.systemSublayers.channels.locked}
            onToggleLocked={() => onPatchSystemSublayer("channels", { locked: !designer.systemSublayers.channels.locked })}
            expanded={expandedDiffusorGroups.channels}
            onToggle={() => setExpandedDiffusorGroups((current) => ({ ...current, channels: !current.channels }))}
            action={<button type="button" title="New Channels sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("channels", selectedIdsForScope("channels"))}><Plus className="h-3.5 w-3.5" /></button>}
          >
            {(designer.channels ?? []).length ? (
              <SublayeredLayerList
                designer={designer}
                scope="channels"
                searchActive={Boolean(normalizedSearch)}
                searchQuery={normalizedSearch}
                activeSublayerId={activeLayerTarget?.scope === "channels" ? activeLayerTarget.sublayerId : null}
                onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "channels", sublayerId })}
                ids={designer.channels.filter((channel) => channelMatchesSurfaceView(channel.fabricationSurface, routeSurfaceView)).map((channel) => channel.id)}
                selectedIds={selectedIdsForScope("channels")}
                sensors={sensors}
                disabled={designer.layers.zones.locked || designer.systemSublayers.channels.locked}
                onReorder={(activeId, overId) => onReorderItems("channels", activeId, overId)}
                onPatchSublayer={onPatchSublayer}
                onRemoveSublayer={onRemoveSublayer}
                onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("channels", ids, sublayerId, beforeId)}
                withinDndContext
              >
                {designer.channels.filter((channel) => channelMatchesSurfaceView(channel.fabricationSurface, routeSurfaceView) && matchesSearch(channel.name, "channel")).map((channel) => (
                  <SortableLayerChildRow key={channel.id} id={channel.id} disabled={designer.layers.zones.locked}>
                    <LayerChildRow
                      label={channel.name}
                      selected={(selection?.type === "channel" && selection.id === channel.id) || selectedGeometryKeys.includes(`channel:${channel.id}`)}
                      color="amber"
                      icon={Waves}
                      detail={`${channel.fabricationSurface === "rear" ? "Rear" : "Front"} · ${channel.widthMm} mm router channel`}
                      visible={channel.visible}
                      onToggleVisible={() => onPatchChannel(channel.id, { visible: channel.visible === false })}
                      onClick={() => {
                        activateLayer("zones");
                        onSelect({ type: "channel", id: channel.id });
                      }}
                      onRename={(name) => onPatchChannel(channel.id, { name })}
                      lightingCount={designer.lightSources.filter((source) => source.targetType === "channel" && source.targetId === channel.id && source.enabled).length}
                      onOpenLighting={() => onOpenLighting({ type: "channel", id: channel.id })}
                    />
                  </SortableLayerChildRow>
                ))}
              </SublayeredLayerList>
            ) : null}
          </RouteFolder>
          {effectTargets}
          <TextRows designer={designer} targetLayer="zones" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchText} />
          <ProjectionRows designer={designer} targetLayer="zones" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchProjection} />
          <DerivedGeometryRows designer={designer} targetLayer="zones" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
          <DragOverlay>{diffusorDragIds.length ? <div className="rounded-md border border-blue-500 bg-card px-3 py-2 text-body-sm font-medium shadow-xl">{diffusorDragIds.length === 1 ? "Move object" : `Move ${diffusorDragIds.length} objects`}</div> : null}</DragOverlay>
          <span className="sr-only" aria-live="polite">{diffusorDragMessage}</span>
          </DndContext>
        </LayerPanelSection>

        <LayerPanelSection
          label="Hardware"
          order={2}
          active={activeLayer === "strings" || activeLayer === "hardware"}
          expanded={expandedLayers.strings || expandedLayers.hardware}
          layer={{
            visible: designer.layers.strings.visible && designer.layers.hardware.visible,
            locked: designer.layers.strings.locked && designer.layers.hardware.locked,
            opacity: Math.min(designer.layers.strings.opacity, designer.layers.hardware.opacity)
          }}
          visibilityMixed={designer.layers.strings.visible !== designer.layers.hardware.visible}
          lockMixed={designer.layers.strings.locked !== designer.layers.hardware.locked}
          onActivate={() => activateLayer(activeLayer === "strings" ? "strings" : "hardware")}
          onToggle={() => {
            const expanded = expandedLayers.strings || expandedLayers.hardware;
            if (!expanded && activeLayer === null) {
              activateLayer("hardware");
              return;
            }
            setExpandedLayers((current) => ({ ...current, strings: !expanded, hardware: !expanded }));
          }}
          onChange={(patch) => onPatchLayers(["strings", "hardware"], patch)}
        >
          <RouteFolder
            label="Data cables"
            rootDropScope="dataCables"
            icon={Cable}
            iconClassName="text-emerald-600"
            active={activeLayerTarget?.scope === "dataCables" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "dataCables", sublayerId: null })}
            order={2}
            count={designer.routes.filter((route) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).length}
            visible={designer.systemSublayers.dataCables.visible}
            onToggleVisible={() => onPatchSystemSublayer("dataCables", { visible: !designer.systemSublayers.dataCables.visible })}
            locked={designer.systemSublayers.dataCables.locked}
            onToggleLocked={() => onPatchSystemSublayer("dataCables", { locked: !designer.systemSublayers.dataCables.locked })}
            expanded={expandedStringGroups.data_cables}
            onToggle={() => {
              setExpandedStringGroups((current) => ({ ...current, data_cables: !current.data_cables }));
            }}
            action={<button type="button" title="New Data cables sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("dataCables", selectedIdsForScope("dataCables"))}><Plus className="h-3.5 w-3.5" /></button>}
          >
            <SublayeredLayerList
              designer={designer}
              scope="dataCables"
              searchActive={Boolean(normalizedSearch)}
              searchQuery={normalizedSearch}
              activeSublayerId={activeLayerTarget?.scope === "dataCables" ? activeLayerTarget.sublayerId : null}
              onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "dataCables", sublayerId })}
              ids={designer.routes.filter((route) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).map((route) => route.id)}
              selectedIds={selectedIdsForScope("dataCables")}
              sensors={sensors}
              disabled={designer.layers.strings.locked || designer.systemSublayers.dataCables.locked}
              onReorder={(activeId, overId) => onReorderItems("strings", activeId, overId)}
              onPatchSublayer={onPatchSublayer}
              onRemoveSublayer={onRemoveSublayer}
              onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("dataCables", ids, sublayerId, beforeId)}
            >
              {designer.routes.map((route, index) => ({ route, index })).filter(({ route }) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).filter(({ route }) => matchesSearch(route.name, "data cable")).map(({ route }) => (
                <SortableLayerChildRow key={route.id} id={route.id} disabled={designer.layers.strings.locked}>
                  <LayerChildRow
                    label={route.name}
                    icon={Cable}
                    detail={`${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · ${route.designSurface === "front" ? "Front" : "Rear"} · data cable`}
                    selected={selectedRouteIds.includes(route.id)}
                    color="green"
                    strongColor
                    visible={route.visible !== false}
                    onToggleVisible={() => onPatchRoute(route.id, { visible: route.visible === false })}
                    onClick={(event) => {
                      activateLayer("strings");
                      onSelect({ type: "route", id: route.id }, designerAdditiveSelectionRequested(event));
                    }}
                    onRename={(name) => onPatchRoute(route.id, { name })}
                    onOpenDetails={() => setDetails({ type: "route", id: route.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SublayeredLayerList>
          </RouteFolder>
          <RouteFolder
            label="Strings"
            rootDropScope="strings"
            icon={Waypoints}
            iconClassName="text-amber-600"
            active={activeLayerTarget?.scope === "strings" && !activeLayerTarget.sublayerId}
            onActivate={() => onActivateLayerTarget({ scope: "strings", sublayerId: null })}
            order={1}
            count={designer.routes.filter((route) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).length}
            visible={designer.systemSublayers.strings.visible}
            onToggleVisible={() => onPatchSystemSublayer("strings", { visible: !designer.systemSublayers.strings.visible })}
            locked={designer.systemSublayers.strings.locked}
            onToggleLocked={() => onPatchSystemSublayer("strings", { locked: !designer.systemSublayers.strings.locked })}
            expanded={expandedStringGroups.led_strings}
            onToggle={() => {
              setExpandedStringGroups((current) => ({ ...current, led_strings: !current.led_strings }));
            }}
            action={<button type="button" title="New Strings sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("strings", selectedIdsForScope("strings"))}><Plus className="h-3.5 w-3.5" /></button>}
          >
            <SublayeredLayerList
              designer={designer}
              scope="strings"
              searchActive={Boolean(normalizedSearch)}
              searchQuery={normalizedSearch}
              activeSublayerId={activeLayerTarget?.scope === "strings" ? activeLayerTarget.sublayerId : null}
              onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "strings", sublayerId })}
              ids={designer.routes.filter((route) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).map((route) => route.id)}
              selectedIds={selectedIdsForScope("strings")}
              sensors={sensors}
              disabled={designer.layers.strings.locked || designer.systemSublayers.strings.locked}
              onReorder={(activeId, overId) => onReorderItems("strings", activeId, overId)}
              onPatchSublayer={onPatchSublayer}
              onRemoveSublayer={onRemoveSublayer}
              onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("strings", ids, sublayerId, beforeId)}
            >
              {designer.routes.map((route, index) => ({ route, index })).filter(({ route, index }) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView) && matchesSearch(route.name, `${routeSummaries[index]?.pixels ?? 0} px`)).map(({ route, index }) => (
                <SortableLayerChildRow key={route.id} id={route.id} disabled={designer.layers.strings.locked}>
                  <LayerChildRow
                    label={route.name}
                    icon={Waypoints}
                    detail={`${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · ${route.designSurface === "front" ? "Front" : "Rear"} · ${routeSummaries[index]?.pixels ?? 0} px · ${routeSummaries[index]?.leds ?? 0} LEDs`}
                    selected={selectedRouteIds.includes(route.id)}
                    color="amber"
                    strongColor
                    visible={route.visible !== false}
                    onToggleVisible={() => onPatchRoute(route.id, { visible: route.visible === false })}
                    onClick={(event) => {
                      activateLayer("strings");
                      onSelect({ type: "route", id: route.id }, designerAdditiveSelectionRequested(event));
                    }}
                    onRename={(name) => onPatchRoute(route.id, { name })}
                    onOpenDetails={() => setDetails({ type: "route", id: route.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SublayeredLayerList>
          </RouteFolder>
          {matchesSearch(designer.controller.name, `${designer.controller.dataOutputs} outputs controller`) ? <RouteFolder
            label="Controller"
            icon={Cpu}
            iconClassName="text-slate-600"
            active={activeLayerTarget?.scope === "controller"}
            onActivate={() => onActivateLayerTarget({ scope: "controller", sublayerId: null })}
            order={3}
            count={1}
            expanded={expandedControllerGroup}
            onToggle={() => {
              setExpandedControllerGroup((current) => !current);
            }}
          >
            <LayerChildRow
              label={designer.controller.name}
              icon={Cpu}
              detail={`${designer.controller.dataOutputs} outputs`}
              selected={selection?.type === "controller"}
              visible={designer.layers.hardware.visible && designer.controller.visible !== false}
              onToggleVisible={() => onPatchController({ visible: !(designer.layers.hardware.visible && designer.controller.visible !== false) })}
              onClick={() => {
                activateLayer("hardware");
                onSelect({ type: "controller", id: designer.controller.id });
              }}
              onRename={(name) => onPatchController({ name })}
              onOpenDetails={() => setDetails({ type: "controller", id: designer.controller.id })}
            />
          </RouteFolder> : null}
        </LayerPanelSection>

        <LayerPanelSection
          label="Face Graphic"
          rootDropScope="faceGraphic"
          order={4}
          active={activeLayer === "faceGraphic"}
          expanded={expandedLayers.faceGraphic}
          layer={designer.layers.faceGraphic}
          onActivate={() => activateLayer("faceGraphic")}
          onToggle={() => toggleLayer("faceGraphic")}
          onChange={(patch) => onPatchLayer("faceGraphic", patch)}
          action={<>
            <button type="button" title="New Face Graphic sublayer" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => onAddSublayer("faceGraphic", selectedIdsForScope("faceGraphic"))}>
              <Plus className="h-3.5 w-3.5" />
            </button>
            <IconToggle
              active={faceGraphicVinylPreview}
              label={faceGraphicVinylPreview ? "Exit black and white vinyl preview" : "Preview vinyl in black and white"}
              onClick={onToggleFaceGraphicVinylPreview}
            >
              <Contrast className="h-3.5 w-3.5" />
            </IconToggle>
          </>}
        >
          <SublayeredLayerList
            designer={designer}
            scope="faceGraphic"
            searchActive={Boolean(normalizedSearch)}
            searchQuery={normalizedSearch}
            activeSublayerId={activeLayerTarget?.scope === "faceGraphic" ? activeLayerTarget.sublayerId : null}
            onActivateSublayer={(sublayerId) => onActivateLayerTarget({ scope: "faceGraphic", sublayerId })}
            ids={designer.faceGraphics.map((element) => element.id)}
            selectedIds={selectedIdsForScope("faceGraphic")}
            sensors={sensors}
            disabled={designer.layers.faceGraphic.locked}
            onReorder={(activeId, overId) => onReorderItems("faceGraphic", activeId, overId)}
            onPatchSublayer={onPatchSublayer}
            onRemoveSublayer={onRemoveSublayer}
            onAssignObjects={(ids, sublayerId, beforeId) => onAssignObjectsToSublayer("faceGraphic", ids, sublayerId, beforeId)}
          >
            {designer.faceGraphics.filter((element) => matchesSearch(element.name, `${element.passMode} ${element.filterColor}`)).map((element) => (
              <SortableLayerChildRow key={element.id} id={element.id} disabled={designer.layers.faceGraphic.locked || element.locked}>
                <LayerChildRow
                  label={element.name}
                  detail={`${element.passMode}${element.passMode === "translucent" ? ` · ${element.filterColor}` : ""}`}
                  selected={(selection?.type === "face_graphic" && selection.id === element.id) || selectedGeometryKeys.includes(`face_graphic:${element.id}`)}
                  color="violet"
                  strongColor
                  visible={element.visible}
                  locked={element.locked}
                  onToggleVisible={() => onPatchFaceGraphic(element.id, { visible: element.visible === false })}
                  onToggleLocked={() => onPatchFaceGraphic(element.id, { locked: !element.locked })}
                  onClick={(event) => { activateLayer("faceGraphic"); onSelect({ type: "face_graphic", id: element.id }, designerAdditiveSelectionRequested(event)); }}
                  onRename={element.locked ? undefined : (name) => onPatchFaceGraphic(element.id, { name })}
                />
              </SortableLayerChildRow>
            ))}
          </SublayeredLayerList>
          <TextRows designer={designer} targetLayer="faceGraphic" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchText} />
          <ProjectionRows designer={designer} targetLayer="faceGraphic" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchProjection} />
          <DerivedGeometryRows designer={designer} targetLayer="faceGraphic" selection={selection} selectedGeometryKeys={selectedGeometryKeys} matchesSearch={matchesSearch} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
        </LayerPanelSection>

        <LayerPanelSection
          label="Fabrication Plans"
          order={5}
          active={activeLayer === "fabrication"}
          expanded={expandedLayers.fabrication}
          layer={designer.layers.fabrication}
          onActivate={() => activateLayer("fabrication")}
          onToggle={() => toggleLayer("fabrication")}
          onChange={(patch) => onPatchLayer("fabrication", patch)}
          action={(
            <button type="button" title="New fabrication part" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={onAddFabricationPart}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
        >
          {designer.fabricationParts.filter((part) => matchesSearch(part.name, `${part.material} ${part.machiningSide}`)
            || designer.fabricationPaths.some((path) => path.partId === part.id && matchesSearch(path.name, path.operation))).map((part) => {
            const partMatches = matchesSearch(part.name, `${part.material} ${part.machiningSide}`);
            const paths = designer.fabricationPaths.filter((path) => path.partId === part.id && (partMatches || matchesSearch(path.name, path.operation)));
            const expanded = expandedFabricationParts[part.id] === true;
            return (
              <RouteFolder
                key={part.id}
                label={part.name}
                icon={Hammer}
                iconClassName="text-slate-600"
                count={paths.length}
                visible={part.visible}
                onToggleVisible={() => onPatchFabricationPart(part.id, { visible: !part.visible })}
                locked={part.locked}
                onToggleLocked={() => onPatchFabricationPart(part.id, { locked: !part.locked })}
                active={activeLayerTarget?.scope === "fabrication" && activeLayerTarget.fabricationPartId === part.id}
                onActivate={() => onSelect({ type: "fabrication_part", id: part.id })}
                expanded={expanded}
                onToggle={() => setExpandedFabricationParts((current) => ({ ...current, [part.id]: !expanded }))}
              >
                {paths.map((path) => (
                  <LayerChildRow
                    key={path.id}
                    label={path.name}
                    icon={Route}
                    detail={`${path.operation}${typeof path.depthMm === "number" ? ` · ${path.depthMm} mm` : ""}`}
                    selected={selection?.type === "fabrication_path" && selection.id === path.id}
                    color={path.operation === "pocket" ? "amber" : path.operation === "drill" ? "green" : path.operation === "engrave" ? "blue" : "slate"}
                    strongColor
                    visible={path.visible}
                    locked={path.locked}
                    onToggleVisible={() => onPatchFabricationPath(path.id, { visible: !path.visible })}
                    onToggleLocked={() => onPatchFabricationPath(path.id, { locked: !path.locked })}
                    onClick={() => { activateLayer("fabrication"); onSelect({ type: "fabrication_path", id: path.id }); }}
                    onRename={(name) => onPatchFabricationPath(path.id, { name })}
                  />
                ))}
              </RouteFolder>
            );
          })}
        </LayerPanelSection>
      </div>
      {details ? (
        <LayerDetailsDialog
          details={details}
          designer={designer}
          assets={assets}
          routeSummaries={routeSummaries}
          routeOutputs={routeOutputs}
          onClose={() => setDetails(null)}
          onPatchArtwork={onPatchArtwork}
          onPatchBuildArea={onPatchBuildArea}
          onPatchZone={onPatchZone}
          onPatchController={onPatchController}
          onPatchRoute={onPatchRoute}
        />
      ) : null}
    </aside>
  );
}

type DesignerLayerDetails = {
  type: "artwork" | "build_area" | "zone" | "controller" | "route";
  id: string;
};

function LayerPanelSection({
  label,
  rootDropScope,
  order,
  active,
  expanded,
  layer,
  visibilityMixed = false,
  lockMixed = false,
  children,
  action,
  onActivate,
  onToggle,
  onChange
}: {
  label: string;
  rootDropScope?: DesignerSublayerScope;
  order: number;
  active: boolean;
  expanded: boolean;
  layer: DesignerLayerSettings;
  visibilityMixed?: boolean;
  lockMixed?: boolean;
  children: React.ReactNode;
  action?: React.ReactNode;
  onActivate: () => void;
  onToggle: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <section role="treeitem" aria-expanded={expanded} className="shrink-0 border-b border-border/80" style={{ order }}>
      <div data-sublayer-root-drop={rootDropScope} className={`layer-tree-row flex h-8 items-center gap-1 border-l-2 px-2 data-[sublayer-root-over=true]:ring-1 data-[sublayer-root-over=true]:ring-inset data-[sublayer-root-over=true]:ring-blue-500 ${active ? "border-l-blue-600 bg-blue-500/10" : "border-l-transparent hover:bg-surface-hover"}`}>
        <button type="button" title={expanded ? `Collapse ${label}` : `Expand ${label}`} className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground hover:bg-card" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-body-sm font-semibold ${active ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`} onClick={onActivate} onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !expanded) { event.preventDefault(); onToggle(); }
          if (event.key === "ArrowLeft" && expanded) { event.preventDefault(); onToggle(); }
        }}>
          {label}
        </button>
        {action}
        <LayerOpacityControl label={label} value={layer.opacity} onChange={(opacity) => onChange({ opacity })} />
        <IconToggle active={layer.visible} mixed={visibilityMixed} label={visibilityMixed ? `Show all ${label}` : layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => onChange({ visible: visibilityMixed ? true : !layer.visible })}>
          {visibilityMixed ? <Minus className="h-3.5 w-3.5" /> : layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconToggle>
        <IconToggle active={layer.locked} mixed={lockMixed} stateTone={layer.locked ? "danger" : "success"} label={lockMixed ? `Lock all ${label}` : layer.locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onChange({ locked: lockMixed ? true : !layer.locked })}>
          {lockMixed ? <Minus className="h-3.5 w-3.5" /> : layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </IconToggle>
      </div>
      {expanded ? <div className="flex flex-col pb-1 pl-3 pr-1">{children}</div> : null}
    </section>
  );
}

function LayerOpacityControl({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const percent = Math.round(value * 100);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        title={`${label} opacity · ${percent}%`}
        aria-label={`${label} opacity`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-6 w-6 items-center justify-center rounded border ${open || percent < 100 ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "border-transparent bg-transparent text-muted-foreground hover:border-border-2 hover:bg-card"}`}
      >
        <Blend className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div className="absolute right-0 top-7 z-50 w-48 rounded-md border border-border-2 bg-card p-2 shadow-lg" role="dialog" aria-label={`${label} opacity control`}>
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Opacity</span>
            <span className="font-mono text-foreground">{percent}%</span>
          </div>
          <input
            className="h-5 w-full accent-blue-600"
            aria-label={`${label} opacity percentage`}
            type="range"
            min="10"
            max="100"
            step="5"
            value={percent}
            onChange={(event) => onChange(Number(event.target.value) / 100)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function AssemblySurfaceViewToggle({ value, onChange }: { value: DesignerRouteSurfaceView; onChange: (view: DesignerRouteSurfaceView) => void }) {
  const options = [
    { value: "front", label: "Front", icon: AlignEndHorizontal },
    { value: "rear", label: "Rear", icon: AlignStartHorizontal },
    { value: "both", label: "Both", icon: AlignVerticalJustifyCenter }
  ] as const;

  return (
    <div className="flex h-8 items-center rounded-md border border-border-2 bg-surface-2 p-0.5 shadow-sm" role="group" aria-label="Construction side visibility">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button key={option.value} type="button" title={`Show ${option.value === "both" ? "both construction sides" : `${option.value} construction side`}`} aria-pressed={value === option.value} className={`flex h-7 items-center gap-1 rounded px-1.5 text-[10px] font-semibold transition ${value === option.value ? "bg-blue-600 text-white shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground"}`} onClick={() => onChange(option.value)}>
            <Icon className="h-3.5 w-3.5" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function RouteFolder({
  label,
  icon: Icon = Layers3,
  iconClassName = "text-blue-600",
  rootDropScope,
  order,
  count,
  active = false,
  expanded,
  children,
  onToggle,
  onActivate,
  visible,
  onToggleVisible,
  locked,
  onToggleLocked,
  action
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  rootDropScope?: DesignerSublayerScope;
  order?: number;
  count: number;
  active?: boolean;
  expanded: boolean;
  children: React.ReactNode;
  onToggle: () => void;
  onActivate?: () => void;
  visible?: boolean;
  onToggleVisible?: () => void;
  locked?: boolean;
  onToggleLocked?: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div role="treeitem" aria-expanded={expanded} className="mt-0.5 border-l border-border/70" style={order === undefined ? undefined : { order }}>
      <div
        data-sublayer-root-drop={rootDropScope}
        className={`layer-tree-row flex h-8 items-center gap-1 border-l-2 pl-1 data-[sublayer-root-over=true]:bg-blue-500/10 data-[sublayer-root-over=true]:ring-1 data-[sublayer-root-over=true]:ring-inset data-[sublayer-root-over=true]:ring-blue-500 ${active ? "border-l-blue-600 bg-blue-500/10" : "border-l-transparent"}`}
      >
        <button
          type="button"
          title={expanded ? `Collapse ${label}` : `Expand ${label}`}
          className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconClassName}`} />
        <button type="button" className={`flex h-7 min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-body-sm font-semibold hover:bg-surface-hover ${active ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`} onClick={onActivate ?? onToggle} onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !expanded) { event.preventDefault(); onToggle(); }
          if (event.key === "ArrowLeft" && expanded) { event.preventDefault(); onToggle(); }
        }}>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="font-mono text-[10px]">{count}</span>
        </button>
        {typeof visible === "boolean" && onToggleVisible ? (
          <IconToggle active={visible} label={visible ? `Hide all ${label}` : `Show all ${label}`} onClick={onToggleVisible}>
            {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </IconToggle>
        ) : null}
        {typeof locked === "boolean" && onToggleLocked ? (
          <IconToggle active={locked} label={locked ? `Unlock ${label}` : `Lock ${label}`} onClick={onToggleLocked}>
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </IconToggle>
        ) : null}
        {action ? <div className="flex shrink-0 items-center gap-1 pr-1">{action}</div> : null}
      </div>
      {expanded ? <div className="pl-2">{children}</div> : null}
    </div>
  );
}

function EffectTargetsSection({ groups, zones, channels, searchQuery, expanded, active, selectedMember, onActivate, onToggleExpanded, onAdd, onPatchGroup, onRemoveGroup, onToggleGroupMember, onSelectMember }: {
  groups: DesignerGroupForm[];
  zones: DesignerZoneForm[];
  channels: DesignerChannelForm[];
  searchQuery: string;
  expanded: boolean;
  active: boolean;
  selectedMember?: { type: "zone" | "channel"; id: string };
  onActivate: () => void;
  onToggleExpanded: () => void;
  onAdd: () => void;
  onPatchGroup: (groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, memberType: "zone" | "channel" | "group", memberId: string) => void;
  onSelectMember: (memberType: "zone" | "channel", memberId: string) => void;
}) {
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const visibleGroups = searchQuery
    ? groups.filter((group) => group.name.toLowerCase().includes(searchQuery) || group.members.some((member) => {
      const label = member.type === "zone" ? zoneById.get(member.id)?.name : member.type === "channel" ? channelById.get(member.id)?.name : groups.find((candidate) => candidate.id === member.id)?.name;
      return label?.toLowerCase().includes(searchQuery);
    }))
    : groups;
  return <RouteFolder
    label="Effect targets"
    icon={Sparkles}
    iconClassName="text-violet-600"
    active={active}
    onActivate={onActivate}
    count={groups.length}
    expanded={expanded}
    onToggle={onToggleExpanded}
    action={<button type="button" title="New effect target" className="flex h-6 w-6 items-center justify-center rounded text-blue-700 hover:bg-surface-hover" onClick={() => { if (!expanded) onToggleExpanded(); onAdd(); }}>
      <Plus className="h-3.5 w-3.5" />
    </button>}
  >
    {visibleGroups.map((group) => <EffectTargetDropRow
      key={group.id}
      group={group}
      groups={groups}
      zones={zones}
      channels={channels}
      searchQuery={searchQuery}
      selectedMember={selectedMember}
      onActivate={onActivate}
      onPatch={(patch) => onPatchGroup(group.id, patch)}
      onRemove={() => onRemoveGroup(group.id)}
      onRemoveMember={(type, id) => onToggleGroupMember(group.id, type, id)}
      onSelectMember={onSelectMember}
    />)}
  </RouteFolder>;
}

function EffectTargetDropRow({ group, groups, zones, channels, searchQuery, selectedMember, onActivate, onPatch, onRemove, onRemoveMember, onSelectMember }: {
  group: DesignerGroupForm;
  groups: DesignerGroupForm[];
  zones: DesignerZoneForm[];
  channels: DesignerChannelForm[];
  searchQuery: string;
  selectedMember?: { type: "zone" | "channel"; id: string };
  onActivate: () => void;
  onPatch: (patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) => void;
  onRemove: () => void;
  onRemoveMember: (type: "zone" | "channel" | "group", id: string) => void;
  onSelectMember: (type: "zone" | "channel", id: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `effect-target-drop:${group.id}` });
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);
  const searchExpansionSnapshotRef = useRef<boolean | null>(null);
  useEffect(() => setName(group.name), [group.name]);
  useEffect(() => {
    if (searchQuery && searchExpansionSnapshotRef.current === null) {
      searchExpansionSnapshotRef.current = expanded;
      setExpanded(true);
    } else if (!searchQuery && searchExpansionSnapshotRef.current !== null) {
      setExpanded(searchExpansionSnapshotRef.current);
      searchExpansionSnapshotRef.current = null;
    }
  }, [searchQuery]);
  useEffect(() => {
    if (!isOver || expanded) return;
    const timer = window.setTimeout(() => setExpanded(true), 650);
    return () => window.clearTimeout(timer);
  }, [expanded, isOver]);
  const commit = () => {
    const nextName = name.trim();
    if (nextName && nextName !== group.name) onPatch({ name: nextName });
    else setName(group.name);
    setRenaming(false);
  };
  const zoneById = new Map(zones.map((zone) => [zone.id, zone]));
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const groupById = new Map(groups.map((entry) => [entry.id, entry]));
  const groupMatchesSearch = !searchQuery || group.name.toLowerCase().includes(searchQuery);
  const visibleMembers = group.members.filter((member) => groupMatchesSearch || (member.type === "zone" ? zoneById.get(member.id)?.name : member.type === "channel" ? channelById.get(member.id)?.name : groupById.get(member.id)?.name)?.toLowerCase().includes(searchQuery));
  return <div role="treeitem" aria-expanded={expanded} className="ml-2 border-l border-border/80">
    <div ref={setNodeRef} className={`layer-tree-row group flex h-8 items-center gap-1 border-l-2 border-l-transparent pl-1 pr-0.5 hover:bg-surface-hover ${isOver ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500" : ""}`}>
      <button type="button" className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground" title={expanded ? `Collapse ${group.name}` : `Expand ${group.name}`} onClick={() => setExpanded((current) => !current)}>
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-violet-600" />
      {renaming ? <input
        autoFocus
        value={name}
        aria-label="Effect target name"
        className="h-6 min-w-0 flex-1 rounded border border-blue-500 bg-card px-1.5 text-body-sm outline-none"
        onChange={(event) => setName(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") { setName(group.name); setRenaming(false); }
        }}
      /> : <button type="button" className="min-w-0 flex-1 truncate text-left text-body-sm font-medium" title={`${group.name} · double-click to rename · drop Zones or Channels here`} onClick={onActivate} onDoubleClick={() => setRenaming(true)}>{group.name}</button>}
      <span className="font-mono text-[10px] text-muted-foreground">{group.members.length}</span>
      <button type="button" title={`Delete ${group.name}`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100" onClick={onRemove}>
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
    {expanded ? <div className="pl-3">
      {visibleMembers.map((member) => {
        const zone = member.type === "zone" ? zoneById.get(member.id) : undefined;
        const channel = member.type === "channel" ? channelById.get(member.id) : undefined;
        const nested = member.type === "group" ? groupById.get(member.id) : undefined;
        const label = zone?.name ?? channel?.name ?? (nested ? `Target · ${nested.name}` : member.id);
        const selected = member.type !== "group" && selectedMember?.type === member.type && selectedMember.id === member.id;
        const MemberIcon = member.type === "channel" ? Waves : member.type === "group" ? Sparkles : CircleDot;
        return <div key={`${member.type}:${member.id}`} className={`group/member flex h-7 items-center gap-1 rounded pl-2 pr-0.5 text-body-sm ${selected ? "bg-blue-600 text-white" : "hover:bg-surface-hover"}`}>
          <MemberIcon className={`h-3 w-3 shrink-0 ${selected ? "" : member.type === "channel" ? "text-amber-600" : member.type === "group" ? "text-violet-600" : "text-sky-600"}`} />
          <button type="button" className="min-w-0 flex-1 truncate text-left" disabled={member.type === "group" || !zone && !channel} onClick={() => member.type !== "group" && (zone || channel) && onSelectMember(member.type, member.id)}>{label}</button>
          <button type="button" title={`Remove ${label} from ${group.name}`} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-0 group-hover/member:opacity-100 ${selected ? "hover:bg-white/20" : "text-muted-foreground hover:bg-red-500/10 hover:text-red-600"}`} onClick={() => onRemoveMember(member.type, member.id)}>
            <X className="h-3 w-3" />
          </button>
        </div>;
      })}
    </div> : null}
  </div>;
}

function SortableLayerList({
  ids,
  sensors,
  disabled,
  children,
  onReorder
}: {
  ids: string[];
  sensors: ReturnType<typeof useSensors>;
  disabled?: boolean;
  children: React.ReactNode;
  onReorder: (activeId: string, overId: string) => void;
}) {
  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    if (!overId || activeId === overId) return;
    if (disabled) return;
    onReorder(activeId, overId);
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        <div>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

function SublayerDropRow({
  sublayer,
  active,
  expanded,
  onToggle,
  onActivate,
  onPatch,
  onRemove,
  children
}: {
  sublayer: DesignerSublayerForm;
  active: boolean;
  expanded: boolean;
  onToggle: () => void;
  onActivate: () => void;
  onPatch: (patch: Partial<Pick<DesignerSublayerForm, "name" | "visible" | "locked">>) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `sublayer-drop:${sublayer.id}` });
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(sublayer.name);
  useEffect(() => setName(sublayer.name), [sublayer.name]);
  useEffect(() => {
    if (!isOver || expanded) return;
    const timer = window.setTimeout(onToggle, 650);
    return () => window.clearTimeout(timer);
  }, [expanded, isOver, onToggle]);
  const commit = () => {
    const nextName = name.trim();
    if (nextName && nextName !== sublayer.name) onPatch({ name: nextName });
    else setName(sublayer.name);
    setRenaming(false);
  };
  return (
    <div role="treeitem" aria-expanded={expanded} className="ml-2 border-l border-border/80">
      <div ref={setNodeRef} className={`layer-tree-row group flex h-8 items-center gap-1 border-l-2 pl-1 pr-0.5 hover:bg-surface-hover ${active ? "border-l-blue-600 bg-blue-500/10" : "border-l-transparent"} ${isOver ? "bg-blue-500/10 ring-1 ring-inset ring-blue-500" : ""}`}>
        <button type="button" className="flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground" title={expanded ? `Collapse ${sublayer.name}` : `Expand ${sublayer.name}`} onClick={onToggle}>
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <Layers3 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
        {renaming ? <input
          autoFocus
          value={name}
          aria-label="Sublayer name"
          className="h-6 min-w-0 flex-1 rounded border border-blue-500 bg-card px-1.5 text-body-sm outline-none"
          onChange={(event) => setName(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") { setName(sublayer.name); setRenaming(false); }
          }}
        /> : <button type="button" className={`min-w-0 flex-1 truncate text-left text-body-sm font-medium ${active ? "text-blue-700 dark:text-blue-300" : ""}`} title={`${sublayer.name} · double-click to rename`} onClick={onActivate} onDoubleClick={() => setRenaming(true)} onKeyDown={(event) => {
          if (event.key === "ArrowRight" && !expanded) { event.preventDefault(); onToggle(); }
          if (event.key === "ArrowLeft" && expanded) { event.preventDefault(); onToggle(); }
        }}>{sublayer.name}</button>}
        <span className="font-mono text-[10px] text-muted-foreground">{sublayer.objectIds.length}</span>
        <button type="button" title={sublayer.visible ? `Hide ${sublayer.name}` : `Show ${sublayer.name}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${layerVisibilityStateClass(sublayer.visible)}`} onClick={() => onPatch({ visible: !sublayer.visible })}>
          {sublayer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title={sublayer.locked ? `Unlock ${sublayer.name}` : `Lock ${sublayer.name}`} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${layerLockStateClass(sublayer.locked)}`} onClick={() => onPatch({ locked: !sublayer.locked })}>
          {sublayer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
        <button type="button" title={`Delete ${sublayer.name}; objects return to the parent layer`} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded ? <div className="pl-2">{children}</div> : null}
    </div>
  );
}

function SublayerRootDropTarget({ scope, children }: { scope: DesignerSublayerScope; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id: `sublayer-root:${scope}` });

  useEffect(() => {
    const header = document.querySelector<HTMLElement>(`[data-sublayer-root-drop="${scope}"]`);
    setNodeRef(header);
    return () => setNodeRef(null);
  }, [scope, setNodeRef]);

  useEffect(() => {
    const header = document.querySelector<HTMLElement>(`[data-sublayer-root-drop="${scope}"]`);
    if (!header) return;
    if (isOver) header.dataset.sublayerRootOver = "true";
    else delete header.dataset.sublayerRootOver;
    return () => { delete header.dataset.sublayerRootOver; };
  }, [isOver, scope]);

  return <>{children}</>;
}

function SublayeredLayerList({
  designer,
  scope,
  searchActive,
  searchQuery,
  activeSublayerId,
  ids,
  selectedIds,
  sensors,
  disabled,
  children,
  onReorder,
  onPatchSublayer,
  onRemoveSublayer,
  onAssignObjects,
  onActivateSublayer,
  withinDndContext = false
}: {
  designer: DesignerForm;
  scope: DesignerSublayerScope;
  searchActive: boolean;
  searchQuery: string;
  activeSublayerId: string | null;
  ids: string[];
  selectedIds: string[];
  sensors: ReturnType<typeof useSensors>;
  disabled?: boolean;
  children: React.ReactNode;
  onReorder: (activeId: string, overId: string) => void;
  onPatchSublayer: (sublayerId: string, patch: Partial<Pick<DesignerSublayerForm, "name" | "visible" | "locked">>) => void;
  onRemoveSublayer: (sublayerId: string) => void;
  onAssignObjects: (objectIds: string[], sublayerId: string | null, beforeObjectId?: string) => void;
  onActivateSublayer: (sublayerId: string) => void;
  withinDndContext?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeDragIds, setActiveDragIds] = useState<string[]>([]);
  const [dragMessage, setDragMessage] = useState("");
  const sublayers = designerSublayersInScope(designer, scope);
  const selectedKey = [...selectedIds].sort().join("\u0000");
  const previousSelectedKeyRef = useRef("");
  const searchExpansionSnapshotRef = useRef<Record<string, boolean> | null>(null);

  useEffect(() => {
    if (searchActive && !searchExpansionSnapshotRef.current) {
      searchExpansionSnapshotRef.current = expanded;
      setExpanded(Object.fromEntries(sublayers.map((sublayer) => [sublayer.id, true])));
      return;
    }
    if (!searchActive && searchExpansionSnapshotRef.current) {
      setExpanded(searchExpansionSnapshotRef.current);
      searchExpansionSnapshotRef.current = null;
    }
  }, [searchActive]);

  useEffect(() => {
    if (previousSelectedKeyRef.current === selectedKey) return;
    previousSelectedKeyRef.current = selectedKey;
    if (!selectedKey) return;
    const selected = new Set(selectedIds);
    const containingIds = sublayers
      .filter((sublayer) => sublayer.objectIds.some((id) => selected.has(id)))
      .map((sublayer) => sublayer.id);
    if (!containingIds.length) return;
    setExpanded((current) => {
      const next = { ...current };
      let changed = false;
      for (const id of containingIds) {
        if (next[id] === true) continue;
        next[id] = true;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [selectedKey, selectedIds, sublayers]);

  const rendered = new Map<string, React.ReactNode>();
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const id = String((child.props as { id?: string }).id ?? "");
    if (id) rendered.set(id, child);
  });
  const existing = new Set(ids);
  const assigned = new Set(sublayers.flatMap((entry) => entry.objectIds).filter((id) => existing.has(id)));
  const rootIds = ids.filter((id) => !assigned.has(id));
  const visibleSublayers = searchActive
    ? sublayers.filter((sublayer) => sublayer.name.toLowerCase().includes(searchQuery) || sublayer.objectIds.some((id) => rendered.has(id)))
    : sublayers;

  function handleDragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : "";
    setActiveDragIds([]);
    if (!overId || activeId === overId) return;
    if (disabled || designerSublayerForObject(designer, scope, activeId)?.locked) return;
    const moving = selectedIds.includes(activeId) ? selectedIds.filter((id) => existing.has(id)) : [activeId];
    if (overId === `sublayer-root:${scope}`) {
      onAssignObjects(moving, null);
      setDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} to the root layer.`);
      return;
    }
    if (overId.startsWith("sublayer-drop:")) {
      onAssignObjects(moving, overId.slice("sublayer-drop:".length));
      setDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} to a sublayer.`);
      return;
    }
    const activeLayer = designerSublayerForObject(designer, scope, activeId)?.id ?? null;
    const overLayer = designerSublayerForObject(designer, scope, overId)?.id ?? null;
    if (activeLayer !== overLayer) {
      onAssignObjects(moving, overLayer, overId);
      setDragMessage(`Moved ${moving.length} object${moving.length === 1 ? "" : "s"} between layers.`);
    } else {
      onReorder(activeId, overId);
      setDragMessage("Layer order changed.");
    }
  }

  const rows = (rowIds: string[], locked = false) => <SortableContext items={rowIds} strategy={verticalListSortingStrategy} disabled={disabled || locked}>
    <div>{rowIds.map((id) => rendered.get(id))}</div>
  </SortableContext>;

  const content = <>
    {visibleSublayers.map((sublayer) => {
      const members = new Set(sublayer.objectIds);
      const rowIds = ids.filter((id) => members.has(id));
      return <SublayerDropRow
        key={sublayer.id}
        sublayer={sublayer}
        active={activeSublayerId === sublayer.id}
        expanded={expanded[sublayer.id] === true}
        onToggle={() => setExpanded((current) => ({ ...current, [sublayer.id]: current[sublayer.id] !== true }))}
        onActivate={() => onActivateSublayer(sublayer.id)}
        onPatch={(patch) => onPatchSublayer(sublayer.id, patch)}
        onRemove={() => onRemoveSublayer(sublayer.id)}
      >
        {rows(rowIds, sublayer.locked)}
      </SublayerDropRow>;
    })}
    <SublayerRootDropTarget scope={scope}>
      {rows(rootIds)}
    </SublayerRootDropTarget>
  </>;

  if (withinDndContext) return content;

  return <DndContext
    sensors={sensors}
    collisionDetection={closestCenter}
    onDragStart={(event) => {
      const activeId = String(event.active.id);
      setActiveDragIds(selectedIds.includes(activeId) ? selectedIds.filter((id) => existing.has(id)) : [activeId]);
      setDragMessage("");
    }}
    onDragCancel={() => setActiveDragIds([])}
    onDragEnd={handleDragEnd}
  >
    {content}
    <DragOverlay>{activeDragIds.length ? <div className="rounded-md border border-blue-500 bg-card px-3 py-2 text-body-sm font-medium shadow-xl">{activeDragIds.length === 1 ? "Move object" : `Move ${activeDragIds.length} objects`}</div> : null}</DragOverlay>
    <span className="sr-only" aria-live="polite">{dragMessage}</span>
  </DndContext>;
}

function WorkLineRows({ designer, selection, matchesSearch, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  selection: DesignerSelection;
  matchesSearch: (label: string, detail?: string) => boolean;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection) => void;
  onPatch: (workLineId: string, patch: Partial<Pick<DesignerWorkLineForm, "name" | "layer" | "points">>) => void;
}) {
  const lines = designer.workLines.filter((line) => matchesSearch(line.name, "work line construction reference"));
  if (!lines.length) return null;
  return (
    <div className="border-t border-border-2 py-1">
      {lines.map((line) => <LayerChildRow
        key={line.id}
        label={line.name}
        detail={`Continuous reference · ${line.points.length} points`}
        selected={selection?.type === "work_line" && selection.id === line.id}
        color="green"
        icon={SquareCenterlineDashedVertical}
        onClick={() => { onActivate(); onSelect({ type: "work_line", id: line.id }); }}
        onRename={(name) => onPatch(line.id, { name })}
      />)}
    </div>
  );
}

function TextRows({ designer, targetLayer, selection, matchesSearch, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  matchesSearch: (label: string, detail?: string) => boolean;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection) => void;
  onPatch: (textId: string, patch: Partial<DesignerText>) => void;
}) {
  const texts = designer.texts.filter((text) => text.targetLayer === targetLayer && matchesSearch(text.name, text.text));
  if (!texts.length) return null;
  return (
    <div className="py-0.5">
      {texts.map((text) => <LayerChildRow
        key={text.id}
        label={text.name}
        detail={`${text.fontSizeMm} mm · ${text.text.replace(/\s+/g, " ").slice(0, 24) || "Empty"}`}
        selected={selection?.type === "text" && selection.id === text.id}
        color="violet"
        icon={Type}
        visible={text.visible}
        locked={text.locked}
        onToggleVisible={() => onPatch(text.id, { visible: !text.visible })}
        onToggleLocked={() => onPatch(text.id, { locked: !text.locked })}
        onClick={() => { onActivate(); onSelect({ type: "text", id: text.id }); }}
        onRename={text.locked ? undefined : (name) => onPatch(text.id, { name })}
      />)}
    </div>
  );
}

function ProjectionRows({ designer, targetLayer, selection, selectedGeometryKeys, matchesSearch, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  matchesSearch: (label: string, detail?: string) => boolean;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onPatch: (projectionId: string, patch: Partial<DesignerProjection>) => void;
}) {
  const projections = designer.projections.filter((projection) => projection.targetLayer === targetLayer && matchesSearch(projection.name, "projected linked geometry"));
  if (!projections.length) return null;
  return (
    <div className="py-0.5">
      {projections.map((projection) => {
        const issue = resolveDesignerProjectionGeometry(designer, projection.id).issue;
        return <LayerChildRow
          key={projection.id}
          label={projection.name}
          detail={issue === "cycle" ? "Invalid cycle" : issue === "broken" ? "Broken reference" : issue === "collapsed" ? "Source collapsed" : issue === "invalid-topology" ? "Invalid source" : "Linked · read only"}
          selected={(selection?.type === "projection" && selection.id === projection.id) || selectedGeometryKeys.includes(`projection:${projection.id}`)}
          color="blue"
          icon={Spline}
          visible={projection.visible}
          onToggleVisible={() => onPatch(projection.id, { visible: !projection.visible })}
          onClick={(event) => { onActivate(); onSelect({ type: "projection", id: projection.id }, designerAdditiveSelectionRequested(event)); }}
          onRename={(name) => onPatch(projection.id, { name })}
        />;
      })}
    </div>
  );
}

function DerivedGeometryRows({ designer, targetLayer, selection, selectedGeometryKeys, matchesSearch, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  matchesSearch: (label: string, detail?: string) => boolean;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onPatch: (derivedId: string, patch: Partial<DesignerDerivedGeometry>) => void;
}) {
  const operations = designer.derivedGeometries.filter((operation) => operation.targetLayer === targetLayer && matchesSearch(operation.name, operation.operation));
  if (!operations.length) return null;
  return (
    <div className="py-0.5">
      {operations.map((operation) => {
        const resolution = resolveDesignerDerivedGeometry(designer, operation.id);
        const detail = resolution.issue === "cycle" ? "Invalid cycle"
          : resolution.issue === "broken" ? "Broken source"
            : resolution.issue === "collapsed" ? "Collapsed profile"
              : resolution.issue === "invalid-topology" ? "Invalid topology"
                : `${operation.operation} · live`;
        return <LayerChildRow
          key={operation.id}
          label={operation.name}
          detail={detail}
          selected={(selection?.type === "derived_geometry" && selection.id === operation.id) || selectedGeometryKeys.includes(`derived_geometry:${operation.id}`)}
          color="amber"
          icon={operation.operation === "offset" ? CornerDownRight : CircleDot}
          visible={operation.visible}
          onToggleVisible={() => onPatch(operation.id, { visible: !operation.visible })}
          onClick={(event) => { onActivate(); onSelect({ type: "derived_geometry", id: operation.id }, designerAdditiveSelectionRequested(event)); }}
          onRename={(name) => onPatch(operation.id, { name })}
        />;
      })}
    </div>
  );
}

function SortableLayerChildRow({ id, disabled, children }: { id: string; disabled?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  if (!isValidElement(children)) return null;
  return (
    <div ref={setNodeRef} style={style} className={`${isDragging ? "relative z-20 opacity-40" : ""} ${isOver && !isDragging ? "border-t-2 border-blue-500" : ""}`}>
      {cloneElement(children as ReactElement<LayerChildRowProps>, {
        dragAttributes: attributes,
        dragListeners: listeners,
        dragging: isDragging,
        dragDisabled: disabled
      })}
    </div>
  );
}

type LayerChildRowProps = {
  label: string;
  detail?: string;
  selected?: boolean;
  color?: "slate" | "green" | "amber" | "blue" | "violet";
  strongColor?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  dragAttributes?: ReturnType<typeof useSortable>["attributes"];
  dragListeners?: ReturnType<typeof useSortable>["listeners"];
  dragging?: boolean;
  dragDisabled?: boolean;
  visible?: boolean;
  locked?: boolean;
  onToggleVisible?: () => void;
  onToggleLocked?: () => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onRename?: (name: string) => void;
  onOpenDetails?: () => void;
  lightingCount?: number;
  onOpenLighting?: () => void;
};

function LayerChildRow({
  label,
  detail,
  selected,
  color = "slate",
  strongColor = false,
  icon: Icon,
  dragAttributes,
  dragListeners,
  dragging,
  dragDisabled,
  visible,
  locked,
  onToggleVisible,
  onToggleLocked,
  onClick,
  onRename,
  onOpenDetails,
  lightingCount,
  onOpenLighting
}: LayerChildRowProps) {
  const colorClass = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-400" : color === "blue" ? "bg-sky-500" : color === "violet" ? "bg-violet-500" : "bg-slate-400";
  const iconColorClass = color === "green" ? "text-emerald-600" : color === "amber" ? "text-amber-600" : color === "blue" ? "text-sky-600" : color === "violet" ? "text-violet-600" : "text-slate-500";
  const rowToneClass = !strongColor || selected ? "" : color === "green"
    ? "border-l-emerald-500"
    : color === "amber"
      ? "border-l-amber-500"
      : color === "blue"
        ? "border-l-sky-500"
        : color === "violet"
          ? "border-l-violet-500"
          : "border-l-slate-400";
  const strongColorClass = color === "green"
    ? "border-emerald-500 bg-emerald-100 text-emerald-800"
    : color === "amber"
      ? "border-amber-500 bg-amber-100 text-amber-900"
      : color === "blue"
        ? "border-sky-500 bg-sky-100 text-sky-800"
        : color === "violet"
          ? "border-violet-500 bg-violet-100 text-violet-800"
          : "border-slate-400 bg-slate-100 text-slate-700";
  const rowRef = useRef<HTMLDivElement | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(label);

  useEffect(() => setDraftName(label), [label]);
  useEffect(() => {
    if (!selected) return;
    rowRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);

  function commitName() {
    const name = draftName.trim();
    if (name && name !== label) onRename?.(name);
    else setDraftName(label);
    setEditingName(false);
  }

  return (
    <div ref={rowRef} role="treeitem" aria-selected={selected} className={`group border-l-2 ${strongColor ? "border-l-4" : ""} ${selected ? "border-blue-500 bg-blue-600 text-white" : `border-transparent hover:bg-surface-hover ${rowToneClass}`} ${dragging ? "relative z-20 shadow-md ring-2 ring-blue-300" : ""}`}>
      <div className="layer-object-row flex min-h-9 items-center gap-1 px-1.5 py-0.5">
        {dragAttributes && dragListeners ? (
          <button
            type="button"
            title={`Move ${label}`}
            disabled={dragDisabled}
            className={`flex h-6 w-4 shrink-0 cursor-grab items-center justify-center rounded active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${selected ? "text-white/80 hover:bg-white/15" : "text-muted-foreground hover:bg-card hover:text-foreground"}`}
            {...dragAttributes}
            {...dragListeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {Icon ? <Icon className={`h-3.5 w-3.5 shrink-0 ${selected ? "text-white" : iconColorClass}`} /> : strongColor ? (
          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${selected ? "border-white bg-white text-blue-700" : strongColorClass}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${selected ? colorClass : colorClass}`} />
          </span>
        ) : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${selected ? "bg-white" : colorClass}`} />}
        {editingName ? (
          <input
            autoFocus
            className="h-6 min-w-0 flex-1 rounded border border-blue-500 bg-card px-1.5 text-body-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-blue-200"
            value={draftName}
            aria-label="Object name"
            onChange={(event) => setDraftName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraftName(label);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button type="button" className="min-w-0 flex-1 text-left" title={detail ? `${label} · ${detail}` : label} onClick={onClick} onDoubleClick={onOpenDetails}>
            <span className={`block whitespace-normal break-words text-body-sm font-medium leading-4 ${selected ? "text-white" : "text-foreground"}`}>{label}</span>
            {detail ? <span className={`layer-object-detail block truncate text-[10px] leading-3 ${selected ? "text-white/70" : "text-muted-foreground"}`}>{detail}</span> : null}
          </button>
        )}
        {onOpenLighting ? (
          <button
            type="button"
            title={lightingCount ? `Open lighting setup · ${lightingCount} configured` : "Configure lighting setup"}
            aria-label={lightingCount ? `Open lighting setup for ${label}, ${lightingCount} configured` : `Configure lighting setup for ${label}`}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${selected ? "border-white/30 text-white hover:bg-white/15" : lightingCount ? "border-amber-400/70 bg-amber-400/10 text-amber-600 hover:bg-amber-400/20" : "border-border-2 text-muted-foreground hover:bg-card hover:text-amber-600"}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenLighting();
            }}
          >
            <Lightbulb className="h-4 w-4" />
          </button>
        ) : null}
        {onToggleVisible ? (
          <button
            type="button"
            title={visible === false ? `Show ${label}` : `Hide ${label}`}
            aria-pressed={visible !== false}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${layerVisibilityStateClass(visible !== false)}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggleVisible();
            }}
          >
            {visible === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {onToggleLocked ? (
          <button
            type="button"
            title={locked ? `Unlock ${label}` : `Lock ${label}`}
            aria-pressed={locked === true}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${layerLockStateClass(locked === true)}`}
            onClick={(event) => { event.stopPropagation(); onToggleLocked(); }}
          >
            {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
        ) : null}
        {onRename && !editingName ? (
          <button
            type="button"
            title={`Rename ${label}`}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent opacity-0 transition group-hover:opacity-100 ${selected ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:border-border-2 hover:bg-card hover:text-blue-700"}`}
            onClick={() => setEditingName(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onOpenDetails ? (
          <button
            type="button"
            title={`Open details for ${label}`}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent opacity-0 transition group-hover:opacity-100 ${selected ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:border-border-2 hover:bg-card hover:text-blue-700"}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetails();
            }}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LayerDetailsDialog({
  details,
  designer,
  assets,
  routeSummaries,
  routeOutputs,
  onClose,
  onPatchArtwork,
  onPatchBuildArea,
  onPatchZone,
  onPatchController,
  onPatchRoute
}: {
  details: DesignerLayerDetails;
  designer: DesignerForm;
  assets: Array<{ id: string; fileName: string; mimeType: string }>;
  routeSummaries: DesignerRouteSummary[];
  routeOutputs: Map<string, number>;
  onClose: () => void;
  onPatchArtwork: (artworkId: string, patch: Partial<DesignerArtworkForm>) => void;
  onPatchBuildArea: (buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchZone: (zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchController: (patch: Pick<DesignerForm["controller"], "name">) => void;
  onPatchRoute: (routeId: string, patch: Pick<DesignerForm["routes"][number], "name">) => void;
}) {
  const routeIndex = details.type === "route" ? designer.routes.findIndex((route) => route.id === details.id) : -1;
  const item =
    details.type === "artwork" ? designer.artwork.find((entry) => entry.id === details.id) :
    details.type === "build_area" ? designer.buildAreas.find((entry) => entry.id === details.id) :
    details.type === "zone" ? designer.zones.find((entry) => entry.id === details.id) :
    details.type === "route" ? designer.routes[routeIndex] :
    designer.controller.id === details.id ? designer.controller : undefined;

  if (!item) return null;

  const name = "name" in item ? item.name : "";
  const title = details.type === "build_area" ? "Reference detail" : `${details.type.replace("_", " ")} detail`;
  const fields = detailFields(details, designer, assets, routeSummaries, routeOutputs, routeIndex);

  function rename(nextName: string) {
    if (!nextName.trim()) return;
    if (details.type === "artwork") onPatchArtwork(details.id, { name: nextName });
    if (details.type === "build_area") onPatchBuildArea(details.id, { name: nextName });
    if (details.type === "zone") onPatchZone(details.id, { name: nextName });
    if (details.type === "controller") onPatchController({ name: nextName });
    if (details.type === "route") onPatchRoute(details.id, { name: nextName });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-border-2 bg-card shadow-xl">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div>
            <div className="text-body-sm font-semibold capitalize">{title}</div>
            <div className="font-mono text-[11px] uppercase text-muted-foreground">{details.id}</div>
          </div>
          <button type="button" title="Close" className="flex h-8 w-8 items-center justify-center rounded-md border border-border-2 text-muted-foreground hover:bg-surface-hover" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">Name</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-body-md font-medium outline-none focus:ring-2 focus:ring-blue-500"
              value={name}
              onChange={(event) => rename(event.target.value)}
            />
          </label>
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            {fields.map((field) => (
              <div key={field.label} className="grid grid-cols-[140px_minmax(0,1fr)] border-b border-border last:border-b-0">
                <div className="bg-surface-2 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">{field.label}</div>
                <div className="min-w-0 break-words px-3 py-2 font-mono text-body-sm text-foreground">{field.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function detailFields(
  details: DesignerLayerDetails,
  designer: DesignerForm,
  assets: Array<{ id: string; fileName: string; mimeType: string }>,
  routeSummaries: DesignerRouteSummary[],
  routeOutputs: Map<string, number>,
  routeIndex: number
) {
  if (details.type === "artwork") {
    const artwork = designer.artwork.find((entry) => entry.id === details.id);
    const asset = assets.find((entry) => entry.id === artwork?.assetId);
    return [
      { label: "Type", value: "Artwork reference" },
      { label: "Asset", value: asset?.fileName ?? "Missing asset" },
      { label: "Size", value: `${formatDecimal(artwork?.width ?? 0)} x ${formatDecimal(artwork?.height ?? 0)} cm` }
    ];
  }
  if (details.type === "build_area") {
    const buildArea = designer.buildAreas.find((entry) => entry.id === details.id);
    return [
      { label: "Type", value: "Reference geometry" },
      { label: "Shape", value: buildArea?.shape ?? "" },
      { label: "Size", value: `${formatDecimal(buildArea?.width ?? 0)} x ${formatDecimal(buildArea?.height ?? 0)} cm` },
      { label: "Points", value: String(buildArea?.points?.length ?? 0) }
    ];
  }
  if (details.type === "zone") {
    const zone = designer.zones.find((entry) => entry.id === details.id);
    return [
      { label: "Type", value: "Effect target zone" },
      { label: "Shape", value: zone?.shape ?? "" },
      { label: "Size", value: `${formatDecimal(zone?.width ?? 0)} x ${formatDecimal(zone?.height ?? 0)} cm` },
      { label: "Points", value: String(zone?.points?.length ?? 0) }
    ];
  }
  if (details.type === "controller") {
    return [
      { label: "Type", value: "Controller" },
      { label: "Outputs", value: String(designer.controller.dataOutputs) }
    ];
  }
  const route = designer.routes[routeIndex];
  const summary = routeSummaries[routeIndex];
  return [
    { label: "Type", value: route?.kind === "data_cable" ? "Data cable" : "LED string" },
    { label: "Output", value: routeOutputs.get(details.id) ? `Out ${routeOutputs.get(details.id)}` : "Unassigned" },
    { label: "Route points", value: String(route?.points.length ?? 0) },
    { label: "Length", value: `${formatDecimal(summary?.lengthCm ?? 0)} cm` },
    { label: "Pixels", value: String(summary?.pixels ?? 0) },
    { label: "LEDs", value: String(summary?.leds ?? 0) }
  ];
}

function IconToggle({ active, mixed = false, selected, compact, stateTone, label, children, onClick }: { active: boolean; mixed?: boolean; selected?: boolean; compact?: boolean; stateTone?: "danger" | "success"; label: string; children: React.ReactNode; onClick: () => void }) {
  const stateClass = mixed
    ? "border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
    : stateTone === "danger"
    ? layerLockStateClass(true)
    : stateTone === "success"
      ? layerLockStateClass(false)
      : selected
        ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
        : layerVisibilityStateClass(active);
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={mixed ? "mixed" : active}
      className={`flex ${compact ? "h-6 w-6 opacity-0 group-hover:opacity-100" : "h-7 w-7"} items-center justify-center rounded border transition ${stateClass}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function layerVisibilityStateClass(visible: boolean) {
  return visible
    ? "border-transparent bg-transparent text-muted-foreground hover:border-border-2 hover:bg-card hover:text-foreground"
    : "border-slate-400 bg-surface-2 text-slate-500 hover:bg-card";
}

function layerLockStateClass(locked: boolean) {
  return locked
    ? "border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
    : "border-transparent bg-transparent text-muted-foreground hover:border-border-2 hover:bg-card hover:text-foreground";
}

export function LayerToggle({
  label,
  active,
  layer,
  onActivate,
  onChange
}: {
  label: string;
  active: boolean;
  layer: DesignerLayerSettings;
  onActivate: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      className={`flex h-8 cursor-pointer items-center gap-1 rounded-md border px-1.5 text-body-sm transition ${active ? "border-blue-600 bg-blue-600 text-white shadow-sm ring-2 ring-blue-200" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onActivate();
        }
      }}
    >
      <span className={`px-1 text-[11px] font-semibold uppercase ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
      <button
        type="button"
        title={layer.visible ? `Hide ${label}` : `Show ${label}`}
        aria-pressed={layer.visible}
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layerVisibilityStateClass(layer.visible)}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange({ visible: !layer.visible });
        }}
      >
        {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title={layer.locked ? `Unlock ${label}` : `Lock ${label}`}
        aria-pressed={layer.locked}
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layerLockStateClass(layer.locked)}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange({ locked: !layer.locked });
        }}
      >
        {layer.locked ? <Lock className="h-3.5 w-3.5 text-red-500" /> : <Unlock className="h-3.5 w-3.5 text-emerald-500" />}
      </button>
      <input
        type="range"
        title={`${label} opacity`}
        min="10"
        max="100"
        step="5"
        value={Math.round(layer.opacity * 100)}
        className="h-6 w-14 accent-blue-600"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })}
      />
    </div>
  );
}

export function ToolbarField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex shrink-0 items-center gap-1.5 ${className}`}>
      <span className="text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ToolbarText({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <ToolbarField label={label}>
      <input className="h-8 w-40 rounded-md border border-input bg-card px-2 text-body-sm outline-none focus:ring-2 focus:ring-blue-500" value={value} onChange={(event) => onChange(event.target.value)} />
    </ToolbarField>
  );
}

export function ToolbarNumber({ label, value, suffix, onChange }: { label: string; value: number; suffix?: string; onChange: (value: number) => void }) {
  return (
    <ToolbarField label={label}>
      <div className="flex h-8 items-center rounded-md border border-input bg-card">
        <input className="h-full w-16 rounded-md bg-transparent px-2 text-right font-mono text-body-sm outline-none" type="number" step="any" value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix ? <span className="pr-2 text-[11px] text-muted-foreground">{suffix}</span> : null}
      </div>
    </ToolbarField>
  );
}

export function NodeTypePicker({ value = "smooth", onChange }: { value?: DesignerPointNodeType; onChange: (value: DesignerPointNodeType) => void }) {
  const options: Array<{ value: DesignerPointNodeType; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "corner", label: "Corner node", icon: CornerDownRight },
    { value: "straight", label: "Straight node", icon: Minus },
    { value: "smooth", label: "Smooth node", icon: Spline },
    { value: "symmetric", label: "Symmetric node", icon: CircleDot }
  ];
  return (
    <div className="flex h-8 items-center rounded-md border border-input bg-card p-0.5">
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={`flex h-6 w-7 items-center justify-center rounded transition ${value === optionValue ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

export function HorizontalRuler({ viewport, unit, colorMode }: { viewport: DesignerViewport; unit: DesignerForm["rulerUnit"]; colorMode: "day" | "night" }) {
  const ticks = rulerTicks(viewport.x, viewport.x + viewport.width, viewport.width, unit);
  const night = colorMode === "night";
  return (
    <div className={`relative h-full w-full overflow-hidden border-b ${night ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-100"}`}>
      {ticks.map((tick) => (
        <div key={`${tick.cm}-${tick.major ? "major" : "minor"}`} className="absolute bottom-0" style={{ left: `${((tick.cm - viewport.x) / viewport.width) * 100}%` }}>
          <div className={tick.major ? `h-5 border-l ${night ? "border-slate-200" : "border-slate-700"}` : `h-2.5 border-l ${night ? "border-slate-500" : "border-slate-400"}`} />
          {tick.major ? <div className={`absolute left-1 top-0 whitespace-nowrap font-mono text-[15px] leading-none ${night ? "text-slate-200" : "text-slate-700"}`}>{tick.label}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function VerticalRuler({ viewport, unit, colorMode }: { viewport: DesignerViewport; unit: DesignerForm["rulerUnit"]; colorMode: "day" | "night" }) {
  const ticks = rulerTicks(viewport.y, viewport.y + viewport.height, viewport.height, unit);
  const night = colorMode === "night";
  return (
    <div className={`relative h-full w-full overflow-hidden border-r ${night ? "border-slate-700 bg-slate-900" : "border-slate-300 bg-slate-100"}`}>
      {ticks.map((tick) => (
        <div key={`${tick.cm}-${tick.major ? "major" : "minor"}`} className="absolute right-0" style={{ top: `${((tick.cm - viewport.y) / viewport.height) * 100}%` }}>
          <div className={tick.major ? `w-6 border-t ${night ? "border-slate-200" : "border-slate-700"}` : `w-3 border-t ${night ? "border-slate-500" : "border-slate-400"}`} />
          {tick.major ? (
            <div className={`absolute right-9 top-[-7px] origin-right -rotate-90 whitespace-nowrap font-mono text-[15px] leading-none ${night ? "text-slate-200" : "text-slate-700"}`}>
              {tick.label}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
