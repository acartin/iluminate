"use client";

import { CircleDot, CornerDownRight, Minus, Spline } from "lucide-react";
import type { ComponentType } from "react";

export type NodeTypePickerValue = "corner" | "straight" | "smooth" | "symmetric";

export function NodeTypePicker({ value = "smooth", onChange }: { value?: NodeTypePickerValue; onChange: (value: NodeTypePickerValue) => void }) {
  const options: Array<{ value: NodeTypePickerValue; label: string; icon: ComponentType<{ className?: string }> }> = [
    { value: "corner", label: "Corner node", icon: CornerDownRight },
    { value: "straight", label: "Straight node", icon: Minus },
    { value: "smooth", label: "Smooth node", icon: Spline },
    { value: "symmetric", label: "Symmetric node", icon: CircleDot }
  ];
  return (
    <div className="flex h-8 items-center rounded-md border border-input bg-card p-0.5">
      {options.map(({ value: optionValue, label, icon: Icon }) => (
        <button
          key={optionValue}
          type="button"
          title={label}
          aria-label={label}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
          className={`flex h-6 w-7 items-center justify-center rounded transition ${value === optionValue ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-surface-hover hover:text-foreground"}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}
