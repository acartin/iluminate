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
  return redirectTo(`/settings/agents?${feedbackQuery(type, message)}`);
}

function payloadFromForm(formData: FormData) {
  const payload: Record<string, unknown> = Object.fromEntries(formData.entries());
  if (typeof payload.user_id === "string") payload.user_id = Number.parseInt(payload.user_id, 10);
  if (payload.supervisor_user_id === "") payload.supervisor_user_id = null;
  if (typeof payload.supervisor_user_id === "string") payload.supervisor_user_id = Number.parseInt(payload.supervisor_user_id, 10);
  if (typeof payload.metadata === "string" && payload.metadata.trim()) payload.metadata = JSON.parse(payload.metadata);
  if (payload.metadata === "") payload.metadata = {};
  return payload;
}

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  if (!token) return redirectTo("/login");

  const formData = await request.formData();
  let payload: Record<string, unknown>;
  try {
    payload = payloadFromForm(formData);
  } catch {
    return redirectWithFeedback("error", "Metadata must be a valid JSON object.");
  }

  if (placeholderAuthEnabled) {
    return redirectWithFeedback("info", "Placeholder mode: agent was not saved to the database.");
  }

  const response = await fetch(`${API_BASE_URL}/settings/agents`, {
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
    return redirectWithFeedback("error", friendlyApiError(errorPayload));
  }

  return redirectWithFeedback("success", "Agent created successfully.");
}
