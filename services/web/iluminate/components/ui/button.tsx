import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-control items-center justify-center gap-2 rounded-md px-3 text-body-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      density: {
        default: null,
        compact: "!h-8"
      },
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_2px_var(--shadow-color)] hover:bg-[var(--primary-hover)]",
        outline: "border border-border-2 bg-card text-ink-secondary hover:border-border-strong hover:bg-surface-hover hover:text-foreground data-[active=true]:border-primary data-[active=true]:bg-surface-selected data-[active=true]:text-foreground",
        chip: "h-control-sm rounded-[6px] border border-border-2 bg-card px-3 text-label font-medium text-ink-secondary hover:border-border-strong hover:bg-surface-hover hover:text-foreground data-[active=true]:border-primary data-[active=true]:bg-surface-selected data-[active=true]:text-foreground",
        ghost: "border border-transparent bg-transparent px-2 text-ink-secondary hover:bg-surface-hover hover:text-foreground data-[active=true]:border-primary data-[active=true]:bg-surface-selected data-[active=true]:text-foreground"
      }
    },
    defaultVariants: {
      density: "default",
      variant: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, density, asChild = false, title, "aria-label": ariaLabel, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, density, className }))} ref={ref} title={title ?? (typeof ariaLabel === "string" ? ariaLabel : undefined)} aria-label={ariaLabel} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
