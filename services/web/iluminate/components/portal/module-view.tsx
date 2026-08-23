import { ArrowUpRight, Database, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FeedbackAlert } from "@/components/ui/feedback-alert";
import { ClientsCrud } from "@/components/crud/clients-crud";
import { RolesCrud } from "@/components/crud/roles-crud";
import { UsersCrud } from "@/components/crud/users-crud";
import { ModulePayload } from "@/lib/types";
import { Feedback } from "@/lib/feedback";

export function ModuleView({ payload, feedback }: { payload: ModulePayload; feedback?: Feedback | null }) {
  const usesCustomBody = ["settings.clients", "settings.users", "settings.roles"].includes(payload.module.id);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Badge>{payload.module.status}</Badge>
            <Badge>role: {payload.context.role}</Badge>
          </div>
          <h1 className="text-page-title font-light">{payload.module.title}</h1>
          <p className="mt-2 max-w-3xl text-page-subtitle text-muted-foreground">
            {payload.module.description}
          </p>
        </div>
        {!usesCustomBody ? (
          <div className="flex gap-2">
            {payload.actions.slice(0, 2).map((action) => (
              <Button key={String(action.id)} variant={action.enabled ? "default" : "outline"} disabled={!action.enabled}>
                {String(action.label)}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <FeedbackAlert feedback={feedback} />

      {payload.module.id === "settings.clients" ? (
        <ClientsCrud payload={payload} />
      ) : payload.module.id === "settings.users" ? (
        <UsersCrud payload={payload} />
      ) : payload.module.id === "settings.roles" ? (
        <RolesCrud payload={payload} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Database className="h-5 w-5 text-semantic-blue" />
                <div>
                  <div className="text-xl font-semibold">{payload.records.length}</div>
                  <div className="text-body-sm text-muted-foreground">Placeholder records</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Settings2 className="h-5 w-5 text-semantic-green" />
                <div>
                  <div className="text-xl font-semibold">{payload.actions.length}</div>
                  <div className="text-body-sm text-muted-foreground">Reserved actions</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <ArrowUpRight className="h-5 w-5 text-semantic-amber" />
                <div>
                  <div className="text-xl font-semibold">API</div>
                  <div className="text-body-sm text-muted-foreground">{payload.module.id}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <div>
                <div className="text-card-title font-medium">Workspace placeholder</div>
                <div className="mt-1 text-body-sm text-muted-foreground">
                  This screen is wired into the secured portal shell and ready for the Iluminate API payload.
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid min-h-56 place-items-center rounded-b-lg border-t bg-surface-2 text-center">
              <div className="max-w-md">
                <div className="text-card-title font-medium">No data model connected yet</div>
                <p className="mt-2 text-body-sm text-muted-foreground">
                  The next pass can connect these records to Iluminate service APIs without changing the shell contract.
                </p>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
