"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, ExternalLink, LoaderCircle, Share2, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { WebViewerSurface } from "@/components/lighting/viewer/web-viewer-surface";

type SharePolicy = "private" | "review" | "unlisted" | "public";

type ScenePublication = {
  shareId: string;
  slug: string;
  policy: SharePolicy;
  status: "pending" | "rendering" | "ready" | "failed" | "cancelled";
  errorSummary: string | null;
  shareUrl: string | null;
  revoked: boolean;
};

const policyOptions: Array<{ value: SharePolicy; label: string; description: string }> = [
  { value: "private", label: "Private render", description: "Render and bundle remain private without an external link." },
  { value: "review", label: "Client review", description: "Revocable, non-indexed link backed by short-lived private media URLs." },
  { value: "unlisted", label: "Unlisted", description: "Stable possession link that remains outside search and the public catalog." },
  { value: "public", label: "Public", description: "Public distribution through the CDN; explicit rights confirmation is required." }
];

export function OwnerWebViewer({
  partituraId,
  title,
  manifestUrl,
  bundleError,
  canManageShares
}: {
  partituraId: string;
  title: string;
  manifestUrl: string | null;
  bundleError: string | null;
  canManageShares: boolean;
}) {
  const [policy, setPolicy] = useState<SharePolicy>("review");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publication, setPublication] = useState<ScenePublication | null>(null);

  useEffect(() => {
    if (!publication || !["pending", "rendering"].includes(publication.status)) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/lighting/scene-shares/${encodeURIComponent(publication.shareId)}`, { cache: "no-store" })
        .then(async (response) => {
          const payload = await response.json() as { publication?: ScenePublication; message?: string };
          if (!response.ok || !payload.publication) throw new Error(payload.message ?? "Unable to refresh share status.");
          setPublication(payload.publication);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Unable to refresh share status."));
    }, 2500);
    return () => window.clearInterval(timer);
  }, [publication]);

  async function createShare() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/lighting/partituras/${encodeURIComponent(partituraId)}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privacy: policy,
          profile: policy === "review" ? "review-720p30" : "social-1080p30",
          rightsConfirmed: policy === "public" && rightsConfirmed
        })
      });
      const payload = await response.json() as { publication?: ScenePublication; message?: string };
      if (!response.ok || !payload.publication) throw new Error(payload.message ?? "Unable to create the share.");
      setPublication(payload.publication);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create the share.");
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeShare() {
    if (!publication) return;
    setError(null);
    const response = await fetch(`/api/lighting/scene-shares/${encodeURIComponent(publication.shareId)}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { message?: string };
      setError(payload.message ?? "Unable to revoke the link.");
      return;
    }
    setPublication((current) => current ? { ...current, revoked: true, shareUrl: null } : current);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button asChild variant="outline"><Link href={`/partituras/designer/${encodeURIComponent(partituraId)}`}><ArrowLeft className="h-4 w-4" /> Back to Animate</Link></Button>
          <div className="min-w-0">
            <p className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">Web Viewer</p>
            <h1 className="truncate text-page-title font-semibold text-foreground">{title}</h1>
          </div>
        </div>
        <span className="rounded-full border border-border-2 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">Owner preview</span>
      </header>

      {manifestUrl ? <WebViewerSurface manifestUrl={manifestUrl} title={title} /> : (
        <Alert variant="warning" title="Viewer is not ready">{bundleError ?? "Compile and generate this partitura before opening the Viewer."}</Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-card-title font-semibold">Share this scene</h2>
              <p className="mt-1 text-body-sm text-muted-foreground">Create controlled links from the same immutable bundle shown above.</p>
            </div>
            <Share2 className="h-5 w-5 text-muted-foreground" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManageShares ? <Alert variant="warning" title="Read-only access">Your role can preview this Viewer but cannot create or revoke shares.</Alert> : null}
          {error ? <Alert variant="error" title="Share action failed">{error}</Alert> : null}

          {publication ? (
            <div className="space-y-4">
              <Alert
                variant={publication.revoked ? "warning" : publication.status === "ready" ? "success" : publication.status === "failed" ? "error" : "info"}
                title={publication.revoked ? "Link revoked" : publication.status === "ready" ? "Share ready" : publication.status === "failed" ? "Render failed" : "Render queued"}
              >
                {publication.revoked
                  ? "New requests can no longer resolve this share."
                  : publication.status === "ready"
                    ? "The render and share are ready to open."
                    : publication.status === "failed"
                      ? publication.errorSummary ?? "The renderer exhausted its retries."
                      : "The render worker is preparing the poster and video."}
              </Alert>

              {publication.shareUrl && !publication.revoked ? (
                <div className="rounded-md border border-border-2 bg-surface-2 p-4">
                  <div className="text-meta font-semibold uppercase tracking-wide text-muted-foreground">Share link</div>
                  <div className="mt-2 break-all font-mono text-body-sm">{publication.shareUrl}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void navigator.clipboard.writeText(new URL(publication.shareUrl!, window.location.origin).toString())}><Copy className="h-4 w-4" /> Copy link</Button>
                    <Button asChild><a href={publication.shareUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open</a></Button>
                  </div>
                </div>
              ) : publication.policy === "private" && !publication.revoked ? (
                <p className="text-body-sm text-muted-foreground">Private renders intentionally do not create an external URL.</p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => { setPublication(null); setError(null); }}>Create another</Button>
                {!publication.revoked && canManageShares ? <Button variant="destructive" onClick={() => void revokeShare()}><Trash2 className="h-4 w-4" /> Revoke link</Button> : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <fieldset className="grid gap-3 md:grid-cols-2">
                <legend className="sr-only">Share policy</legend>
                {policyOptions.map((option) => (
                  <label key={option.value} className={`flex cursor-pointer gap-3 rounded-md border p-4 ${policy === option.value ? "border-blue-500 bg-blue-500/10" : "border-border-2 bg-card"}`}>
                    <input
                      type="radio"
                      name="viewer-share-policy"
                      value={option.value}
                      checked={policy === option.value}
                      disabled={!canManageShares}
                      onChange={() => { setPolicy(option.value); setRightsConfirmed(false); }}
                      className="mt-1 h-4 w-4 accent-blue-600"
                    />
                    <span><span className="block font-medium">{option.label}</span><span className="mt-1 block text-body-sm text-muted-foreground">{option.description}</span></span>
                  </label>
                ))}
              </fieldset>

              {policy === "public" ? (
                <label className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-body-sm">
                  <input type="checkbox" checked={rightsConfirmed} disabled={!canManageShares} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-blue-600" />
                  <span>I confirm that I have permission to distribute this design, brand, video and selected attribution publicly.</span>
                </label>
              ) : null}

              <div className="flex justify-end">
                <Button disabled={!manifestUrl || !canManageShares || submitting || policy === "public" && !rightsConfirmed} onClick={() => void createShare()}>
                  {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
                  {submitting ? "Preparing…" : "Generate and render"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
