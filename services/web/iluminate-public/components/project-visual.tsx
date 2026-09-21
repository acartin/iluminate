import type { ProjectVisual as VisualType } from "@/content/site";

export function ProjectVisual({
  visual,
  colors,
  animated = true,
}: {
  visual: VisualType;
  colors: [string, string, string];
  animated?: boolean;
}) {
  return (
    <div
      className={`project-visual visual-${visual} ${animated ? "is-animated" : ""}`}
      style={
        {
          "--visual-a": colors[0],
          "--visual-b": colors[1],
          "--visual-c": colors[2],
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <div className="visual-ambient" />
      {visual === "signal" && (
        <div className="signal-word" aria-hidden="true">
          <i>S</i><i>I</i><i>G</i><i>N</i><i>A</i><i>L</i>
        </div>
      )}
      {visual === "orbit" && (
        <div className="orbit-system">
          <i /><i /><i /><b />
        </div>
      )}
      {visual === "ribbon" && (
        <div className="ribbon-system">
          <i /><i /><i />
        </div>
      )}
      {visual === "monolith" && (
        <div className="monolith-system">
          <i /><b /><span />
        </div>
      )}
      <span className="visual-floor" />
    </div>
  );
}
