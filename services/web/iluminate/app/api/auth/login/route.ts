import { API_BASE_URL, defaultAuthenticatedPath, placeholderAuthEnabled, placeholderRoleCookieName, sessionCookieName } from "@/lib/api";
import { redirectTo } from "@/lib/request-url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "");
  const password = String(formData.get("password") ?? "");

  if (placeholderAuthEnabled) {
    if (!username || !password) {
      return redirectTo("/login?error=1");
    }

    const response = redirectTo(defaultAuthenticatedPath);
    response.cookies.set(sessionCookieName, "placeholder-session", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.ILUMINATE_SECURE_COOKIES === "true",
      path: "/",
      maxAge: 60 * 60 * 8
    });
    response.cookies.delete(placeholderRoleCookieName);
    return response;
  }

  const apiResponse = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    cache: "no-store"
  });

  if (!apiResponse.ok) {
    return redirectTo("/login?error=1");
  }

  const payload = (await apiResponse.json()) as { access_token: string; expires_at: string };
  const response = redirectTo(defaultAuthenticatedPath);
  response.cookies.set(sessionCookieName, payload.access_token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.ILUMINATE_SECURE_COOKIES === "true",
    path: "/",
    expires: new Date(payload.expires_at)
  });

  return response;
}
