"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PasswordInput } from "@/components/ui/password-input";
import { CrudField } from "./types";

function valuesFor(field: CrudField, record?: Record<string, unknown>) {
  if (!record) return [];
  const valueKey = field.sourceName ?? field.name;
  const value = record[valueKey];
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object") return [JSON.stringify(value, null, 2)];
  if (typeof value === "string" && field.control === "checkbox-group") {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
  return value === null || value === undefined ? [] : [String(value)];
}

function Field({
  field,
  mode,
  record,
  formValues,
  onFieldChange
}: {
  field: CrudField;
  mode: "create" | "view" | "edit";
  record?: Record<string, unknown>;
  formValues: Record<string, string>;
  onFieldChange: (fieldName: string, value: string) => void;
}) {
  if ((field.createOnly && mode !== "create") || (field.editOnly && mode === "view")) return null;
  if (field.hideWhen && field.hideWhen.values.includes(formValues[field.hideWhen.field] ?? "")) return null;

  const value = formValues[field.name] ?? valuesFor(field, record)[0] ?? field.defaultValue ?? "";
  const values = valuesFor(field, record);
  const readOnly = mode === "view" || field.editable === false;
  const options = field.optionsSource && record && Array.isArray(record[field.optionsSource])
    ? (record[field.optionsSource] as Array<{ value: string; label: string }>)
    : field.options;

  if (field.type === "hidden") {
    return <input type="hidden" name={field.name} defaultValue={value} />;
  }

  return (
    <label className="space-y-1 text-label font-medium">
      <span>{field.label}</span>
      {field.control === "checkbox-group" && options ? (
        <div className="grid gap-2 rounded-md border border-border-2 bg-background p-3">
          {options.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-body-sm font-normal">
              <input
                type="checkbox"
                name={field.name}
                value={option.value}
                defaultChecked={values.includes(option.value)}
                disabled={readOnly}
                className="h-4 w-4 rounded border-border-2"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : options && !readOnly ? (
        <select
          name={field.name}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onFieldChange(field.name, event.target.value)}
          required={field.required ?? true}
          className="min-h-9 w-full rounded-md border border-border-2 bg-background px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.control === "textarea" || field.control === "json" ? (
        <textarea
          name={field.name}
          required={readOnly ? false : field.required ?? true}
          defaultValue={value}
          readOnly={readOnly}
          placeholder={field.placeholder}
          rows={4}
          className="min-h-24 w-full rounded-md border border-border-2 bg-background px-3 py-2 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background read-only:bg-surface-2"
        />
      ) : field.type === "password" && !readOnly ? (
        <PasswordInput
          name={field.name}
          required={field.required ?? true}
          minLength={field.minLength}
          defaultValue={value}
          autoComplete="new-password"
          placeholder={field.placeholder}
          className="h-9 w-full rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        />
      ) : (
        <input
          name={field.name}
          type={field.type ?? "text"}
          required={readOnly ? false : field.required ?? true}
          minLength={field.minLength}
          defaultValue={value}
          readOnly={readOnly}
          placeholder={field.placeholder}
          className="h-9 w-full rounded-md border border-border-2 bg-background px-3 text-body-sm outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background read-only:bg-surface-2"
        />
      )}
      {field.helperText ? <span className="block text-meta font-normal text-muted-foreground">{field.helperText}</span> : null}
    </label>
  );
}

export function CrudFormDialog({
  open,
  mode,
  title,
  description,
  action,
  fields,
  record,
  canSubmit = true,
  onClose
}: {
  open: boolean;
  mode: "create" | "view" | "edit";
  title: string;
  description?: string;
  action?: string;
  fields: CrudField[];
  record?: Record<string, unknown>;
  canSubmit?: boolean;
  onClose: () => void;
}) {
  const [jsonError, setJsonError] = useState<string | null>(null);
  const initialFormValues = useMemo(() => {
    return fields.reduce<Record<string, string>>((values, field) => {
      values[field.name] = valuesFor(field, record)[0] ?? field.defaultValue ?? "";
      return values;
    }, {});
  }, [fields, record]);
  const [formValues, setFormValues] = useState(initialFormValues);

  useEffect(() => {
    if (open) setFormValues(initialFormValues);
  }, [initialFormValues, open]);

  function handleFieldChange(fieldName: string, value: string) {
    setFormValues((current) => ({ ...current, [fieldName]: value }));
  }

  function normalizeJsonFields(event: FormEvent<HTMLFormElement>) {
    setJsonError(null);
    if (mode === "view" || !canSubmit) return;

    for (const field of fields) {
      if (field.control !== "json") continue;
      const element = event.currentTarget.elements.namedItem(field.name);
      if (!(element instanceof HTMLTextAreaElement)) continue;

      const rawValue = element.value.trim();
      if (!rawValue) {
        element.value = "{}";
        continue;
      }

      try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
          throw new Error("Expected object");
        }
        element.value = JSON.stringify(parsed);
      } catch {
        event.preventDefault();
        setJsonError(`${field.label} must be a valid JSON object.`);
        return;
      }
    }
  }

  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <form action={mode !== "view" && canSubmit ? action : undefined} method="post" className="space-y-5" onSubmit={normalizeJsonFields}>
        <div className="grid gap-3 md:grid-cols-2">
          {fields.map((field) => (
            <Field
              key={field.name}
              field={field}
              mode={mode}
              record={record}
              formValues={formValues}
              onFieldChange={handleFieldChange}
            />
          ))}
        </div>
        {jsonError ? (
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-2 text-body-sm text-[var(--red-text)]">
            {jsonError}
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            {mode === "view" ? "Close" : "Cancel"}
          </Button>
          {mode !== "view" ? (
            <Button type="submit" disabled={!canSubmit}>
              {mode === "create" ? "Create" : "Update"}
            </Button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
