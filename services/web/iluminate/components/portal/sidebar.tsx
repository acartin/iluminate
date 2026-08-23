import Link from "next/link";
import {
  Activity,
  BarChart3,
  BookOpenText,
  Bot,
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  ClipboardCheck,
  Cog,
  FileText,
  FolderKanban,
  Inbox,
  KeyRound,
  Link2,
  Shield,
  Sparkles,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MenuPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  overview: BarChart3,
  activity: Activity,
  "workspace-hub": Boxes,
  projects: FolderKanban,
  tasks: ClipboardCheck,
  documents: FileText,
  collections: BookOpenText,
  flows: Sparkles,
  agents: Bot,
  inboxes: Inbox,
  integrations: Link2,
  reports: BarChart3,
  quality: ClipboardCheck,
  workspaces: BriefcaseBusiness,
  clients: BriefcaseBusiness,
  users: Users,
  roles: Shield,
  "partitura-generator": Sparkles,
  audit: KeyRound,
  security: KeyRound
};

const bubbleClasses: Record<string, string> = {
  overview: "bg-[var(--blue-bg)] text-[var(--blue-text)]",
  activity: "bg-[var(--teal-bg)] text-[var(--teal-text)]",
  "workspace-hub": "bg-[var(--purple-bg)] text-[var(--purple-text)]",
  projects: "bg-[var(--green-bg)] text-[var(--green-text)]",
  tasks: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
  documents: "bg-[var(--blue-bg)] text-[var(--blue-text)]",
  collections: "bg-[var(--teal-bg)] text-[var(--teal-text)]",
  flows: "bg-[var(--purple-bg)] text-[var(--purple-text)]",
  agents: "bg-[var(--green-bg)] text-[var(--green-text)]",
  inboxes: "bg-[var(--teal-bg)] text-[var(--teal-text)]",
  integrations: "bg-[var(--purple-bg)] text-[var(--purple-text)]",
  reports: "bg-[var(--green-bg)] text-[var(--green-text)]",
  quality: "bg-[var(--amber-bg)] text-[var(--amber-text)]",
  workspaces: "bg-[var(--teal-bg)] text-[var(--teal-text)]",
  clients: "bg-[var(--green-bg)] text-[var(--green-text)]",
  users: "bg-[var(--blue-bg)] text-[var(--blue-text)]",
  roles: "bg-[var(--purple-bg)] text-[var(--purple-text)]",
  "partitura-generator": "bg-[var(--amber-bg)] text-[var(--amber-text)]",
  audit: "bg-[var(--coral-bg)] text-[var(--coral-text)]"
};

const collapsedSectionsKey = "iluminate-sidebar-collapsed-sections";

export function Sidebar({
  menu,
  currentPath,
  collapsed = false
}: {
  menu: MenuPayload;
  currentPath: string;
  collapsed?: boolean;
}) {
  const [collapsedSections, setCollapsedSections] = useState<string[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(collapsedSectionsKey);
      if (stored) {
        setCollapsedSections(JSON.parse(stored) as string[]);
      }
    } catch {
      setCollapsedSections([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(collapsedSectionsKey, JSON.stringify(collapsedSections));
  }, [collapsedSections]);

  const activeSectionId = useMemo(() => {
    return menu.sections.find((section) => section.items.some((item) => item.href === currentPath))?.id;
  }, [currentPath, menu.sections]);

  function toggleSection(sectionId: string) {
    setCollapsedSections((current) =>
      current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId]
    );
  }

  return (
    <aside className={cn("sticky top-0 flex h-screen shrink-0 flex-col border-r bg-surface shadow-[1px_0_0_var(--shadow-color)] transition-[width]", collapsed ? "w-16" : "w-72")}>
      <div className={cn("border-b py-4", collapsed ? "px-2 text-center" : "px-5")}>
        <div className={cn("font-semibold tracking-normal text-foreground", collapsed ? "text-body-sm" : "text-section-title")}>{collapsed ? "IL" : "Iluminate"}</div>
        {!collapsed ? <div className="mt-1 text-body-sm text-muted-foreground">Workspace Console</div> : null}
      </div>
      <nav className={cn("flex-1 overflow-y-auto py-4", collapsed ? "px-2" : "px-3")}>
        {menu.sections.map((section) => {
          const sectionHasActiveItem = activeSectionId === section.id;
          const sectionOpen = collapsed || !collapsedSections.includes(section.id);

          return (
            <div key={section.id} className="mb-3">
              <button
                type="button"
                aria-expanded={sectionOpen}
                title={sectionOpen ? `Collapse ${section.label}` : `Expand ${section.label}`}
                onClick={() => toggleSection(section.id)}
                className={cn(
                  "mb-1 flex w-full min-h-9 items-center justify-between rounded-md px-2 text-left text-meta font-medium uppercase text-ink-muted transition-colors hover:bg-surface-hover hover:text-foreground",
                  sectionHasActiveItem && "text-foreground",
                  collapsed && "sr-only"
                )}
              >
                <span className="truncate">{section.label}</span>
                <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface">
                  <ChevronDown className={cn("h-[18px] w-[18px] transition-transform", !sectionOpen && "-rotate-90")} />
                </span>
              </button>
              {sectionOpen ? (
                <div className="space-y-1">
                  {section.items.map((item) => {
                    const Icon = icons[item.id] ?? Cog;
                    const active = currentPath === item.href;
                    const bubbleClass = bubbleClasses[item.id] ?? "bg-[var(--surface-3)] text-[var(--ink-secondary)]";
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          "flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-body-sm transition-colors",
                          collapsed && "justify-center px-0",
                          active
                            ? "bg-[var(--nav-active)] text-[var(--nav-active-foreground)] shadow-[0_1px_2px_var(--shadow-color)]"
                            : "text-ink-secondary hover:bg-surface-hover hover:text-foreground"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] transition-colors",
                            active ? "bg-[var(--nav-active-icon-bg)] text-[var(--nav-active-foreground)]" : bubbleClass
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                        </span>
                        {!collapsed ? <span className="truncate">{item.label}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
