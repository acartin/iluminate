"use client";

import { Badge } from "@/components/ui/badge";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudResourceConfig } from "./types";

type AgentRecord = Record<string, unknown> & {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  display_name: string;
  languages: string;
  skills: string;
  status: string;
  supervisor?: string;
  supervisor_user_id?: string;
  tenants_assigned: number;
};

const statusOptions: CrudChoice[] = [
  { value: "offline", label: "Offline" },
  { value: "available", label: "Available" },
  { value: "ringing", label: "Ringing" },
  { value: "on_call", label: "On call" },
  { value: "after_call_work", label: "After call work" },
  { value: "break", label: "Break" },
  { value: "training", label: "Training" },
  { value: "unavailable", label: "Unavailable" }
];

const fallbackUserOptions: CrudChoice[] = [];

function badgeForStatus(status: string) {
  const classes: Record<string, string> = {
    available: "bg-[var(--green-bg)] text-[var(--green-text)]",
    on_call: "bg-[var(--blue-bg)] text-[var(--blue-text)]",
    ringing: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    break: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
    unavailable: "bg-[var(--red-bg)] text-[var(--red-text)]"
  };

  return <Badge className={classes[status] ?? undefined}>{status.replace(/_/g, " ")}</Badge>;
}

function optionsFromPayload(payload: ModulePayload, key: string, fallback: CrudChoice[] = []): CrudChoice[] {
  const options = payload.filters?.[key];
  if (!Array.isArray(options)) return fallback;

  const parsed = options.filter((option): option is CrudChoice => {
    if (!option || typeof option !== "object") return false;
    const choice = option as Record<string, unknown>;
    return typeof choice.value === "string" && typeof choice.label === "string";
  });

  return parsed.length > 0 ? parsed : fallback;
}

function agentsCrudConfig(userOptions: CrudChoice[]): CrudResourceConfig<AgentRecord> {
  return {
    id: "settings.agents",
    title: "Agents",
    eyebrow: "agent",
    description: "Iluminate operator profiles. Each agent maps to one user account and can serve multiple tenants.",
    createLabel: "Create agent",
    createAction: "/api/settings/agents",
    rowActionBasePath: "/api/settings/agents",
    identityField: "id",
    titleField: "display_name",
    searchPlaceholder: "Search agent, user, email, languages or skills",
    emptyTitle: "No agents match the current filters",
    emptyDescription: "Create agent profiles for Iluminate operators, then assign tenants from the workspace.",
    allowedActions: ["view", "workspace", "edit", "delete"],
    workspaceLabel: "Open workspace",
    workspaceHref: (record) => `/settings/agents/${encodeURIComponent(record.id)}`,
    filters: [
      { key: "status", label: "Status", allLabel: "All statuses", options: statusOptions }
    ],
    columns: [
      {
        id: "display_name",
        header: "Agent",
        searchValue: (record) => `${record.display_name} ${record.user_name} ${record.user_email}`,
        cell: (record) => (
          <div className="min-w-56">
            <div className="font-medium text-foreground">{record.display_name}</div>
            <div className="text-meta text-muted-foreground">{record.user_email}</div>
          </div>
        )
      },
      { id: "languages", header: "Languages" },
      { id: "skills", header: "Skills" },
      {
        id: "tenants_assigned",
        header: "Tenants",
        className: "text-right font-mono",
        headerClassName: "text-right",
        sortValue: (record) => record.tenants_assigned
      },
      { id: "supervisor", header: "Supervisor" },
      {
        id: "status",
        header: "Status",
        cell: (record) => badgeForStatus(String(record.status)),
        sortValue: (record) => String(record.status)
      }
    ],
    createFields: [
      { label: "User", name: "user_id", control: "select", options: userOptions },
      { label: "Display name", name: "display_name" },
      { label: "Languages", name: "languages", defaultValue: "en, es", helperText: "Comma-separated language codes for now." },
      { label: "Skills", name: "skills", required: false, placeholder: "reservations, billing, emergency", helperText: "Comma-separated skills for now." },
      { label: "Status", name: "status", control: "select", options: statusOptions, defaultValue: "offline" },
      { label: "Supervisor user", name: "supervisor_user_id", control: "select", options: [{ value: "", label: "No supervisor" }, ...userOptions], required: false },
      { label: "Metadata JSON", name: "metadata", control: "json", required: false, defaultValue: "{}" }
    ],
    editFields: [
      { label: "Agent ID", name: "id", editable: false },
      { label: "User", name: "user_id", control: "select", options: userOptions },
      { label: "Display name", name: "display_name" },
      { label: "Languages", name: "languages", helperText: "Comma-separated language codes for now." },
      { label: "Skills", name: "skills", required: false, helperText: "Comma-separated skills for now." },
      { label: "Status", name: "status", control: "select", options: statusOptions },
      { label: "Supervisor user", name: "supervisor_user_id", control: "select", options: [{ value: "", label: "No supervisor" }, ...userOptions], required: false },
      { label: "Assigned tenants", name: "tenants_assigned", editable: false },
      { label: "Metadata JSON", name: "metadata", control: "json", required: false }
    ]
  };
}

export function AgentsCrud({ payload }: { payload: ModulePayload }) {
  const userOptions = optionsFromPayload(payload, "user_options", fallbackUserOptions);
  return <CrudResourcePage config={agentsCrudConfig(userOptions)} records={payload.records as AgentRecord[]} />;
}
