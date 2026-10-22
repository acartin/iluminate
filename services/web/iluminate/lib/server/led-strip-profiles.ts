import type { LedStripCatalogProfile } from "@/lib/lighting/partitura-model";
import { getPool } from "@/lib/server/postgres";

type LedStripProfileRow = {
  id: string;
  client_id: string | number | null;
  profile_key: string;
  revision: number;
  name: string;
  construction: LedStripCatalogProfile["construction"];
  native_control_protocol: string;
  color_model: LedStripCatalogProfile["colorModel"];
  voltage_v: string | number;
  cut_mode: LedStripCatalogProfile["cutMode"];
  cut_segment_length_mm: string | number;
  addressable_pixels_per_cut_segment: number;
  physical_leds_per_cut_segment: string | number | null;
  physical_leds_per_addressable_pixel: string | number | null;
  addressable_pixels_per_meter: string | number;
  physical_leds_per_meter: string | number | null;
  pcb_width_mm: string | number;
  pcb_thickness_mm: string | number | null;
  led_package_size_mm: string | number | null;
  rated_power_w_per_meter: string | number | null;
  minimum_bend_radius_mm: string | number | null;
  backup_data_line: boolean;
  source_url: string | null;
};

const optionalNumber = (value: string | number | null) => value === null ? undefined : Number(value);

function mapLedStripProfile(row: LedStripProfileRow): LedStripCatalogProfile {
  return {
    id: row.id,
    profileKey: row.profile_key,
    revision: row.revision,
    ...(row.client_id === null ? {} : { clientId: String(row.client_id) }),
    name: row.name,
    construction: row.construction,
    nativeControlProtocol: row.native_control_protocol,
    colorModel: row.color_model,
    voltageV: Number(row.voltage_v),
    cutMode: row.cut_mode,
    ...(row.construction === "continuous" && row.cut_mode !== "free_cut" ? { cutSegmentLengthMm: Number(row.cut_segment_length_mm) } : {}),
    addressablePixelsPerCutSegment: row.addressable_pixels_per_cut_segment,
    ...(optionalNumber(row.physical_leds_per_cut_segment) === undefined ? {} : { physicalLedsPerCutSegment: optionalNumber(row.physical_leds_per_cut_segment) }),
    ...(optionalNumber(row.physical_leds_per_addressable_pixel) === undefined ? {} : { physicalLedsPerAddressablePixel: optionalNumber(row.physical_leds_per_addressable_pixel) }),
    addressablePixelsPerMeter: Number(row.addressable_pixels_per_meter),
    ...(optionalNumber(row.physical_leds_per_meter) === undefined ? {} : { physicalLedsPerMeter: optionalNumber(row.physical_leds_per_meter) }),
    pcbWidthMm: Number(row.pcb_width_mm),
    ...(optionalNumber(row.pcb_thickness_mm) === undefined ? {} : { pcbThicknessMm: optionalNumber(row.pcb_thickness_mm) }),
    ...(optionalNumber(row.led_package_size_mm) === undefined ? {} : { ledPackageSizeMm: optionalNumber(row.led_package_size_mm) }),
    ...(optionalNumber(row.rated_power_w_per_meter) === undefined ? {} : { ratedPowerWPerMeter: optionalNumber(row.rated_power_w_per_meter) }),
    ...(optionalNumber(row.minimum_bend_radius_mm) === undefined ? {} : { minimumBendRadiusMm: optionalNumber(row.minimum_bend_radius_mm) }),
    ...(row.backup_data_line ? { backupDataLine: true } : {}),
    ...(row.source_url ? { sourceUrl: row.source_url } : {})
  };
}

export async function listLedStripProfiles(trustedClientId: string) {
  const result = await getPool().query<LedStripProfileRow>(
    `select profile.*
       from iluminate.led_strip_profiles profile
       left join public.auth_clients client on client.id = profile.client_id
      where profile.active = true
        and (profile.client_id is null or client.id::text = $1 or client.client_key = $1)
      order by profile.client_id nulls first, profile.name, profile.revision desc`,
    [trustedClientId]
  );
  return result.rows.map(mapLedStripProfile);
}
