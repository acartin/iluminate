"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Building2, FolderKanban, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { CrudFormDialog } from "@/components/crud/crud-form-dialog";
import { CrudResourcePage } from "@/components/crud/crud-resource-page";
import { CrudColumn, CrudField, CrudResourceConfig } from "@/components/crud/types";
import { EmptyState } from "@/components/ui/empty-state";
import { FeedbackAlert } from "@/components/ui/feedback-alert";
import { Tabs } from "@/components/ui/tabs";
import { Feedback } from "@/lib/feedback";
import { WorkspacePayload, WorkspaceSection } from "@/lib/types";
import { cn } from "@/lib/utils";

const toneClasses = {
  blue: "text-semantic-blue",
  green: "text-semantic-green",
  amber: "text-semantic-amber",
  red: "text-semantic-red"
};

function formatCellValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

type RowAction = {
  label: string;
  href: string;
};

type WorkspaceCrudMetadata = {
  title?: string;
  description?: string;
  eyebrow?: string;
  createLabel?: string;
  createAction?: string;
  rowActionBasePath?: string;
  identityField?: string;
  titleField?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  allowedActions?: Array<"view" | "edit" | "delete" | "deactivate" | "workspace">;
  columns?: CrudColumn<Record<string, unknown>>[];
  createFields?: CrudField[];
  editFields?: CrudField[];
  filters?: CrudResourceConfig<Record<string, unknown>>["filters"];
};

function rowActions(value: unknown): RowAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RowAction => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    return typeof candidate.label === "string" && typeof candidate.href === "string";
  });
}

