"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, Copy, Eye, Filter, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { CrudFormDialog } from "./crud-form-dialog";
import { CrudGrid } from "./crud-grid";
import { CrudColumn, CrudResourceConfig } from "./types";

type RowAction = {
  label: string;
  href: string;
  icon?: "copy" | "activate" | "preview";
};

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function recordMatchesSearch<TRecord extends Record<string, unknown>>(
  record: TRecord,
  columns: CrudColumn<TRecord>[],
  query: string
) {
  if (!query) return true;

  return columns.some((column) => {
    const value = column.searchValue ? column.searchValue(record) : record[column.id];
    return normalizeSearch(value).includes(query);
  });
}

function recordMatchesFilters<TRecord extends Record<string, unknown>>(
  record: TRecord,
  filters: CrudResourceConfig<TRecord>["filters"],
  selectedFilters: Record<string, string>
) {
  return (filters ?? []).every((filter) => {
    const selectedValue = selectedFilters[filter.key] ?? "";
    return !selectedValue || String(record[filter.key] ?? "") === selectedValue;
  });
}

function rowActions(value: unknown): RowAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RowAction => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Record<string, unknown>;
    return (
      typeof candidate.label === "string"
      && typeof candidate.href === "string"
      && (candidate.icon === undefined || candidate.icon === "copy" || candidate.icon === "activate" || candidate.icon === "preview")
    );
  });
}

function rowActionContent(action: RowAction) {
  if (action.icon === "copy") return <Copy className="h-4 w-4" />;
  if (action.icon === "activate") return <CheckCircle2 className="h-4 w-4" />;
  if (action.icon === "preview") return <Eye className="h-4 w-4" />;
  return <span>{action.label}</span>;
}

