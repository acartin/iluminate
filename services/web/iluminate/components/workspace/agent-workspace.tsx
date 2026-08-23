"use client";

import { WorkspacePayload } from "@/lib/types";
import { Feedback } from "@/lib/feedback";
import { WorkspacePage } from "./workspace-page";

export function AgentWorkspace({
  payload,
  initialTab,
  feedback
}: {
  payload: WorkspacePayload;
  initialTab?: string;
  feedback?: Feedback | null;
}) {
  return (
    <WorkspacePage
      payload={payload}
      backHref="/settings/agents"
      backLabel="Agents"
      initialTab={initialTab}
      feedback={feedback}
    />
  );
}
