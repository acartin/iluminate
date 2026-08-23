"use client";

import { Badge } from "@/components/ui/badge";
import { roleOptions } from "@/lib/modules";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudResourceConfig } from "./types";

type UserRecord = Record<string, unknown> & {
  id: string;
  username: string;
  email: string;
  display_name: string;
  primary_role_id: string;
  default_client_id: string;
  roles: string;
  clients: string;
  status: string;
  client_options?: CrudChoice[];
};

const statusOptions: CrudChoice[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "locked", label: "Locked" }
];

function badgeForStatus(status: string) {
  const classes: Record<string, string> = {
    active: "bg-[var(--green-bg)] text-[var(--green-text)]",
    inactive: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    locked: "bg-[var(--red-bg)] text-[var(--red-text)]"
  };

  return <Badge className={classes[status] ?? undefined}>{status}</Badge>;
}

const usersCrudConfig: CrudResourceConfig<UserRecord> = {
  id: "settings.users",
  title: "Users",
  eyebrow: "user",
  description: "Account lifecycle, client membership and role-based access for Iluminate staff and partner users.",
  createLabel: "Create user",
  createAction: "/api/settings/users",
  rowActionBasePath: "/api/settings/users",
  identityField: "id",
  titleField: "display_name",
  searchPlaceholder: "Search name, email, role or client",
  emptyTitle: "No users match the current filters",
  emptyDescription: "Adjust search or filters and try again.",
  allowedActions: ["view", "edit", "deactivate"],
  filters: [
    { key: "status", label: "Status", allLabel: "All statuses", options: statusOptions },
    { key: "primary_role_id", label: "Role", allLabel: "All roles", options: roleOptions.map((role) => ({ value: role.id, label: role.label })) }
  ],
  columns: [
    {
      id: "display_name",
      header: "Name",
      searchValue: (record) => `${record.display_name} ${record.email}`,
      cell: (record) => (
        <div className="min-w-48">
          <div className="font-medium text-foreground">{record.display_name}</div>
          <div className="text-meta text-muted-foreground">{record.username} · {record.email}</div>
        </div>
      )
    },
    { id: "roles", header: "Roles", searchValue: (record) => `${record.roles}` },
    { id: "clients", header: "Clients", searchValue: (record) => `${record.clients} ${record.default_client_id}` },
    {
      id: "status",
      header: "Status",
      cell: (record) => badgeForStatus(String(record.status)),
      sortValue: (record) => String(record.status)
    },
    { id: "id", header: "User ID" }
  ],
  createFields: [
    { label: "Username", name: "username" },
    { label: "Email", name: "email", type: "email" },
    { label: "Display name", name: "display_name" },
    {
      label: "Roles",
      name: "role_ids",
      control: "checkbox-group",
      options: roleOptions.map((role) => ({ value: role.id, label: role.label }))
    },
    {
      label: "Client",
      name: "client_id",
      control: "select",
      defaultValue: "1",
      options: [{ value: "1", label: "Iluminate" }],
      optionsSource: "client_options",
      helperText: "Stored as client_id, matching the auth contract."
    },
    {
      label: "Status",
      name: "status",
      control: "select",
      defaultValue: "active",
      options: statusOptions
    },
    { label: "Temporary password", name: "password", type: "password", minLength: 8, helperText: "Required until invitation delivery is connected." }
  ],
  editFields: [
    { label: "User ID", name: "id", editable: false },
    { label: "Username", name: "username", editable: false },
    { label: "Email", name: "email", type: "email", editable: false },
    { label: "Display name", name: "display_name" },
    {
      label: "Roles",
      name: "role_ids",
      sourceName: "roles",
      control: "checkbox-group",
      options: roleOptions.map((role) => ({ value: role.id, label: role.label }))
    },
    {
      label: "Client",
      name: "client_id",
      sourceName: "default_client_id",
      control: "select",
      options: [{ value: "1", label: "Iluminate" }],
      optionsSource: "client_options"
    },
    {
      label: "Status",
      name: "status",
      control: "select",
      options: statusOptions
    },
    { label: "Temporary password", name: "password", type: "password", minLength: 8, required: false, editOnly: true }
  ]
};

export function UsersCrud({ payload }: { payload: ModulePayload }) {
  return <CrudResourcePage config={usersCrudConfig} records={payload.records as UserRecord[]} />;
}
