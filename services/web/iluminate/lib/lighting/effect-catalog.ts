export type EffectParameterValue = string | number | boolean | null | string[] | number[];

export type EffectParameterDefinition = {
  type: "color" | "number" | "boolean" | "string" | "integer" | "percent" | "select";
  required?: boolean;
  default?: EffectParameterValue;
  min?: number;
  max?: number;
  unit?: string;
  label?: string;
  options?: Array<{ value: string; label: string }>;
};

export type EffectDefinition = {
  id: string;
  label: string;
  description: string;
  family?: "linear" | "spatial" | "utility";
  parameters: Record<string, EffectParameterDefinition>;
};
