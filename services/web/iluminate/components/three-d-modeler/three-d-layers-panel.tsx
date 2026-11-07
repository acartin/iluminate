"use client";

import { DndContext, PointerSensor, closestCenter, type DragEndEvent, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Boxes, ChevronDown, Eye, EyeOff, Folder, FolderPlus, GripVertical, Layers3, Lock, Plus, Route, Trash2, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModelPath, ProfileContour, ThreeDLayerFolder, ThreeDModelDocument } from "@/lib/three-d-modeler/contracts";
import type { ThreeDLayerTarget } from "@/lib/three-d-modeler/layers";
import { cn } from "@/lib/utils";

type Props = {
  document: ThreeDModelDocument;
  availablePlans: ModelPath[];
  selectedObjectId: string | null;
  selectedPathId: string | null;
  solidObjects: Array<{ id: string; name: string; visible: boolean; fitClearanceMm: number; fitClearanceDirection: "outward" | "inward" }>;
  selectedSolidObjectId: string | null;
  activeTarget: ThreeDLayerTarget | null;
  onSelectObject: (id: string) => void;
  onSelectPath: (id: string) => void;
  onSelectSolidObject: (id: string) => void;
  onSetAllVisibility: (visible: boolean) => void;
  onSetAllPathVisibility: (visible: boolean) => void;
  onSetAllSolidObjectVisibility: (visible: boolean) => void;
  onToggleSolidObjectVisibility: (id: string) => void;
  onRenameSolidObject: (id: string, name: string) => void;
  onImportPlan: (plan: ModelPath) => void;
  onActivateTarget: (target: ThreeDLayerTarget | null) => void;
  onAddFolder: () => void;
  onPatchFolder: (id: string, patch: Partial<Pick<ThreeDLayerFolder, "name" | "visible" | "locked">>) => void;
  onDeleteFolder: (id: string) => void;
  onPatchObject: (id: string, patch: Partial<Pick<ProfileContour, "name" | "visible" | "locked">>) => void;
  onPatchPath: (id: string, patch: Partial<Pick<ModelPath, "name" | "visible" | "locked">>) => void;
  onMoveObject: (id: string, target: ThreeDLayerTarget, beforeObjectId?: string) => void;
};

const objectDndId = (id: string) => `object:${id}`;
const folderDndId = (id: string) => `folder:${id}`;

function VisibilityButton({ visible, label, onClick }: { visible: boolean; label?: string; onClick: () => void }) {
  const action = `${visible ? "Hide" : "Show"}${label ? ` ${label}` : ""}`;
  return <button type="button" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover" title={action} aria-label={action} onClick={(event) => { event.stopPropagation(); onClick(); }}>{visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}</button>;
}

function LockButton({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  return <button type="button" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-surface-hover" title={locked ? "Unlock" : "Lock"} aria-label={locked ? "Unlock" : "Lock"} onClick={(event) => { event.stopPropagation(); onClick(); }}>{locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}</button>;
}

function InlineName({ value, editing, onEditingChange, onCommit }: { value: string; editing: boolean; onEditingChange: (editing: boolean) => void; onCommit: (name: string) => void }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
  }, [editing]);
  function commit() {
    const name = draft.trim();
    onEditingChange(false);
    if (name && name !== value) onCommit(name);
    else setDraft(value);
  }
  if (!editing) return <span className="min-w-0 flex-1 truncate text-left" title={`${value} · Click to rename`}>{value}</span>;
  return <input ref={inputRef} type="text" value={draft} maxLength={80} aria-label={`Rename ${value}`} className="h-7 min-w-0 flex-1 rounded border border-blue-400 bg-card px-1.5 text-foreground outline-none ring-2 ring-blue-500/30" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setDraft(value); onEditingChange(false); } }} />;
}

