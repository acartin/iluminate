"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, CircleDot, CornerDownRight, Eye, EyeOff, ImageIcon, Layers, Lock, Minus, Pencil, Plus, Spline, Unlock } from "lucide-react";
import type { DesignerArtworkForm, DesignerBuildAreaForm, DesignerForm, DesignerLayerSettings, DesignerLayersForm, DesignerPointNodeType, DesignerZoneForm } from "@/lib/lighting/partitura-model";
import { formatDecimal, rulerTicks } from "./designer-geometry";
import type { DesignerActiveLayer, DesignerRouteSummary, DesignerSelection, DesignerViewport } from "./types";

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
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`relative flex h-10 w-10 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-40 ${active ? activeClass : "border-transparent bg-card text-ink-secondary hover:bg-surface-hover"}`}
    >
      {active ? <span className="absolute -right-1.5 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-current ring-2 ring-white" /> : null}
      {(tone === "amber" || tone === "green") && !active ? <span className={`absolute bottom-1 h-1.5 w-5 rounded-full ${tone === "amber" ? "bg-amber-500" : "bg-emerald-500"}`} /> : null}
      <Icon className="h-5 w-5" />
    </button>
  );
}

export function DesignerLayersPanel({
  designer,
  activeLayer,
  selection,
  routeSummaries,
  routeOutputs,
  assets,
  onActivateLayer,
  onPatchLayer,
  onAddArtwork,
  onPatchArtwork,
  onPatchBuildArea,
  onPatchZone,
  onPatchController,
  onPatchRoute,
  onSelect,
  onClose
}: {
  designer: DesignerForm;
  activeLayer: DesignerActiveLayer;
  selection: DesignerSelection;
  routeSummaries: DesignerRouteSummary[];
  routeOutputs: Map<string, number>;
  assets: Array<{ id: string; fileName: string; mimeType: string }>;
  onActivateLayer: (layer: DesignerActiveLayer) => void;
  onPatchLayer: (layer: keyof DesignerLayersForm, patch: Partial<DesignerLayerSettings>) => void;
  onAddArtwork: (asset: { id: string; fileName: string; mimeType: string }) => void;
  onPatchArtwork: (artworkId: string, patch: Partial<DesignerArtworkForm>) => void;
  onPatchBuildArea: (buildAreaId: string, patch: Partial<Pick<DesignerBuildAreaForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchZone: (zoneId: string, patch: Partial<Pick<DesignerZoneForm, "name" | "visible" | "locked" | "opacity">>) => void;
  onPatchController: (patch: Pick<DesignerForm["controller"], "name">) => void;
  onPatchRoute: (routeId: string, patch: Pick<DesignerForm["routes"][number], "name">) => void;
  onSelect: (selection: DesignerSelection) => void;
  onClose: () => void;
}) {
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [expandedLayers, setExpandedLayers] = useState<Record<DesignerActiveLayer, boolean>>({
    artwork: activeLayer === "artwork",
    reference: activeLayer === "reference",
    zones: activeLayer === "zones",
    strings: activeLayer === "strings"
  });

  function activateLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: true }));
    onActivateLayer(layer);
  }

  function toggleLayer(layer: DesignerActiveLayer) {
    setExpandedLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0];

  return (
    <aside className="flex min-h-0 flex-col border-l border-border-2 bg-card">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-2 text-body-sm font-semibold">
          <Layers className="h-4 w-4 text-blue-700" />
          Layers
        </div>
        <button type="button" title="Close layers" className="flex h-8 w-8 items-center justify-center rounded-md border border-border-2 text-muted-foreground hover:bg-surface-hover" onClick={onClose}>
          <EyeOff className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        <LayerPanelSection
          label="Artwork"
          active={activeLayer === "artwork"}
          expanded={expandedLayers.artwork}
          layer={designer.layers.artwork}
          onActivate={() => activateLayer("artwork")}
          onToggle={() => toggleLayer("artwork")}
          onChange={(patch) => onPatchLayer("artwork", patch)}
        >
          <div className="mb-2 flex items-center gap-1">
            <select
              className="h-8 min-w-0 flex-1 rounded border border-input bg-card px-2 text-body-sm text-foreground"
              value={selectedAsset?.id ?? ""}
              disabled={!assets.length || designer.layers.artwork.locked}
              onChange={(event) => setSelectedAssetId(event.target.value)}
            >
              {assets.length ? assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName}</option>) : <option value="">No assets</option>}
            </select>
            <button
              type="button"
              title="Add artwork"
              disabled={!selectedAsset || designer.layers.artwork.locked}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border-2 bg-card text-blue-700 hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (selectedAsset) onAddArtwork(selectedAsset);
              }}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {designer.artwork.map((artwork) => {
            const asset = assets.find((entry) => entry.id === artwork.assetId);
            return (
              <LayerChildRow
                key={artwork.id}
                label={artwork.name}
                detail={asset ? asset.fileName : "Missing asset"}
                selected={selection?.type === "artwork" && selection.id === artwork.id}
                muted={!artwork.visible}
                locked={artwork.locked}
                visible={artwork.visible}
                opacity={artwork.opacity}
                color="blue"
                icon={ImageIcon}
                onClick={() => {
                  activateLayer("artwork");
                  onSelect({ type: "artwork", id: artwork.id });
                }}
                onVisibleChange={(visible) => onPatchArtwork(artwork.id, { visible })}
                onLockedChange={(locked) => onPatchArtwork(artwork.id, { locked })}
                onOpacityChange={(opacity) => onPatchArtwork(artwork.id, { opacity })}
                onRename={(name) => onPatchArtwork(artwork.id, { name })}
              />
            );
          })}
        </LayerPanelSection>

        <LayerPanelSection
          label="Reference"
          active={activeLayer === "reference"}
          expanded={expandedLayers.reference}
          layer={designer.layers.reference}
          onActivate={() => activateLayer("reference")}
          onToggle={() => toggleLayer("reference")}
          onChange={(patch) => onPatchLayer("reference", patch)}
        >
          {designer.buildAreas.map((buildArea) => (
            <LayerChildRow
              key={buildArea.id}
              label={buildArea.name}
              detail={`${buildArea.shape} · ${formatDecimal(buildArea.width)}x${formatDecimal(buildArea.height)} cm`}
              selected={selection?.type === "build_area" && selection.id === buildArea.id}
              muted={!buildArea.visible}
              locked={buildArea.locked}
              visible={buildArea.visible}
              opacity={buildArea.opacity}
              onClick={() => {
                activateLayer("reference");
                onSelect({ type: "build_area", id: buildArea.id });
              }}
              onVisibleChange={(visible) => onPatchBuildArea(buildArea.id, { visible })}
              onLockedChange={(locked) => onPatchBuildArea(buildArea.id, { locked })}
              onOpacityChange={(opacity) => onPatchBuildArea(buildArea.id, { opacity })}
              onRename={(name) => onPatchBuildArea(buildArea.id, { name })}
            />
          ))}
          <LayerChildRow
            label="Reference Art"
            detail={designer.sourceSvg ? "Loaded" : "Pending"}
            muted={!designer.sourceSvg}
            onClick={() => activateLayer("reference")}
          />
        </LayerPanelSection>

        <LayerPanelSection
          label="Zones"
          active={activeLayer === "zones"}
          expanded={expandedLayers.zones}
          layer={designer.layers.zones}
          onActivate={() => activateLayer("zones")}
          onToggle={() => toggleLayer("zones")}
          onChange={(patch) => onPatchLayer("zones", patch)}
        >
          {designer.zones.map((zone) => (
            <LayerChildRow
              key={zone.id}
              label={zone.name}
              detail={`${zone.shape} · ${formatDecimal(zone.width)}x${formatDecimal(zone.height)} cm`}
              selected={selection?.type === "zone" && selection.id === zone.id}
              muted={!zone.visible}
              locked={zone.locked}
              visible={zone.visible}
              opacity={zone.opacity}
              onClick={() => {
                activateLayer("zones");
                onSelect({ type: "zone", id: zone.id });
              }}
              onVisibleChange={(visible) => onPatchZone(zone.id, { visible })}
              onLockedChange={(locked) => onPatchZone(zone.id, { locked })}
              onOpacityChange={(opacity) => onPatchZone(zone.id, { opacity })}
              onRename={(name) => onPatchZone(zone.id, { name })}
            />
          ))}
        </LayerPanelSection>

        <LayerPanelSection
          label="Strings"
          active={activeLayer === "strings"}
          expanded={expandedLayers.strings}
          layer={designer.layers.strings}
          onActivate={() => activateLayer("strings")}
          onToggle={() => toggleLayer("strings")}
          onChange={(patch) => onPatchLayer("strings", patch)}
        >
          <LayerChildRow
            label={designer.controller.name}
            detail={`${designer.controller.dataOutputs} outputs`}
            selected={selection?.type === "controller"}
            onClick={() => {
              activateLayer("strings");
              onSelect({ type: "controller", id: designer.controller.id });
            }}
            onRename={(name) => onPatchController({ name })}
          />
          {designer.routes.map((route, index) => (
            <LayerChildRow
              key={route.id}
              label={route.name}
              detail={route.kind === "data_cable"
                ? `${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · data cable`
                : `${routeOutputs.get(route.id) ? `Out ${routeOutputs.get(route.id)}` : "Unassigned"} · ${routeSummaries[index]?.pixels ?? 0} px · ${routeSummaries[index]?.leds ?? 0} LEDs`}
              selected={selection?.type === "route" && selection.id === route.id}
              color={route.kind === "data_cable" ? "green" : "amber"}
              onClick={() => {
                activateLayer("strings");
                onSelect({ type: "route", id: route.id });
              }}
              onRename={(name) => onPatchRoute(route.id, { name })}
            />
          ))}
        </LayerPanelSection>
      </div>
    </aside>
  );
}

