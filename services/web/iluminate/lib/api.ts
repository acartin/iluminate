import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MenuItem, MenuPayload, MenuSection, ModulePayload, Role, WorkspacePayload } from "@/lib/types";

export const API_BASE_URL = process.env.ILUMINATE_API_BASE_URL ?? "";
export const placeholderAuthEnabled = process.env.ILUMINATE_PLACEHOLDER_AUTH !== "false" && !API_BASE_URL;
export const sessionCookieName = "iluminate_session";
export const placeholderRoleCookieName = "iluminate_placeholder_role";
export const defaultAuthenticatedPath = "/settings/clients";

export const roleLabels: Record<Role, string> = {
  "system-admin": "System admin",
  "system-user": "System user",
  "client-admin": "Client admin",
  "client-viewer": "Client viewer"
};

export const roleOrder: Role[] = ["system-admin", "system-user", "client-admin", "client-viewer"];

export const permissionsByRole: Record<Role, string[]> = {
  "system-admin": ["*"],
  "system-user": ["lighting:projects:read", "lighting:partituras:read", "device:controllers:read", "audit:events:read"],
  "client-admin": [
    "auth:users:manage",
    "lighting:projects:read",
    "lighting:projects:manage",
    "lighting:partituras:read",
    "lighting:partituras:manage",
    "lighting:deployments:manage",
    "device:controllers:read",
    "device:controllers:manage"
  ],
  "client-viewer": ["lighting:projects:read", "lighting:partituras:read", "device:controllers:read"]
};

export const menuCatalog: MenuSection[] = [
  {
    id: "partituras",
    label: "Lighting",
    items: [
      {
        id: "partitura-generator",
        label: "Partitura Generator",
        href: "/partituras/generator",
        description: "Internal generator and validation workbench for partitura.v1.",
        required_permission: "lighting:partituras:manage"
      },
      {
        id: "designer",
        label: "Designer",
        href: "/partituras/designer",
        description: "Full-screen visual composer for signs, zones and LED routing.",
        required_permission: "lighting:partituras:manage"
      }
    ]
  },
  {
    id: "settings",
    label: "Auth",
    items: [
      {
        id: "clients",
        label: "Clients",
        href: "/settings/clients",
        description: "Client records used as the tenant boundary for Iluminate.",
        required_permission: "auth:clients:manage"
      },
      {
        id: "users",
        label: "Users",
        href: "/settings/users",
        description: "User lifecycle and membership architecture reserved for backend auth.",
        required_permission: "auth:users:manage"
      },
      {
        id: "roles",
        label: "Roles",
        href: "/settings/roles",
        description: "Roles, grants and authorization policy placeholders.",
        required_permission: "auth:roles:manage"
      },
      {
        id: "audit",
        label: "Audit Log",
        href: "/settings/audit",
        description: "Auth and operational audit trail.",
        required_permission: "audit:events:read"
      }
    ]
  }
];

export function isRole(value: string): value is Role {
  return roleOrder.includes(value as Role);
}

export function canAccess(role: Role, item: MenuItem) {
  const permissions = permissionsByRole[role];
  return permissions.includes("*") || (item.required_permission ? permissions.includes(item.required_permission) : true);
}

export function menuForRole(role: Role): MenuSection[] {
  return menuCatalog
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => canAccess(role, item))
    }))
    .filter((section) => section.items.length > 0);
}

export function roleCanAccessPath(role: Role, path: string) {
  return menuForRole(role).some((section) => section.items.some((item) => item.href === path));
}

export function defaultPathForRole(role: Role) {
  return menuForRole(role)[0]?.items[0]?.href ?? defaultAuthenticatedPath;
}

const defaultPlaceholderRole: Role = "system-admin";

function placeholderMenuForRole(role: Role): MenuPayload {
  return {
    user: {
      id: "placeholder-user",
      email: "admin@iluminate.local",
      role,
      role_label: roleLabels[role]
    },
    tenant: {
      client_id: "iluminate",
      name: "Iluminate",
      mode: "placeholder"
    },
    auth: {
      provider: placeholderAuthEnabled ? "placeholder" : "iluminate-api",
      status: placeholderAuthEnabled ? "placeholder" : "active",
      can_simulate_roles: placeholderAuthEnabled,
      is_role_simulated: role !== defaultPlaceholderRole
    },
    sections: menuForRole(role)
  };
}

export const placeholderMenu: MenuPayload = placeholderMenuForRole(defaultPlaceholderRole);

async function authHeaders(): Promise<HeadersInit> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) redirect("/login");

  return {
    Authorization: `Bearer ${token}`
  };
}

async function getJson<T>(path: string): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error("ILUMINATE_API_BASE_URL is not configured");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: await authHeaders(),
    cache: "no-store"
  });

  if (response.status === 401) redirect("/login");
  if (response.status === 403) redirect(defaultAuthenticatedPath);

  if (!response.ok) {
    throw new Error(`Iluminate API error ${response.status} on ${path}`);
  }

  return response.json() as Promise<T>;
}

