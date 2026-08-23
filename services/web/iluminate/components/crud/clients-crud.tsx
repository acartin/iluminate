"use client";

import { Badge } from "@/components/ui/badge";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudResourceConfig } from "./types";

type ClientRecord = Record<string, unknown> & {
  id: string;
  client_key: string;
  name: string;
  market: string;
  mode: string;
  status: string;
  users?: number;
};

const statusOptions: CrudChoice[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" }
];

const modeOptions: CrudChoice[] = [
  { value: "customer", label: "Customer" },
  { value: "internal", label: "Internal" },
  { value: "demo", label: "Demo" }
];

function badgeForStatus(status: string) {
  const classes: Record<string, string> = {
    active: "bg-[var(--green-bg)] text-[var(--green-text)]",
    inactive: "bg-[var(--amber-bg)] text-[var(--amber-text)]"
  };

  return <Badge className={classes[status] ?? undefined}>{status}</Badge>;
}

const clientsCrudConfig: CrudResourceConfig<ClientRecord> = {
  id: "settings.clients",
  title: "Clients",
  eyebrow: "client",
  description: "Tenant records used to scope Iluminate users, projects, controllers and partituras.",
  createLabel: "Create client",
  createAction: "/api/settings/clients",
  rowActionBasePath: "/api/settings/clients",
  identityField: "id",
  titleField: "name",
  searchPlaceholder: "Search client, key, market or mode",
  emptyTitle: "No clients match the current filters",
  emptyDescription: "Create a client before assigning users or projects.",
  allowedActions: ["view", "edit", "deactivate"],
  filters: [
    { key: "status", label: "Status", allLabel: "All statuses", options: statusOptions },
    { key: "mode", label: "Mode", allLabel: "All modes", options: modeOptions }
  ],
  columns: [
    {
      id: "name",
      header: "Client",
      searchValue: (record) => `${record.name} ${record.client_key}`,
      cell: (record) => (
        <div className="min-w-48">
          <div className="font-medium text-foreground">{record.name}</div>
          <div className="text-meta text-muted-foreground">{record.client_key}</div>
        </div>
      )
    },
    { id: "market", header: "Market" },
    { id: "mode", header: "Mode" },
    { id: "users", header: "Users" },
    {
      id: "status",
      header: "Status",
      cell: (record) => badgeForStatus(String(record.status)),
      sortValue: (record) => String(record.status)
    }
  ],
  createFields: [
    { label: "Client key", name: "client_key", helperText: "Stable lowercase key used by APIs." },
    { label: "Name", name: "name" },
    { label: "Market", name: "market", defaultValue: "CR" },
    { label: "Mode", name: "mode", control: "select", defaultValue: "customer", options: modeOptions }
  ],
  editFields: [
    { label: "Client ID", name: "id", editable: false },
    { label: "Client key", name: "client_key", editable: false },
    { label: "Name", name: "name" },
    { label: "Market", name: "market" },
    { label: "Mode", name: "mode", control: "select", options: modeOptions },
    { label: "Status", name: "status", control: "select", options: statusOptions },
    { label: "Users", name: "users", editable: false }
  ]
};

export function ClientsCrud({ payload }: { payload: ModulePayload }) {
  return <CrudResourcePage config={clientsCrudConfig} records={payload.records as ClientRecord[]} />;
}
