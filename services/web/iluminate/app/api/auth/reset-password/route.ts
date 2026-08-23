import { API_BASE_URL, placeholderAuthEnabled } from "@/lib/api";
import { redirectTo } from "@/lib/request-url";

export async function POST(request: Request) {
  const formData = await request.formData();
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!token || password.length < 8 || password !== confirmPassword) {
    return redirectTo(`/reset-password?error=1&token=${encodeURIComponent(token)}`);
  }

  if (placeholderAuthEnabled) {
    return redirectTo("/login?reset=1");
  }

  const apiResponse = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
    cache: "no-store"
  });

  if (!apiResponse.ok) {
    return redirectTo(`/reset-password?error=1&token=${encodeURIComponent(token)}`);
  }

  return redirectTo("/login?reset=1");
}
