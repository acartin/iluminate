export type GeneratedPartituraTarget =
  | { type: "installation" }
  | { type: "group" | "zone"; id: string };

type CompiledTargetLayout = {
  zones: Array<{ id: string }>;
  groups: Array<{ id: string }>;
};

/**
 * Resolves an authored clip target against the compiled physical layout.
 * Global light-source groups are intentionally absent when they contain no
 * mapped pixels, so those clips must be omitted from the runtime rather than
 * converted into an invalid zone target.
 */
export function resolveGeneratedPartituraTarget(targetId: string, layout: CompiledTargetLayout): GeneratedPartituraTarget | null {
  if (targetId === "installation") return { type: "installation" };
  if (layout.groups.some((group) => group.id === targetId)) return { type: "group", id: targetId };
  if (layout.zones.some((zone) => zone.id === targetId)) return { type: "zone", id: targetId };
  return null;
}
