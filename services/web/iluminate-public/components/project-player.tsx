"use client";

import { useState } from "react";
import type { ProjectVisual as VisualType } from "@/content/site";
import { ProjectVisual } from "./project-visual";

const palettes = [
  { name: "Signal", colors: ["#ff3b30", "#ff9f0a", "#f4f1ea"] },
  { name: "Cobalto", colors: ["#2563eb", "#22d3ee", "#f4f1ea"] },
  { name: "Violeta", colors: ["#a855f7", "#ec4899", "#f4f1ea"] },
] as const;

export function ProjectPlayer({ visual }: { visual: VisualType }) {
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const palette = palettes[paletteIndex];

  return (
    <section className="project-player" aria-label="Vista interactiva del proyecto">
      <div className="player-stage" style={{ "--preview-speed": `${2.8 / speed}s` } as React.CSSProperties}>
        <ProjectVisual visual={visual} colors={[...palette.colors]} animated={playing} />
        {!playing && <span className="paused-label">Pausa</span>}
        <span className="concept-label">Vista conceptual · Preview web</span>
      </div>
      <div className="player-controls">
        <button className="round-control" type="button" onClick={() => setPlaying((value) => !value)}>
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
          <span className="sr-only">{playing ? "Pausar" : "Reproducir"}</span>
        </button>
        <div className="control-group">
          <span>Paleta</span>
          <div className="palette-list">
            {palettes.map((item, index) => (
              <button
                key={item.name}
                type="button"
                className={index === paletteIndex ? "is-active" : ""}
                onClick={() => setPaletteIndex(index)}
                aria-label={`Usar paleta ${item.name}`}
                title={item.name}
              >
                <i style={{ background: item.colors[0] }} />
                <i style={{ background: item.colors[1] }} />
              </button>
            ))}
          </div>
        </div>
        <label className="speed-control">
          <span>Velocidad</span>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.25"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          />
          <output>{speed.toFixed(2)}×</output>
        </label>
      </div>
    </section>
  );
}
