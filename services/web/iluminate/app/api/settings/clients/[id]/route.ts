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

function redirectWithFeedback(type: "success" | "warning" | "error" | "info", message: string) {
  return redirectTo(`/settings/clients?${feedbackQuery(type, message)}`);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = tokenFromRequest(request);
  if (!token) return redirectTo("/login");

  const { id } = await params;
  const formData = await request.formData();
  const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
  delete payload._method;

  if (placeholderAuthEnabled) {
    return redirectWithFeedback("success", `Client ${id} updated in placeholder mode.`);
  }

  const response = await fetch(`${API_BASE_URL}/settings/clients/${encodeURIComponent(id)}`, {
    method: "PATCH",
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
    return redirectWithFeedback("error", friendlyApiError(errorPayload));
  }

  return redirectWithFeedback("success", "Client updated successfully.");
}
