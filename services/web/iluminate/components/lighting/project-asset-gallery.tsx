"use client";

import { Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { PersistedAsset } from "@/lib/server/projects";

function formatBytes(sizeBytes?: number) {
  if (!sizeBytes) return "-";
  return sizeBytes < 1024 * 1024 ? `${Math.ceil(sizeBytes / 1024)} KB` : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ProjectAssetGallery({ projectId, assets }: { projectId: string; assets: PersistedAsset[] }) {
  const [pendingDelete, setPendingDelete] = useState<PersistedAsset | null>(null);

  if (!assets.length) return <EmptyState title="No project assets" description="Upload artwork before using it in Designer." />;

  return <>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {assets.map((asset) => (
        <article key={asset.id} className="group overflow-hidden rounded-md border border-border-2 bg-card">
          <button type="button" className="block aspect-[4/3] w-full bg-surface-2" title={`Preview ${asset.fileName}`} onClick={() => window.open(`/api/lighting/projects/${projectId}/assets/${asset.id}`, "_blank", "noopener,noreferrer")}>
            <img src={`/api/lighting/projects/${projectId}/assets/${asset.id}`} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain" />
          </button>
          <div className="flex items-start justify-between gap-2 p-3">
            <div className="min-w-0"><div className="truncate text-body-sm font-medium" title={asset.fileName}>{asset.fileName}</div><div className="mt-1 text-meta text-muted-foreground">{asset.mimeType} · {formatBytes(asset.sizeBytes)}</div></div>
            <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" className="h-8 w-8 px-0" title="Preview" onClick={() => window.open(`/api/lighting/projects/${projectId}/assets/${asset.id}`, "_blank", "noopener,noreferrer")}><Eye className="h-4 w-4" /></Button><Button type="button" variant="ghost" className="h-8 w-8 px-0" title="Delete" onClick={() => setPendingDelete(asset)}><Trash2 className="h-4 w-4" /></Button></div>
          </div>
        </article>
      ))}
    </div>
    <Modal open={pendingDelete !== null} title="Confirm delete" description="The asset will be removed from R2 and this project." onClose={() => setPendingDelete(null)} className="max-w-lg">
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>{pendingDelete ? <form action={`/api/lighting/projects/${projectId}/assets/${pendingDelete.id}`} method="post"><input type="hidden" name="_method" value="delete" /><Button type="submit"><Trash2 className="h-4 w-4" />Delete</Button></form> : null}</div>
    </Modal>
  </>;
}
