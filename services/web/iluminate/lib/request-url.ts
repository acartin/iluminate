import { NextResponse } from "next/server";

export function safeRedirectPath(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }

  try {
    const base = new URL("https://iluminate.local");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function redirectTo(path: string, status = 303) {
  return new NextResponse(null, {
    status,
    headers: {
      Location: path
    }
  });
}
