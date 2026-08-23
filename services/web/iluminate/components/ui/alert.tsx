import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type AlertVariant = "info" | "success" | "warning" | "error";

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle
};

const styles = {
  info: "border-transparent bg-[var(--blue-bg)] text-[var(--blue-text)] [&_svg]:text-[var(--blue-text)]",
  success: "border-transparent bg-[var(--green-bg)] text-[var(--green-text)] [&_svg]:text-[var(--green-text)]",
  warning: "border-transparent bg-[var(--amber-bg)] text-[var(--amber-text)] [&_svg]:text-[var(--amber-text)]",
  error: "border-transparent bg-[var(--red-bg)] text-[var(--red-text)] [&_svg]:text-[var(--red-text)]"
};

export function Alert({
  variant = "info",
  title,
  children,
  className
}: {
  variant?: AlertVariant;
  title: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = icons[variant];

  return (
    <div className={cn("flex gap-3 rounded-md border px-5 py-4 text-body-sm shadow-[0_1px_2px_var(--shadow-color)]", styles[variant], className)}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        <div className="text-card-title font-semibold">{title}</div>
        {children ? <div className="mt-1 text-body-sm opacity-95">{children}</div> : null}
      </div>
    </div>
  );
}
