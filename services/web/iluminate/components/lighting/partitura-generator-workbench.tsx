"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { CrudResourcePage } from "@/components/crud/crud-resource-page";
import { CrudResourceConfig } from "@/components/crud/types";
import { PersistedPartitura } from "@/lib/lighting/partitura-model";

type PartituraRecord = Record<string, unknown> & {
  id: string;
  name: string;
  client: string;
  status: string;
  scenes: number;
  clips: number;
  leds: number;
  updatedAt: string;
  _actions: Array<{ label: string; href: string; icon?: "copy" }>;
};

const partituraCrudConfig: CrudResourceConfig<PartituraRecord> = {
  id: "lighting.partituras",
  title: "Partituras",
  eyebrow: "partitura",
  description: "Client-scoped lighting partituras. Open a partitura workspace to manage scenes, layout and simulation.",
  createLabel: "Create partitura",
  createAction: "/api/lighting/partituras",
  rowActionBasePath: "/api/lighting/partituras",
  identityField: "id",
  titleField: "name",
  searchPlaceholder: "Search partitura, client or status",
  emptyTitle: "No partituras match the current filters",
  emptyDescription: "Create a partitura for the active client before editing scenes.",
  canCreate: false,
  allowedActions: ["workspace", "delete"],
  workspaceLabel: "Open partitura workspace",
  workspaceHref: (record) => `/partituras/generator/${encodeURIComponent(record.id)}`,
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
    { id: "scenes", header: "Scenes", className: "text-right font-mono", headerClassName: "text-right" },
    { id: "clips", header: "Clips", className: "text-right font-mono", headerClassName: "text-right" },
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

function recordFromPartitura(partitura: PersistedPartitura): PartituraRecord {
  return {
    id: partitura.id,
    name: partitura.name,
    client: partitura.clientName,
    status: partitura.status,
    scenes: partitura.document.scenes.length,
    clips: partitura.document.scenes.reduce((total, scene) => total + scene.clips.length, 0),
    leds: partitura.document.compiledLayout?.pixelMap.length ?? 0,
    updatedAt: new Date(partitura.updatedAt).toLocaleString(),
    _actions: [{ label: "Duplicate", href: `duplicate:${partitura.id}`, icon: "copy" }]
  };
}

export function PartituraGeneratorWorkbench() {
  const router = useRouter();
  const [records, setRecords] = useState<PersistedPartitura[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadRecords() {
    setLoading(true);
    try {
      const response = await fetch("/api/lighting/partituras", { cache: "no-store" });
      const payload = (await response.json()) as { records?: PersistedPartitura[] };
      setRecords(payload.records ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords();
  }, []);

  const gridRecords = useMemo(() => records.map(recordFromPartitura), [records]);

  async function duplicatePartitura(id: string) {
    const source = records.find((partitura) => partitura.id === id);
    if (!source) return;
    const response = await fetch("/api/lighting/partituras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: source.projectId, duplicateOf: id })
    });
    const payload = (await response.json()) as { partitura?: PersistedPartitura };
    if (payload.partitura) router.push(`/partituras/generator/${encodeURIComponent(payload.partitura.id)}`);
  }

  function handleAction(action: string) {
    const [verb, id] = action.split(":");
    if (verb === "duplicate") void duplicatePartitura(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <Badge>{loading ? "Loading" : "Persistent"}</Badge>
          <Badge>partitura.v1</Badge>
        </div>
        <h1 className="text-page-title font-light">Partituras</h1>
        <p className="mt-2 max-w-3xl text-page-subtitle text-muted-foreground">
          Client partituras backed by Postgres. Open one to manage scenes, layout and simulator playback in a workspace.
        </p>
      </div>

      <CrudResourcePage
        config={partituraCrudConfig}
        records={gridRecords}
        onNavigateAction={handleAction}
      />
    </div>
  );
}