export async function getMenu(): Promise<MenuPayload> {
  if (placeholderAuthEnabled) {
    const cookieStore = await cookies();
    if (!cookieStore.get(sessionCookieName)?.value) redirect("/login");
    const requestedRole = cookieStore.get(placeholderRoleCookieName)?.value ?? defaultPlaceholderRole;
    const role = isRole(requestedRole) ? requestedRole : defaultPlaceholderRole;
    return placeholderMenuForRole(role);
  }

  return getJson<MenuPayload>("/menu");
}

export async function getModule(path: string): Promise<ModulePayload> {
  if (placeholderAuthEnabled) {
    const menu = await getMenu();
    const item = menu.sections.flatMap((section) => section.items).find((entry) => entry.href === path);
    const recordCountByPath: Record<string, number> = {
      "/console/overview": 4,
      "/workspaces/hub": 3,
      "/knowledge/documents": 5,
      "/automation/flows": 2,
      "/settings/clients": 1,
      "/settings/users": 1,
      "/settings/roles": 4
    };

    if (path === "/settings/clients") {
      return {
        module: {
          id: "settings.clients",
          title: "Clients",
          description: "Client records define the tenant boundary for projects, controllers and partituras.",
          status: "Placeholder"
        },
        context: {
          client_id: menu.tenant.client_id,
          role: menu.user.role
        },
        links: {},
        actions: [{ id: "create", label: "Create client", enabled: false }],
        records: [
          { id: "1", client_key: "iluminate", name: "Iluminate", market: "CR", mode: "internal", status: "active", users: 1 }
        ]
      };
    }

    if (path === "/settings/users") {
      return {
        module: {
          id: "settings.users",
          title: "Users",
          description: "Local auth users, roles and client assignment.",
          status: "Placeholder"
        },
        context: {
          client_id: menu.tenant.client_id,
          role: menu.user.role
        },
        links: {},
        actions: [{ id: "create", label: "Create user", enabled: false }],
        records: [
          {
            id: "1",
            username: "acartin",
            email: "acartin@iluminate.local",
            display_name: "acartin",
            status: "active",
            primary_role_id: "system-admin",
            default_client_id: "1",
            roles: "system-admin",
            clients: "Iluminate",
            client_options: [{ value: "1", label: "Iluminate" }]
          }
        ]
      };
    }

    if (path === "/settings/roles") {
      return {
        module: {
          id: "settings.roles",
          title: "Roles",
          description: "Base business roles and permissions copied from the auth contract.",
          status: "Placeholder"
        },
        context: {
          client_id: menu.tenant.client_id,
          role: menu.user.role
        },
        links: {},
        actions: [{ id: "create", label: "Create role", enabled: false }],
        records: [
          { id: "system-admin", label: "System admin", scope: "system", description: "Full platform administration.", users: 1, permissions: 11 },
          { id: "system-user", label: "System user", scope: "system", description: "Internal operation without security administration.", users: 0, permissions: 4 },
          { id: "client-admin", label: "Client admin", scope: "client", description: "Manages users and lighting operations inside a client.", users: 0, permissions: 8 },
          { id: "client-viewer", label: "Client viewer", scope: "client", description: "Reads projects, partituras and controllers.", users: 0, permissions: 3 }
        ]
      };
    }

    return {
      module: {
        id: path.replace(/^\//, "").replace(/\//g, "."),
        title: item?.label ?? "Placeholder",
        description: item?.description ?? "Placeholder screen ready for the Iluminate API contract.",
        status: "Placeholder"
      },
      context: {
        client_id: menu.tenant.client_id,
        role: menu.user.role
      },
      links: {},
      actions: [
        { id: "create", label: "Create", enabled: false },
        { id: "export", label: "Export", enabled: false }
      ],
      records: Array.from({ length: recordCountByPath[path] ?? 0 }, (_, index) => ({
        id: `${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}-${index + 1}`,
        name: `${item?.label ?? "Module"} placeholder ${index + 1}`,
        status: "Reserved",
        owner: "Iluminate"
      }))
    };
  }

  return getJson<ModulePayload>(path);
}

export async function getWorkspace(path: string): Promise<WorkspacePayload> {
  if (placeholderAuthEnabled) {
    const menu = await getMenu();
    const key = path.split("/").filter(Boolean).at(-2) ?? "workspace";

    return {
      workspace: {
        id: "placeholder-workspace",
        title: "Workspace Placeholder",
        status: "Placeholder"
      },
      subject: {
        id: key,
        key,
        title: "Iluminate Workspace",
        subtitle: "Reserved workspace architecture",
        status: "Placeholder",
        badges: ["Local", "No auth backend"]
      },
      context: {
        client_id: menu.tenant.client_id,
        role: menu.user.role
      },
      links: {},
      actions: [],
      summary: [
        { label: "Sections", value: 3, tone: "blue" },
        { label: "Records", value: 0, tone: "green" },
        { label: "Auth", value: "Reserved", tone: "amber" }
      ],
      sections: [
        {
          id: "overview",
          label: "Overview",
          description: "Workspace details will be connected once the Iluminate API is introduced.",
          status: "Placeholder",
          records: []
        },
        {
          id: "members",
          label: "Members",
          description: "Membership and authorization data model placeholder.",
          status: "Reserved",
          records: []
        },
        {
          id: "activity",
          label: "Activity",
          description: "Operational activity stream placeholder.",
          status: "Reserved",
          records: []
        }
      ]
    };
  }

  return getJson<WorkspacePayload>(path);
}
