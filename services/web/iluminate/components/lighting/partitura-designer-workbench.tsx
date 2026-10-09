"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CrudResourcePage } from "@/components/crud/crud-resource-page";
import { CrudResourceConfig } from "@/components/crud/types";
import type { PersistedPartitura } from "@/lib/lighting/partitura-model";
import type { PersistedProject } from "@/lib/server/projects";

type DesignerRecord = Record<string, unknown> & {
  id: string;
  name: string;
  client: string;
  projectId: string;
  project: string;
  status: string;
  canvas: string;
  pixelsPerMeter: number;
  ledsPerMeter: number;
  zones: number;
  routes: number;
  pixels: number;
  updatedAt: string;
};

const designerCrudConfig: CrudResourceConfig<DesignerRecord> = {
  id: "lighting.designer",
  title: "Designer",
  eyebrow: "lighting",
  description: "Open a full-screen visual composer for a client partitura.",
  createLabel: "Create partitura",
  createAction: "/api/lighting/partituras",
  rowActionBasePath: "/api/lighting/partituras",
  identityField: "id",
  titleField: "name",
  searchPlaceholder: "Search partitura, client or status",
  emptyTitle: "No partituras match the current filters",
  emptyDescription: "Create a partitura before opening the visual designer.",
  canCreate: false,
  allowedActions: ["workspace"],
  workspaceLabel: "Open designer",
  workspaceHref: (record) => `/partituras/designer/${encodeURIComponent(record.id)}`,
  filters: [
    {
      key: "status",
      label: "Status",
      allLabel: "All statuses",
      options: [
        { value: "draft", label: "Draft" },
        { value: "validated", label: "Validated" },
        { value: "active", label: "Active" },
        { value: "archived", label: "Archived" }
      ]
    }
  ],
  columns: [
    {
      id: "name",
      header: "Partitura",
      searchValue: (record) => `${record.name} ${record.id}`,
      cell: (record) => (
        <div className="min-w-56">
          <div className="font-medium text-foreground">{record.name}</div>
          <div className="font-mono text-meta text-muted-foreground">{record.id}</div>
        </div>
      )
    },
    { id: "client", header: "Client" },
    { id: "project", header: "Project" },
    { id: "canvas", header: "Canvas", className: "font-mono" },
    { id: "pixelsPerMeter", header: "Pixels/m", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "ledsPerMeter", header: "LEDs/m", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "zones", header: "Zones", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "routes", header: "Routes", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "pixels", header: "Pixels", className: "text-right font-mono", headerClassName: "text-right" },
    {
      id: "status",
      header: "Status",
      cell: (record) => <Badge>{record.status}</Badge>,
      sortValue: (record) => record.status
    },
    { id: "updatedAt", header: "Updated" }
  ],
  createFields: [],
  editFields: []
};

function recordFromPartitura(partitura: PersistedPartitura, projectName: string): DesignerRecord {
  const designer = partitura.document.designer;
  return {
    id: partitura.id,
    name: partitura.name,
    client: partitura.clientName,
    projectId: partitura.projectId,
    project: projectName,
    status: partitura.status,
    canvas: designer ? `${designer.canvasWidthCm}x${designer.canvasHeightCm} cm` : "Not configured",
    pixelsPerMeter: designer?.addressablePixelsPerMeter ?? designer?.ledDensityPerMeter ?? 0,
    ledsPerMeter: designer?.ledsPerMeter ?? designer?.addressablePixelsPerMeter ?? designer?.ledDensityPerMeter ?? 0,
    zones: designer?.zones.length ?? 0,
    routes: designer?.routes.length ?? 0,
    pixels: partitura.document.compiledLayout?.pixelMap.length ?? 0,
    updatedAt: new Date(partitura.updatedAt).toLocaleString()
  };
}

export function PartituraDesignerWorkbench() {
  const [records, setRecords] = useState<PersistedPartitura[]>([]);
  const [projects, setProjects] = useState<PersistedProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      setLoading(true);
      try {
        const [partiturasResponse, projectsResponse] = await Promise.all([
          fetch("/api/lighting/partituras", { cache: "no-store" }),
          fetch("/api/lighting/projects", { cache: "no-store" })
        ]);
        const [partiturasPayload, projectsPayload] = await Promise.all([
          partiturasResponse.json() as Promise<{ records?: PersistedPartitura[] }>,
          projectsResponse.json() as Promise<{ records?: PersistedProject[] }>
        ]);
        if (!cancelled) {
          setRecords(partiturasPayload.records ?? []);
          setProjects(projectsPayload.records ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const gridRecords = useMemo(
    () => records.map((partitura) => recordFromPartitura(partitura, projectNames.get(partitura.projectId) ?? "Unknown project")),
    [projectNames, records]
  );
  const effectiveConfig = useMemo<CrudResourceConfig<DesignerRecord>>(() => ({
    ...designerCrudConfig,
    filters: [
      ...(designerCrudConfig.filters ?? []),
      {
        key: "projectId",
        label: "Project",
        allLabel: "All projects",
        options: projects.map((project) => ({ value: project.id, label: project.name }))
      }
    ]
  }), [projects]);

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge>{loading ? "Loading" : "Visual composer"}</Badge>
          <Badge>pixelMap</Badge>
        </div>
        <h1 className="text-page-title font-light">Designer</h1>
        <p className="mt-2 max-w-3xl text-page-subtitle text-muted-foreground">
          Select a tenant partitura and open the full-screen composer for zones, physical scale and LED routing.
        </p>
      </div>

      <CrudResourcePage config={effectiveConfig} records={gridRecords} />
    </div>
  );
}
