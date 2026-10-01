import { appendFile } from "node:fs/promises";
import { NextResponse } from "next/server";

const LOG_PATH = "/tmp/iluminate-client-debug.log";

export async function POST(request: Request) {
  const text = await request.text();
  if (text.length > 32_768) return NextResponse.json({ ok: false }, { status: 413 });

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const entries = Array.isArray((payload as { entries?: unknown })?.entries)
    ? (payload as { entries: unknown[] }).entries.slice(-100)
    : [];
  if (!entries.length) return NextResponse.json({ ok: true });

  const line = JSON.stringify({ receivedAt: new Date().toISOString(), entries });
  await appendFile(LOG_PATH, `${line}\n`, "utf8");
  console.info(`[client-debug] ${line}`);
  return NextResponse.json({ ok: true });
}
