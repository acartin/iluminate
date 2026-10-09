"use client";

import { cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, type DragEndEvent, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cable, ChevronDown, ChevronRight, CircleDot, Contrast, CornerDownRight, Cpu, Eye, EyeOff, Folder, GripVertical, ImageIcon, Info, Layers, Lightbulb, Lock, Minus, Pencil, Plus, Search, Spline, Trash2, Type, Unlock, Upload, Waves, X } from "lucide-react";
import type { DesignerArtworkForm, DesignerBuildAreaForm, DesignerChannelForm, DesignerFaceGraphicForm, DesignerForm, DesignerGroupForm, DesignerLayerSettings, DesignerLayersForm, DesignerPointNodeType, DesignerText, DesignerWorkLineForm, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { resolveDesignerDerivedGeometry, resolveDesignerProjectionGeometry, type DesignerDerivedGeometry, type DesignerProjection, type DesignerProjectionLayer } from "@/lib/lighting/partitura-model";
import { formatDecimal, rulerTicks } from "./designer-geometry";
import { designerAdditiveSelectionRequested, designerLayerForSelection, routeMatchesSurfaceView, type DesignerActiveLayer, type DesignerRouteSummary, type DesignerRouteSurfaceView, type DesignerSelection, type DesignerViewport } from "./types";

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
  selection,
  selectedGeometryKeys,
  routeSummaries,
  routeOutputs,
  assets,
  faceGraphicVinylPreview,
  routeSurfaceView,
  onActivateLayer,
  onPatchLayer,
  onPatchLayers,
  onPatchWorkLine,
  onToggleFaceGraphicVinylPreview,
  onRouteSurfaceViewChange,
  onUploadArtwork,
  onPatchArtwork,
  onPatchBuildArea,
  onPatchZone,
  onPatchFaceGraphic,
  onPatchProjection,
  onPatchDerivedGeometry,
  onPatchText,
  onAddGroup,
  onPatchGroup,
  onRemoveGroup,
  onToggleGroupMember,
  onSelectZone,
  onOpenLighting,
  onPatchChannel,
  onPatchController,
  onPatchRoute,
  onReorderItems,
  onSelect,
  onClose
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer | null;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  routeSummaries: DesignerRouteSummary[];
  routeOutputs: Map<string, number>;
  assets: Array<{ id: string; fileName: string; mimeType: string }>;
  faceGraphicVinylPreview: boolean;
  routeSurfaceView: DesignerRouteSurfaceView;
  onActivateLayer: (layer: DesignerActiveLayer) => void;
  onPatchLayer: (layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) => void;
  onPatchLayers: (layers: Array<keyof DesignerLayersForm>, patch: Partial<DesignerLayerSettings>) => void;
  onPatchWorkLine: (workLineId: string, patch: Partial<Pick<DesignerWorkLineForm, "name" | "layer" | "points">>) => void;
  onToggleFaceGraphicVinylPreview: () => void;
  onRouteSurfaceViewChange: (view: DesignerRouteSurfaceView) => void;
  onUploadArtwork: (file: File) => void | Promise<void>;
  onPatchArtwork: (artworkId: string, patch: Partial<DesignerArtworkForm>) => void;
  onPatchBuildArea: (buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchZone: (zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchFaceGraphic: (elementId: string, patch: Partial<DesignerFaceGraphicForm>) => void;
  onPatchProjection: (projectionId: string, patch: Partial<DesignerProjection>) => void;
  onPatchDerivedGeometry: (derivedId: string, patch: Partial<DesignerDerivedGeometry>) => void;
  onPatchText: (textId: string, patch: Partial<DesignerText>) => void;
  onAddGroup: () => void;
  onPatchGroup: (groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, memberType: "zone" | "group", memberId: string) => void;
  onSelectZone: (zoneId: string) => void;
  onOpenLighting: (target: { type: "zone" | "channel"; id: string }) => void;
  onPatchChannel: (channelId: string, patch: Partial<Pick<DesignerChannelForm, "name" | "widthMm" | "closed" | "cap" | "visible">>) => void;
  onPatchController: (patch: Partial<Pick<DesignerForm["controller"], "name" | "visible">>) => void;
  onPatchRoute: (routeId: string, patch: Partial<Pick<DesignerForm["routes"][number], "name" | "visible">>) => void;
  onReorderItems: (layer: "artwork" | "reference" | "zones" | "channels" | "faceGraphic" | "strings", activeId: string, overId: string) => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
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
    lightSources: false,
    hardware: false,
    strings: false
  });
  const didMountRef = useRef(false);
  const [expandedStringGroups, setExpandedStringGroups] = useState({ data_cables: false, led_strings: false });
  const [expandedControllerGroup, setExpandedControllerGroup] = useState(false);
  const [expandedDiffusorGroups, setExpandedDiffusorGroups] = useState({ zones: false, channels: false, groups: false });
  const [expandedArtworkGroups, setExpandedArtworkGroups] = useState({ images: false, reference: false });

  function activateLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: true }));
    onActivateLayer(layer);
  }

  function toggleLayer(layer: DesignerActiveLayer) {
    onActivateLayer(layer);
    setExpandedLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  const selectedArtwork = selection?.type === "artwork" ? designer.artwork.find((artwork) => artwork.id === selection.id) ?? null : null;
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const matchesSearch = (label: string, detail = "") => !normalizedSearch || `${label} ${detail}`.toLowerCase().includes(normalizedSearch);

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
      const owner = designer.workLines.find((line) => line.id === selection.id)?.layer;
      if (owner) setExpandedLayers((current) => ({ ...current, [owner]: true }));
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
    const layer = designerLayerForSelection(selection);
    if (layer) setExpandedLayers((current) => ({ ...current, [layer]: true }));
    if (selection.type === "zone") setExpandedDiffusorGroups((current) => ({ ...current, zones: true }));
    if (selection.type === "channel") setExpandedDiffusorGroups((current) => ({ ...current, channels: true }));
    if (selection.type === "route") {
      const route = designer.routes.find((entry) => entry.id === selection.id);
      if (route?.kind === "data_cable") setExpandedStringGroups((current) => ({ ...current, data_cables: true }));
      if (route?.kind === "led_string") setExpandedStringGroups((current) => ({ ...current, led_strings: true }));
    }
    if (selection.type === "controller") setExpandedControllerGroup(true);
  }, [selection]);

  return (
    <aside className="flex min-h-0 flex-col border-l border-border-2 bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-2 text-body-sm font-semibold">
          <Layers className="h-4 w-4 text-blue-700" />
          Layers
        </div>
        <button type="button" title="Close layers" className="flex h-8 w-8 items-center justify-center rounded-md border border-border-2 text-muted-foreground hover:bg-surface-hover" onClick={onClose}>
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          className="h-7 min-w-0 flex-1 rounded border border-input bg-background px-2 text-body-sm outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search objects"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
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
          onChange={(patch) => onPatchLayer("artwork", patch)}
        >
          <RouteFolder
            label="Images"
            count={designer.artwork.length}
            expanded={expandedArtworkGroups.images}
            onToggle={() => {
              activateLayer("artwork");
              setExpandedArtworkGroups((current) => ({ ...current, images: !current.images }));
            }}
            action={
              <button type="button" title="Upload image to assets" className="flex h-6 w-6 items-center justify-center rounded border border-border-2 bg-card text-blue-700 hover:bg-surface-hover" onClick={() => artworkFileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
              </button>
            }
          >
            <SortableLayerList
              ids={designer.artwork.map((artwork) => artwork.id)}
              sensors={sensors}
              disabled={designer.layers.artwork.locked}
              onReorder={(activeId, overId) => onReorderItems("artwork", activeId, overId)}
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
            </SortableLayerList>
            {selectedArtwork ? (
              <div className="mt-2 rounded border border-border-2 bg-card px-2 py-1.5">
                <label className="grid gap-1 text-[11px] text-muted-foreground">
                  <span>Image source</span>
                  <select
                    className="h-7 min-w-0 rounded border border-input bg-card px-2 text-body-sm text-foreground"
                    value={selectedArtwork.assetId}
                    onChange={(event) => onPatchArtwork(selectedArtwork.id, { assetId: event.target.value })}
                  >
                    <option value="">— No image —</option>
                    {assets.length ? assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>) : <option value="" disabled>No assets uploaded</option>}
                  </select>
                </label>
              </div>
            ) : (
              <p className="mt-1 px-2 py-1 text-[11px] leading-4 text-muted-foreground">Use the Image tool to place a container, then pick its image here.</p>
            )}
          </RouteFolder>

          <RouteFolder
            label="Reference"
            count={designer.buildAreas.length}
            expanded={expandedArtworkGroups.reference}
            onToggle={() => {
              activateLayer("artwork");
              setExpandedArtworkGroups((current) => ({ ...current, reference: !current.reference }));
            }}
          >
            <SortableLayerList
              ids={designer.buildAreas.map((buildArea) => buildArea.id)}
              sensors={sensors}
              disabled={designer.layers.artwork.locked}
              onReorder={(activeId, overId) => onReorderItems("reference", activeId, overId)}
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
            </SortableLayerList>
          </RouteFolder>
          <TextRows designer={designer} targetLayer="reference" selection={selection} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchText} />
          <ProjectionRows designer={designer} targetLayer="reference" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchProjection} />
          <DerivedGeometryRows designer={designer} targetLayer="reference" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
          <WorkLineRows designer={designer} layer="artwork" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("artwork")} onSelect={onSelect} onPatch={onPatchWorkLine} />
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
          <RouteFolder
            label="Zones"
            count={designer.zones.length}
            expanded={expandedDiffusorGroups.zones}
            onToggle={() => setExpandedDiffusorGroups((current) => ({ ...current, zones: !current.zones }))}
          >
            <SortableLayerList
              ids={designer.zones.map((zone) => zone.id)}
              sensors={sensors}
              disabled={designer.layers.zones.locked}
              onReorder={(activeId, overId) => onReorderItems("zones", activeId, overId)}
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
                    lightingCount={designer.lightSources.filter((source) => source.targetType === "zone" && source.targetId === zone.id && source.enabled && source.stringIds.length > 0).length}
                    onOpenLighting={() => onOpenLighting({ type: "zone", id: zone.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SortableLayerList>
          </RouteFolder>
          <RouteFolder
            label="Channels"
            count={(designer.channels ?? []).length}
            expanded={expandedDiffusorGroups.channels}
            onToggle={() => setExpandedDiffusorGroups((current) => ({ ...current, channels: !current.channels }))}
          >
            {(designer.channels ?? []).length ? (
              <SortableLayerList
                ids={designer.channels.map((channel) => channel.id)}
                sensors={sensors}
                disabled={designer.layers.zones.locked}
                onReorder={(activeId, overId) => onReorderItems("channels", activeId, overId)}
              >
                {designer.channels.filter((channel) => matchesSearch(channel.name, "channel")).map((channel) => (
                  <SortableLayerChildRow key={channel.id} id={channel.id} disabled={designer.layers.zones.locked}>
                    <LayerChildRow
                      label={channel.name}
                      selected={selection?.type === "channel" && selection.id === channel.id}
                      color="amber"
                      icon={Waves}
                      visible={channel.visible}
                      onToggleVisible={() => onPatchChannel(channel.id, { visible: channel.visible === false })}
                      onClick={() => {
                        activateLayer("zones");
                        onSelect({ type: "channel", id: channel.id });
                      }}
                      onRename={(name) => onPatchChannel(channel.id, { name })}
                      lightingCount={designer.lightSources.filter((source) => source.targetType === "channel" && source.targetId === channel.id && source.enabled && source.stringIds.length > 0).length}
                      onOpenLighting={() => onOpenLighting({ type: "channel", id: channel.id })}
                    />
                  </SortableLayerChildRow>
                ))}
              </SortableLayerList>
            ) : (
              <p className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">Use the Channel tool to trace a 3-20 mm neon-flex channel.</p>
            )}
          </RouteFolder>
          <RouteFolder
            label="Zones Groups"
            count={(designer.groups ?? []).length}
            expanded={expandedDiffusorGroups.groups}
            onToggle={() => setExpandedDiffusorGroups((current) => ({ ...current, groups: !current.groups }))}
            action={
              <button type="button" title="New group" className="flex h-6 w-6 items-center justify-center rounded border border-border-2 bg-card text-blue-700 hover:bg-surface-hover" onClick={onAddGroup}>
                <Plus className="h-3.5 w-3.5" />
              </button>
            }
          >
            <GroupPanelSection
              groups={designer.groups ?? []}
              zones={designer.zones}
              selectedZoneId={selection?.type === "zone" ? selection.id : undefined}
              onPatchGroup={onPatchGroup}
              onRemoveGroup={onRemoveGroup}
              onToggleGroupMember={onToggleGroupMember}
              onSelectZone={onSelectZone}
            />
          </RouteFolder>
          <TextRows designer={designer} targetLayer="zones" selection={selection} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchText} />
          <ProjectionRows designer={designer} targetLayer="zones" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchProjection} />
          <DerivedGeometryRows designer={designer} targetLayer="zones" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
          <WorkLineRows designer={designer} layer="zones" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("zones")} onSelect={onSelect} onPatch={onPatchWorkLine} />
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
          onActivate={() => activateLayer(activeLayer === "strings" ? "strings" : "hardware")}
          onToggle={() => {
            const expanded = expandedLayers.strings || expandedLayers.hardware;
            onActivateLayer(activeLayer === "strings" ? "strings" : "hardware");
            setExpandedLayers((current) => ({ ...current, strings: !expanded, hardware: !expanded }));
          }}
          onChange={(patch) => onPatchLayers(["strings", "hardware"], patch)}
          action={<RouteSurfaceViewToggle value={routeSurfaceView} onChange={onRouteSurfaceViewChange} />}
        >
          <RouteFolder
            label="Data cables"
            icon={Cable}
            order={2}
            count={designer.routes.filter((route) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).length}
            expanded={expandedStringGroups.data_cables}
            onToggle={() => {
              activateLayer("strings");
              setExpandedStringGroups((current) => ({ ...current, data_cables: !current.data_cables }));
            }}
          >
            <SortableLayerList
              ids={designer.routes.filter((route) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).map((route) => route.id)}
              sensors={sensors}
              disabled={designer.layers.strings.locked}
              onReorder={(activeId, overId) => onReorderItems("strings", activeId, overId)}
            >
              {designer.routes.map((route, index) => ({ route, index })).filter(({ route }) => route.kind === "data_cable" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).filter(({ route }) => matchesSearch(route.name, "data cable")).map(({ route }) => (
                <SortableLayerChildRow key={route.id} id={route.id} disabled={designer.layers.strings.locked}>
                  <LayerChildRow
                    label={route.name}
                    icon={Cable}
                    detail={`${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · ${route.designSurface === "front" ? "Front" : "Rear"} · data cable`}
                    selected={selection?.type === "route" && selection.id === route.id}
                    color="green"
                    strongColor
                    visible={route.visible !== false}
                    onToggleVisible={() => onPatchRoute(route.id, { visible: route.visible === false })}
                    onClick={() => {
                      activateLayer("strings");
                      onSelect({ type: "route", id: route.id });
                    }}
                    onRename={(name) => onPatchRoute(route.id, { name })}
                    onOpenDetails={() => setDetails({ type: "route", id: route.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SortableLayerList>
          </RouteFolder>
          <RouteFolder
            label="Strings"
            icon={Lightbulb}
            order={1}
            count={designer.routes.filter((route) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).length}
            expanded={expandedStringGroups.led_strings}
            onToggle={() => {
              activateLayer("strings");
              setExpandedStringGroups((current) => ({ ...current, led_strings: !current.led_strings }));
            }}
          >
            <SortableLayerList
              ids={designer.routes.filter((route) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView)).map((route) => route.id)}
              sensors={sensors}
              disabled={designer.layers.strings.locked}
              onReorder={(activeId, overId) => onReorderItems("strings", activeId, overId)}
            >
              {designer.routes.map((route, index) => ({ route, index })).filter(({ route, index }) => route.kind === "led_string" && routeMatchesSurfaceView(route.designSurface, routeSurfaceView) && matchesSearch(route.name, `${routeSummaries[index]?.pixels ?? 0} px`)).map(({ route, index }) => (
                <SortableLayerChildRow key={route.id} id={route.id} disabled={designer.layers.strings.locked}>
                  <LayerChildRow
                    label={route.name}
                    icon={Lightbulb}
                    detail={`${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · ${route.designSurface === "front" ? "Front" : "Rear"} · ${routeSummaries[index]?.pixels ?? 0} px · ${routeSummaries[index]?.leds ?? 0} LEDs`}
                    selected={selection?.type === "route" && selection.id === route.id}
                    color="amber"
                    strongColor
                    visible={route.visible !== false}
                    onToggleVisible={() => onPatchRoute(route.id, { visible: route.visible === false })}
                    onClick={() => {
                      activateLayer("strings");
                      onSelect({ type: "route", id: route.id });
                    }}
                    onRename={(name) => onPatchRoute(route.id, { name })}
                    onOpenDetails={() => setDetails({ type: "route", id: route.id })}
                  />
                </SortableLayerChildRow>
              ))}
            </SortableLayerList>
          </RouteFolder>
          <RouteFolder
            label="Controller"
            icon={Cpu}
            order={3}
            count={1}
            expanded={expandedControllerGroup}
            onToggle={() => {
              activateLayer("hardware");
              setExpandedControllerGroup((current) => !current);
            }}
          >
            <LayerChildRow
              label={designer.controller.name}
              icon={Cpu}
              detail={`${designer.controller.dataOutputs} outputs`}
              selected={selection?.type === "controller"}
              visible={designer.controller.visible !== false}
              onToggleVisible={() => onPatchController({ visible: designer.controller.visible === false })}
              onClick={() => {
                activateLayer("hardware");
                onSelect({ type: "controller", id: designer.controller.id });
              }}
              onRename={(name) => onPatchController({ name })}
              onOpenDetails={() => setDetails({ type: "controller", id: designer.controller.id })}
            />
          </RouteFolder>
        </LayerPanelSection>

        <LayerPanelSection
          label="Face Graphic"
          order={4}
          active={activeLayer === "faceGraphic"}
          expanded={expandedLayers.faceGraphic}
          layer={designer.layers.faceGraphic}
          onActivate={() => activateLayer("faceGraphic")}
          onToggle={() => toggleLayer("faceGraphic")}
          onChange={(patch) => onPatchLayer("faceGraphic", patch)}
          action={(
            <IconToggle
              active={faceGraphicVinylPreview}
              label={faceGraphicVinylPreview ? "Exit black and white vinyl preview" : "Preview vinyl in black and white"}
              onClick={onToggleFaceGraphicVinylPreview}
            >
              <Contrast className="h-3.5 w-3.5" />
            </IconToggle>
          )}
        >
          <SortableLayerList
            ids={designer.faceGraphics.map((element) => element.id)}
            sensors={sensors}
            disabled={designer.layers.faceGraphic.locked}
            onReorder={(activeId, overId) => onReorderItems("faceGraphic", activeId, overId)}
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
          </SortableLayerList>
          {!designer.faceGraphics.length ? <p className="px-2 py-1 text-[11px] leading-4 text-muted-foreground">Use a shape or Bezier tool to create the frontal vinyl mask.</p> : null}
          <TextRows designer={designer} targetLayer="faceGraphic" selection={selection} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchText} />
          <ProjectionRows designer={designer} targetLayer="faceGraphic" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchProjection} />
          <DerivedGeometryRows designer={designer} targetLayer="faceGraphic" selection={selection} selectedGeometryKeys={selectedGeometryKeys} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchDerivedGeometry} />
          <WorkLineRows designer={designer} layer="faceGraphic" selection={selection} matchesSearch={matchesSearch} onActivate={() => activateLayer("faceGraphic")} onSelect={onSelect} onPatch={onPatchWorkLine} />
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
  order,
  active,
  expanded,
  layer,
  children,
  action,
  onActivate,
  onToggle,
  onChange
}: {
  label: string;
  order: number;
  active: boolean;
  expanded: boolean;
  layer: DesignerLayerSettings;
  children: React.ReactNode;
  action?: React.ReactNode;
  onActivate: () => void;
  onToggle: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <section className="shrink-0 border-b border-border/80" style={{ order }}>
      <div className={`flex h-8 items-center gap-1 px-2 ${active ? "bg-surface-selected" : "hover:bg-surface-hover"}`}>
        <button type="button" title={expanded ? `Collapse ${label}` : `Expand ${label}`} className="flex h-6 w-5 items-center justify-center rounded text-muted-foreground hover:bg-card" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" className={`min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-body-sm font-semibold ${active ? "bg-blue-600 text-white" : "text-foreground"}`} onClick={onActivate}>
          {label}
        </button>
        {action}
        <IconToggle active={layer.visible} label={layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => onChange({ visible: !layer.visible })}>
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconToggle>
        <IconToggle active={layer.locked} stateTone={layer.locked ? "danger" : "success"} label={layer.locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onChange({ locked: !layer.locked })}>
          {layer.locked ? <Lock className="h-3.5 w-3.5 text-red-500" /> : <Unlock className="h-3.5 w-3.5 text-emerald-500" />}
        </IconToggle>
      </div>
      {expanded ? (
        <>
          <div className="flex h-7 items-center gap-2 px-8">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">Opacity</span>
            <input className="h-5 flex-1 accent-blue-600" type="range" min="10" max="100" step="5" value={Math.round(layer.opacity * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
            <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">{Math.round(layer.opacity * 100)}%</span>
          </div>
          <div className="flex flex-col pb-1 pl-3 pr-1">{children}</div>
        </>
      ) : null}
    </section>
  );
}

function RouteSurfaceViewToggle({ value, onChange }: { value: DesignerRouteSurfaceView; onChange: (view: DesignerRouteSurfaceView) => void }) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Wiring surface visibility">
      {(["rear", "front", "both"] as const).map((view) => (
        <IconToggle key={view} active={value === view} label={`Show ${view === "both" ? "both wiring surfaces" : `${view} wiring surface`}`} onClick={() => onChange(view)}>
          <RouteSurfaceIcon view={view} />
        </IconToggle>
      ))}
    </div>
  );
}

