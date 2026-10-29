import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { feedbackQuery } from "@/lib/feedback";
import { redirectTo } from "@/lib/request-url";
import { ledStripProfileFormValues, validateLedStripProfileInput } from "@/lib/server/led-strip-profile-input";
import { createGlobalLedStripProfile, listGlobalLedStripProfiles } from "@/lib/server/led-strip-profiles";

export const runtime = "nodejs";

async function isSystemAdmin() {
  return (await getMenu()).user.role === "system-admin";
}

export async function GET() {
  if (!await isSystemAdmin()) return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  return NextResponse.json({ records: await listGlobalLedStripProfiles() });
}

export async function POST(request: Request) {
  if (!await isSystemAdmin()) return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  const parsed = validateLedStripProfileInput(ledStripProfileFormValues(await request.formData()));
  if (!parsed.ok) return redirectTo(`/settings/led-strips?${feedbackQuery("error", parsed.message)}`);
  try {
    await createGlobalLedStripProfile(parsed.value);
    return redirectTo(`/settings/led-strips?${feedbackQuery("success", "LED strip profile created.")}`);
  } catch {
    return redirectTo(`/settings/led-strips?${feedbackQuery("error", "The profile could not be created. Check that its key is unique.")}`);
  }
}