function LayerPanelSection({
  label,
  active,
  expanded,
  layer,
  children,
  onActivate,
  onToggle,
  onChange
}: {
  label: string;
  active: boolean;
  expanded: boolean;
  layer: DesignerLayerSettings;
  children: React.ReactNode;
  onActivate: () => void;
  onToggle: () => void;
  onChange: (patch: Partial<DesignerLayerSettings>) => void;
}) {
  return (
    <section className={`overflow-hidden rounded-md border ${active ? "border-blue-500 bg-surface-selected" : "border-border bg-surface-2"}`}>
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <button type="button" title={expanded ? `Collapse ${label}` : `Expand ${label}`} className="flex h-7 w-7 items-center justify-center rounded border border-border-2 bg-card text-muted-foreground hover:bg-surface-hover" onClick={onToggle}>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button type="button" className={`min-w-0 flex-1 rounded px-2 py-1 text-left text-body-sm font-semibold ${active ? "bg-blue-600 text-white" : "text-foreground hover:bg-card"}`} onClick={onActivate}>
          {label}
        </button>
        <IconToggle active={layer.visible} label={layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => onChange({ visible: !layer.visible })}>
          {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </IconToggle>
        <IconToggle active={layer.locked} label={layer.locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onChange({ locked: !layer.locked })}>
          {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </IconToggle>
      </div>
      {expanded ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="text-[10px] font-medium uppercase text-muted-foreground">Opacity</span>
            <input className="h-5 flex-1 accent-blue-600" type="range" min="10" max="100" step="5" value={Math.round(layer.opacity * 100)} onChange={(event) => onChange({ opacity: Number(event.target.value) / 100 })} />
            <span className="w-8 text-right font-mono text-[11px] text-muted-foreground">{Math.round(layer.opacity * 100)}%</span>
          </div>
          <div className="space-y-1 p-2 pt-0">{children}</div>
        </>
      ) : null}
    </section>
  );
}

function LayerChildRow({
  label,
  detail,
  selected,
  muted,
  locked,
  visible,
  opacity,
  color = "slate",
  icon: Icon,
  onClick,
  onVisibleChange,
  onLockedChange,
  onOpacityChange,
  onRename
}: {
  label: string;
  detail: string;
  selected?: boolean;
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
  opacity?: number;
  color?: "slate" | "green" | "amber" | "blue";
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  onVisibleChange?: (visible: boolean) => void;
  onLockedChange?: (locked: boolean) => void;
  onOpacityChange?: (opacity: number) => void;
  onRename?: (name: string) => void;
}) {
  const colorClass = color === "green" ? "bg-emerald-500" : color === "amber" ? "bg-amber-400" : color === "blue" ? "bg-sky-500" : "bg-slate-400";
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(label);

  useEffect(() => setDraftName(label), [label]);

  function commitName() {
    const name = draftName.trim();
    if (name && name !== label) onRename?.(name);
    else setDraftName(label);
    setEditingName(false);
  }

  return (
    <div className={`rounded-md border ${selected ? "border-blue-500 bg-card shadow-sm" : "border-transparent bg-card/60 hover:bg-surface-hover"} ${muted ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-1 px-2 py-1.5">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-sky-600" /> : <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorClass}`} />}
        {editingName ? (
          <input
            autoFocus
            className="h-7 min-w-0 flex-1 rounded border border-blue-500 bg-card px-1.5 text-body-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-blue-200"
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
          <button type="button" className="min-w-0 flex-1 text-left" onClick={onClick}>
            <span className="block truncate text-body-sm font-medium text-foreground">{label}</span>
            <span className="block truncate font-mono text-[10px] uppercase text-muted-foreground">{detail}</span>
          </button>
        )}
        {onRename && !editingName ? (
          <button
            type="button"
            title={`Rename ${label}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground hover:border-border-2 hover:bg-card hover:text-blue-700"
            onClick={() => setEditingName(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {(onVisibleChange || onLockedChange || onOpacityChange) ? (
        <div className="flex items-center gap-1.5 border-t border-border px-2 py-1">
          {onVisibleChange ? (
            <IconToggle active={visible !== false} label={visible !== false ? `Hide ${label}` : `Show ${label}`} onClick={() => onVisibleChange(!(visible !== false))}>
              {visible !== false ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </IconToggle>
          ) : null}
          {onLockedChange ? (
            <IconToggle active={Boolean(locked)} label={locked ? `Unlock ${label}` : `Lock ${label}`} onClick={() => onLockedChange(!locked)}>
              {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            </IconToggle>
          ) : null}
          {onOpacityChange ? (
            <>
              <input className="h-5 min-w-0 flex-1 accent-blue-600" type="range" min="10" max="100" step="5" value={Math.round((opacity ?? 1) * 100)} onChange={(event) => onOpacityChange(Number(event.target.value) / 100)} />
              <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">{Math.round((opacity ?? 1) * 100)}%</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconToggle({ active, label, children, onClick }: { active: boolean; label: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-pressed={active}
      className={`flex h-7 w-7 items-center justify-center rounded border transition ${active ? "border-blue-300 bg-card text-blue-700" : "border-border-2 bg-surface-2 text-muted-foreground hover:bg-card"}`}
      onClick={onClick}
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
        className={`flex h-6 w-6 items-center justify-center rounded border transition ${layer.locked ? "border-amber-500 bg-amber-100 text-amber-800" : active ? "border-white/50 bg-white/10 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100"}`}
        onClick={(event) => {
          event.stopPropagation();
          onChange({ locked: !layer.locked });
        }}
      >
        {layer.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
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