function humanizeColumn(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textValue(record: Record<string, unknown>, key: string) {
  return String(record[key] ?? "");
}

function ContactMethodIcon({ methodType }: { methodType: unknown }) {
  const type = String(methodType ?? "");
  const Icon = type === "email" ? Mail : type === "whatsapp" || type === "sms" ? MessageCircle : Phone;
  return <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

function crudConfigForSection(
  section: WorkspaceSection,
  contextFilter?: string,
  flowFilter?: string,
  queueFilter?: string,
  extensionFilter?: string,
  contactFilter?: string,
  tenantFilter?: string
): CrudResourceConfig<Record<string, unknown>> | null {
  const metadata = section.crud as WorkspaceCrudMetadata | undefined;
  if (!metadata?.createAction || !metadata.rowActionBasePath) return null;

  const scopedField = (field: CrudField) => {
    if (contextFilter && field.name === "context_key") return { ...field, type: "hidden" as const, defaultValue: contextFilter };
    if (flowFilter && field.name === "flow_id") return { ...field, type: "hidden" as const, defaultValue: flowFilter };
    if (queueFilter && field.name === "queue_key") return { ...field, type: "hidden" as const, defaultValue: queueFilter };
    if (extensionFilter && field.name === "extension_id") return { ...field, type: "hidden" as const, defaultValue: extensionFilter };
    if (contactFilter && field.name === "contact_id") return { ...field, type: "hidden" as const, defaultValue: contactFilter };
    if (tenantFilter && field.name === "tenant_id") return { ...field, type: "hidden" as const, defaultValue: tenantFilter };
    if (tenantFilter && field.name === "logical_extension_id" && field.options) {
      return { ...field, options: field.options.filter((option) => !option.tenant_id || option.tenant_id === tenantFilter) };
    }
    return field;
  };

  const createFields = (metadata.createFields ?? []).map(scopedField);
  const editFields = (metadata.editFields ?? createFields).map(scopedField);

  return {
    id: section.id,
    title: metadata.title ?? section.label,
    description: metadata.description ?? section.description,
    eyebrow: metadata.eyebrow,
    createLabel: metadata.createLabel ?? `Create ${section.label}`,
    createAction: metadata.createAction,
    rowActionBasePath: metadata.rowActionBasePath,
    identityField: metadata.identityField ?? "id",
    titleField: metadata.titleField ?? "id",
    searchPlaceholder: metadata.searchPlaceholder ?? `Search ${section.label}`,
    emptyTitle: metadata.emptyTitle ?? "No records match the current filters",
    emptyDescription: metadata.emptyDescription ?? "Adjust search or filters and try again.",
    allowedActions: metadata.allowedActions ?? ["view", "edit"],
    columns: metadata.columns ?? [],
    createFields,
    editFields,
    filters: metadata.filters
  };
}

function RecordsTable({
  records,
  contextFilter,
  queueFilter,
  extensionFilter,
  contactFilter,
  onNavigateAction
}: {
  records: Array<Record<string, unknown>>;
  contextFilter?: string;
  queueFilter?: string;
  extensionFilter?: string;
  contactFilter?: string;
  onNavigateAction?: (href: string) => void;
}) {
  const visibleRecords = records.filter((record) => {
    if (contactFilter) return String(record.contact_id ?? "") === contactFilter;
    if (extensionFilter) return String(record.extension_id ?? "") === extensionFilter;
    if (queueFilter) return String(record.queue_key ?? "") === queueFilter;
    if (contextFilter) return String(record.context_key ?? "") === contextFilter;
    return true;
  });

  if (!visibleRecords.length) {
    return <EmptyState title="No records yet" description="This section is ready, but no records exist for the current scope." />;
  }

  const hasActions = visibleRecords.some((record) => rowActions(record._actions).length > 0);
  const columns = Array.from(
    visibleRecords.reduce((keys, record) => {
      Object.keys(record).forEach((key) => {
        if (!key.startsWith("_")) keys.add(key);
      });
      return keys;
    }, new Set<string>())
  ).slice(0, 10);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse text-grid-cell">
        <thead className="bg-surface-2">
          <tr className="border-b border-border-2 text-left text-grid-header font-semibold text-ink-muted">
            {columns.map((column) => (
              <th key={column} className="whitespace-nowrap px-3 py-2.5 font-medium">
                {humanizeColumn(column)}
              </th>
            ))}
            {hasActions ? <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {visibleRecords.map((record, index) => (
            <tr key={String(record.id ?? index)} className="h-grid-row border-b last:border-0 hover:bg-surface-hover">
              {columns.map((column) => (
                <td key={column} className="max-w-72 truncate px-3 py-2.5 align-middle text-grid-cell">
                  {formatCellValue(record[column])}
                </td>
              ))}
              {hasActions ? (
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    {rowActions(record._actions).map((action) => (
                      <Button
                        key={action.href}
                        asChild={!onNavigateAction}
                        variant="ghost"
                        className="h-8 px-2"
                        title={action.label}
                        onClick={onNavigateAction ? () => onNavigateAction(action.href) : undefined}
                      >
                        {onNavigateAction ? (
                          <>
                            <span>{action.label}</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </>
                        ) : (
                          <Link href={action.href}>
                            <span>{action.label}</span>
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </Link>
                        )}
                      </Button>
                    ))}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactsMasterDetail({
  contactSection,
  methodSection,
  contactFilter,
  onSelectContact
}: {
  contactSection: WorkspaceSection;
  methodSection?: WorkspaceSection;
  contactFilter?: string;
  onSelectContact: (contactId: string) => void;
}) {
  const contacts = contactSection.records ?? [];
  const methods = methodSection?.records ?? [];
  const contactConfig = crudConfigForSection(contactSection);
  const selectedContact = useMemo(() => {
    if (!contacts.length) return undefined;
    return contacts.find((record) => String(record.id ?? "") === contactFilter) ?? contacts[0];
  }, [contactFilter, contacts]);
  const selectedContactId = selectedContact ? String(selectedContact.id ?? "") : undefined;
  const methodConfig = methodSection && selectedContactId
    ? crudConfigForSection(methodSection, undefined, undefined, undefined, undefined, selectedContactId)
    : null;

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!selectedContactId) return;
    if (contactFilter === selectedContactId) return;
    onSelectContact(selectedContactId);
  }, [contactFilter, onSelectContact, selectedContactId]);

  const contactTypeOptions = contactConfig?.filters?.find((filter) => filter.key === "contact_type")?.options ?? [];
  const statusOptions = contactConfig?.filters?.find((filter) => filter.key === "status")?.options ?? [];
  const normalizedQuery = normalizeSearch(query);
  const visibleContacts = contacts.filter((record) => {
    const haystack = normalizeSearch(
      [
        textValue(record, "display_name"),
        textValue(record, "organization"),
        textValue(record, "department"),
        textValue(record, "title"),
        textValue(record, "notes")
      ].join(" ")
    );

    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && (!typeFilter || textValue(record, "contact_type") === typeFilter)
      && (!statusFilter || textValue(record, "status") === statusFilter);
  });
  const selectedMethods = selectedContactId
    ? methods.filter((record) => String(record.contact_id ?? "") === selectedContactId)
    : [];

  if (!contactConfig) {
    return <PlaceholderSection section={contactSection} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(520px,1.08fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-card-title font-medium">Contacts</div>
              <div className="mt-1 text-body-sm text-muted-foreground">Tenant people and departments used for escalations, reporting and follow-up.</div>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
          <div className="grid gap-2 pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contacts"
                aria-label="Search contacts"
                className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Contact type"
            >
              <option value="">All types</option>
              {contactTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Contact status"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleContacts.length ? (
            <div className="max-h-[680px] overflow-auto">
              {visibleContacts.map((contact) => {
                const contactId = String(contact.id ?? "");
                const active = contactId === selectedContactId;
                return (
                  <div
                    key={contactId}
                    data-active={active}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-2 px-4 py-2.5 transition-colors hover:bg-surface-hover data-[active=true]:bg-surface-selected"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectContact(contactId)}
                      className="min-w-0 rounded-md py-1 text-left outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-body-sm font-medium text-foreground">{formatCellValue(contact.display_name)}</span>
                      </span>
                    </button>
                    <span className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Edit contact"
                        onClick={() => {
                          onSelectContact(contactId);
                          setActiveRecord(contact);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Delete contact"
                        onClick={() => {
                          onSelectContact(contactId);
                          setDeleteRecord(contact);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No contacts match the current filters" description="Adjust search or filters and try again." />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {selectedContact ? (
          <>
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div className="text-card-title font-medium">{formatCellValue(selectedContact.display_name)}</div>
                    </div>
                    <div className="mt-1 text-body-sm text-muted-foreground">
                      {formatCellValue(selectedContact.department)} · {formatCellValue(selectedContact.title)}
                    </div>
                    {selectedMethods.length ? (
                      <div className="mt-3 space-y-1.5 text-body-sm text-muted-foreground">
                        {selectedMethods.map((method) => (
                          <div key={String(method.id)} className="flex min-w-0 items-center gap-2">
                            <ContactMethodIcon methodType={method.method_type} />
                            <span className="shrink-0 capitalize">{formatCellValue(method.method_type)}</span>
                            <span className="min-w-0 truncate text-foreground">{formatCellValue(method.value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {selectedContact.notes ? <div className="mt-2 text-body-sm text-muted-foreground">{formatCellValue(selectedContact.notes)}</div> : null}
                  </div>
                </div>
              </CardHeader>
            </Card>

            {methodConfig ? (
              <CrudResourcePage config={methodConfig} records={selectedMethods} hideToolbar hideHeader />
            ) : (
              <Card>
                <CardContent className="bg-surface-2">
                  <EmptyState title="Methods are not available" description="This workspace section does not expose contact methods yet." />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="bg-surface-2">
              <EmptyState title="No contact selected" description="Select a contact to manage phone, email, WhatsApp and extension methods." />
            </CardContent>
          </Card>
        )}
      </div>

      <CrudFormDialog
        key="contacts:create"
        open={createOpen}
        mode="create"
        title="New contact"
        description="Create the tenant contact through the Iluminate API boundary."
        action={contactConfig.createAction}
        fields={contactConfig.createFields}
        onClose={() => setCreateOpen(false)}
      />

      <CrudFormDialog
        key={`contacts:edit:${String(activeRecord?.id ?? "none")}`}
        open={activeRecord !== null}
        mode="edit"
        title={`Edit ${String(activeRecord?.display_name ?? "contact")}`}
        description="Update the tenant contact through the Iluminate API boundary."
        action={activeRecord ? `${contactConfig.rowActionBasePath}/${encodeURIComponent(String(activeRecord.id ?? ""))}` : undefined}
        fields={contactConfig.editFields}
        record={activeRecord ?? undefined}
        onClose={() => setActiveRecord(null)}
      />

      <Modal
        open={deleteRecord !== null}
        title="Confirm delete"
        description="This action permanently deletes the selected contact and its methods."
        onClose={() => setDeleteRecord(null)}
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to permanently delete <span className="font-medium">{String(deleteRecord?.display_name ?? "this contact")}</span>.
            Contact methods will be deleted with it.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            {deleteRecord ? (
              <form action={`${contactConfig.rowActionBasePath}/${encodeURIComponent(String(deleteRecord.id ?? ""))}`} method="post">
                <input type="hidden" name="_method" value="delete" />
                <Button type="submit">
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AgentAssignmentsMasterDetail({
  assignmentSection,
  telephonySection
}: {
  assignmentSection: WorkspaceSection;
  telephonySection?: WorkspaceSection;
}) {
  const assignments = assignmentSection.records ?? [];
  const telephonyRecords = telephonySection?.records ?? [];
  const assignmentConfig = crudConfigForSection(assignmentSection);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState(() => String(assignments[0]?.id ?? ""));

  const selectedAssignment = useMemo(() => {
    if (!assignments.length) return undefined;
    return assignments.find((record) => String(record.id ?? "") === selectedAssignmentId) ?? assignments[0];
  }, [assignments, selectedAssignmentId]);
  const selectedTenantId = selectedAssignment ? String(selectedAssignment.tenant_id ?? "") : undefined;
  const selectedTelephonyRecords = selectedTenantId
    ? telephonyRecords.filter((record) => String(record.tenant_id ?? "") === selectedTenantId)
    : [];
  const telephonyConfig = telephonySection && selectedTenantId
    ? crudConfigForSection(telephonySection, undefined, undefined, undefined, undefined, undefined, selectedTenantId)
    : null;

  useEffect(() => {
    if (!assignments.length) return;
    if (selectedAssignment && String(selectedAssignment.id ?? "") === selectedAssignmentId) return;
    setSelectedAssignmentId(String(assignments[0].id ?? ""));
  }, [assignments, selectedAssignment, selectedAssignmentId]);

  if (!assignmentConfig) {
    return <PlaceholderSection section={assignmentSection} />;
  }

  const assignmentTypeOptions = assignmentConfig.filters?.find((filter) => filter.key === "assignment_type")?.options ?? [];
  const statusOptions = assignmentConfig.filters?.find((filter) => filter.key === "status")?.options ?? [];
  const normalizedQuery = normalizeSearch(query);
  const visibleAssignments = assignments.filter((record) => {
    const haystack = normalizeSearch(
      [
        textValue(record, "tenant"),
        textValue(record, "tenant_key"),
        textValue(record, "assignment_type"),
        textValue(record, "queue_key"),
        textValue(record, "status")
      ].join(" ")
    );

    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && (!typeFilter || textValue(record, "assignment_type") === typeFilter)
      && (!statusFilter || textValue(record, "status") === statusFilter);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(520px,1.08fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-card-title font-medium">Tenant Assignments</div>
              <div className="mt-1 text-body-sm text-muted-foreground">Tenant responsibilities this agent can operate.</div>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
          <div className="grid gap-2 pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tenant assignments"
                aria-label="Search tenant assignments"
                className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Assignment type"
            >
              <option value="">All types</option>
              {assignmentTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Assignment status"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleAssignments.length ? (
            <div className="max-h-[680px] overflow-auto">
              {visibleAssignments.map((assignment) => {
                const assignmentId = String(assignment.id ?? "");
                const active = assignmentId === String(selectedAssignment?.id ?? "");
                return (
                  <div
                    key={assignmentId}
                    data-active={active}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-2 px-4 py-2.5 transition-colors hover:bg-surface-hover data-[active=true]:bg-surface-selected"
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedAssignmentId(assignmentId)}
                      className="min-w-0 rounded-md py-1 text-left outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <span className="block truncate text-body-sm font-medium text-foreground">{formatCellValue(assignment.tenant)}</span>
                      <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                        {formatCellValue(assignment.assignment_type)} · {formatCellValue(assignment.queue_key || "all queues")} · priority {formatCellValue(assignment.priority)}
                      </span>
                    </button>
                    <span className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Edit assignment"
                        onClick={() => {
                          setSelectedAssignmentId(assignmentId);
                          setActiveRecord(assignment);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Delete assignment"
                        onClick={() => {
                          setSelectedAssignmentId(assignmentId);
                          setDeleteRecord(assignment);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No tenant assignments match the current filters" description="Adjust search or filters and try again." />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {selectedAssignment ? (
          <>
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div className="text-card-title font-medium">{formatCellValue(selectedAssignment.tenant)}</div>
                  </div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {formatCellValue(selectedAssignment.assignment_type)} · {formatCellValue(selectedAssignment.queue_key || "all queues")} · priority {formatCellValue(selectedAssignment.priority)}
                  </div>
                  <div className="mt-3 text-body-sm text-muted-foreground">
                    Extension assignments here are scoped to this tenant only.
                  </div>
                </div>
              </CardHeader>
            </Card>

            {telephonyConfig ? (
              <CrudResourcePage config={telephonyConfig} records={selectedTelephonyRecords} hideToolbar hideHeader />
            ) : (
              <Card>
                <CardContent className="bg-surface-2">
                  <EmptyState title="Telephony is not available" description="This workspace section does not expose extension assignments yet." />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="bg-surface-2">
              <EmptyState title="No assignment selected" description="Select a tenant assignment to manage the agent extension for that tenant." />
            </CardContent>
          </Card>
        )}
      </div>

      <CrudFormDialog
        key="tenant-assignments:create"
        open={createOpen}
        mode="create"
        title="New tenant assignment"
        description="Assign this agent to a tenant through the Iluminate API boundary."
        action={assignmentConfig.createAction}
        fields={assignmentConfig.createFields}
        onClose={() => setCreateOpen(false)}
      />

      <CrudFormDialog
        key={`tenant-assignments:edit:${String(activeRecord?.id ?? "none")}`}
        open={activeRecord !== null}
        mode="edit"
        title={`Edit ${String(activeRecord?.tenant ?? "assignment")}`}
        description="Update this agent tenant assignment."
        action={activeRecord ? `${assignmentConfig.rowActionBasePath}/${encodeURIComponent(String(activeRecord.id ?? ""))}` : undefined}
        fields={assignmentConfig.editFields}
        record={activeRecord ?? undefined}
        onClose={() => setActiveRecord(null)}
      />

      <Modal
        open={deleteRecord !== null}
        title="Confirm delete"
        description="This action permanently deletes the selected tenant assignment."
        onClose={() => setDeleteRecord(null)}
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to permanently delete <span className="font-medium">{String(deleteRecord?.tenant ?? "this assignment")}</span>.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            {deleteRecord ? (
              <form action={`${assignmentConfig.rowActionBasePath}/${encodeURIComponent(String(deleteRecord.id ?? ""))}`} method="post">
                <input type="hidden" name="_method" value="delete" />
                <Button type="submit">
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ExtensionsMasterDetail({
  extensionSection,
  deviceSection,
  extensionFilter,
  onSelectExtension
}: {
  extensionSection: WorkspaceSection;
  deviceSection?: WorkspaceSection;
  extensionFilter?: string;
  onSelectExtension: (extensionId: string) => void;
}) {
  const extensions = extensionSection.records ?? [];
  const devices = deviceSection?.records ?? [];
  const extensionConfig = crudConfigForSection(extensionSection);
  const selectedExtension = useMemo(() => {
    if (!extensions.length) return undefined;
    return extensions.find((record) => String(record.id ?? "") === extensionFilter) ?? extensions[0];
  }, [extensionFilter, extensions]);
  const selectedExtensionId = selectedExtension ? String(selectedExtension.id ?? "") : undefined;
  const deviceConfig = deviceSection && selectedExtensionId
    ? crudConfigForSection(deviceSection, undefined, undefined, undefined, selectedExtensionId)
    : null;

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!selectedExtensionId) return;
    if (extensionFilter === selectedExtensionId) return;
    onSelectExtension(selectedExtensionId);
  }, [extensionFilter, onSelectExtension, selectedExtensionId]);

  const extensionTypeOptions = [
    {"value": "agent", "label": "Agent"},
    {"value": "supervisor", "label": "Supervisor"},
    {"value": "tenant_contact", "label": "Tenant contact"},
    {"value": "test", "label": "Test"},
    {"value": "system", "label": "System"}
  ];
  const statusOptions = [
    {"value": "active", "label": "Active"},
    {"value": "provisioning", "label": "Provisioning"},
    {"value": "inactive", "label": "Inactive"},
    {"value": "failed", "label": "Failed"}
  ];
  const normalizedQuery = normalizeSearch(query);
  const visibleExtensions = extensions.filter((record) => {
    const haystack = normalizeSearch(
      [
        textValue(record, "context_key"),
        textValue(record, "logical_extension"),
        textValue(record, "display_name"),
        textValue(record, "extension_type"),
        textValue(record, "provider_endpoint"),
        textValue(record, "status")
      ].join(" ")
    );

    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && (!typeFilter || textValue(record, "extension_type") === typeFilter)
      && (!statusFilter || textValue(record, "status") === statusFilter);
  });
  const selectedDevices = selectedExtensionId
    ? devices.filter((record) => String(record.extension_id ?? "") === selectedExtensionId)
    : [];

  if (!extensionConfig) {
    return <PlaceholderSection section={extensionSection} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(520px,1.08fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-card-title font-medium">Extensions</div>
              <div className="mt-1 text-body-sm text-muted-foreground">Tenant-local logical extensions and provider endpoints.</div>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
          <div className="grid gap-2 pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search extensions"
                aria-label="Search extensions"
                className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Extension type"
            >
              <option value="">All types</option>
              {extensionTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Extension status"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleExtensions.length ? (
            <div className="max-h-[680px] overflow-auto">
              {visibleExtensions.map((extension) => {
                const extensionId = String(extension.id ?? "");
                const active = extensionId === selectedExtensionId;
                return (
                  <div
                    key={extensionId}
                    data-active={active}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-2 px-4 py-2.5 transition-colors hover:bg-surface-hover data-[active=true]:bg-surface-selected"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectExtension(extensionId)}
                      className="min-w-0 rounded-md py-1 text-left outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-body-sm font-medium text-foreground">
                          {formatCellValue(extension.logical_extension)} · {formatCellValue(extension.display_name)}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                        {formatCellValue(extension.context_key)} · {formatCellValue(extension.extension_type)} · {formatCellValue(extension.devices)} devices
                      </span>
                    </button>
                    <span className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Edit extension"
                        onClick={() => {
                          onSelectExtension(extensionId);
                          setActiveRecord(extension);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Delete extension"
                        onClick={() => {
                          onSelectExtension(extensionId);
                          setDeleteRecord(extension);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No extensions match the current filters" description="Adjust search or filters and try again." />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {selectedExtension ? (
          <>
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div className="text-card-title font-medium">
                      {formatCellValue(selectedExtension.logical_extension)} · {formatCellValue(selectedExtension.display_name)}
                    </div>
                  </div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {formatCellValue(selectedExtension.context_key)} · {formatCellValue(selectedExtension.extension_type)} · {formatCellValue(selectedExtension.status)}
                  </div>
                  <div className="mt-3 text-body-sm text-muted-foreground">
                    Endpoint: <span className="text-foreground">{formatCellValue(selectedExtension.provider_endpoint)}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {deviceConfig ? (
              <CrudResourcePage config={deviceConfig} records={selectedDevices} hideToolbar hideHeader />
            ) : (
              <Card>
                <CardContent className="bg-surface-2">
                  <EmptyState title="Devices are not available" description="This workspace section does not expose extension devices yet." />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="bg-surface-2">
              <EmptyState title="No extension selected" description="Select an extension to manage its web phones, SIP phones, softphones and forwards." />
            </CardContent>
          </Card>
        )}
      </div>

      <CrudFormDialog
        key="extensions:create"
        open={createOpen}
        mode="create"
        title="New extension"
        description="Create the logical tenant extension through the Asterisk control API."
        action={extensionConfig.createAction}
        fields={extensionConfig.createFields}
        onClose={() => setCreateOpen(false)}
      />

      <CrudFormDialog
        key={`extensions:edit:${String(activeRecord?.id ?? "none")}`}
        open={activeRecord !== null}
        mode="edit"
        title={`Edit ${String(activeRecord?.logical_extension ?? "extension")}`}
        description="Update the logical tenant extension."
        action={activeRecord ? `${extensionConfig.rowActionBasePath}/${encodeURIComponent(String(activeRecord.id ?? ""))}` : undefined}
        fields={extensionConfig.editFields}
        record={activeRecord ?? undefined}
        onClose={() => setActiveRecord(null)}
      />

      <Modal
        open={deleteRecord !== null}
        title="Confirm delete"
        description="This action permanently deletes the selected extension and its devices."
        onClose={() => setDeleteRecord(null)}
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to permanently delete extension <span className="font-medium">{String(deleteRecord?.logical_extension ?? "this extension")}</span>.
            Devices and related Asterisk mappings may be deleted with it.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            {deleteRecord ? (
              <form action={`${extensionConfig.rowActionBasePath}/${encodeURIComponent(String(deleteRecord.id ?? ""))}`} method="post">
                <input type="hidden" name="_method" value="delete" />
                <Button type="submit">
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ContextsMasterDetail({
  contextSection,
  flowSection,
  contextFilter,
  onSelectContext
}: {
  contextSection: WorkspaceSection;
  flowSection?: WorkspaceSection;
  contextFilter?: string;
  onSelectContext: (contextKey: string) => void;
}) {
  const contexts = contextSection.records ?? [];
  const flows = flowSection?.records ?? [];
  const selectedContext = useMemo(() => {
    if (!contexts.length) return undefined;
    return contexts.find((record) => String(record.context_key ?? "") === contextFilter) ?? contexts[0];
  }, [contextFilter, contexts]);
  const selectedContextKey = selectedContext ? String(selectedContext.context_key ?? "") : undefined;
  const flowConfig = flowSection && selectedContextKey
    ? crudConfigForSection(flowSection, selectedContextKey)
    : null;

  const [query, setQuery] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    if (!selectedContextKey) return;
    if (contextFilter === selectedContextKey) return;
    onSelectContext(selectedContextKey);
  }, [contextFilter, onSelectContext, selectedContextKey]);

  const directionOptions = Array.from(new Set(contexts.map((record) => textValue(record, "direction")).filter(Boolean))).sort();
  const statusOptions = Array.from(new Set(contexts.map((record) => textValue(record, "status")).filter(Boolean))).sort();
  const normalizedQuery = normalizeSearch(query);
  const visibleContexts = contexts.filter((record) => {
    const haystack = normalizeSearch(
      [
        textValue(record, "context_key"),
        textValue(record, "display_name"),
        textValue(record, "provider_context_name"),
        textValue(record, "direction"),
        textValue(record, "status")
      ].join(" ")
    );

    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && (!directionFilter || textValue(record, "direction") === directionFilter)
      && (!statusFilter || textValue(record, "status") === statusFilter);
  });
  const selectedFlows = selectedContextKey
    ? flows.filter((record) => String(record.context_key ?? "") === selectedContextKey)
    : [];

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(520px,1.08fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="min-w-0">
            <div className="text-card-title font-medium">Contexts</div>
            <div className="mt-1 text-body-sm text-muted-foreground">Tenant dialplan namespaces where flows are attached.</div>
          </div>
          <div className="grid gap-2 pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search contexts"
                aria-label="Search contexts"
                className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
            <select
              value={directionFilter}
              onChange={(event) => setDirectionFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Context direction"
            >
              <option value="">All directions</option>
              {directionOptions.map((option) => (
                <option key={option} value={option}>{humanizeColumn(option)}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Context status"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{humanizeColumn(option)}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleContexts.length ? (
            <div className="max-h-[680px] overflow-auto">
              {visibleContexts.map((dialContext) => {
                const contextKey = String(dialContext.context_key ?? "");
                const active = contextKey === selectedContextKey;
                return (
                  <button
                    key={contextKey}
                    type="button"
                    data-active={active}
                    onClick={() => onSelectContext(contextKey)}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background data-[active=true]:bg-surface-selected"
                  >
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-body-sm font-medium text-foreground">{formatCellValue(dialContext.display_name)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                        {formatCellValue(dialContext.context_key)} · {formatCellValue(dialContext.direction)} · {formatCellValue(dialContext.provider_context_name)}
                      </span>
                    </span>
                    <span className="text-meta text-muted-foreground">{formatCellValue(dialContext.flows)} flows</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No contexts match the current filters" description="Adjust search or filters and try again." />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {selectedContext ? (
          <>
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FolderKanban className="h-4 w-4 text-muted-foreground" />
                    <div className="text-card-title font-medium">{formatCellValue(selectedContext.display_name)}</div>
                  </div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {formatCellValue(selectedContext.context_key)} · {formatCellValue(selectedContext.direction)} · {formatCellValue(selectedContext.status)}
                  </div>
                  <div className="mt-3 text-body-sm text-muted-foreground">
                    Provider context: <span className="text-foreground">{formatCellValue(selectedContext.provider_context_name)}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {flowConfig ? (
              <CrudResourcePage config={flowConfig} records={selectedFlows} hideToolbar hideHeader />
            ) : (
              <Card>
                <CardContent className="bg-surface-2">
                  <EmptyState title="Flows are not available" description="This workspace section does not expose context flows yet." />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="bg-surface-2">
              <EmptyState title="No context selected" description="Select a context to manage the flows attached to it." />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function QueuesMasterDetail({
  queueSection,
  memberSection,
  queueFilter,
  onSelectQueue
}: {
  queueSection: WorkspaceSection;
  memberSection?: WorkspaceSection;
  queueFilter?: string;
  onSelectQueue: (queueKey: string) => void;
}) {
  const queues = queueSection.records ?? [];
  const members = memberSection?.records ?? [];
  const queueConfig = crudConfigForSection(queueSection);
  const selectedQueue = useMemo(() => {
    if (!queues.length) return undefined;
    return queues.find((record) => String(record.queue_key ?? "") === queueFilter) ?? queues[0];
  }, [queueFilter, queues]);
  const selectedQueueKey = selectedQueue ? String(selectedQueue.queue_key ?? "") : undefined;
  const memberConfig = memberSection && selectedQueueKey
    ? crudConfigForSection(memberSection, undefined, undefined, selectedQueueKey)
    : null;

  const [query, setQuery] = useState("");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<Record<string, unknown> | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!selectedQueueKey) return;
    if (queueFilter === selectedQueueKey) return;
    onSelectQueue(selectedQueueKey);
  }, [onSelectQueue, queueFilter, selectedQueueKey]);

  const strategyOptions = [
    {"value": "ringall", "label": "Ring all"},
    {"value": "leastrecent", "label": "Least recent"},
    {"value": "fewestcalls", "label": "Fewest calls"},
    {"value": "random", "label": "Random"},
    {"value": "rrmemory", "label": "Round robin"},
    {"value": "linear", "label": "Linear"}
  ];
  const statusOptions = [
    {"value": "active", "label": "Active"},
    {"value": "provisioning", "label": "Provisioning"},
    {"value": "inactive", "label": "Inactive"},
    {"value": "failed", "label": "Failed"}
  ];
  const normalizedQuery = normalizeSearch(query);
  const visibleQueues = queues.filter((record) => {
    const haystack = normalizeSearch(
      [
        textValue(record, "context_key"),
        textValue(record, "queue_key"),
        textValue(record, "display_name"),
        textValue(record, "provider_queue_name"),
        textValue(record, "strategy"),
        textValue(record, "status")
      ].join(" ")
    );

    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && (!strategyFilter || textValue(record, "strategy") === strategyFilter)
      && (!statusFilter || textValue(record, "status") === statusFilter);
  });
  const selectedMembers = selectedQueueKey
    ? members.filter((record) => String(record.queue_key ?? "") === selectedQueueKey)
    : [];

  if (!queueConfig) {
    return <PlaceholderSection section={queueSection} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(360px,0.92fr)_minmax(520px,1.08fr)]">
      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-card-title font-medium">Queues</div>
              <div className="mt-1 text-body-sm text-muted-foreground">Tenant reception queues and their Asterisk strategy.</div>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>
          <div className="grid gap-2 pt-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search queues"
                aria-label="Search queues"
                className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              />
            </label>
            <select
              value={strategyFilter}
              onChange={(event) => setStrategyFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Queue strategy"
            >
              <option value="">All strategies</option>
              {strategyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
              aria-label="Queue status"
            >
              <option value="">All statuses</option>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {visibleQueues.length ? (
            <div className="max-h-[680px] overflow-auto">
              {visibleQueues.map((queue) => {
                const queueKey = String(queue.queue_key ?? "");
                const active = queueKey === selectedQueueKey;
                return (
                  <div
                    key={queueKey}
                    data-active={active}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-2 px-4 py-2.5 transition-colors hover:bg-surface-hover data-[active=true]:bg-surface-selected"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectQueue(queueKey)}
                      className="min-w-0 rounded-md py-1 text-left outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-body-sm font-medium text-foreground">{formatCellValue(queue.display_name)}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-meta text-muted-foreground">
                        {formatCellValue(queue.queue_key)} · {formatCellValue(queue.strategy)} · {formatCellValue(queue.members)} members
                      </span>
                    </button>
                    <span className="flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Edit queue"
                        onClick={() => {
                          onSelectQueue(queueKey);
                          setActiveRecord(queue);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 px-0"
                        title="Delete queue"
                        onClick={() => {
                          onSelectQueue(queueKey);
                          setDeleteRecord(queue);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState title="No queues match the current filters" description="Adjust search or filters and try again." />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {selectedQueue ? (
          <>
            <Card>
              <CardHeader>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div className="text-card-title font-medium">{formatCellValue(selectedQueue.display_name)}</div>
                  </div>
                  <div className="mt-1 text-body-sm text-muted-foreground">
                    {formatCellValue(selectedQueue.queue_key)} · {formatCellValue(selectedQueue.strategy)} · timeout {formatCellValue(selectedQueue.timeout_seconds)}s
                  </div>
                  <div className="mt-3 text-body-sm text-muted-foreground">
                    Provider queue: <span className="text-foreground">{formatCellValue(selectedQueue.provider_queue_name)}</span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {memberConfig ? (
              <CrudResourcePage config={memberConfig} records={selectedMembers} hideToolbar hideHeader />
            ) : (
              <Card>
                <CardContent className="bg-surface-2">
                  <EmptyState title="Members are not available" description="This workspace section does not expose queue members yet." />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card>
            <CardContent className="bg-surface-2">
              <EmptyState title="No queue selected" description="Select a queue to manage its member extensions." />
            </CardContent>
          </Card>
        )}
      </div>

      <CrudFormDialog
        key="queues:create"
        open={createOpen}
        mode="create"
        title="New queue"
        description="Create the tenant queue through the Asterisk control API."
        action={queueConfig.createAction}
        fields={queueConfig.createFields}
        onClose={() => setCreateOpen(false)}
      />

      <CrudFormDialog
        key={`queues:edit:${String(activeRecord?.id ?? "none")}`}
        open={activeRecord !== null}
        mode="edit"
        title={`Edit ${String(activeRecord?.queue_key ?? "queue")}`}
        description="Update this tenant queue."
        action={activeRecord ? `${queueConfig.rowActionBasePath}/${encodeURIComponent(String(activeRecord.id ?? ""))}` : undefined}
        fields={queueConfig.editFields}
        record={activeRecord ?? undefined}
        onClose={() => setActiveRecord(null)}
      />

      <Modal
        open={deleteRecord !== null}
        title="Confirm delete"
        description="This action permanently deletes the selected queue and its members."
        onClose={() => setDeleteRecord(null)}
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to permanently delete queue <span className="font-medium">{String(deleteRecord?.queue_key ?? "this queue")}</span>.
            Queue members will be deleted with it.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            {deleteRecord ? (
              <form action={`${queueConfig.rowActionBasePath}/${encodeURIComponent(String(deleteRecord.id ?? ""))}`} method="post">
                <input type="hidden" name="_method" value="delete" />
                <Button type="submit">
                  <Trash2 className="h-4 w-4" />
                  Delete permanently
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function OverviewSection({
  section,
  summary
}: {
  section: WorkspaceSection;
  summary: WorkspacePayload["summary"];
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="text-card-title font-medium">{section.label}</div>
          <div className="mt-1 text-body-sm text-muted-foreground">{section.description}</div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.map((item) => (
              <div key={item.label} className="rounded-md border border-border-2 bg-surface-2 px-4 py-3">
                <div className={cn("font-mono text-xl font-medium", item.tone && toneClasses[item.tone])}>{item.value}</div>
                <div className="mt-1 text-meta text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {section.records?.length ? (
        <Card>
          <CardContent className="p-0">
            <RecordsTable records={section.records} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PlaceholderSection({
  section,
  contextFilter,
  flowFilter,
  queueFilter,
  extensionFilter,
  contactFilter,
  parentSection,
  onReturnToParent,
  onNavigateAction
}: {
  section: WorkspaceSection;
  contextFilter?: string;
  flowFilter?: string;
  queueFilter?: string;
  extensionFilter?: string;
  contactFilter?: string;
  parentSection?: WorkspaceSection;
  onReturnToParent?: (sectionId: string) => void;
  onNavigateAction?: (href: string) => void;
}) {
  const records = section.records ?? [];
  const visibleRecords = records.filter((record) => {
    if (flowFilter) return String(record.flow_id ?? "") === flowFilter;
    if (contactFilter) return String(record.contact_id ?? "") === contactFilter;
    if (extensionFilter) return String(record.extension_id ?? "") === extensionFilter;
    if (queueFilter) return String(record.queue_key ?? "") === queueFilter;
    if (contextFilter) return String(record.context_key ?? "") === contextFilter;
    return true;
  });
  const crudConfig = crudConfigForSection(section, contextFilter, flowFilter, queueFilter, extensionFilter, contactFilter);

  if (crudConfig) {
    return (
      <div className="space-y-4">
        {parentSection && onReturnToParent ? (
          <Button variant="ghost" className="h-8 px-0" onClick={() => onReturnToParent(parentSection.id)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {parentSection.label}
          </Button>
        ) : null}
        <CrudResourcePage config={crudConfig} records={visibleRecords} onNavigateAction={onNavigateAction} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        {parentSection && onReturnToParent ? (
          <Button variant="ghost" className="mb-2 h-8 px-0" onClick={() => onReturnToParent(parentSection.id)}>
            <ArrowLeft className="h-4 w-4" />
            Back to {parentSection.label}
          </Button>
        ) : null}
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-muted-foreground" />
          <div className="text-card-title font-medium">{section.label}</div>
          {section.status ? <Badge>{section.status}</Badge> : null}
          {contextFilter ? <Badge>Context: {contextFilter}</Badge> : null}
          {flowFilter ? <Badge>Flow ID: {flowFilter}</Badge> : null}
          {queueFilter ? <Badge>Queue: {queueFilter}</Badge> : null}
          {extensionFilter ? <Badge>Extension ID: {extensionFilter}</Badge> : null}
          {contactFilter ? <Badge>Contact ID: {contactFilter}</Badge> : null}
        </div>
        <div className="mt-1 text-body-sm text-muted-foreground">{section.description}</div>
      </CardHeader>
      <CardContent className={cn(records.length ? "p-0" : "bg-surface-2")}>
        <RecordsTable
          records={records}
          contextFilter={contextFilter}
          queueFilter={queueFilter}
          extensionFilter={extensionFilter}
          contactFilter={contactFilter}
          onNavigateAction={onNavigateAction}
        />
      </CardContent>
    </Card>
  );
}

export function WorkspacePage({
  payload,
  backHref,
  backLabel,
  initialTab,
  contextFilter,
  flowFilter,
  queueFilter,
  extensionFilter,
  contactFilter,
  feedback
}: {
  payload: WorkspacePayload;
  backHref: string;
  backLabel: string;
  initialTab?: string;
  contextFilter?: string;
  flowFilter?: string;
  queueFilter?: string;
  extensionFilter?: string;
  contactFilter?: string;
  feedback?: Feedback | null;
}) {
  const initialSectionId = useMemo(() => {
    const fallback = payload.sections[0]?.id ?? "overview";
    return payload.sections.some((section) => section.id === initialTab) ? String(initialTab) : fallback;
  }, [initialTab, payload.sections]);
  const [activeSectionId, setActiveSectionId] = useState(initialSectionId);
  const [activeContextFilter, setActiveContextFilter] = useState(contextFilter);
  const [activeFlowFilter, setActiveFlowFilter] = useState(flowFilter);
  const [activeQueueFilter, setActiveQueueFilter] = useState(queueFilter);
  const [activeExtensionFilter, setActiveExtensionFilter] = useState(extensionFilter);
  const [activeContactFilter, setActiveContactFilter] = useState(contactFilter);
  const activeSection = payload.sections.find((section) => section.id === activeSectionId) ?? payload.sections[0];
  const visibleSections = payload.sections.filter((section) => !section.hiddenFromTabs);
  const parentSection = activeSection?.parentSectionId
    ? payload.sections.find((section) => section.id === activeSection.parentSectionId)
    : undefined;

  useEffect(() => {
    setActiveSectionId(initialSectionId);
    setActiveContextFilter(contextFilter);
    setActiveFlowFilter(flowFilter);
    setActiveQueueFilter(queueFilter);
    setActiveExtensionFilter(extensionFilter);
    setActiveContactFilter(contactFilter);
  }, [contactFilter, contextFilter, extensionFilter, flowFilter, initialSectionId, queueFilter]);

  function selectSection(sectionId: string) {
    setActiveSectionId(sectionId);
    setActiveContextFilter(undefined);
    setActiveFlowFilter(undefined);
    setActiveQueueFilter(undefined);
    setActiveExtensionFilter(undefined);
    setActiveContactFilter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", sectionId);
    url.searchParams.delete("context");
    url.searchParams.delete("flow_id");
    url.searchParams.delete("queue_key");
    url.searchParams.delete("extension_id");
    url.searchParams.delete("contact_id");
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());
  }

  function navigateAction(href: string) {
    const url = new URL(href, window.location.origin);
    if (url.pathname !== window.location.pathname) {
      window.location.href = href;
      return;
    }

    const nextSectionId = url.searchParams.get("tab") ?? activeSectionId;
    if (!payload.sections.some((section) => section.id === nextSectionId)) {
      window.location.href = href;
      return;
    }

    setActiveSectionId(nextSectionId);
    setActiveContextFilter(url.searchParams.get("context") ?? undefined);
    setActiveFlowFilter(url.searchParams.get("flow_id") ?? undefined);
    setActiveQueueFilter(url.searchParams.get("queue_key") ?? undefined);
    setActiveExtensionFilter(url.searchParams.get("extension_id") ?? undefined);
    setActiveContactFilter(url.searchParams.get("contact_id") ?? undefined);
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.pushState(null, "", url.toString());
  }

  function selectContact(contactId: string) {
    setActiveSectionId("contacts");
    setActiveContactFilter(contactId);
    setActiveContextFilter(undefined);
    setActiveFlowFilter(undefined);
    setActiveQueueFilter(undefined);
    setActiveExtensionFilter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "contacts");
    url.searchParams.set("contact_id", contactId);
    url.searchParams.delete("context");
    url.searchParams.delete("flow_id");
    url.searchParams.delete("queue_key");
    url.searchParams.delete("extension_id");
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());
  }

  function selectExtension(extensionId: string) {
    setActiveSectionId("extensions");
    setActiveExtensionFilter(extensionId);
    setActiveContextFilter(undefined);
    setActiveFlowFilter(undefined);
    setActiveQueueFilter(undefined);
    setActiveContactFilter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "extensions");
    url.searchParams.set("extension_id", extensionId);
    url.searchParams.delete("context");
    url.searchParams.delete("flow_id");
    url.searchParams.delete("queue_key");
    url.searchParams.delete("contact_id");
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());
  }

  function selectContext(contextKey: string) {
    setActiveSectionId("contexts");
    setActiveContextFilter(contextKey);
    setActiveFlowFilter(undefined);
    setActiveQueueFilter(undefined);
    setActiveExtensionFilter(undefined);
    setActiveContactFilter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "contexts");
    url.searchParams.set("context", contextKey);
    url.searchParams.delete("flow_id");
    url.searchParams.delete("queue_key");
    url.searchParams.delete("extension_id");
    url.searchParams.delete("contact_id");
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());
  }

  function selectQueue(queueKey: string) {
    setActiveSectionId("queues");
    setActiveQueueFilter(queueKey);
    setActiveContextFilter(undefined);
    setActiveFlowFilter(undefined);
    setActiveExtensionFilter(undefined);
    setActiveContactFilter(undefined);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", "queues");
    url.searchParams.set("queue_key", queueKey);
    url.searchParams.delete("context");
    url.searchParams.delete("flow_id");
    url.searchParams.delete("extension_id");
    url.searchParams.delete("contact_id");
    url.searchParams.delete("feedback");
    url.searchParams.delete("message");
    window.history.replaceState(null, "", url.toString());
  }

  const contactMethodsSection = payload.sections.find((section) => section.id === "contact-methods");
  const telephonySection = payload.sections.find((section) => section.id === "telephony");
  const extensionDevicesSection = payload.sections.find((section) => section.id === "extension-devices");
  const flowsSection = payload.sections.find((section) => section.id === "flows");
  const queueMembersSection = payload.sections.find((section) => section.id === "queue-members");

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <Button asChild variant="ghost" className="mb-3 px-0">
          <Link href={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <h1 className="truncate text-page-title font-light">{payload.subject.title}</h1>
      </div>

      <FeedbackAlert feedback={feedback} />

      <div className="rounded-md border border-border-2 bg-card px-4 py-3">
        <Tabs
          items={visibleSections.map((section) => ({ id: section.id, label: section.label }))}
          value={activeSectionId}
          onValueChange={selectSection}
          className="max-w-full overflow-x-auto"
        />
      </div>

      {activeSection?.id === "overview" ? (
        <OverviewSection section={activeSection} summary={payload.summary} />
      ) : activeSection?.id === "contacts" ? (
        <ContactsMasterDetail
          contactSection={activeSection}
          methodSection={contactMethodsSection}
          contactFilter={activeContactFilter}
          onSelectContact={selectContact}
        />
      ) : activeSection?.id === "tenant-assignments" ? (
        <AgentAssignmentsMasterDetail
          assignmentSection={activeSection}
          telephonySection={telephonySection}
        />
      ) : activeSection?.id === "contexts" ? (
        <ContextsMasterDetail
          contextSection={activeSection}
          flowSection={flowsSection}
          contextFilter={activeContextFilter}
          onSelectContext={selectContext}
        />
      ) : activeSection?.id === "extensions" ? (
        <ExtensionsMasterDetail
          extensionSection={activeSection}
          deviceSection={extensionDevicesSection}
          extensionFilter={activeExtensionFilter}
          onSelectExtension={selectExtension}
        />
      ) : activeSection?.id === "queues" ? (
        <QueuesMasterDetail
          queueSection={activeSection}
          memberSection={queueMembersSection}
          queueFilter={activeQueueFilter}
          onSelectQueue={selectQueue}
        />
      ) : activeSection ? (
        <PlaceholderSection
          section={activeSection}
          contextFilter={activeContextFilter}
          flowFilter={activeFlowFilter}
          queueFilter={activeQueueFilter}
          extensionFilter={activeExtensionFilter}
          contactFilter={activeContactFilter}
          parentSection={parentSection}
          onReturnToParent={selectSection}
          onNavigateAction={navigateAction}
        />
      ) : null}
    </div>
  );
}
