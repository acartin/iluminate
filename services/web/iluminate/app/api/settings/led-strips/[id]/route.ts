import { NextResponse } from "next/server";
import { getMenu } from "@/lib/api";
import { feedbackQuery } from "@/lib/feedback";
import { redirectTo } from "@/lib/request-url";
import { ledStripProfileFormValues, validateLedStripProfileInput } from "@/lib/server/led-strip-profile-input";
import { deleteGlobalLedStripProfile, duplicateGlobalLedStripProfile, updateGlobalLedStripProfile } from "@/lib/server/led-strip-profiles";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if ((await getMenu()).user.role !== "system-admin") return NextResponse.json({ message: "Forbidden." }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const action = String(form.get("_action") ?? form.get("_method") ?? "patch").toLowerCase();
  try {
    if (action === "duplicate") {
      const duplicated = await duplicateGlobalLedStripProfile(id);
      const feedback = duplicated
        ? feedbackQuery("success", "LED strip profile duplicated. You can now edit the copy.")
        : feedbackQuery("error", "LED strip profile not found.");
      return redirectTo(`/settings/led-strips?${feedback}`);
    }
    if (action === "delete") {
      const deleted = await deleteGlobalLedStripProfile(id);
      const feedback = deleted
        ? feedbackQuery("success", "LED strip profile deleted. Existing project snapshots were not changed.")
        : feedbackQuery("error", "LED strip profile not found.");
      return redirectTo(`/settings/led-strips?${feedback}`);
    }
    const parsed = validateLedStripProfileInput(ledStripProfileFormValues(form));
    if (!parsed.ok) return redirectTo(`/settings/led-strips?${feedbackQuery("error", parsed.message)}`);
    const updated = await updateGlobalLedStripProfile(id, parsed.value);
    const feedback = updated
      ? feedbackQuery("success", "LED strip profile updated.")
      : feedbackQuery("error", "LED strip profile not found.");
    return redirectTo(`/settings/led-strips?${feedback}`);
  } catch {
    return redirectTo(`/settings/led-strips?${feedbackQuery("error", "The profile could not be updated. Check its values and key.")}`);
  }
}
