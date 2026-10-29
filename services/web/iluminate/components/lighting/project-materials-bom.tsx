import { FileDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { buildLedStringBom } from "@/lib/lighting/materials-bom";
import type { PersistedPartitura } from "@/lib/lighting/partitura-model";

function value(value: number | undefined, digits: number, suffix: string) {
  return value === undefined ? "Not set" : `${value.toFixed(digits)} ${suffix}`;
}

export function ProjectMaterialsBom({ projectId, activePartitura, usesOnlyPartitura = false }: { projectId: string; activePartitura?: PersistedPartitura; usesOnlyPartitura?: boolean }) {
  if (!activePartitura) {
    return <Card><CardContent className="py-12"><EmptyState title="No active partitura" description="Set an active partitura to calculate the LED string bill of materials." /></CardContent></Card>;
  }
  const bom = buildLedStringBom(activePartitura.document);
  if (!bom.rows.length) {
    return <Card><CardContent className="py-12"><EmptyState title="No LED strings" description="Draw LED strings in the active partitura to generate the bill of materials." /></CardContent></Card>;
  }
  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex flex-wrap gap-2"><Badge>{usesOnlyPartitura ? "Only project partitura" : "Active partitura"}</Badge><Badge>{bom.rows.length} strings</Badge></div>
        <h2 className="mt-2 text-card-title font-medium">LED string bill of materials</h2>
        <p className="mt-1 text-body-sm text-muted-foreground">Strings are listed once, in their electrical order under each controller output. Counts include the complete physical string. Data-cable routes are excluded.</p>
      </div>
      <Button asChild variant="outline"><a href={`/api/lighting/projects/${encodeURIComponent(projectId)}/bom.pdf`}><FileDown className="h-4 w-4" />Export PDF</a></Button>
    </div>
    <div className="rounded-md border border-border-2 bg-surface-2 px-3 py-2 text-body-sm">
      <span className="font-medium">{bom.stripName}</span>
      <span className="ml-2 text-muted-foreground">{value(bom.voltageV || undefined, 2, "V")} · {bom.ratedCurrentMaPerLed === undefined ? value(bom.ratedPowerWPerMeter, 2, "W/m") : value(bom.ratedCurrentMaPerLed, 2, "mA/LED")}</span>
    </div>
    {bom.ratedCurrentMaPerLed === undefined && bom.ratedPowerWPerMeter === undefined ? <div className="rounded-md border border-amber-300 bg-[var(--amber-bg)] px-3 py-2 text-body-sm text-[var(--amber-text)]">Set Current / LED in Designer Setup to calculate each output load.</div> : null}
    {bom.groups.map((group) => <Card key={group.output ?? "disconnected"}>
      <CardHeader><div className="flex flex-wrap items-baseline justify-between gap-2"><div><div className="text-card-title font-medium">{group.label}</div><div className="mt-1 text-body-sm text-muted-foreground">{group.rows.length} strings · {activePartitura.name}</div></div>{group.output ? <Badge>Output {group.output}</Badge> : <Badge>Review wiring</Badge>}</div></CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-body-sm">
          <thead><tr className="border-b border-border-2 text-left text-label text-muted-foreground"><th className="w-12 px-3 py-2">#</th><th className="px-3 py-2">String</th><th className="px-3 py-2">Zone / Channel</th><th className="px-3 py-2 text-right">Length</th><th className="px-3 py-2 text-right">LEDs</th><th className="px-3 py-2 text-right">Current</th></tr></thead>
          <tbody>{group.rows.length ? group.rows.map((row, index) => <tr key={row.id} className="border-b border-border"><td className="px-3 py-2 font-mono text-muted-foreground">{index + 1}</td><td className="px-3 py-2 font-medium">{row.name}</td><td className="px-3 py-2 text-muted-foreground">{row.assignment}</td><td className="px-3 py-2 text-right font-mono">{value(row.lengthM, 2, "m")}</td><td className="px-3 py-2 text-right font-mono">{row.ledCount ?? "N/A"}</td><td className="px-3 py-2 text-right font-mono">{value(row.currentA, 2, "A")}</td></tr>) : <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No strings connected to this output.</td></tr>}</tbody>
          <tfoot><tr className="bg-surface-2 font-medium"><td colSpan={3} className="px-3 py-3">Output summary</td><td className="px-3 py-3 text-right font-mono">{value(group.totalLengthM, 2, "m")}</td><td className="px-3 py-3 text-right font-mono">{group.totalLedCount ?? "N/A"}</td><td className="px-3 py-3 text-right font-mono"><div>{value(group.minimumCurrentA, 2, "A")}</div><div className="text-meta font-normal text-muted-foreground">{value(group.recommendedCurrentA, 2, "A")} recommended</div></td></tr></tfoot>
        </table>
      </CardContent>
    </Card>)}
  </div>;
}
