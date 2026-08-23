export const moduleEndpointByPath: Record<string, string> = {
  "/console/overview": "/console/overview",
  "/console/activity": "/console/activity",
  "/workspaces/hub": "/workspaces/hub",
  "/workspaces/projects": "/workspaces/projects",
  "/workspaces/tasks": "/workspaces/tasks",
  "/knowledge/documents": "/knowledge/documents",
  "/knowledge/collections": "/knowledge/collections",
  "/automation/flows": "/automation/flows",
  "/automation/agents": "/automation/agents",
  "/channels/inboxes": "/channels/inboxes",
  "/channels/integrations": "/channels/integrations",
  "/insights/reports": "/insights/reports",
  "/insights/quality": "/insights/quality",
  "/settings/clients": "/settings/clients",
  "/settings/workspaces": "/settings/workspaces",
  "/settings/users": "/settings/users",
  "/settings/roles": "/settings/roles",
  "/settings/audit": "/settings/audit"
};

export const roleOptions = [
  { id: "system-admin", label: "System admin" },
  { id: "system-user", label: "System user" },
  { id: "client-admin", label: "Client admin" },
  { id: "client-viewer", label: "Client viewer" }
] as const;
