import { NextResponse } from "next/server";
import { API_BASE_URL, placeholderAuthEnabled, sessionCookieName } from "@/lib/api";
import { feedbackQuery, friendlyApiError } from "@/lib/feedback";
import { redirectTo } from "@/lib/request-url";

function tokenFromRequest(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName}=`))
    ?.split("=")[1];
}

function redirectPath(request: Request, type: "success" | "warning" | "error" | "info", message: string, contactId?: unknown) {
  const referer = request.headers.get("referer");
  const refererUrl = referer ? new URL(referer) : null;
  const target = refererUrl ? refererUrl.pathname : "/settings/tenants";
  const params = new URLSearchParams({ tab: "contact-methods" });
  const scopedContactId = contactId ?? refererUrl?.searchParams.get("contact_id");
  if (scopedContactId) params.set("contact_id", String(scopedContactId));
  const feedbackParams = new URLSearchParams(feedbackQuery(type, message));
  feedbackParams.forEach((value, key) => params.set(key, value));
  return redirectTo(`${target}?${params.toString()}`);
}

function payloadFromForm(formData: FormData) {
  const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (typeof payload.contact_id === "string") payload.contact_id = Number.parseInt(payload.contact_id, 10);
  if (payload.is_primary === "true") payload.is_primary = true;
  if (payload.is_primary === "false") payload.is_primary = false;
  if (payload.can_receive_escalations === "true") payload.can_receive_escalations = true;
  if (payload.can_receive_escalations === "false") payload.can_receive_escalations = false;
  if (typeof payload.metadata === "string" && payload.metadata.trim()) payload.metadata = JSON.parse(payload.metadata);
  if (payload.metadata === "") payload.metadata = {};
  return payload;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = tokenFromRequest(request);
  if (!token) return redirectTo("/login");

  const { id: tenantKey } = await params;
  const formData = await request.formData();
  let payload: Record<string, unknown>;
  try {
    payload = payloadFromForm(formData);
  } catch {
    return redirectPath(request, "error", "Metadata must be a valid JSON object.");
  }

  if (placeholderAuthEnabled) {
    return redirectPath(request, "info", "Placeholder mode: contact method was not saved.", payload.contact_id);
  }

  const response = await fetch(`${API_BASE_URL}/settings/tenants/${encodeURIComponent(tenantKey)}/contact-methods`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (response.status === 401) return redirectTo("/login");
  if (response.status === 403) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => undefined);
    return redirectPath(request, "error", friendlyApiError(errorPayload), payload.contact_id);
  }

  return redirectPath(request, "success", "Contact method created successfully.", payload.contact_id);
}
