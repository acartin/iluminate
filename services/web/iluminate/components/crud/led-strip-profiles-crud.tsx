"use client";

import { Badge } from "@/components/ui/badge";
import { ModulePayload } from "@/lib/types";
import { CrudResourcePage } from "./crud-resource-page";
import { CrudChoice, CrudField, CrudResourceConfig } from "./types";

type LedStripProfileRecord = Record<string, unknown> & {
  id: string;
  profileKey: string;
  revision: number;
  name: string;
  construction: "discrete" | "continuous";
  nativeControlProtocol: string;
  colorModel: "rgb" | "rgbw";
  voltageV: number;
  cutMode: "marked_segments" | "free_cut";
  addressablePixelsPerMeter: number;
  physicalLedsPerMeter?: number;
  ratedPowerWPerMeter?: number;
};

const constructionOptions: CrudChoice[] = [
  { value: "discrete", label: "Discrete" },
  { value: "continuous", label: "Continuous / COB" }
];

const colorModelOptions: CrudChoice[] = [
  { value: "rgb", label: "RGB" },
  { value: "rgbw", label: "RGBW" }
];

const cutModeOptions: CrudChoice[] = [
  { value: "marked_segments", label: "Marked segments" },
  { value: "free_cut", label: "Free cut" }
];

const booleanOptions: CrudChoice[] = [
  { value: "false", label: "No" },
  { value: "true", label: "Yes" }
];

const profileFields: CrudField[] = [
  { label: "Profile key", name: "profileKey", helperText: "Stable lowercase catalog key." },
  { label: "Name", name: "name" },
  { label: "Construction", name: "construction", control: "select", defaultValue: "discrete", options: constructionOptions },
  { label: "Native protocol", name: "nativeControlProtocol", defaultValue: "ws281x" },
  { label: "Color model", name: "colorModel", control: "select", defaultValue: "rgb", options: colorModelOptions },
  { label: "Voltage", name: "voltageV", type: "number", defaultValue: "5" },
  { label: "Cut mode", name: "cutMode", control: "select", defaultValue: "marked_segments", options: cutModeOptions },
  { label: "Cut segment (mm)", name: "cutSegmentLengthMm", type: "number", required: false },
  { label: "Pixels / cut", name: "addressablePixelsPerCutSegment", type: "number", defaultValue: "1" },
  { label: "LEDs / cut", name: "physicalLedsPerCutSegment", type: "number", required: false },
  { label: "LEDs / pixel", name: "physicalLedsPerAddressablePixel", type: "number", required: false },
  { label: "Pixels / m", name: "addressablePixelsPerMeter", type: "number", defaultValue: "60" },
  { label: "LEDs / m", name: "physicalLedsPerMeter", type: "number", required: false },
  { label: "PCB width (mm)", name: "pcbWidthMm", type: "number", defaultValue: "10" },
  { label: "PCB thickness (mm)", name: "pcbThicknessMm", type: "number", required: false },
  { label: "LED package (mm)", name: "ledPackageSizeMm", type: "number", required: false },
  { label: "Rated power (W/m)", name: "ratedPowerWPerMeter", type: "number", required: false },
  { label: "Minimum bend radius (mm)", name: "minimumBendRadiusMm", type: "number", required: false },
  { label: "Backup data line", name: "backupDataLine", control: "select", defaultValue: "false", options: booleanOptions },
  { label: "Source URL", name: "sourceUrl", required: false }
];

const ledStripProfilesCrudConfig: CrudResourceConfig<LedStripProfileRecord> = {
  id: "settings.led-strips",
  title: "LED strip profiles",
  eyebrow: "LED strip profile",
  description: "Global strip specifications available as project snapshots in Designer Setup.",
  createLabel: "Create profile",
  createAction: "/api/settings/led-strips",
  rowActionBasePath: "/api/settings/led-strips",
  identityField: "id",
  titleField: "name",
  searchPlaceholder: "Search name, key, protocol or voltage",
  emptyTitle: "No LED strip profiles match the current filters",
  emptyDescription: "Create a profile to make it available in Designer Setup.",
  allowedActions: ["view", "duplicate", "edit", "delete"],
  filters: [
    { key: "construction", label: "Construction", allLabel: "All constructions", options: constructionOptions },
    { key: "colorModel", label: "Color model", allLabel: "All color models", options: colorModelOptions }
  ],
  columns: [
    {
      id: "name",
      header: "Profile",
      searchValue: (record) => `${record.name} ${record.profileKey} ${record.nativeControlProtocol} ${record.voltageV}`,
      cell: (record) => (
        <div className="min-w-64">
          <div className="font-medium text-foreground">{record.name}</div>
          <div className="text-meta text-muted-foreground">{record.profileKey} · revision {record.revision}</div>
        </div>
      )
    },
    {
      id: "construction",
      header: "Construction",
      cell: (record) => <Badge>{record.construction === "continuous" ? "Continuous" : "Discrete"}</Badge>
    },
    { id: "colorModel", header: "Color" },
    { id: "voltageV", header: "Voltage", cell: (record) => `${record.voltageV} V` },
    { id: "addressablePixelsPerMeter", header: "Pixels/m" },
    { id: "physicalLedsPerMeter", header: "LEDs/m", cell: (record) => record.physicalLedsPerMeter ?? "—" },
    { id: "ratedPowerWPerMeter", header: "Power", cell: (record) => record.ratedPowerWPerMeter ? `${record.ratedPowerWPerMeter} W/m` : "—" }
  ],
  createFields: profileFields,
  editFields: [
    { label: "Profile ID", name: "id", editable: false },
    { label: "Revision", name: "revision", editable: false },
    ...profileFields
  ]
};

export function LedStripProfilesCrud({ payload }: { payload: ModulePayload }) {
  return <CrudResourcePage config={ledStripProfilesCrudConfig} records={payload.records as LedStripProfileRecord[]} />;
}
