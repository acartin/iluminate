import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { RenderHarness } from "@/components/lighting/player/render-harness";

export const dynamic = "force-dynamic";

export default async function InternalRenderPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const authorization = (await headers()).get("authorization");
  const expected = process.env.ILUMINATE_INTERNAL_TOKEN;
  if (!expected || authorization !== `Bearer ${expected}`) notFound();
  const query = await searchParams;
  const bundleUrl = single(query.bundle);
  const width = dimension(single(query.width), 1920);
  const height = dimension(single(query.height), 1080);
  if (!bundleUrl || !/^https?:\/\//.test(bundleUrl)) notFound();
  return <RenderHarness bundleUrl={bundleUrl} width={width} height={height} />;
}

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function dimension(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= 64 && parsed <= 4096 ? parsed : fallback;
}
