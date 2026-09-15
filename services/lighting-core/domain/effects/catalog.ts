import type { EffectDefinition, EffectId } from "../partituras/types.js";
import { auroraEffect } from "./aurora.js";
import { chaseEffect } from "./chase.js";
import { fadeEffect } from "./fade.js";
import { flameEffect } from "./flame.js";
import type { EffectModule, EffectRenderer } from "./module.js";
import { offEffect } from "./off.js";
import { pulseEffect } from "./pulse.js";
import { solidEffect } from "./solid.js";
import { spatialFillEffect } from "./spatial-fill.js";
import { spatialWaveEffect } from "./spatial-wave.js";
import { toggleEffect } from "./toggle.js";

/**
 * Canonical effect registry.
 *
 * Each effect is a self-contained module (definition + renderer). The
 * `Record<EffectId, EffectModule>` type is exhaustive: adding an id to
 * `EffectId` forces a module here, and every module id must be a valid
 * `EffectId`. To add an effect: create `domain/effects/<id>.ts`, register it
 * here, and add the id to `EffectId`.
 */
export const effectModules: Record<EffectId, EffectModule> = {
  off: offEffect,
  solid: solidEffect,
  fade: fadeEffect,
  pulse: pulseEffect,
  chase: chaseEffect,
  toggle: toggleEffect,
  flame: flameEffect,
  spatial_fill: spatialFillEffect,
  spatial_wave: spatialWaveEffect,
  aurora: auroraEffect
};

export const effectCatalog: Record<EffectId, EffectDefinition> = Object.fromEntries(
  (Object.keys(effectModules) as EffectId[]).map((id) => [id, effectModules[id].definition])
) as Record<EffectId, EffectDefinition>;

export const effectRenderers: Record<string, EffectRenderer> = Object.fromEntries(
  (Object.keys(effectModules) as EffectId[]).map((id) => [id, effectModules[id].render])
);

export function isSupportedEffect(effect: string): effect is EffectId {
  return Object.prototype.hasOwnProperty.call(effectModules, effect);
}
