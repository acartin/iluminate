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
  const params = new URLSearchParams({ tab: "numbers" });
  const feedbackParams = new URLSearchParams(feedbackQuery(type, message));
  feedbackParams.forEach((value, key) => params.set(key, value));
  return redirectTo(`${target}?${params.toString()}`);
}

function payloadFromForm(formData: FormData) {
  const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (payload.channel_id === "") payload.channel_id = null;
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
    return redirectPath(request, "info", "Placeholder mode: number was not saved.");
  }

  const response = await fetch(`${API_BASE_URL}/settings/tenants/${encodeURIComponent(tenantKey)}/numbers`, {
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
    return redirectPath(request, "error", friendlyApiError(errorPayload));
  }

  return redirectPath(request, "success", "Number created successfully.");
}
