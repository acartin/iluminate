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

function redirectPath(request: Request, type: "success" | "warning" | "error" | "info", message: string) {
  const referer = request.headers.get("referer");
  const target = referer ? new URL(referer).pathname : "/settings/tenants";
  const params = new URLSearchParams({ tab: "channels" });
  const feedbackParams = new URLSearchParams(feedbackQuery(type, message));
  feedbackParams.forEach((value, key) => params.set(key, value));
  return redirectTo(`${target}?${params.toString()}`);
}

function payloadFromForm(formData: FormData) {
  const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
  delete payload._method;
  if (payload.service_policy_id === "") payload.service_policy_id = null;
  if (typeof payload.metadata === "string" && payload.metadata.trim()) payload.metadata = JSON.parse(payload.metadata);
  if (payload.metadata === "") payload.metadata = {};
  return payload;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; recordId: string }> }
) {
  const token = tokenFromRequest(request);
  if (!token) return redirectTo("/login");

  const { id: tenantKey, recordId } = await params;
  const formData = await request.formData();
  const method = String(formData.get("_method") ?? "patch").toLowerCase();
  let payload: Record<string, unknown> | undefined;
  try {
    payload = method === "delete" ? undefined : payloadFromForm(formData);
  } catch {
    return redirectPath(request, "error", "Metadata must be a valid JSON object.");
  }

  if (placeholderAuthEnabled) {
    return redirectPath(request, "info", `Placeholder mode: channel ${method === "delete" ? "deleted" : "updated"}.`);
  }

  const response = await fetch(`${API_BASE_URL}/settings/tenants/${encodeURIComponent(tenantKey)}/channels/${encodeURIComponent(recordId)}`, {
    method: method === "delete" ? "DELETE" : "PATCH",
    headers: payload
      ? {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      : { Authorization: `Bearer ${token}` },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store"
  });

  if (response.status === 401) return redirectTo("/login");
  if (response.status === 403) return NextResponse.json({ detail: "Forbidden" }, { status: 403 });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => undefined);
    return redirectPath(request, "error", friendlyApiError(errorPayload));
  }

  return redirectPath(request, "success", method === "delete" ? "Channel deleted permanently." : "Channel updated successfully.");
}
