import type { LedStripProfileInput } from "@/lib/server/led-strip-profiles";

type ValidationResult =
  | { ok: true; value: LedStripProfileInput }
  | { ok: false; message: string };

function requiredText(values: Record<string, string>, key: string, label: string) {
  const value = values[key]?.trim();
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function positiveNumber(values: Record<string, string>, key: string, label: string): number;
function positiveNumber(values: Record<string, string>, key: string, label: string, optional: true): number | undefined;
function positiveNumber(values: Record<string, string>, key: string, label: string, optional = false) {
  const raw = values[key]?.trim();
  if (!raw && optional) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

export function validateLedStripProfileInput(values: Record<string, string>): ValidationResult {
  try {
    const profileKey = requiredText(values, "profileKey", "Profile key");
    if (!/^[a-z0-9][a-z0-9_.:-]*$/.test(profileKey)) {
      throw new Error("Profile key must use lowercase letters, numbers, dots, colons, underscores or hyphens.");
    }
    const construction = values.construction === "continuous" ? "continuous" : "discrete";
    const colorModel = values.colorModel === "rgbw" ? "rgbw" : "rgb";
    const cutMode = construction === "continuous" && values.cutMode === "free_cut" ? "free_cut" : "marked_segments";
    const sourceUrl = values.sourceUrl?.trim();
    if (sourceUrl) {
      const url = new URL(sourceUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    }

    return {
      ok: true,
      value: {
        profileKey,
        name: requiredText(values, "name", "Name"),
        construction,
        nativeControlProtocol: requiredText(values, "nativeControlProtocol", "Native protocol"),
        colorModel,
        voltageV: positiveNumber(values, "voltageV", "Voltage"),
        cutMode,
        cutSegmentLengthMm: positiveNumber(values, "cutSegmentLengthMm", "Cut segment", true),
        addressablePixelsPerCutSegment: positiveNumber(values, "addressablePixelsPerCutSegment", "Pixels per cut"),
        physicalLedsPerCutSegment: positiveNumber(values, "physicalLedsPerCutSegment", "LEDs per cut", true),
        physicalLedsPerAddressablePixel: positiveNumber(values, "physicalLedsPerAddressablePixel", "LEDs per pixel", true),
        addressablePixelsPerMeter: positiveNumber(values, "addressablePixelsPerMeter", "Pixels per meter"),
        physicalLedsPerMeter: positiveNumber(values, "physicalLedsPerMeter", "LEDs per meter", true),
        pcbWidthMm: positiveNumber(values, "pcbWidthMm", "PCB width"),
        pcbThicknessMm: positiveNumber(values, "pcbThicknessMm", "PCB thickness", true),
        ledPackageSizeMm: positiveNumber(values, "ledPackageSizeMm", "LED package", true),
        ratedPowerWPerMeter: positiveNumber(values, "ratedPowerWPerMeter", "Rated power", true),
        minimumBendRadiusMm: positiveNumber(values, "minimumBendRadiusMm", "Minimum bend radius", true),
        backupDataLine: values.backupDataLine === "true",
        ...(sourceUrl ? { sourceUrl } : {})
      }
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error && error.message ? error.message : "Source URL must be a valid HTTP or HTTPS URL." };
  }
}

export function ledStripProfileFormValues(form: FormData) {
  return Object.fromEntries(Array.from(form.entries(), ([key, value]) => [key, String(value)]));
}