function ObjectRow({ object, selected, masked, dragDisabled, editing, onBeginEdit, onEditingChange, onSelect, onPatch }: { object: ProfileContour; selected: boolean; masked: boolean; dragDisabled: boolean; editing: boolean; onBeginEdit: () => void; onEditingChange: (editing: boolean) => void; onSelect: () => void; onPatch: Props["onPatchObject"] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: objectDndId(object.id), disabled: dragDisabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} className={cn("group flex min-h-9 items-center gap-1 rounded px-1 text-body-sm hover:bg-surface-hover", selected && !editing && "bg-blue-600 text-white hover:bg-blue-600", isDragging && "z-50 opacity-60")} onClick={() => { onSelect(); onBeginEdit(); }}>
    <button type="button" disabled={dragDisabled} className="flex h-7 w-6 cursor-grab items-center justify-center opacity-50 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-20" title={dragDisabled ? "Unlock this object and folder to drag" : "Drag object"} aria-label={`Drag ${object.name}`} onClick={(event) => event.stopPropagation()} {...attributes} {...listeners}><GripVertical className="h-3.5 w-3.5" /></button>
    <span className={cn("h-2.5 w-2.5 rounded-full bg-violet-500", masked && "opacity-30")} />
    <InlineName key={`${object.name}:${editing}`} value={object.name} editing={editing} onEditingChange={onEditingChange} onCommit={(name) => onPatch(object.id, { name })} />
    <VisibilityButton visible={object.visible} onClick={() => onPatch(object.id, { visible: !object.visible })} />
    <LockButton locked={object.locked} onClick={() => onPatch(object.id, { locked: !object.locked })} />
  </div>;
}

