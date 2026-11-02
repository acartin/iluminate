"use client";

import * as React from "react";
import { Check, ChevronDown, Copy, Facebook, Linkedin, Mail, MessageCircle, Share2, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ViewerShareMenu({ title }: { title: string }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [shareUrl, setShareUrl] = React.useState("");
  const [nativeShare, setNativeShare] = React.useState(false);

  React.useEffect(() => {
    setShareUrl(window.location.href);
    setNativeShare(typeof navigator.share === "function");
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const closeOnPointer = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnPointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnPointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const input = document.createElement("textarea");
      input.value = shareUrl;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function shareNative() {
    if (!navigator.share) return;
    try {
      await navigator.share({ title, text: `View ${title} on Iluminate`, url: shareUrl });
      setOpen(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
    }
  }

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);
  const message = encodeURIComponent(`${title} — ${shareUrl}`);

  return <div ref={hostRef} className="relative">
    <Button className="max-lg:!h-10" variant="outline" density="compact" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      <Share2 className="h-4 w-4" /> Share <ChevronDown className="h-3.5 w-3.5" />
    </Button>
    {open ? <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-sm text-slate-100 shadow-2xl">
      {nativeShare ? <button type="button" role="menuitem" className={itemClass} onClick={() => void shareNative()}><Share2 className="h-4 w-4" /> Share from device</button> : null}
      <button type="button" role="menuitem" className={itemClass} onClick={() => void copyLink()}>{copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}{copied ? "Link copied" : "Copy link"}</button>
      <div className="my-1 border-t border-slate-700" />
      <ShareLink icon={<Mail className="h-4 w-4" />} label="Email" href={`mailto:?subject=${encodedTitle}&body=${message}`} />
      <ShareLink icon={<MessageCircle className="h-4 w-4" />} label="WhatsApp" href={`https://wa.me/?text=${message}`} />
      <ShareLink icon={<Facebook className="h-4 w-4" />} label="Facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`} />
      <ShareLink icon={<Twitter className="h-4 w-4" />} label="X" href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encodedUrl}`} />
      <ShareLink icon={<Linkedin className="h-4 w-4" />} label="LinkedIn" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`} />
    </div> : null}
  </div>;
}

function ShareLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return <a role="menuitem" className={itemClass} href={href} target={href.startsWith("mailto:") ? undefined : "_blank"} rel="noreferrer" onClick={() => undefined}>{icon}{label}</a>;
}

const itemClass = "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-slate-200 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
