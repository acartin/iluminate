import { profilePath, type ThreeDModelDocument } from "@/lib/three-d-modeler/contracts";

export function ProfileThumbnail({ document }: { document: ThreeDModelDocument }) {
  const nodes = document.profile.contours.flatMap((contour) => contour.nodes.flatMap((node) => [
    node,
    ...(node.handleIn ? [{ xMm: node.xMm + node.handleIn.xMm, yMm: node.yMm + node.handleIn.yMm }] : []),
    ...(node.handleOut ? [{ xMm: node.xMm + node.handleOut.xMm, yMm: node.yMm + node.handleOut.yMm }] : [])
  ]));
  const minX = nodes.length ? Math.min(...nodes.map((node) => node.xMm)) : -1;
  const maxX = nodes.length ? Math.max(...nodes.map((node) => node.xMm)) : 1;
  const minY = nodes.length ? Math.min(...nodes.map((node) => -node.yMm)) : -1;
  const maxY = nodes.length ? Math.max(...nodes.map((node) => -node.yMm)) : 1;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const padding = Math.max(width, height) * .18;
  return <svg className="h-full w-full" viewBox={`${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Profile geometry preview">
    <path d={document.profile.contours.map(profilePath).join(" ")} fill="color-mix(in srgb, var(--primary) 22%, transparent)" fillRule="evenodd" stroke="var(--primary)" strokeWidth={Math.max(width, height) / 90} vectorEffect="non-scaling-stroke" />
  </svg>;
}
