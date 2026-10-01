import { NextRequest, NextResponse } from "next/server";

const destinations: Record<string, string> = {
  start: "/start",
  login: "/login",
  designer: "/partituras/designer",
  generator: "/partituras/generator",
  projects: "/projects"
};

function requestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!forwardedHost) return request.nextUrl.hostname;

  try {
    return new URL(`http://${forwardedHost}`).hostname;
  } catch {
    return request.nextUrl.hostname;
  }
}

function requestProtocol(request: NextRequest) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol === "http" || forwardedProtocol === "https") return forwardedProtocol;
  return request.nextUrl.protocol.replace(":", "");
}

function developmentAppOrigin(request: NextRequest) {
  const protocol = requestProtocol(request);
  const hostname = requestHostname(request);
  const formattedHostname = hostname.includes(":") ? `[${hostname}]` : hostname;
  const configuredPort = process.env.ILUMINATE_WEB_PORT?.trim();
  const port = configuredPort && /^\d{1,5}$/.test(configuredPort) ? configuredPort : "8420";
  return `${protocol}://${formattedHostname}:${port}`;
}

export function GET(request: NextRequest) {
  const destination = request.nextUrl.searchParams.get("destination") ?? "start";
  const path = destinations[destination] ?? destinations.start;
  const configuredOrigin = process.env.ILUMINATE_APP_URL?.trim();
  if (!configuredOrigin && requestProtocol(request) === "https") {
    return new NextResponse("Iluminate application handoff is not configured.", {
      status: 503,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" }
    });
  }
  const target = new URL(path, configuredOrigin || developmentAppOrigin(request));

  const template = request.nextUrl.searchParams.get("template");
  if (destination === "start" && template && /^[a-z0-9-]{1,80}$/.test(template)) {
    target.searchParams.set("template", template);
  }

  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
