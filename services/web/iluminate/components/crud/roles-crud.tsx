"use client";

import { Badge } from "@/components/ui/badge";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudResourceConfig } from "./types";

type RoleRecord = Record<string, unknown> & {
  id: string;
  label: string;
  scope: string;
  description: string;
  users?: number;
  permissions?: number;
};

const scopeOptions: CrudChoice[] = [
  { value: "system", label: "System" },
  { value: "client", label: "Client" }
];

function badgeForScope(scope: string) {
  const classes: Record<string, string> = {
    system: "bg-[var(--purple-bg)] text-[var(--purple-text)]",
    client: "bg-[var(--blue-bg)] text-[var(--blue-text)]"
  };

  return <Badge className={classes[scope] ?? undefined}>{scope}</Badge>;
}

const rolesCrudConfig: CrudResourceConfig<RoleRecord> = {
  id: "settings.roles",
  title: "Roles",
  eyebrow: "role",
  description: "System and client roles used by the copied auth contract.",
  createLabel: "Create role",
  createAction: "/api/settings/roles",
  rowActionBasePath: "/api/settings/roles",
  identityField: "id",
  titleField: "label",
  searchPlaceholder: "Search role, scope or description",
  emptyTitle: "No roles match the current filters",
  emptyDescription: "The baseline seed creates system and client roles.",
  allowedActions: ["view", "edit"],
  filters: [{ key: "scope", label: "Scope", allLabel: "All scopes", options: scopeOptions }],
  columns: [
    {
      id: "label",
      header: "Role",
      searchValue: (record) => `${record.id} ${record.label} ${record.description}`,
      cell: (record) => (
        <div className="min-w-56">
          <div className="font-medium text-foreground">{record.label}</div>
          <div className="text-meta text-muted-foreground">{record.id}</div>
        </div>
      )
    },
    {
      id: "scope",
      header: "Scope",
      cell: (record) => badgeForScope(String(record.scope)),
      sortValue: (record) => String(record.scope)
    },
    { id: "users", header: "Users" },
    { id: "permissions", header: "Permissions" },
    { id: "description", header: "Description" }
  ],
  createFields: [
    { label: "Role ID", name: "id", helperText: "Use ids like client-installer or operator." },
    { label: "Label", name: "label" },
    { label: "Scope", name: "scope", control: "select", defaultValue: "client", options: scopeOptions },
    { label: "Description", name: "description", control: "textarea", required: false }
  ],
  editFields: [
    { label: "Role ID", name: "id", editable: false },
    { label: "Label", name: "label" },
    { label: "Scope", name: "scope", control: "select", options: scopeOptions },
    { label: "Description", name: "description", control: "textarea", required: false },
    { label: "Users", name: "users", editable: false },
    { label: "Permissions", name: "permissions", editable: false }
  ]
};

export function RolesCrud({ payload }: { payload: ModulePayload }) {
  return <CrudResourcePage config={rolesCrudConfig} records={payload.records as RoleRecord[]} />;
}
