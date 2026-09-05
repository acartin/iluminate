"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { CrudResourcePage } from "@/components/crud/crud-resource-page";
import { CrudResourceConfig } from "@/components/crud/types";
import { PersistedPartitura } from "@/lib/lighting/partitura-model";

type DesignerRecord = Record<string, unknown> & {
  id: string;
  name: string;
  client: string;
  status: string;
  canvas: string;
  density: number;
  zones: number;
  routes: number;
  leds: number;
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
    { id: "canvas", header: "Canvas", className: "font-mono" },
    { id: "density", header: "LED/m", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "zones", header: "Zones", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "routes", header: "Routes", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "leds", header: "LEDs", className: "text-right font-mono", headerClassName: "text-right" },
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

function recordFromPartitura(partitura: PersistedPartitura): DesignerRecord {
  const designer = partitura.document.designer;
  return {
    id: partitura.id,
    name: partitura.name,
    client: partitura.clientName,
    status: partitura.status,
    canvas: designer ? `${designer.canvasWidthCm}x${designer.canvasHeightCm} cm` : "Not configured",
    density: designer?.ledDensityPerMeter ?? 0,
    zones: designer?.zones.length ?? partitura.document.zones.length,
    routes: designer?.routes.length ?? 0,
    leds: partitura.document.chain1Pixels + partitura.document.chain2Pixels + partitura.document.chain3Pixels,
    updatedAt: new Date(partitura.updatedAt).toLocaleString()
  };
}

export function PartituraDesignerWorkbench() {
  const [records, setRecords] = useState<PersistedPartitura[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadRecords() {
      setLoading(true);
      try {
        const response = await fetch("/api/lighting/partituras", { cache: "no-store" });
        const payload = (await response.json()) as { records?: PersistedPartitura[] };
        if (!cancelled) setRecords(payload.records ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRecords();
    return () => {
      cancelled = true;
    };
  }, []);

  const gridRecords = useMemo(() => records.map(recordFromPartitura), [records]);

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

      <CrudResourcePage config={designerCrudConfig} records={gridRecords} />
    </div>
  );
}
