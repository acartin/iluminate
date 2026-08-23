import { API_BASE_URL, placeholderAuthEnabled, placeholderRoleCookieName, sessionCookieName } from "@/lib/api";
import { redirectTo } from "@/lib/request-url";

async function logout(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${sessionCookieName}=`))
    ?.split("=")[1];

  if (token && !placeholderAuthEnabled) {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store"
    }).catch(() => undefined);
  }

  const response = redirectTo("/");
  response.cookies.delete(sessionCookieName);
  response.cookies.delete(placeholderRoleCookieName);
  return response;
}

export async function POST(request: Request) {
  return logout(request);
}
