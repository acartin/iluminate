import type { LedStripCatalogProfile } from "@/lib/lighting/partitura-model";
import { getPool } from "@/lib/server/postgres";
import { randomUUID } from "node:crypto";

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

export type LedStripProfileInput = Omit<LedStripCatalogProfile, "id" | "revision" | "clientId" | "sourceProfileId" | "sourceProfileRevision"> & {
  profileKey: string;
};

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

const ledStripProfileSelect = `select id, client_id, profile_key, revision, name,
  construction, native_control_protocol, color_model, voltage_v, cut_mode,
  cut_segment_length_mm, addressable_pixels_per_cut_segment,
  physical_leds_per_cut_segment, physical_leds_per_addressable_pixel,
  addressable_pixels_per_meter, physical_leds_per_meter, pcb_width_mm,
  pcb_thickness_mm, led_package_size_mm, rated_power_w_per_meter,
  minimum_bend_radius_mm, backup_data_line, source_url
from iluminate.led_strip_profiles`;

function nullablePositive(value: number | undefined) {
  return value === undefined ? null : value;
}

function profileValues(input: LedStripProfileInput) {
  return [
    input.profileKey,
    input.name,
    input.construction,
    input.nativeControlProtocol,
    input.colorModel,
    input.voltageV,
    input.construction === "continuous" ? input.cutMode : "marked_segments",
    input.cutSegmentLengthMm ?? 1,
    input.addressablePixelsPerCutSegment,
    nullablePositive(input.physicalLedsPerCutSegment),
    nullablePositive(input.physicalLedsPerAddressablePixel),
    input.addressablePixelsPerMeter,
    nullablePositive(input.physicalLedsPerMeter),
    input.pcbWidthMm,
    nullablePositive(input.pcbThicknessMm),
    nullablePositive(input.ledPackageSizeMm),
    nullablePositive(input.ratedPowerWPerMeter),
    nullablePositive(input.minimumBendRadiusMm),
    input.backupDataLine === true,
    input.sourceUrl?.trim() || null
  ];
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

export async function listGlobalLedStripProfiles() {
  const result = await getPool().query<LedStripProfileRow>(
    `${ledStripProfileSelect}
      where client_id is null and active = true
      order by name, revision desc`
  );
  return result.rows.map(mapLedStripProfile);
}

export async function createGlobalLedStripProfile(input: LedStripProfileInput) {
  const id = `global:${input.profileKey}:${randomUUID()}`;
  const values = profileValues(input);
  const result = await getPool().query<LedStripProfileRow>(
    `insert into iluminate.led_strip_profiles (
       id, client_id, profile_key, revision, name, construction,
       native_control_protocol, color_model, voltage_v, cut_mode,
       cut_segment_length_mm, addressable_pixels_per_cut_segment,
       physical_leds_per_cut_segment, physical_leds_per_addressable_pixel,
       addressable_pixels_per_meter, physical_leds_per_meter, pcb_width_mm,
       pcb_thickness_mm, led_package_size_mm, rated_power_w_per_meter,
       minimum_bend_radius_mm, backup_data_line, source_url
     ) values ($1, null, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     returning *`,
    [id, ...values]
  );
  return mapLedStripProfile(result.rows[0]);
}

export async function updateGlobalLedStripProfile(id: string, input: LedStripProfileInput) {
  const values = profileValues(input);
  const result = await getPool().query<LedStripProfileRow>(
    `update iluminate.led_strip_profiles
        set profile_key = $2,
            revision = revision + 1,
            name = $3,
            construction = $4,
            native_control_protocol = $5,
            color_model = $6,
            voltage_v = $7,
            cut_mode = $8,
            cut_segment_length_mm = $9,
            addressable_pixels_per_cut_segment = $10,
            physical_leds_per_cut_segment = $11,
            physical_leds_per_addressable_pixel = $12,
            addressable_pixels_per_meter = $13,
            physical_leds_per_meter = $14,
            pcb_width_mm = $15,
            pcb_thickness_mm = $16,
            led_package_size_mm = $17,
            rated_power_w_per_meter = $18,
            minimum_bend_radius_mm = $19,
            backup_data_line = $20,
            source_url = $21,
            updated_at = now()
      where id = $1 and client_id is null and active = true
      returning *`,
    [id, ...values]
  );
  return result.rows[0] ? mapLedStripProfile(result.rows[0]) : null;
}

export async function deleteGlobalLedStripProfile(id: string) {
  const result = await getPool().query(
    `delete from iluminate.led_strip_profiles
      where id = $1 and client_id is null`,
    [id]
  );
  return result.rowCount === 1;
}

export async function duplicateGlobalLedStripProfile(id: string) {
  const suffix = randomUUID().slice(0, 8);
  const result = await getPool().query<LedStripProfileRow>(
    `insert into iluminate.led_strip_profiles (
       id, client_id, profile_key, revision, name, construction,
       native_control_protocol, color_model, voltage_v, cut_mode,
       cut_segment_length_mm, addressable_pixels_per_cut_segment,
       physical_leds_per_cut_segment, physical_leds_per_addressable_pixel,
       addressable_pixels_per_meter, physical_leds_per_meter, pcb_width_mm,
       pcb_thickness_mm, led_package_size_mm, rated_power_w_per_meter,
       minimum_bend_radius_mm, backup_data_line, source_url
     )
     select 'global:' || profile_key || '-copy-' || $2,
            null,
            profile_key || '-copy-' || $2,
            1,
            name || ' copy',
            construction,
            native_control_protocol,
            color_model,
            voltage_v,
            cut_mode,
            cut_segment_length_mm,
            addressable_pixels_per_cut_segment,
            physical_leds_per_cut_segment,
            physical_leds_per_addressable_pixel,
            addressable_pixels_per_meter,
            physical_leds_per_meter,
            pcb_width_mm,
            pcb_thickness_mm,
            led_package_size_mm,
            rated_power_w_per_meter,
            minimum_bend_radius_mm,
            backup_data_line,
            source_url
       from iluminate.led_strip_profiles
      where id = $1 and client_id is null and active = true
      returning *`,
    [id, suffix]
  );
  return result.rows[0] ? mapLedStripProfile(result.rows[0]) : null;
}
