export type Role = "client-admin" | "client-viewer" | "system-admin" | "system-user";

export type MenuItem = {
  id: string;
  label: string;
  href: string;
  description: string;
  required_permission?: string;
};

export type MenuSection = {
  id: string;
  label: string;
  items: MenuItem[];
};

export type MenuPayload = {
  user: {
    id: string;
    email: string;
    role: Role;
    role_label: string;
  };
  tenant: {
    client_id: string;
    name: string;
    mode: string;
  };
  auth: {
    provider: string;
    status: string;
    can_simulate_roles?: boolean;
    is_role_simulated?: boolean;
  };
  sections: MenuSection[];
};

export type ModulePayload = {
  module: {
    id: string;
    title: string;
    description: string;
    status: string;
  };
  context: {
    client_id: string;
    role: Role;
  };
  links: Record<string, string>;
  actions: Array<Record<string, unknown>>;
  filters?: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
};

export type WorkspaceSummaryItem = {
  label: string;
  value: string | number;
  tone?: "blue" | "green" | "amber" | "red";
};

export type WorkspaceSection = {
  id: string;
  label: string;
  description: string;
  status?: string;
  component?: string;
  crud?: Record<string, unknown>;
  hiddenFromTabs?: boolean;
  parentSectionId?: string;
  records?: Array<Record<string, unknown>>;
};

export type WorkspacePayload = {
  workspace: {
    id: string;
    title: string;
    status: string;
  };
  subject: {
    id: string;
    key: string;
    title: string;
    subtitle?: string;
    status: string;
    badges: string[];
  };
  context: {
    client_id: string;
    role: Role;
  };
  links: Record<string, string>;
  actions: Array<Record<string, unknown>>;
  summary: WorkspaceSummaryItem[];
  sections: WorkspaceSection[];
};
