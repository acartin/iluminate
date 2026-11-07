"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function NewProfileButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, description }) });
      const payload = await response.json() as { profile?: { id: string }; error?: string };
      if (!response.ok || !payload.profile) throw new Error(payload.error ?? "The Profile could not be created.");
      router.push(`/profiles/${payload.profile.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Profile could not be created.");
    } finally { setBusy(false); }
  }

  return <><Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" />New Profile</Button><Modal open={open} title="New Profile" description="Create a global fabrication Profile, then define its cross-section in the Profile Editor." onClose={() => !busy && setOpen(false)} closeOnBackdrop className="max-w-lg"><div className="space-y-4"><label className="block text-body-sm">Name<input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-card px-3" placeholder="Example: 5 mm channel" /></label><label className="block text-body-sm">Description<textarea maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-20 w-full rounded-md border border-input bg-card px-3 py-2" placeholder="Where and how this profile is used" /></label>{error ? <div className="text-body-sm text-destructive">{error}</div> : null}<div className="flex justify-end gap-2 border-t pt-4"><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy || !name.trim()} onClick={create}>{busy ? "Creating…" : "Create and edit"}</Button></div></div></Modal></>;
}