export function CrudResourcePage<TRecord extends Record<string, unknown>>({
  config,
  records,
  onNavigateAction,
  onCreateAction,
  hideToolbar = false,
  hideHeader = false
}: {
  config: CrudResourceConfig<TRecord>;
  records: TRecord[];
  onNavigateAction?: (href: string) => void;
  onCreateAction?: () => void;
  hideToolbar?: boolean;
  hideHeader?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [activeRecord, setActiveRecord] = useState<TRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<TRecord | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | null>(null);

  const normalizedQuery = normalizeSearch(query);
  const filteredRecords = useMemo(
    () =>
      records.filter(
        (record) =>
          recordMatchesSearch(record, config.columns, normalizedQuery)
          && recordMatchesFilters(record, config.filters, selectedFilters)
      ),
    [config.columns, config.filters, normalizedQuery, records, selectedFilters]
  );

  const columns: CrudColumn<TRecord>[] = [
    ...config.columns,
    {
      id: "actions",
      header: "Actions",
      sortable: false,
      headerClassName: "text-right",
      className: "w-32 text-right",
      cell: (record) => {
        const rowId = String(record[config.identityField] ?? "");
        return (
          <div className="flex justify-end gap-1">
            {rowActions(record._actions).map((action) => (
              <Button
                key={action.href}
                asChild={!onNavigateAction}
                type="button"
                variant="ghost"
                className={action.icon ? "h-8 w-8 px-0" : "h-8 px-2"}
                title={action.label}
                onClick={onNavigateAction ? () => onNavigateAction(action.href) : undefined}
              >
                {onNavigateAction ? (
                  rowActionContent(action)
                ) : (
                  <Link href={action.href}>
                    {rowActionContent(action)}
                  </Link>
                )}
              </Button>
            ))}
            {config.allowedActions.includes("view") ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 px-0"
                title="View"
                onClick={() => {
                  setActiveRecord(record);
                  setMode("view");
                }}
              >
                <Eye className="h-4 w-4" />
              </Button>
            ) : null}
            {config.allowedActions.includes("workspace") && config.workspaceHref ? (
              <Button asChild type="button" variant="ghost" className="h-8 w-8 px-0" title={config.workspaceLabel ?? "Open workspace"}>
                <Link href={config.workspaceHref(record)}>
                  <ArrowUpRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            {config.allowedActions.includes("edit") ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 px-0"
                title="Edit"
                onClick={() => {
                  setActiveRecord(record);
                  setMode("edit");
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            ) : null}
            {config.allowedActions.includes("deactivate") ? (
              <form action={`${config.rowActionBasePath}/${encodeURIComponent(rowId)}`} method="post">
                <input type="hidden" name="_method" value="patch" />
                <input type="hidden" name="status" value="inactive" />
                <Button type="submit" variant="ghost" className="h-8 w-8 px-0" title="Deactivate">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </form>
            ) : null}
            {config.allowedActions.includes("delete") ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 px-0"
                title="Delete"
                onClick={() => setDeleteRecord(record)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        );
      }
    }
  ];

  const clearFilters = () => {
    setQuery("");
    setSelectedFilters({});
  };

  return (
    <>
      <div className="space-y-4">
        {hideToolbar ? (
          config.canCreate !== false ? (
            <div className="flex justify-end">
              <Button type="button" onClick={onCreateAction ?? (() => setCreateOpen(true))}>
                <Plus className="h-4 w-4" />
                {config.createLabel}
              </Button>
            </div>
          ) : null
        ) : (
          <div className="flex flex-col gap-3 rounded-md border border-border-2 bg-card p-3 shadow-[0_1px_2px_var(--shadow-color)] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center">
              <label className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={config.searchPlaceholder}
                  aria-label={config.searchPlaceholder}
                  className="h-control w-full rounded-md border border-border-2 bg-background pl-9 pr-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                />
              </label>
              {config.filters?.map((filter) => (
                <label key={filter.key} className="flex items-center gap-2">
                  <span className="sr-only">{filter.label}</span>
                  <select
                    value={selectedFilters[filter.key] ?? ""}
                    onChange={(event) =>
                      setSelectedFilters((current) => ({ ...current, [filter.key]: event.target.value }))
                    }
                    className="h-control rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  >
                    <option value="">{filter.allLabel}</option>
                    {filter.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Button type="button" variant="outline" onClick={clearFilters}>
                <Filter className="h-4 w-4" />
                Clear
              </Button>
            </div>
            {config.canCreate !== false ? (
              <Button type="button" onClick={onCreateAction ?? (() => setCreateOpen(true))}>
                <Plus className="h-4 w-4" />
                {config.createLabel}
              </Button>
            ) : null}
          </div>
        )}

        <Card>
          {hideHeader ? null : (
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-card-title font-medium">{config.title}</div>
                  <div className="mt-1 text-body-sm text-muted-foreground">{config.description}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{filteredRecords.length} shown</Badge>
                  <Badge>{records.length} total</Badge>
                </div>
              </div>
            </CardHeader>
          )}
          <CardContent>
            <CrudGrid
              columns={columns}
              records={filteredRecords}
              emptyTitle={config.emptyTitle}
              emptyDescription={config.emptyDescription}
            />
          </CardContent>
        </Card>
      </div>

      {config.canCreate !== false && !onCreateAction ? (
        <CrudFormDialog
          key={`${config.id}:create`}
          open={createOpen}
          mode="create"
          title={`New ${config.eyebrow ?? config.title}`}
          description="Create the record through the Iluminate API boundary."
          action={config.createAction}
          fields={config.createFields}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      <CrudFormDialog
        key={`${config.id}:${mode ?? "closed"}:${String(activeRecord?.[config.identityField] ?? "none")}`}
        open={mode !== null && activeRecord !== null}
        mode={mode ?? "view"}
        title={`${mode === "edit" ? "Edit" : "View"} ${String(activeRecord?.[config.titleField] ?? "record")}`}
        description={mode === "view" ? "Selected account details." : "Update allowed account fields through the Iluminate API boundary."}
        action={
          activeRecord
            ? `${config.rowActionBasePath}/${encodeURIComponent(String(activeRecord[config.identityField] ?? ""))}`
            : undefined
        }
        fields={config.editFields}
        record={activeRecord ?? undefined}
        canSubmit={config.allowedActions.includes("edit")}
        onClose={() => {
          setMode(null);
          setActiveRecord(null);
        }}
      />

      <Modal
        open={deleteRecord !== null}
        title="Confirm delete"
        description="This action permanently deletes the selected record."
        onClose={() => setDeleteRecord(null)}
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to permanently delete{" "}
            <span className="font-medium">
              {String(deleteRecord?.[config.titleField] ?? deleteRecord?.[config.identityField] ?? "this record")}
            </span>
            . This cannot be undone.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteRecord(null)}>
              Cancel
            </Button>
            {deleteRecord ? (
              <form action={`${config.rowActionBasePath}/${encodeURIComponent(String(deleteRecord[config.identityField] ?? ""))}`} method="post">
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
    </>
  );
}