function RouteSurfaceIcon({ view }: { view: DesignerRouteSurfaceView }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.5">
      {view !== "front" ? <path d="M2.5 5.5h9v7h-9z M11.5 8h3.5" strokeDasharray="2 1.5" /> : null}
      {view !== "rear" ? <path d="M6.5 2.5h9v7h-9z M3 6h3.5" /> : null}
    </svg>
  );
}

function RouteFolder({
  label,
  icon: Icon = Folder,
  order,
  count,
  expanded,
  children,
  onToggle,
  action
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  order?: number;
  count: number;
  expanded: boolean;
  children: React.ReactNode;
  onToggle: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="mt-1" style={order === undefined ? undefined : { order }}>
      <div className="flex h-7 items-center gap-1">
        <button
          type="button"
          className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded px-1.5 text-left text-body-sm font-semibold text-muted-foreground hover:bg-surface-hover hover:text-foreground"
          onClick={onToggle}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Icon className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="font-mono text-[10px]">{count}</span>
        </button>
        {action ? <div className="flex shrink-0 items-center gap-1 pr-1">{action}</div> : null}
      </div>
      {expanded ? <div className="pl-2">{children}</div> : null}
    </div>
  );
}

function GroupPanelSection({
  groups,
  zones,
  selectedZoneId,
  onPatchGroup,
  onRemoveGroup,
  onToggleGroupMember,
  onSelectZone
}: {
  groups: DesignerGroupForm[];
  zones: DesignerZoneForm[];
  selectedZoneId?: string;
  onPatchGroup: (groupId: string, patch: Partial<Pick<DesignerGroupForm, "name" | "members">>) => void;
  onRemoveGroup: (groupId: string) => void;
  onToggleGroupMember: (groupId: string, memberType: "zone" | "group", memberId: string) => void;
  onSelectZone: (zoneId: string) => void;
}) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  return (
    <div className="pb-1">
        {!groups.length ? (
          <p className="px-1.5 py-1 text-[11px] leading-4 text-muted-foreground">A group targets several zones as one effect while keeping each zone&apos;s pixel limits.</p>
        ) : null}
        {groups.map((group) => {
          const expanded = expandedGroups[group.id] ?? true;
          const members = group.members ?? [];
          const zoneMembers = new Set(members.filter((member) => member.type === "zone").map((member) => member.id));
          const groupMembers = new Set(members.filter((member) => member.type === "group").map((member) => member.id));
          const nestedGroups = groups.filter((other) => other.id !== group.id);
          return (
            <div key={group.id} className="mb-1 rounded border border-border-2 bg-card">
              <div className="flex items-center gap-1 px-1.5 py-1">
                <button type="button" title={expanded ? "Collapse group" : "Expand group"} className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover" onClick={() => setExpandedGroups((current) => ({ ...current, [group.id]: !expanded }))}>
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <input
                  className="h-6 min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 text-body-sm font-medium text-foreground outline-none hover:border-border-2 focus:border-blue-500 focus:bg-card"
                  value={group.name}
                  aria-label="Group name"
                  onChange={(event) => onPatchGroup(group.id, { name: event.target.value })}
                />
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{members.length}</span>
                <button type="button" title="Delete group" className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border-2 hover:bg-surface-hover hover:text-red-600" onClick={() => onRemoveGroup(group.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              {expanded ? (
                <div className="max-h-56 space-y-0.5 overflow-auto border-t border-border px-2 py-1.5">
                  {!zones.length ? <p className="text-[11px] text-muted-foreground">No zones to include yet.</p> : null}
                  {zones.map((zone) => {
                    const checked = zoneMembers.has(zone.id);
                    const selected = selectedZoneId === zone.id;
                    return (
                      <div key={zone.id} className={`flex items-center gap-2 rounded px-1 py-0.5 text-body-sm ${selected ? "bg-blue-600 text-white" : "hover:bg-surface-hover"}`}>
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={checked}
                          aria-label={`Include ${zone.name || zone.id} in ${group.name}`}
                          onChange={() => {
                            onToggleGroupMember(group.id, "zone", zone.id);
                            onSelectZone(zone.id);
                          }}
                        />
                        <button
                          type="button"
                          className={`min-w-0 flex-1 truncate text-left ${selected ? "text-white" : ""}`}
                          title={`Select ${zone.name || zone.id} on the canvas`}
                          onClick={() => onSelectZone(zone.id)}
                        >
                          {zone.name || zone.id}
                        </button>
                        <span className={`shrink-0 font-mono text-[10px] ${selected ? "text-white/70" : "text-muted-foreground"}`}>{zone.id}</span>
                      </div>
                    );
                  })}
                  {nestedGroups.map((other) => {
                    const blocked = wouldCreateGroupCycle(groups, group.id, other.id);
                    return (
                      <label key={other.id} className={`flex items-center gap-2 rounded px-1 py-0.5 text-body-sm ${blocked ? "cursor-not-allowed opacity-40" : "hover:bg-surface-hover"}`} title={blocked ? "This would create a group cycle." : undefined}>
                        <input type="checkbox" className="accent-blue-600" disabled={blocked} checked={groupMembers.has(other.id)} onChange={() => onToggleGroupMember(group.id, "group", other.id)} />
                        <span className="min-w-0 flex-1 truncate">Group · {other.name || other.id}</span>
                      </label>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}

function wouldCreateGroupCycle(groups: DesignerGroupForm[], parentId: string, candidateId: string) {
  if (parentId === candidateId) return true;
  const stack = [candidateId];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === parentId) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const group = groups.find((entry) => entry.id === id);
    group?.members.filter((member) => member.type === "group").forEach((member) => stack.push(member.id));
  }
  return false;
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

function WorkLineDashedIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M3 18 9 10 15 14 21 5" strokeDasharray="2.5 3" />
      <circle cx="3" cy="18" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="9" cy="10" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="15" cy="14" r="1.25" fill="currentColor" stroke="none" />
      <circle cx="21" cy="5" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}

function WorkLineRows({ designer, layer, selection, matchesSearch, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  layer: NonNullable<DesignerWorkLineForm["layer"]>;
  selection: DesignerSelection;
  matchesSearch: (label: string, detail?: string) => boolean;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection) => void;
  onPatch: (workLineId: string, patch: Partial<Pick<DesignerWorkLineForm, "name" | "layer" | "points">>) => void;
}) {
  const lines = designer.workLines.filter((line) => line.layer === layer && matchesSearch(line.name, "work line construction"));
  if (!lines.length) return null;
  return (
    <div className="border-t border-border-2 py-1">
      {lines.map((line) => <LayerChildRow
        key={line.id}
        label={line.name}
        detail={`Dashed reference · ${line.points.length} points`}
        selected={selection?.type === "work_line" && selection.id === line.id}
        color="green"
        icon={WorkLineDashedIcon}
        onClick={() => { onActivate(); onSelect({ type: "work_line", id: line.id }); }}
        onRename={(name) => onPatch(line.id, { name })}
      />)}
    </div>
  );
}

function TextRows({ designer, targetLayer, selection, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  onActivate: () => void;
  onSelect: (selection: DesignerSelection) => void;
  onPatch: (textId: string, patch: Partial<DesignerText>) => void;
}) {
  const texts = designer.texts.filter((text) => text.targetLayer === targetLayer);
  if (!texts.length) return null;
  return (
    <div className="border-t border-border-2 py-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700">Editable text</div>
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

function ProjectionRows({ designer, targetLayer, selection, selectedGeometryKeys, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  onActivate: () => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onPatch: (projectionId: string, patch: Partial<DesignerProjection>) => void;
}) {
  const projections = designer.projections.filter((projection) => projection.targetLayer === targetLayer);
  if (!projections.length) return null;
  return (
    <div className="border-t border-border-2 py-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-700">Projected geometry</div>
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

function DerivedGeometryRows({ designer, targetLayer, selection, selectedGeometryKeys, onActivate, onSelect, onPatch }: {
  designer: DesignerForm;
  targetLayer: DesignerProjectionLayer;
  selection: DesignerSelection;
  selectedGeometryKeys: string[];
  onActivate: () => void;
  onSelect: (selection: DesignerSelection, additive?: boolean) => void;
  onPatch: (derivedId: string, patch: Partial<DesignerDerivedGeometry>) => void;
}) {
  const operations = designer.derivedGeometries.filter((operation) => operation.targetLayer === targetLayer);
  if (!operations.length) return null;
  return (
    <div className="border-t border-border-2 py-1">
      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">Derived profiles</div>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  if (!isValidElement(children)) return null;
  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "relative z-20 opacity-70" : undefined}>
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
    ? "border-l-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/25"
    : color === "amber"
      ? "border-l-amber-500 bg-amber-50/80 dark:bg-amber-950/25"
      : color === "blue"
        ? "border-l-sky-500 bg-sky-50/70 dark:bg-sky-950/25"
        : color === "violet"
          ? "border-l-violet-500 bg-violet-50/70 dark:bg-violet-950/25"
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
    <div ref={rowRef} className={`group border-l-2 ${strongColor ? "border-l-4" : ""} ${selected ? "border-blue-500 bg-blue-600 text-white" : `border-transparent hover:bg-surface-hover ${rowToneClass}`} ${dragging ? "relative z-20 shadow-md ring-2 ring-blue-300" : ""}`}>
      <div className="flex min-h-9 items-center gap-1 px-1.5 py-0.5">
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
            {detail ? <span className={`block truncate font-mono text-[10px] uppercase leading-3 ${selected ? "text-white/70" : "text-muted-foreground"}`}>{detail}</span> : null}
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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent ${selected ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:border-border-2 hover:bg-card hover:text-foreground"}`}
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
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border border-transparent ${selected ? "text-white/80 hover:bg-white/15 hover:text-white" : "text-muted-foreground hover:border-border-2 hover:bg-card hover:text-foreground"}`}
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
      { label: "Position", value: `${formatDecimal(artwork?.x ?? 0)}, ${formatDecimal(artwork?.y ?? 0)} cm` },
      { label: "Size", value: `${formatDecimal(artwork?.width ?? 0)} x ${formatDecimal(artwork?.height ?? 0)} cm` }
    ];
  }
  if (details.type === "build_area") {
    const buildArea = designer.buildAreas.find((entry) => entry.id === details.id);
    return [
      { label: "Type", value: "Reference geometry" },
      { label: "Shape", value: buildArea?.shape ?? "" },
      { label: "Position", value: `${formatDecimal(buildArea?.x ?? 0)}, ${formatDecimal(buildArea?.y ?? 0)} cm` },
      { label: "Size", value: `${formatDecimal(buildArea?.width ?? 0)} x ${formatDecimal(buildArea?.height ?? 0)} cm` },
      { label: "Points", value: String(buildArea?.points?.length ?? 0) }
    ];
  }
  if (details.type === "zone") {
    const zone = designer.zones.find((entry) => entry.id === details.id);
    return [
      { label: "Type", value: "Effect target zone" },
      { label: "Shape", value: zone?.shape ?? "" },
      { label: "Position", value: `${formatDecimal(zone?.x ?? 0)}, ${formatDecimal(zone?.y ?? 0)} cm` },
      { label: "Size", value: `${formatDecimal(zone?.width ?? 0)} x ${formatDecimal(zone?.height ?? 0)} cm` },
      { label: "Points", value: String(zone?.points?.length ?? 0) }
    ];
  }
  if (details.type === "controller") {
    return [
      { label: "Type", value: "Controller" },
      { label: "Outputs", value: String(designer.controller.dataOutputs) },
      { label: "Position", value: `${formatDecimal(designer.controller.x)}, ${formatDecimal(designer.controller.y)} cm` }
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

function IconToggle({ active, selected, compact, stateTone, label, children, onClick }: { active: boolean; selected?: boolean; compact?: boolean; stateTone?: "danger" | "success"; label: string; children: React.ReactNode; onClick: () => void }) {
  const stateClass = stateTone === "danger"
    ? "border-red-500 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300"
    : stateTone === "success"
      ? "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300"
      : selected
        ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
        : active
          ? "border-blue-300 bg-card text-blue-700"
          : "border-border-2 bg-surface-2 text-muted-foreground hover:bg-card";
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
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
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layer.visible ? active ? "border-white/60 bg-white/20 text-white" : "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-100 text-slate-400"}`}
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
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layer.locked ? "border-red-500 bg-red-50 text-red-700 hover:bg-red-100" : "border-emerald-500 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"}`}
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
