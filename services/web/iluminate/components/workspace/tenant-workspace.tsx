"use client";

import { WorkspacePayload } from "@/lib/types";
import { Feedback } from "@/lib/feedback";
import { WorkspacePage } from "./workspace-page";

export function TenantWorkspace({
  payload,
  initialTab,
  contactFilter,
  feedback
}: {
  payload: WorkspacePayload;
  initialTab?: string;
  contactFilter?: string;
  feedback?: Feedback | null;
}) {
  return (
    <WorkspacePage
      payload={payload}
      backHref="/settings/tenants"
      backLabel="Tenants"
      initialTab={initialTab}
      contactFilter={contactFilter}
      feedback={feedback}
    />
  );
}
