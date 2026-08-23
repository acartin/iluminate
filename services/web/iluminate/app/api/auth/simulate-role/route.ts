import { NextResponse } from "next/server";
import {
  API_BASE_URL,
  defaultAuthenticatedPath,
  defaultPathForRole,
  isRole,
  placeholderAuthEnabled,
  placeholderRoleCookieName,
  roleCanAccessPath,
  sessionCookieName
} from "@/lib/api";
import { redirectTo } from "@/lib/request-url";

function tokenFromRequest(request: Request): string | undefined {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName}=`))
    ?.split("=")[1];
}

function safeRedirect(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : defaultAuthenticatedPath;
}

export async function POST(request: Request) {
  const token = tokenFromRequest(request);
  if (!token) {
    return redirectTo("/login");
  }

  const formData = await request.formData();
  const roleId = String(formData.get("role_id") ?? "");
  const redirectToPath = safeRedirect(String(formData.get("redirect_to") ?? defaultAuthenticatedPath));

  if (placeholderAuthEnabled) {
    if (!isRole(roleId)) {
      return NextResponse.json({ detail: "Invalid role" }, { status: 400 });
    }

    const nextPath = roleCanAccessPath(roleId, redirectToPath) ? redirectToPath : defaultPathForRole(roleId);
    const response = redirectTo(nextPath);
    response.cookies.set(placeholderRoleCookieName, roleId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.ILUMINATE_SECURE_COOKIES === "true",
      path: "/",
      maxAge: 60 * 60 * 8
    });
    return response;
  }

  const response = await fetch(`${API_BASE_URL}/auth/simulate-role`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ role_id: roleId }),
    cache: "no-store"
  });

  if (response.status === 401) {
    return redirectTo("/login");
  }

  if (!response.ok) {
    return NextResponse.json(await response.json(), { status: response.status });
  }

  if (!isRole(roleId)) {
    return redirectTo(defaultAuthenticatedPath);
  }

  const nextPath = roleCanAccessPath(roleId, redirectToPath) ? redirectToPath : defaultPathForRole(roleId);
  return redirectTo(nextPath);
}
