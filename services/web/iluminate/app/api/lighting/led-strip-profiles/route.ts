import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { listLedStripProfiles } from "@/lib/server/led-strip-profiles";

export const runtime = "nodejs";

export async function GET() {
  const menu = await getMenu();
  try {
    return NextResponse.json({ records: await listLedStripProfiles(menu.tenant.client_id) });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list LED strip profiles." }, { status: 500 });
  }
}
