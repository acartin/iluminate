"use client";

import { Badge } from "@/components/ui/badge";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudResourceConfig } from "./types";

type TenantRecord = Record<string, unknown> & {
  id: string;
  tenant_key: string;
  display_name: string;
  legal_name?: string;
  vertical: string;
  country_code: string;
  country?: string;
  timezone: string;
  status: string;
  users: number;
};

const statusOptions: CrudChoice[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" }
];

const verticalOptions: CrudChoice[] = [
  { value: "hospitality", label: "Hospitality" },
  { value: "internal", label: "Internal" },
  { value: "other", label: "Other" }
];

const fallbackCountryOptions: CrudChoice[] = [
  { value: "US", label: "United States (USA)" },
  { value: "CA", label: "Canada (CAN)" },
  { value: "MX", label: "Mexico (MEX)" },
  { value: "CR", label: "Costa Rica (CRI)" }
];

function badgeForStatus(status: string) {
  const classes: Record<string, string> = {
    active: "bg-[var(--green-bg)] text-[var(--green-text)]",
    inactive: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    suspended: "bg-[var(--red-bg)] text-[var(--red-text)]"
  };

  return <Badge className={classes[status] ?? undefined}>{status}</Badge>;
}

function countryOptionsFromPayload(payload: ModulePayload): CrudChoice[] {
  const options = payload.filters?.country_options;
  if (!Array.isArray(options)) return fallbackCountryOptions;

  const parsed = options.filter((option): option is CrudChoice => {
    if (!option || typeof option !== "object") return false;
    const choice = option as Record<string, unknown>;
    return typeof choice.value === "string" && typeof choice.label === "string";
  });

  return parsed.length > 0 ? parsed : fallbackCountryOptions;
}

function tenantsCrudConfig(countryOptions: CrudChoice[]): CrudResourceConfig<TenantRecord> {
  return {
  id: "settings.tenants",
  title: "Tenants",
  eyebrow: "tenant",
  description: "Tenant records are the entry point for partner configuration, service policy and operational workspaces.",
  createLabel: "Create tenant",
  createAction: "/api/settings/tenants",
  rowActionBasePath: "/api/settings/tenants",
  identityField: "id",
  titleField: "display_name",
  searchPlaceholder: "Search tenant, key, vertical or timezone",
  emptyTitle: "No tenants match the current filters",
  emptyDescription: "Adjust search or filters and try again.",
  allowedActions: ["view", "workspace", "edit", "delete"],
  workspaceLabel: "Open workspace",
  workspaceHref: (record) => `/settings/tenants/${encodeURIComponent(record.tenant_key)}`,
  filters: [
    { key: "status", label: "Status", allLabel: "All statuses", options: statusOptions },
    { key: "vertical", label: "Vertical", allLabel: "All verticals", options: verticalOptions },
    { key: "country_code", label: "Country", allLabel: "All countries", options: countryOptions }
  ],
  columns: [
    {
      id: "display_name",
      header: "Tenant",
      searchValue: (record) =>
        `${record.display_name} ${record.tenant_key} ${record.legal_name ?? ""} ${record.country ?? ""} ${record.country_code}`,
      cell: (record) => (
        <div className="min-w-56">
          <div className="font-medium text-foreground">{record.display_name}</div>
          <div className="text-meta text-muted-foreground">{record.tenant_key}</div>
        </div>
      )
    },
    { id: "vertical", header: "Vertical" },
    {
      id: "country",
      header: "Country",
      cell: (record) => record.country || record.country_code
    },
    { id: "timezone", header: "Timezone" },
    {
      id: "users",
      header: "Users",
      className: "text-right font-mono",
      headerClassName: "text-right",
      sortValue: (record) => record.users
    },
    {
      id: "status",
      header: "Status",
      cell: (record) => badgeForStatus(record.status),
      sortValue: (record) => record.status
    }
  ],
  createFields: [
    {
      label: "Tenant key",
      name: "tenant_key",
      placeholder: "hotel-valle-azul",
      helperText: "Stable lowercase key used in URLs and integrations."
    },
    { label: "Display name", name: "display_name", placeholder: "Hotel Valle Azul" },
    { label: "Legal name", name: "legal_name", required: false, placeholder: "Legal entity name" },
    { label: "Vertical", name: "vertical", control: "select", options: verticalOptions, defaultValue: "hospitality" },
    { label: "Country", name: "country_code", control: "select", options: countryOptions, defaultValue: "CR" },
    { label: "Timezone", name: "timezone", defaultValue: "America/Costa_Rica" },
    { label: "Status", name: "status", control: "select", options: statusOptions, defaultValue: "active" },
    { label: "Metadata JSON", name: "metadata", control: "json", required: false, defaultValue: "{}" }
  ],
  editFields: [
    { label: "Tenant ID", name: "id", editable: false },
    { label: "Tenant key", name: "tenant_key", editable: false },
    { label: "Display name", name: "display_name" },
    { label: "Legal name", name: "legal_name", required: false },
    { label: "Vertical", name: "vertical", control: "select", options: verticalOptions },
    { label: "Country", name: "country_code", control: "select", options: countryOptions },
    { label: "Timezone", name: "timezone" },
    { label: "Status", name: "status", control: "select", options: statusOptions },
    { label: "Metadata JSON", name: "metadata", control: "json", required: false },
    { label: "Users", name: "users", editable: false }
  ]
};
}

export function TenantsCrud({ payload }: { payload: ModulePayload }) {
  return <CrudResourcePage config={tenantsCrudConfig(countryOptionsFromPayload(payload))} records={payload.records as TenantRecord[]} />;
}
