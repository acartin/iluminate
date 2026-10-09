import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight, FolderKanban, LogIn, PenTool, WandSparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { sessionCookieName } from "@/lib/api";
import { getStartTemplate } from "@/lib/start-intent";

function loginHref(next: string) {
  return `/login?next=${encodeURIComponent(next)}`;
}

export default async function StartPage({
  searchParams
}: {
  searchParams?: Promise<{ template?: string }>;
}) {
  const query = await searchParams;
  const template = getStartTemplate(query?.template);
  const startPath = template ? `/start?template=${encodeURIComponent(template.slug)}` : "/start";
  const projectPath = template ? `/projects?template=${encodeURIComponent(template.slug)}` : "/projects";
  const authenticated = Boolean((await cookies()).get(sessionCookieName)?.value);

  return (
    <main className="min-h-screen bg-background px-6 py-8 text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="flex min-h-14 items-center justify-between border-b">
          <div>
            <div className="text-lg font-medium">Iluminate</div>
            <div className="text-sm text-muted-foreground">Authoring tools entry point</div>
          </div>
          {!authenticated ? (
            <Button asChild>
              <Link href={loginHref(startPath)}><LogIn className="h-4 w-4" />Sign in</Link>
            </Button>
          ) : null}
        </header>

        <section className="py-10">
          <div className="max-w-3xl">
            <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Iluminate Tools</div>
            <h1 className="mt-3 text-3xl font-light">What do you want to build?</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              A project organizes the physical sign. Designer manages its geometry, wiring and partitura workflow.
            </p>
          </div>

          {template ? (
            <Card className="mt-6 border-primary">
              <CardHeader>
                <div className="flex items-center gap-2 font-medium"><WandSparkles className="h-4 w-4" />Selected template: {template.name}</div>
              </CardHeader>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-2xl text-sm text-muted-foreground">{template.description}</p>
                <Button asChild>
                  <Link href={authenticated ? projectPath : loginHref(startPath)}>Continue with this template<ArrowRight className="h-4 w-4" /></Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><div className="flex items-center gap-2 font-medium"><FolderKanban className="h-4 w-4" />Projects</div></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Create or open an installation and organize its assets, partituras and controllers.</p>
                <Button asChild variant="outline"><Link href={authenticated ? projectPath : loginHref(startPath)}>Open projects<ArrowRight className="h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><div className="flex items-center gap-2 font-medium"><PenTool className="h-4 w-4" />Designer</div></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Model the physical form, zones, LED routes and connections.</p>
                <Button asChild variant="outline"><Link href={authenticated ? "/partituras/designer" : loginHref("/partituras/designer")}>Open Designer<ArrowRight className="h-4 w-4" /></Link></Button>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
