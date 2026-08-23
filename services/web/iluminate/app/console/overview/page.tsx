import { redirect } from "next/navigation";
import { defaultAuthenticatedPath } from "@/lib/api";

export default function LegacyOverviewPage() {
  redirect(defaultAuthenticatedPath);
}