function DropContainer({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={cn(className, isOver && "ring-1 ring-inset ring-blue-500")}>{children}</div>;
}

function FixedRow({ name, selected, visible, locked, color, detail, editing, onBeginEdit, onEditingChange, onRename, onSelect, onVisibility, onLock }: { name: string; selected: boolean; visible: boolean; locked?: boolean; color: string; detail?: ReactNode; editing: boolean; onBeginEdit: () => void; onEditingChange: (editing: boolean) => void; onRename: (name: string) => void; onSelect: () => void; onVisibility: () => void; onLock?: () => void }) {
  return <div className={cn("flex min-h-9 items-center gap-2 rounded px-2 text-body-sm hover:bg-surface-hover", selected && !editing && "bg-blue-600 text-white hover:bg-blue-600")} onClick={() => { onSelect(); onBeginEdit(); }}><span className={cn("h-2.5 w-2.5 rounded-full", color)} /><InlineName value={name} editing={editing} onEditingChange={onEditingChange} onCommit={onRename}/>{!editing ? detail : null}<VisibilityButton visible={visible} onClick={onVisibility}/>{onLock ? <LockButton locked={Boolean(locked)} onClick={onLock}/> : null}</div>;
}

export function ThreeDLayersPanel(props: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [plansOpen, setPlansOpen] = useState(true);
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [solidObjectsOpen, setSolidObjectsOpen] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const contours = new Map(props.document.profile.contours.map((contour) => [contour.id, contour]));
  const importedSources = new Set(props.document.modelPaths.map((path) => path.source.sourceName));
  const availablePlans = props.availablePlans.filter((path) => !importedSources.has(path.source.sourceName));
  const allPathsVisible = props.document.modelPaths.length > 0 && props.document.modelPaths.every((path) => path.visible);
  const allSolidObjectsVisible = props.solidObjects.length > 0 && props.solidObjects.every((solid) => solid.visible);
  const visibilityStates = [
    ...props.document.modelPaths.map((path) => path.visible),
    ...props.document.profile.contours.map((contour) => contour.visible),
    ...props.solidObjects.map((solid) => solid.visible),
  ];
  const allLayersVisible = visibilityStates.length > 0 && visibilityStates.every(Boolean);

  function finishDrag(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : "";
    if (!activeId.startsWith("object:") || !overId) return;
    const objectId = activeId.slice(7);
    if (overId === "root") props.onMoveObject(objectId, { type: "root" });
    else if (overId.startsWith("folder:")) props.onMoveObject(objectId, { type: "folder", id: overId.slice(7) });
    else if (overId.startsWith("object:")) {
      const beforeId = overId.slice(7);
      const folder = props.document.layers.folders.find((entry) => entry.objectIds.includes(beforeId));
      props.onMoveObject(objectId, folder ? { type: "folder", id: folder.id } : { type: "root" }, beforeId);
    }
  }

  const rootObjects = props.document.layers.rootObjectIds.map((id) => contours.get(id)).filter((value): value is ProfileContour => Boolean(value));
  return <aside role="tree" aria-label="Layers" className="flex min-h-0 w-[330px] shrink-0 flex-col border-l border-border-2 bg-card">
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border-2 px-3 text-body-sm font-semibold"><Layers3 className="h-4 w-4 text-blue-600" />Layers<div className="ml-auto flex items-center gap-1"><VisibilityButton visible={allLayersVisible} label="all Layers" onClick={() => props.onSetAllVisibility(!allLayersVisible)} /><Button density="compact" variant="ghost" className="w-8 px-0" aria-label="New folder" onClick={props.onAddFolder}><FolderPlus className="h-4 w-4" /></Button></div></div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={finishDrag}>
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <section className="relative mb-1 rounded border border-border/60">
          <div className="flex h-9 items-center px-2 text-body-sm font-semibold"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={plansOpen} onClick={() => setPlansOpen((value) => !value)}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !plansOpen && "-rotate-90")}/><Route className="h-3.5 w-3.5 text-cyan-500"/>Paths <span className="ml-auto text-meta text-muted-foreground">{props.document.modelPaths.length}</span></button><VisibilityButton visible={allPathsVisible} label="all Paths" onClick={() => props.onSetAllPathVisibility(!allPathsVisible)}/><button type="button" className="ml-1 flex h-7 w-7 items-center justify-center rounded text-blue-600 hover:bg-blue-500/10" aria-label="Import Path" title="Import from Fabrication Plans" onClick={() => setPlanPickerOpen((value) => !value)}><Plus className="h-4 w-4"/></button></div>
          {planPickerOpen ? <div className="absolute left-2 right-2 top-10 z-30 max-h-64 overflow-y-auto rounded-md border border-border-2 bg-card p-2 shadow-xl"><div className="mb-2 flex items-center justify-between text-label font-semibold uppercase text-muted-foreground"><span>Fabrication Plans</span><button type="button" className="rounded px-1 text-lg leading-none hover:bg-surface-hover" aria-label="Close Fabrication Plans" onClick={() => setPlanPickerOpen(false)}>×</button></div>{availablePlans.map((plan) => <button key={plan.source.sourceName} type="button" className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-body-sm hover:bg-surface-hover" onClick={() => { props.onImportPlan(plan); setPlanPickerOpen(false); }}><span className="h-2.5 w-2.5 rounded-full border border-cyan-500"/><span className="min-w-0 flex-1 truncate" title={plan.name}>{plan.name}</span><Plus className="h-3.5 w-3.5 text-blue-600"/></button>)}{!availablePlans.length ? <div className="px-2 py-3 text-meta text-muted-foreground">All available plans are already materialized, or the active Designer document has no plans.</div> : null}</div> : null}
          {plansOpen ? <div className="px-1 pb-1">{props.document.modelPaths.map((path) => <FixedRow key={path.id} name={path.name} selected={props.selectedPathId === path.id} visible={path.visible} locked={path.locked} color="bg-cyan-500" editing={editingKey === `path:${path.id}`} onBeginEdit={() => setEditingKey(`path:${path.id}`)} onEditingChange={(editing) => setEditingKey(editing ? `path:${path.id}` : null)} onRename={(name) => props.onPatchPath(path.id, { name })} onSelect={() => props.onSelectPath(path.id)} onVisibility={() => props.onPatchPath(path.id, { visible: !path.visible })} onLock={() => props.onPatchPath(path.id, { locked: !path.locked })}/>)}{!props.document.modelPaths.length ? <div className="px-2 py-2 text-meta text-muted-foreground">Use + to import a Fabrication Plan as a Path.</div> : null}</div> : null}
        </section>
        <section className="mb-1 rounded border border-border/60">
          <div className="flex h-9 items-center px-2 text-body-sm font-semibold"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={solidObjectsOpen} onClick={() => setSolidObjectsOpen((value) => !value)}><ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !solidObjectsOpen && "-rotate-90")}/><Boxes className="h-3.5 w-3.5 text-emerald-500"/>Solid Objects <span className="ml-auto text-meta text-muted-foreground">{props.solidObjects.length}</span></button><VisibilityButton visible={allSolidObjectsVisible} label="all Solid Objects" onClick={() => props.onSetAllSolidObjectVisibility(!allSolidObjectsVisible)}/></div>
          {solidObjectsOpen ? <div className="px-1 pb-1">{props.solidObjects.length ? props.solidObjects.map((solid) => <FixedRow key={solid.id} name={solid.name} selected={props.selectedSolidObjectId === solid.id} visible={solid.visible} color="bg-emerald-500" detail={<span className={cn("shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none", solid.fitClearanceMm > 0 ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "border-border text-muted-foreground", props.selectedSolidObjectId === solid.id && "border-white/40 text-current")} title={`Fit clearance: ${solid.fitClearanceMm.toFixed(2)} mm per side${solid.fitClearanceMm > 0 ? ` · ${solid.fitClearanceDirection}` : ""}`}>C {solid.fitClearanceMm.toFixed(2)}{solid.fitClearanceMm > 0 ? ` ${solid.fitClearanceDirection === "outward" ? "OUT" : "IN"}` : ""}</span>} editing={editingKey === `solid:${solid.id}`} onBeginEdit={() => setEditingKey(`solid:${solid.id}`)} onEditingChange={(editing) => setEditingKey(editing ? `solid:${solid.id}` : null)} onRename={(name) => props.onRenameSolidObject(solid.id, name)} onSelect={() => props.onSelectSolidObject(solid.id)} onVisibility={() => props.onToggleSolidObjectVisibility(solid.id)}/>) : <div className="px-2 py-2 text-meta text-muted-foreground">Successful Sweep results appear here.</div>}</div> : null}
        </section>
        <div className="flex h-8 items-center px-2 text-label font-semibold uppercase text-muted-foreground">Profiles</div>
        <DropContainer id="root" className={cn("mb-1 min-h-2 rounded border border-transparent", props.activeTarget?.type === "root" && "border-blue-500/60 bg-blue-500/5")}>
          <SortableContext items={rootObjects.map((object) => objectDndId(object.id))} strategy={verticalListSortingStrategy}>
            {rootObjects.map((object) => <ObjectRow key={object.id} object={object} selected={props.selectedObjectId === object.id} masked={false} dragDisabled={object.locked} editing={editingKey === `profile:${object.id}`} onBeginEdit={() => setEditingKey(`profile:${object.id}`)} onEditingChange={(editing) => setEditingKey(editing ? `profile:${object.id}` : null)} onSelect={() => props.onSelectObject(object.id)} onPatch={props.onPatchObject} />)}
          </SortableContext>
        </DropContainer>
        {props.document.layers.folders.map((folder) => {
          const objects = folder.objectIds.map((id) => contours.get(id)).filter((value): value is ProfileContour => Boolean(value));
          return <DropContainer key={folder.id} id={folderDndId(folder.id)} className={cn("mb-1 rounded border border-transparent", props.activeTarget?.type === "folder" && props.activeTarget.id === folder.id && "border-blue-500/60 bg-blue-500/5")}>
            <div className="flex h-9 items-center gap-1 px-1 text-body-sm font-semibold" onClick={() => { props.onActivateTarget(props.activeTarget?.type === "folder" && props.activeTarget.id === folder.id ? null : { type: "folder", id: folder.id }); setEditingKey(`folder:${folder.id}`); }}>
              <ChevronDown className="h-3.5 w-3.5" /><Folder className="h-3.5 w-3.5 text-blue-600" />
              <InlineName key={`${folder.name}:${editingKey === `folder:${folder.id}`}`} value={folder.name} editing={editingKey === `folder:${folder.id}`} onEditingChange={(editing) => setEditingKey(editing ? `folder:${folder.id}` : null)} onCommit={(name) => props.onPatchFolder(folder.id, { name })} />
              <VisibilityButton visible={folder.visible} onClick={() => props.onPatchFolder(folder.id, { visible: !folder.visible })} />
              <LockButton locked={folder.locked} onClick={() => props.onPatchFolder(folder.id, { locked: !folder.locked })} />
              <button type="button" className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="Delete empty folder" aria-label="Delete empty folder" disabled={objects.length > 0} onClick={(event) => { event.stopPropagation(); props.onDeleteFolder(folder.id); }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <SortableContext items={objects.map((object) => objectDndId(object.id))} strategy={verticalListSortingStrategy}>
              <div className="pl-4">{objects.map((object) => <ObjectRow key={object.id} object={object} selected={props.selectedObjectId === object.id} masked={!folder.visible} dragDisabled={object.locked || folder.locked} editing={editingKey === `profile:${object.id}`} onBeginEdit={() => setEditingKey(`profile:${object.id}`)} onEditingChange={(editing) => setEditingKey(editing ? `profile:${object.id}` : null)} onSelect={() => props.onSelectObject(object.id)} onPatch={props.onPatchObject} />)}</div>
            </SortableContext>
          </DropContainer>;
        })}
      </div>
    </DndContext>
  </aside>;
}
