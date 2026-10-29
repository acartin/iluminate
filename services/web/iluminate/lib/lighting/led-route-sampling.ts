import type { DesignerPoint, DesignerRouteForm } from "@/lib/lighting/partitura-model";

/** Materializes the physical LED packages shown by Designer along one string. */
export function sampleRouteLedDots(route: DesignerRouteForm, ledsPerMeter: number, addressablePixelsPerMeter: number) {
  const pitchCm = 100 / Math.max(1, ledsPerMeter);
  const addressablePitchCm = 100 / Math.max(1, addressablePixelsPerMeter);
  const dots: Array<DesignerPoint & { angle: number; addressableIndex: number }> = [];
  const segments = route.points.slice(1).map((end, index) => {
    const start = route.points[index];
    const lengthCm = Math.hypot(end.x - start.x, end.y - start.y);
    return {
      start,
      end,
      lengthCm,
      angle: lengthCm > 0.001 ? Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI : 0
    };
  }).filter((segment) => segment.lengthCm > 0.001);
  const totalLengthCm = segments.reduce((total, segment) => total + segment.lengthCm, 0);

  // A physical strip does not re-space LEDs at bends or solder points. Sample
  // one continuous center-to-center pitch across the entire polyline.
  for (let distanceCm = pitchCm / 2; distanceCm < totalLengthCm; distanceCm += pitchCm) {
    let remainingDistance = distanceCm;
    const segment = segments.find((entry) => {
      if (remainingDistance <= entry.lengthCm) return true;
      remainingDistance -= entry.lengthCm;
      return false;
    });
    if (!segment) continue;
    const ratio = remainingDistance / segment.lengthCm;
    dots.push({
      x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
      y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
      angle: segment.angle,
      addressableIndex: Math.floor(distanceCm / addressablePitchCm)
    });
  }
  return dots;
}
