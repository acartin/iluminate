"use client";

import Link from "next/link";
import {
  ChangeEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  Circle,
  ClipboardPaste,
  Copy,
  FileUp,
  Grid3X3,
  Hand,
  LoaderCircle,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  PenLine,
  Redo2,
  RotateCw,
  Ruler,
  Save,
  Settings2,
  Spline,
  Square,
  Trash2,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { ThreeDLayersPanel } from "./three-d-layers-panel";
import {
  ThreeDWorkspaceViewport,
  type ThreeDViewportResult,
  type ThreeDViewportViewState,
} from "./three-d-workspace-viewport";
import { FeedbackAlert } from "@/components/ui/feedback-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { NodeTypePicker } from "@/components/ui/node-type-picker";
import type { Feedback } from "@/lib/feedback";
import {
  defaultThreeDModelDocument,
  modelPathData,
  type ModelPath,
  type PrinterUnit,
  ProfileContour,
  ProfileNode,
  type ProfileParameter,
  ProfileNodeType,
  profilePath,
  ThreeDModelDocument,
} from "@/lib/three-d-modeler/contracts";
import { importSvgModelPaths } from "@/lib/three-d-modeler/model-path-import";
import {
  analyzeFitClearance,
  type FitClearanceDirection,
} from "@/lib/three-d-modeler/fit-clearance";
import {
  assignObjectToLayer,
  folderForObject,
  nextLayerFolder,
  objectLayerState,
  removeObjectFromLayers,
  type ThreeDLayerTarget,
} from "@/lib/three-d-modeler/layers";
import {
  validateProfilesBeforeSave,
  type ProfileSaveValidation,
} from "@/lib/three-d-modeler/profile-save-validation";
import { diagnoseSweepRisk } from "@/lib/three-d-modeler/sweep-diagnostics";
import {
  defaultProfileParameterValues,
  normalizedProfileParameterValues,
  profileParameterBaseValue,
  resolveProfileParameters,
} from "@/lib/three-d-modeler/profile-parameters";
import {
  changeProfileNodeType,
  findNearestStraightSegment,
  findProfileAngularSnap,
  insertNodeOnNearestSegment,
  prepareClosedProfileNodes,
  profileSegmentSnapAngle,
  removeProfileNode,
  resizeStraightSegment,
  updateProfileNodeHandle,
} from "@/lib/three-d-modeler/vector-editing";
import { cn } from "@/lib/utils";

type StudioMode = "profile" | "path" | "preview";
type Tool =
  | "select"
  | "move"
  | "pan"
  | "measure"
  | "rectangle"
  | "ellipse"
  | "polygon"
  | "bezier"
  | "rotate-profile"
  | "move-printer-area";
type Job = {
  id: string;
  sweepId?: string;
  displayName?: string;
  status: string;
  sourceOriginMm?: { xMm: number; yMm: number; zMm: number };
  fitClearanceMm: number;
  fitClearanceDirection: "outward" | "inward";
  errorCode?: string;
  errorSummary?: string;
  createdAt: string;
};
type AssemblyDraft = {
  profileId: string;
  pathId: string;
  yawDeg: number;
  fitClearanceMm?: number;
  fitClearanceDirection?: FitClearanceDirection;
  profileParameterValues?: Record<string, number>;
};
type LayerSelection = { type: "profile" | "path" | "solid"; id: string };
type PendingProfileSave = {
  sourceDocument: ThreeDModelDocument;
  sweepId: string | null;
  validation: ProfileSaveValidation;
};
type Point = { xMm: number; yMm: number };
type AngularGuide = {
  anchor: Point;
  point: Point;
  angleDeg: number;
  snapped: boolean;
};
type GlobalProfile = {
  id: string;
  name: string;
  description: string;
  status: string;
  document: ThreeDModelDocument;
  revision: number;
};
const PROFILE_MAX_ZOOM = 32;
type DragState =
  | {
      type: "node";
      objectId: string;
      node: number;
      before: ThreeDModelDocument;
    }
  | {
      type: "handle";
      objectId: string;
      node: number;
      handle: "handleIn" | "handleOut";
      before: ThreeDModelDocument;
    }
  | {
      type: "object";
      objectId: string;
      start: Point;
      original: ProfileNode[];
      before: ThreeDModelDocument;
    };

const clone = <T,>(value: T): T => structuredClone(value);
const round = (value: number) => Math.round(value * 10) / 10;
const roundCoordinate = (value: number) => Math.round(value * 1000) / 1000;
const PRINTER_UNIT_MM: Record<PrinterUnit, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
};

function globalContourId(profileId: string, index: number) {
  return `global-profile-${profileId}-${index + 1}`;
}

function mergeGlobalProfiles(
  projectDocument: ThreeDModelDocument,
  profiles: GlobalProfile[],
) {
  const next = clone(projectDocument);
  const previous = new Map(
    next.profile.contours.map((contour) => [contour.id, contour]),
  );
  const legacyStarterIds = new Set(
    next.profile.contours
      .filter(
        (contour) =>
          !contour.source &&
          (contour.id === "outer" ||
            ["perfil 1", "profile 1"].includes(
              contour.name.trim().toLowerCase(),
            )),
      )
      .map((contour) => contour.id),
  );
  const localContours = next.profile.contours.filter(
    (contour) => !contour.source && !legacyStarterIds.has(contour.id),
  );
  const globalContours = profiles.flatMap((profile) =>
    profile.document.profile.contours.map((contour, index) => {
      const id = globalContourId(profile.id, index);
      const existing = previous.get(id);
      return {
        ...clone(contour),
        id,
        name:
          profile.document.profile.contours.length === 1
            ? profile.name
            : `${profile.name} · ${contour.name}`.slice(0, 80),
        visible: existing?.visible ?? contour.visible,
        locked: existing?.locked ?? contour.locked,
        source: {
          type: "global-profile" as const,
          profileId: profile.id,
          contourId: contour.id,
          revision: profile.revision,
        },
      };
    }),
  );
  next.profile.contours = [...localContours, ...globalContours];
  const validIds = new Set(next.profile.contours.map((contour) => contour.id));
  next.layers.rootObjectIds = next.layers.rootObjectIds.filter((id) =>
    validIds.has(id),
  );
  next.layers.folders = next.layers.folders.map((folder) => ({
    ...folder,
    objectIds: folder.objectIds.filter((id) => validIds.has(id)),
  }));
  const assigned = new Set([
    ...next.layers.rootObjectIds,
    ...next.layers.folders.flatMap((folder) => folder.objectIds),
  ]);
  for (const contour of globalContours)
    if (!assigned.has(contour.id)) next.layers.rootObjectIds.push(contour.id);
  next.sweeps = next.sweeps.filter((sweep) => validIds.has(sweep.profileId));
  return next;
}

function rulerStep(rangeMm: number, unitMm: number) {
  const minimum = unitMm * 5;
  const desired = rangeMm / 10;
  if (desired <= minimum) return minimum;
  const magnitude = 10 ** Math.floor(Math.log10(desired / minimum));
  const normalized = desired / (minimum * magnitude);
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return minimum * magnitude * multiplier;
}

function marksBetween(min: number, max: number, step: number) {
  const first = Math.ceil(min / step) * step;
  return Array.from(
    { length: Math.max(0, Math.floor((max - first) / step) + 1) },
    (_, index) => roundCoordinate(first + index * step),
  );
}

function modelPathOrigin(path: ModelPath): [number, number, number] {
  const points = path.nodes.flatMap((node) => [
    { xMm: node.xMm, yMm: node.yMm },
    ...(node.handleIn
      ? [
          {
            xMm: node.xMm + node.handleIn.xMm,
            yMm: node.yMm + node.handleIn.yMm,
          },
        ]
      : []),
    ...(node.handleOut
      ? [
          {
            xMm: node.xMm + node.handleOut.xMm,
            yMm: node.yMm + node.handleOut.yMm,
          },
        ]
      : []),
  ]);
  return [
    Math.min(...points.map((point) => point.xMm)),
    Math.min(...points.map((point) => point.yMm)),
    0,
  ];
}

function ThreeDToolButton({
  active,
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-blue-500 bg-blue-600 text-white hover:bg-blue-600"
          : "border-transparent",
      )}
      onClick={onClick}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}

function SetupNumber({
  label,
  value,
  suffix,
  step = 0.1,
  onChange,
}: {
  label: string;
  value: number;
  suffix?: string;
  step?: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  function commitDraft() {
    const parsed = Number(draft.trim().replace(",", "."));
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    setDraft(String(parsed));
    onChange(parsed);
  }
  return (
    <label className="block text-body-sm">
      {label}
      <span className="mt-1 flex h-8 items-center rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(value));
              event.currentTarget.blur();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-2 outline-none"
        />
        {suffix ? (
          <span className="pr-2 text-muted-foreground">{suffix}</span>
        ) : null}
      </span>
    </label>
  );
}

function ConnectionAxes({
  node,
  plane,
  scale,
}: {
  node: ProfileNode;
  plane: "path" | "profile";
  scale: number;
}) {
  const x = node.xMm;
  const y = -node.yMm;
  const axis = 8 * scale;
  const diamond = (plane === "profile" ? 0.65 : 1.5) * scale;
  return (
    <g pointerEvents="none">
      <line
        x1={x - axis}
        y1={y}
        x2={x + axis}
        y2={y}
        stroke="var(--red-text)"
        strokeWidth={0.45 * scale}
      />
      <line
        x1={x}
        y1={y + axis}
        x2={x}
        y2={y - axis}
        stroke="var(--green-text)"
        strokeWidth={0.45 * scale}
      />
      <path
        d={`M ${x} ${y - diamond} L ${x + diamond} ${y} L ${x} ${y + diamond} L ${x - diamond} ${y} Z`}
        fill="var(--amber-text)"
        stroke="var(--surface)"
        strokeWidth={0.3 * scale}
      />
      <text
        x={x + axis + scale}
        y={y + scale}
        fill="var(--red-text)"
        fontSize={2.4 * scale}
      >
        +X
      </text>
      <text
        x={x - axis - scale}
        y={y + scale}
        fill="var(--red-text)"
        fontSize={2.4 * scale}
        textAnchor="end"
      >
        −X
      </text>
      <text
        x={x + scale}
        y={y - axis - scale}
        fill="var(--green-text)"
        fontSize={2.4 * scale}
      >
        +{plane === "profile" ? "Z" : "Y"}
      </text>
      <text
        x={x + scale}
        y={y + axis + 2.4 * scale}
        fill="var(--green-text)"
        fontSize={2.4 * scale}
      >
        −{plane === "profile" ? "Z" : "Y"}
      </text>
      {plane === "path" ? (
        <text
          x={x + 2.5 * scale}
          y={y - 2.5 * scale}
          fill="var(--blue-text)"
          fontSize={2.4 * scale}
        >
          ⊙Z
        </text>
      ) : null}
    </g>
  );
}

function nextContourId(document: ThreeDModelDocument) {
  const used = new Set(document.profile.contours.map((contour) => contour.id));
  let index = document.profile.contours.length + 1;
  while (used.has(`profile-${index}`)) index += 1;
  return `profile-${index}`;
}

function nextGlobalContourId(document: ThreeDModelDocument, profileId: string) {
  const used = new Set(
    document.profile.contours
      .filter((contour) => contour.source?.profileId === profileId)
      .map((contour) => contour.source!.contourId),
  );
  let index = used.size + 1;
  while (used.has(`profile-${index}`)) index += 1;
  return `profile-${index}`;
}

function rectangleNodes(start: Point, end: Point): ProfileNode[] {
  return [
    { xMm: start.xMm, yMm: start.yMm, nodeType: "corner" },
    { xMm: end.xMm, yMm: start.yMm, nodeType: "corner" },
    { xMm: end.xMm, yMm: end.yMm, nodeType: "corner" },
    { xMm: start.xMm, yMm: end.yMm, nodeType: "corner" },
  ];
}

function ellipseNodes(start: Point, end: Point): ProfileNode[] {
  const cx = (start.xMm + end.xMm) / 2;
  const cy = (start.yMm + end.yMm) / 2;
  const rx = Math.abs(end.xMm - start.xMm) / 2;
  const ry = Math.abs(end.yMm - start.yMm) / 2;
  const k = 0.5522847498;
  return [
    {
      xMm: cx + rx,
      yMm: cy,
      nodeType: "smooth",
      handleIn: { xMm: 0, yMm: -ry * k },
      handleOut: { xMm: 0, yMm: ry * k },
    },
    {
      xMm: cx,
      yMm: cy + ry,
      nodeType: "smooth",
      handleIn: { xMm: rx * k, yMm: 0 },
      handleOut: { xMm: -rx * k, yMm: 0 },
    },
    {
      xMm: cx - rx,
      yMm: cy,
      nodeType: "smooth",
      handleIn: { xMm: 0, yMm: ry * k },
      handleOut: { xMm: 0, yMm: -ry * k },
    },
    {
      xMm: cx,
      yMm: cy - ry,
      nodeType: "smooth",
      handleIn: { xMm: -rx * k, yMm: 0 },
      handleOut: { xMm: rx * k, yMm: 0 },
    },
  ];
}

export function ThreeDModelerStudio({
  project,
  catalogProfile,
}: {
  project: { id: string; name: string };
  catalogProfile?: { id: string; name: string };
}) {
  const [document, setDocument] = useState<ThreeDModelDocument>(
    clone(defaultThreeDModelDocument),
  );
  const [confirmed, setConfirmed] = useState("");
  const [revision, setRevision] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [selectedSolidObjectId, setSelectedSolidObjectId] = useState<
    string | null
  >(null);
  const [visibleSolidObjectIds, setVisibleSolidObjectIds] = useState<
    Set<string>
  >(() => new Set());
  const [riskFocus, setRiskFocus] = useState<{
    nodeIndex: number;
    requestId: number;
  } | null>(null);
  const [openSweepErrorsJobId, setOpenSweepErrorsJobId] = useState<
    string | null
  >(null);
  const [visibleRiskMarkersJobId, setVisibleRiskMarkersJobId] = useState<
    string | null
  >(null);
  const [threeDMeasureResetRequest, setThreeDMeasureResetRequest] = useState(0);
  const [assemblyDraft, setAssemblyDraft] = useState<AssemblyDraft | null>(
    null,
  );
  const [availablePlans, setAvailablePlans] = useState<ModelPath[]>([]);
  const [globalProfiles, setGlobalProfiles] = useState<GlobalProfile[]>([]);
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [layerSelection, setLayerSelection] = useState<LayerSelection>({
    type: "profile",
    id: "",
  });
  const [pendingLayerDelete, setPendingLayerDelete] =
    useState<LayerSelection | null>(null);
  const [pendingProfileSave, setPendingProfileSave] =
    useState<PendingProfileSave | null>(null);
  const [mode, setMode] = useState<StudioMode>("profile");
  const [tool, setTool] = useState<Tool>("select");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<{
    objectId: string;
    segmentIndex: number;
    fixedNodeIndex: number;
  } | null>(null);
  const [selectedParameterId, setSelectedParameterId] = useState<string | null>(
    null,
  );
  const [parameterGroupMode, setParameterGroupMode] = useState<
    "fixed" | "control" | "follower" | null
  >(null);
  const [parameterPreviewValues, setParameterPreviewValues] = useState<
    Record<string, number>
  >({});
  const [nodeCreationType, setNodeCreationType] =
    useState<ProfileNodeType>("corner");
  const [moveAxis, setMoveAxis] = useState<"x" | "y">("x");
  const [profileClipboard, setProfileClipboard] =
    useState<ProfileContour | null>(null);
  const [activeLayerTarget, setActiveLayerTarget] =
    useState<ThreeDLayerTarget | null>(null);
  const [draft, setDraft] = useState<ProfileNode[]>([]);
  const [primitive, setPrimitive] = useState<{
    type: "rectangle" | "ellipse";
    start: Point;
    current: Point;
  } | null>(null);
  const [measurement, setMeasurement] = useState<{
    start: Point;
    current: Point;
  } | null>(null);
  const [history, setHistory] = useState<ThreeDModelDocument[]>([]);
  const [future, setFuture] = useState<ThreeDModelDocument[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [profileViewport, setProfileViewport] = useState({
    width: 1000,
    height: 700,
  });
  const [snap, setSnap] = useState(true);
  const [angularSnap, setAngularSnap] = useState(true);
  const [angularGuide, setAngularGuide] = useState<AngularGuide | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [threeDGridVisible, setThreeDGridVisible] = useState(true);
  const [clearanceComparisonVisible, setClearanceComparisonVisible] =
    useState(true);
  const [panning, setPanning] = useState(false);
  const canvasRef = useRef<SVGSVGElement>(null);
  const profileViewportRef = useRef<HTMLDivElement>(null);
  const setupRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<{
    clientX: number;
    clientY: number;
    startX: number;
    startY: number;
    viewWidth: number;
    viewHeight: number;
  } | null>(null);
  const observedJobStatusesRef = useRef(new Map<string, string>());
  const solidVisibilityInitializedRef = useRef(false);
  const threeDViewStateRef = useRef<ThreeDViewportViewState | null>(null);
  const documentRef = useRef(document);
  const confirmedRef = useRef(confirmed);

  const reconcileJobs = useCallback((nextJobs: Job[]) => {
    let terminalFeedback: Feedback | null = null;
    const newlySucceeded: string[] = [];
    for (const job of nextJobs) {
      const previous = observedJobStatusesRef.current.get(job.id);
      observedJobStatusesRef.current.set(job.id, job.status);
      if (!previous || previous === job.status) continue;
      if (job.status === "succeeded") {
        newlySucceeded.push(job.id);
        terminalFeedback = {
          type: "success",
          message:
            "Sweep completed. The Solid Object is now available in Layers.",
        };
      } else if (["failed", "retryable_failure"].includes(job.status))
        terminalFeedback = {
          type: "error",
          message:
            job.errorSummary ??
            "The Sweep failed. Review the selections and retry.",
        };
    }
    setJobs(nextJobs);
    setVisibleSolidObjectIds((current) => {
      const valid = new Set(
        nextJobs
          .filter((job) => job.status === "succeeded")
          .map((job) => job.id),
      );
      const next = new Set(Array.from(current).filter((id) => valid.has(id)));
      if (!solidVisibilityInitializedRef.current) {
        const first = nextJobs.find((job) => job.status === "succeeded");
        if (first) next.add(first.id);
        solidVisibilityInitializedRef.current = true;
      }
      newlySucceeded.forEach((id) => next.add(id));
      return next;
    });
    setActiveJobId((current) => {
      const next =
        current && nextJobs.some((job) => job.id === current)
          ? current
          : (nextJobs.find((job) => job.status === "succeeded")?.id ?? null);
      return next;
    });
    if (terminalFeedback) setFeedback(terminalFeedback);
  }, []);

  const refreshJobs = useCallback(async () => {
    if (catalogProfile) return;
    const response = await fetch(
      `/api/3d-modeler/projects/${project.id}/jobs`,
      { cache: "no-store" },
    );
    const payload = (await response.json()) as { jobs?: Job[]; error?: string };
    if (!response.ok || !payload.jobs)
      throw new Error(payload.error ?? "Could not refresh Solid Objects.");
    reconcileJobs(payload.jobs);
  }, [catalogProfile, project.id, reconcileJobs]);

  const load = useCallback(
    async (preserveDirtyDocument = false) => {
      const [response, plansResponse, profilesResponse] = await Promise.all([
        fetch(
          catalogProfile
            ? `/api/profiles/${catalogProfile.id}`
            : `/api/3d-modeler/projects/${project.id}`,
          { cache: "no-store" },
        ),
        catalogProfile
          ? Promise.resolve(null)
          : fetch(`/api/3d-modeler/projects/${project.id}/fabrication-plans`, {
              cache: "no-store",
            }),
        catalogProfile
          ? Promise.resolve(null)
          : fetch("/api/profiles", { cache: "no-store" }),
      ]);
      if (
        !response.ok ||
        (plansResponse && !plansResponse.ok) ||
        (profilesResponse && !profilesResponse.ok)
      )
        throw new Error(
          catalogProfile
            ? "Could not load the Profile."
            : "Could not load the 3D workspace.",
        );
      const payload = (await response.json()) as {
        document: ThreeDModelDocument;
        revision: number;
        jobs: Job[];
      };
      const plansPayload = plansResponse
        ? ((await plansResponse.json()) as { plans: ModelPath[] })
        : { plans: [] };
      const profilesPayload = profilesResponse
        ? ((await profilesResponse.json()) as { profiles: GlobalProfile[] })
        : { profiles: [] };
      const loadedDocument = catalogProfile
        ? payload.document
        : mergeGlobalProfiles(payload.document, profilesPayload.profiles);
      const preserveLocalDocument =
        preserveDirtyDocument &&
        confirmedRef.current !== JSON.stringify(documentRef.current);
      if (!preserveLocalDocument) {
        setDocument(loadedDocument);
        setConfirmed(JSON.stringify(loadedDocument));
        setRevision(payload.revision);
        setSelectedObjectId((current) =>
          current &&
          loadedDocument.profile.contours.some(
            (contour) => contour.id === current,
          )
            ? current
            : (loadedDocument.profile.contours[0]?.id ?? null),
        );
        setSelectedPathId((current) =>
          current &&
          loadedDocument.modelPaths.some((path) => path.id === current)
            ? current
            : (loadedDocument.modelPaths[0]?.id ?? null),
        );
      }
      reconcileJobs(payload.jobs);
      setAvailablePlans(plansPayload.plans);
      setGlobalProfiles(profilesPayload.profiles);
    },
    [catalogProfile, project.id, reconcileJobs],
  );

  useEffect(() => {
    documentRef.current = document;
    confirmedRef.current = confirmed;
  }, [confirmed, document]);
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        load().catch((error) =>
          setFeedback({ type: "error", message: error.message }),
        ),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [load]);
  const hasPendingJobs = jobs.some((job) =>
    ["queued", "leased", "processing"].includes(job.status),
  );
  useEffect(() => {
    if (catalogProfile || mode !== "preview" || !hasPendingJobs) return;
    const refresh = () => refreshJobs().catch(() => undefined);
    const timer = window.setInterval(refresh, 4000);
    const onVisibility = () => {
      if (!window.document.hidden) refresh();
    };
    window.addEventListener("focus", refresh);
    window.document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [catalogProfile, hasPendingJobs, mode, refreshJobs]);
  useEffect(() => {
    const element = profileViewportRef.current;
    if (!element) return;
    const update = () =>
      setProfileViewport({
        width: Math.max(1, element.clientWidth),
        height: Math.max(1, element.clientHeight),
      });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [mode]);
  useEffect(() => {
    if (!setupOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!setupRef.current?.contains(event.target as Node))
        setSetupOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOutside);
    return () =>
      window.document.removeEventListener("pointerdown", closeOutside);
  }, [setupOpen]);

  const selectedObject =
    document.profile.contours.find(
      (contour) => contour.id === selectedObjectId,
    ) ?? null;
  const activeParameter =
    selectedObject?.parameters.find(
      (parameter) => parameter.id === selectedParameterId,
    ) ??
    selectedObject?.parameters[0] ??
    null;
  const profileEditorPreview =
    selectedObject && activeParameter
      ? resolveProfileParameters(selectedObject, {
          ...defaultProfileParameterValues(selectedObject),
          [activeParameter.id]:
            parameterPreviewValues[activeParameter.id] ??
            activeParameter.defaultMm,
        })
      : null;
  const visibleProfileContours = selectedObject?.source
    ? document.profile.contours.filter(
        (contour) =>
          contour.source?.profileId === selectedObject.source?.profileId,
      )
    : document.profile.contours;
  const selectedPath =
    document.modelPaths.find((path) => path.id === selectedPathId) ?? null;
  const assemblySweep =
    selectedObject && selectedPath
      ? (document.sweeps.find(
          (sweep) =>
            sweep.profileId === selectedObject.id &&
            sweep.pathId === selectedPath.id,
        ) ?? null)
      : null;
  const assemblyYawDeg =
    assemblyDraft?.profileId === selectedObjectId &&
    assemblyDraft.pathId === selectedPathId
      ? assemblyDraft.yawDeg
      : (assemblySweep?.profileConnection.yawDeg ?? 0);
  const assemblyFitClearanceMm =
    assemblyDraft?.profileId === selectedObjectId &&
    assemblyDraft.pathId === selectedPathId
      ? (assemblyDraft.fitClearanceMm ?? assemblySweep?.fitClearanceMm ?? 0)
      : (assemblySweep?.fitClearanceMm ?? 0);
  const assemblyFitClearanceDirection =
    assemblyDraft?.profileId === selectedObjectId &&
    assemblyDraft.pathId === selectedPathId
      ? (assemblyDraft.fitClearanceDirection ??
        assemblySweep?.fitClearanceDirection ??
        "outward")
      : (assemblySweep?.fitClearanceDirection ?? "outward");
  const assemblyProfileParameterValues = selectedObject
    ? normalizedProfileParameterValues(
        selectedObject,
        assemblyDraft?.profileId === selectedObjectId &&
          assemblyDraft.pathId === selectedPathId
          ? (assemblyDraft.profileParameterValues ??
              assemblySweep?.profileParameterValues)
          : assemblySweep?.profileParameterValues,
      )
    : {};
  const resolvedAssemblyProfile = selectedObject
    ? resolveProfileParameters(selectedObject, assemblyProfileParameterValues)
    : null;
  const assemblyDirty = Boolean(
    mode === "preview" &&
      selectedObject &&
      selectedPath &&
      (!assemblySweep ||
        assemblySweep.profileConnection.yawDeg !== assemblyYawDeg ||
        assemblySweep.fitClearanceMm !== assemblyFitClearanceMm ||
        assemblySweep.fitClearanceDirection !== assemblyFitClearanceDirection ||
        JSON.stringify(
          normalizedProfileParameterValues(
            selectedObject,
            assemblySweep.profileParameterValues,
          ),
        ) !== JSON.stringify(assemblyProfileParameterValues)),
  );
  const dirty = confirmed !== JSON.stringify(document) || assemblyDirty;
  const activeJob = activeJobId
    ? (jobs.find((job) => job.id === activeJobId) ?? null)
    : null;
  const assemblyJob = assemblySweep
    ? (jobs.find((job) => job.sweepId === assemblySweep.id) ?? null)
    : null;
  const assemblyProcessing = Boolean(
    assemblyJob &&
      ["queued", "leased", "processing"].includes(assemblyJob.status),
  );
  const diagnosticJob = assemblyJob?.id === activeJobId ? assemblyJob : null;
  const sweepDiagnostic = (() => {
    if (
      !diagnosticJob ||
      diagnosticJob.status !== "failed" ||
      ![
        "model_sweep_failed",
        "model_brep_invalid",
        "model_envelope_invalid",
        "fit_clearance_invalid",
      ].includes(diagnosticJob.errorCode ?? "") ||
      !selectedPath ||
      !selectedObject
    )
      return null;
    return diagnoseSweepRisk(
      selectedPath,
      resolvedAssemblyProfile ?? selectedObject,
      document.setup.cornerPolicy,
    );
  })();
  const showSweepRiskMarkers =
    diagnosticJob !== null && visibleRiskMarkersJobId === diagnosticJob.id;
  const fitClearanceAnalysis = selectedPath
    ? analyzeFitClearance(
        selectedPath,
        assemblyFitClearanceMm,
        assemblyFitClearanceDirection,
      )
    : null;
  const displayedResultJob =
    activeJob?.status === "succeeded" && visibleSolidObjectIds.has(activeJob.id)
      ? activeJob
      : null;
  const displayedFitClearanceMm =
    displayedResultJob?.fitClearanceMm ?? assemblyFitClearanceMm;
  const displayedFitClearanceDirection =
    displayedResultJob?.fitClearanceDirection ?? assemblyFitClearanceDirection;
  const solidObjects = useMemo(
    () =>
      jobs
        .filter((job) => job.status === "succeeded" && job.sweepId)
        .map((job) => {
          const sweep = document.sweeps.find((item) => item.id === job.sweepId);
          const completed = new Date(job.createdAt).toLocaleString();
          return {
            id: job.id,
            name:
              job.displayName ??
              `${sweep?.name ?? "Solid Object"} · Result #${job.id} · ${completed}`,
            visible: visibleSolidObjectIds.has(job.id),
            fitClearanceMm: job.fitClearanceMm,
            fitClearanceDirection: job.fitClearanceDirection,
          };
        }),
    [document.sweeps, jobs, visibleSolidObjectIds],
  );
  const visibleResults = useMemo<ThreeDViewportResult[]>(
    () =>
      jobs
        .filter(
          (job) =>
            job.status === "succeeded" && visibleSolidObjectIds.has(job.id),
        )
        .map((job): ThreeDViewportResult => {
          if (job.sourceOriginMm)
            return {
              id: job.id,
              translationMm: [
                job.sourceOriginMm.xMm,
                job.sourceOriginMm.yMm,
                job.sourceOriginMm.zMm,
              ],
            };
          const sweep = document.sweeps.find((item) => item.id === job.sweepId);
          const path = document.modelPaths.find(
            (item) => item.id === sweep?.pathId,
          );
          return {
            id: job.id,
            translationMm: path ? modelPathOrigin(path) : [0, 0, 0],
          };
        }),
    [document.modelPaths, document.sweeps, jobs, visibleSolidObjectIds],
  );
  const selectedVector = mode === "path" ? selectedPath : selectedObject;
  const activeNode =
    selectedNode === null
      ? null
      : (selectedVector?.nodes[selectedNode] ?? null);
  const activeSegment = (() => {
    if (
      mode !== "profile" ||
      !selectedObject ||
      selectedSegment?.objectId !== selectedObject.id
    )
      return null;
    const start = selectedObject.nodes[selectedSegment.segmentIndex];
    const end =
      selectedObject.nodes[
        (selectedSegment.segmentIndex + 1) % selectedObject.nodes.length
      ];
    if (!start || !end || start.handleOut || end.handleIn) return null;
    const lengthMm = Math.hypot(end.xMm - start.xMm, end.yMm - start.yMm);
    const endIndex =
      (selectedSegment.segmentIndex + 1) % selectedObject.nodes.length;
    const fixedNode = selectedSegment.fixedNodeIndex === endIndex ? end : start;
    return lengthMm > 1e-9
      ? {
          segmentIndex: selectedSegment.segmentIndex,
          endIndex,
          fixedNodeIndex: selectedSegment.fixedNodeIndex,
          fixedNode,
          start,
          end,
          lengthMm,
        }
      : null;
  })();
  const selectedState =
    mode === "path"
      ? {
          visible: selectedPath?.visible !== false,
          locked: selectedPath?.locked === true,
        }
      : selectedObject
        ? objectLayerState(document, selectedObject.id)
        : { visible: true, locked: false };
  const activeTargetLocked =
    activeLayerTarget?.type === "folder" &&
    document.layers.folders.find((folder) => folder.id === activeLayerTarget.id)
      ?.locked === true;
  const printerArea = document.setup.printerArea;
  const printerUnitMm = PRINTER_UNIT_MM[printerArea.unit];
  const printerPadding = Math.max(
    printerUnitMm * 2,
    Math.max(printerArea.widthMm, printerArea.heightMm) * 0.05,
  );
  const printerContentWidth = printerArea.widthMm + printerPadding * 2;
  const printerContentHeight = printerArea.heightMm + printerPadding * 2;
  const viewportAspect = profileViewport.width / profileViewport.height;
  const contentAspect = printerContentWidth / printerContentHeight;
  const fittedWidth =
    contentAspect > viewportAspect
      ? printerContentWidth
      : printerContentHeight * viewportAspect;
  const fittedHeight =
    contentAspect > viewportAspect
      ? printerContentWidth / viewportAspect
      : printerContentHeight;
  const profileViewWidth = fittedWidth / zoom;
  const profileViewHeight = fittedHeight / zoom;
  const profileViewBox = {
    x: pan.x - profileViewWidth / 2,
    y: pan.y - profileViewHeight / 2,
    width: profileViewWidth,
    height: profileViewHeight,
  };
  const majorGridMm = printerUnitMm * 5;
  const horizontalRulerStep = rulerStep(profileViewWidth, printerUnitMm);
  const verticalRulerStep = rulerStep(profileViewHeight, printerUnitMm);
  const horizontalRulerMarks = marksBetween(
    profileViewBox.x,
    profileViewBox.x + profileViewBox.width,
    horizontalRulerStep,
  );
  const verticalRulerMarks = marksBetween(
    profileViewBox.y,
    profileViewBox.y + profileViewBox.height,
    verticalRulerStep,
  );
  const screenMmPerPixel = Math.max(
    profileViewWidth / profileViewport.width,
    profileViewHeight / profileViewport.height,
  );
  const gridMinorStroke = screenMmPerPixel * 0.5;
  const gridMajorStroke = screenMmPerPixel * 0.8;
  const printerBoundaryStroke = screenMmPerPixel * 1.5;
  const profileNodeRadius = screenMmPerPixel * 4.5;
  const profileSelectedNodeRadius = screenMmPerPixel * 5.75;
  const profileHandleRadius = screenMmPerPixel * 4;
  const profileNodeStroke = screenMmPerPixel * 1.5;
  const profileConnectionScale = screenMmPerPixel * 3.5;
  const profileHitStroke = screenMmPerPixel * 12;
  const profileMeasurementFont = screenMmPerPixel * 13;

  function commit(next: ThreeDModelDocument) {
    setHistory((items) => [...items.slice(-39), clone(document)]);
    setFuture([]);
    setDocument(next);
  }
  function mutate(mutator: (next: ThreeDModelDocument) => void) {
    const next = clone(document);
    mutator(next);
    commit(next);
  }
  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((items) => [clone(document), ...items]);
    setDocument(previous);
    setHistory((items) => items.slice(0, -1));
  }
  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((items) => [...items, clone(document)]);
    setDocument(next);
    setFuture((items) => items.slice(1));
  }

  function addProfileParameter() {
    if (
      !selectedObject ||
      selectedState.locked ||
      selectedObject.parameters.length >= 16
    )
      return;
    const used = new Set(
      selectedObject.parameters.map((parameter) => parameter.id),
    );
    let index = selectedObject.parameters.length + 1;
    let id = `parameter-${index}`;
    while (used.has(id)) id = `parameter-${++index}`;
    const parameter: ProfileParameter = {
      id,
      name: `Parameter ${index}`,
      axis: "y",
      defaultMm: 1,
      minMm: 0.1,
      maxMm: 100,
      fixedNodeIndices: selectedNode === null ? [] : [selectedNode],
      controlNodeIndices: [],
      followerNodeIndices: [],
    };
    mutate((next) => {
      next.profile.contours
        .find((contour) => contour.id === selectedObject.id)
        ?.parameters.push(parameter);
    });
    setSelectedParameterId(id);
    setParameterGroupMode(selectedNode === null ? "fixed" : "control");
  }

  function patchProfileParameter(
    parameterId: string,
    patch: Partial<Pick<ProfileParameter, "name" | "axis" | "minMm" | "maxMm">>,
  ) {
    if (!selectedObject || selectedState.locked) return;
    if (
      (patch.minMm !== undefined && !Number.isFinite(patch.minMm)) ||
      (patch.maxMm !== undefined && !Number.isFinite(patch.maxMm))
    )
      return;
    mutate((next) => {
      const contour = next.profile.contours.find(
        (item) => item.id === selectedObject.id,
      );
      const parameter = contour?.parameters.find(
        (item) => item.id === parameterId,
      );
      if (!contour || !parameter) return;
      Object.assign(parameter, patch);
      const base = profileParameterBaseValue(contour, parameter);
      if (base !== null)
        parameter.defaultMm = roundCoordinate(Math.max(0.01, base));
      parameter.minMm = Math.max(
        0.01,
        Math.min(parameter.minMm, parameter.defaultMm),
      );
      parameter.maxMm = Math.min(
        2000,
        Math.max(parameter.maxMm, parameter.defaultMm),
      );
    });
  }

  function deleteProfileParameter(parameterId: string) {
    if (!selectedObject || selectedState.locked) return;
    mutate((next) => {
      const contour = next.profile.contours.find(
        (item) => item.id === selectedObject.id,
      );
      if (contour)
        contour.parameters = contour.parameters.filter(
          (parameter) => parameter.id !== parameterId,
        );
    });
    setSelectedParameterId(null);
    setParameterGroupMode(null);
  }

  function toggleParameterNode(nodeIndex: number) {
    if (
      !selectedObject ||
      !activeParameter ||
      !parameterGroupMode ||
      selectedState.locked
    )
      return;
    const activeDrivenNodes = [
      ...activeParameter.controlNodeIndices,
      ...activeParameter.followerNodeIndices,
    ];
    if (
      parameterGroupMode !== "fixed" &&
      !activeDrivenNodes.includes(nodeIndex) &&
      selectedObject.parameters.some(
        (parameter) =>
          parameter.id !== activeParameter.id &&
          parameter.axis === activeParameter.axis &&
          [
            ...parameter.controlNodeIndices,
            ...parameter.followerNodeIndices,
          ].includes(nodeIndex),
      )
    ) {
      setFeedback({
        type: "error",
        message: `Point ${nodeIndex + 1} is already driven by another ${activeParameter.axis === "x" ? "X" : "Z"} parameter.`,
      });
      return;
    }
    mutate((next) => {
      const contour = next.profile.contours.find(
        (item) => item.id === selectedObject.id,
      );
      const parameter = contour?.parameters.find(
        (item) => item.id === activeParameter.id,
      );
      if (!contour || !parameter) return;
      const groups = {
        fixed: parameter.fixedNodeIndices,
        control: parameter.controlNodeIndices,
        follower: parameter.followerNodeIndices,
      };
      const target = groups[parameterGroupMode];
      for (const group of Object.values(groups)) {
        if (group === target) continue;
        const oppositeIndex = group.indexOf(nodeIndex);
        if (oppositeIndex >= 0) group.splice(oppositeIndex, 1);
      }
      const currentIndex = target.indexOf(nodeIndex);
      if (currentIndex >= 0) target.splice(currentIndex, 1);
      else target.push(nodeIndex);
      target.sort((left, right) => left - right);
      const base = profileParameterBaseValue(contour, parameter);
      if (base !== null) {
        parameter.defaultMm = roundCoordinate(Math.max(0.01, base));
        parameter.minMm = Math.min(parameter.minMm, parameter.defaultMm);
        parameter.maxMm = Math.max(parameter.maxMm, parameter.defaultMm);
      }
    });
  }

  function setAssemblyYaw(yawDeg: number) {
    if (!selectedObject || !selectedPath) return;
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    const normalized = ((((yawDeg + 180) % 360) + 360) % 360) - 180;
    setAssemblyDraft({
      profileId: selectedObject.id,
      pathId: selectedPath.id,
      yawDeg: normalized,
      fitClearanceMm: assemblyFitClearanceMm,
      fitClearanceDirection: assemblyFitClearanceDirection,
      profileParameterValues: assemblyProfileParameterValues,
    });
  }

  function setAssemblyFitClearance(value: number) {
    if (!selectedObject || !selectedPath) return;
    const fitClearanceMm = Math.max(
      0,
      Math.min(5, Number.isFinite(value) ? value : 0),
    );
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    setAssemblyDraft({
      profileId: selectedObject.id,
      pathId: selectedPath.id,
      yawDeg: assemblyYawDeg,
      fitClearanceMm,
      fitClearanceDirection: assemblyFitClearanceDirection,
      profileParameterValues: assemblyProfileParameterValues,
    });
  }

  function setAssemblyFitClearanceDirection(
    fitClearanceDirection: FitClearanceDirection,
  ) {
    if (!selectedObject || !selectedPath) return;
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    setAssemblyDraft({
      profileId: selectedObject.id,
      pathId: selectedPath.id,
      yawDeg: assemblyYawDeg,
      fitClearanceMm: assemblyFitClearanceMm,
      fitClearanceDirection,
      profileParameterValues: assemblyProfileParameterValues,
    });
  }

  function activateProfileRotation() {
    if (!selectedObject || !selectedPath) return;
    setTool("rotate-profile");
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    setAssemblyDraft({
      profileId: selectedObject.id,
      pathId: selectedPath.id,
      yawDeg: assemblyYawDeg,
      fitClearanceMm: assemblyFitClearanceMm,
      fitClearanceDirection: assemblyFitClearanceDirection,
      profileParameterValues: assemblyProfileParameterValues,
    });
  }

  function setAssemblyProfileParameter(
    parameter: ProfileParameter,
    value: number,
  ) {
    if (!selectedObject || !selectedPath || !Number.isFinite(value)) return;
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    setAssemblyDraft({
      profileId: selectedObject.id,
      pathId: selectedPath.id,
      yawDeg: assemblyYawDeg,
      fitClearanceMm: assemblyFitClearanceMm,
      fitClearanceDirection: assemblyFitClearanceDirection,
      profileParameterValues: {
        ...assemblyProfileParameterValues,
        [parameter.id]: Math.max(
          parameter.minMm,
          Math.min(parameter.maxMm, value),
        ),
      },
    });
  }

  function pointForEvent(event: {
    clientX: number;
    clientY: number;
  }): Point | null {
    const svg = canvasRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    const step = snap ? document.setup.snapMm : 0;
    if (!step)
      return {
        xMm: roundCoordinate(transformed.x),
        yMm: roundCoordinate(-transformed.y),
      };
    return {
      xMm: roundCoordinate(Math.round(transformed.x / step) * step),
      yMm: roundCoordinate(Math.round(-transformed.y / step) * step),
    };
  }

  function startPanDrag(event: ReactPointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.viewBox.baseVal;
    panRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      startX: pan.x,
      startY: pan.y,
      viewWidth: box.width,
      viewHeight: box.height,
    };
    setPanning(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function addContour(nodes: ProfileNode[], shapeName = "Profile") {
    if (nodes.length < 3) return;
    if (activeTargetLocked) {
      setFeedback({
        type: "error",
        message: "Unlock the selected folder before creating a profile in it.",
      });
      return;
    }
    const id = nextContourId(document);
    const source =
      !catalogProfile && selectedObject?.source
        ? {
            type: "global-profile" as const,
            profileId: selectedObject.source.profileId,
            contourId: nextGlobalContourId(
              document,
              selectedObject.source.profileId,
            ),
            revision: selectedObject.source.revision,
          }
        : undefined;
    mutate((next) => {
      next.profile.contours.push({
        id,
        name: `${shapeName} ${next.profile.contours.length + 1}`,
        visible: true,
        locked: false,
        connectionNodeIndex: 0,
        parameters: [],
        nodes,
        ...(source ? { source } : {}),
      });
      assignObjectToLayer(next, id, activeLayerTarget ?? { type: "root" });
    });
    setSelectedObjectId(id);
    setSelectedNode(null);
    setSelectedSegment(null);
    setTool("select");
    setDraft([]);
  }

  function finishDraft() {
    if (draft.length < 3) {
      setFeedback({
        type: "error",
        message: "A closed profile requires at least three nodes.",
      });
      return;
    }
    addContour(
      prepareClosedProfileNodes(draft),
      tool === "bezier" ? "Bezier" : "Polygon",
    );
  }

  function canvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button === 2) {
      event.preventDefault();
      startPanDrag(event);
      return;
    }
    const point = pointForEvent(event);
    if (tool === "pan") {
      startPanDrag(event);
      return;
    }
    if (!point) return;
    if (mode === "profile" && (tool === "rectangle" || tool === "ellipse")) {
      setPrimitive({ type: tool, start: point, current: point });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (tool === "measure") {
      setMeasurement({ start: point, current: point });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (mode === "profile" && (tool === "polygon" || tool === "bezier")) {
      const closeToleranceMm = screenMmPerPixel * 8;
      if (
        (draft.length >= 3 &&
          Math.hypot(point.xMm - draft[0].xMm, point.yMm - draft[0].yMm) <=
            closeToleranceMm) ||
        event.detail > 1
      )
        finishDraft();
      else
        setDraft((items) => [
          ...items,
          { ...point, nodeType: nodeCreationType },
        ]);
      return;
    }
    if (mode === "path") setSelectedPathId(null);
    setSelectedNode(null);
    setSelectedSegment(null);
  }

  function objectPointerDown(
    event: ReactPointerEvent<SVGPathElement>,
    objectId: string,
    directSegmentIndex?: number,
  ) {
    if (event.button === 2) return;
    if (tool !== "select" && tool !== "move") return;
    const alreadySelected = selectedObjectId === objectId;
    event.stopPropagation();
    setSelectedObjectId(objectId);
    setLayerSelection({ type: "profile", id: objectId });
    setSelectedNode(null);
    const state = objectLayerState(document, objectId);
    const point = pointForEvent(
      event as unknown as ReactPointerEvent<SVGSVGElement>,
    );
    const object = document.profile.contours.find(
      (contour) => contour.id === objectId,
    );
    if (!point || !object) return;
    setSelectedSegment(
      tool === "select"
        ? (() => {
            if (directSegmentIndex !== undefined)
              return {
                objectId,
                segmentIndex: directSegmentIndex,
                fixedNodeIndex: directSegmentIndex,
              };
            const hit = findNearestStraightSegment(
              object.nodes,
              true,
              point,
              profileHitStroke / 2,
            );
            return hit
              ? {
                  objectId,
                  segmentIndex: hit.segmentIndex,
                  fixedNodeIndex: hit.segmentIndex,
                }
              : null;
          })()
        : null,
    );
    if (
      state.locked ||
      !state.visible ||
      (tool === "select" && !alreadySelected)
    )
      return;
    dragRef.current = {
      type: "object",
      objectId,
      start: point,
      original: clone(object.nodes),
      before: clone(document),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function nodePointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    objectId: string,
    node: number,
  ) {
    if (event.button === 2) return;
    if (
      (tool !== "select" && tool !== "move") ||
      objectLayerState(document, objectId).locked
    )
      return;
    if (
      mode === "profile" &&
      objectId === selectedObjectId &&
      parameterGroupMode &&
      activeParameter
    ) {
      event.stopPropagation();
      toggleParameterNode(node);
      setSelectedNode(node);
      return;
    }
    event.stopPropagation();
    setSelectedObjectId(objectId);
    setLayerSelection({ type: "profile", id: objectId });
    setSelectedNode(node);
    setSelectedSegment(null);
    dragRef.current = { type: "node", objectId, node, before: clone(document) };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function pathPointerDown(
    event: ReactPointerEvent<SVGPathElement>,
    pathId: string,
  ) {
    if (event.button === 2) return;
    if (tool !== "select" && tool !== "move") return;
    const alreadySelected = selectedPathId === pathId;
    event.stopPropagation();
    setSelectedPathId(pathId);
    setLayerSelection({ type: "path", id: pathId });
    setSelectedNode(null);
    const path = document.modelPaths.find((item) => item.id === pathId);
    const point = pointForEvent(
      event as unknown as ReactPointerEvent<SVGSVGElement>,
    );
    if (
      !path ||
      !point ||
      path.locked ||
      !path.visible ||
      (tool === "select" && !alreadySelected)
    )
      return;
    dragRef.current = {
      type: "object",
      objectId: pathId,
      start: point,
      original: clone(path.nodes),
      before: clone(document),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function pathNodePointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    pathId: string,
    node: number,
  ) {
    if (event.button === 2) return;
    if (tool !== "select" && tool !== "move") return;
    const path = document.modelPaths.find((item) => item.id === pathId);
    if (!path || path.locked) return;
    event.stopPropagation();
    setSelectedPathId(pathId);
    setLayerSelection({ type: "path", id: pathId });
    setSelectedNode(node);
    dragRef.current = {
      type: "node",
      objectId: pathId,
      node,
      before: clone(document),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function handlePointerDown(
    event: ReactPointerEvent<SVGCircleElement>,
    handle: "handleIn" | "handleOut",
  ) {
    if (event.button === 2) return;
    if (!selectedVector || selectedNode === null || selectedState.locked)
      return;
    event.stopPropagation();
    dragRef.current = {
      type: "handle",
      objectId: selectedVector.id,
      node: selectedNode,
      handle,
      before: clone(document),
    };
    canvasRef.current?.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    if (panRef.current) {
      const bounds = event.currentTarget.getBoundingClientRect();
      setPan({
        x:
          panRef.current.startX -
          ((event.clientX - panRef.current.clientX) *
            panRef.current.viewWidth) /
            Math.max(bounds.width, 1),
        y:
          panRef.current.startY -
          ((event.clientY - panRef.current.clientY) *
            panRef.current.viewHeight) /
            Math.max(bounds.height, 1),
      });
      return;
    }
    const point = pointForEvent(event);
    if (!point) return;
    if (primitive) {
      setPrimitive({ ...primitive, current: point });
      return;
    }
    if (measurement) {
      setMeasurement({ ...measurement, current: point });
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    let dragPoint = point;
    if (drag.type === "node" && mode === "profile" && angularSnap) {
      const contour = documentRef.current.profile.contours.find(
        (item) => item.id === drag.objectId,
      );
      const node = contour?.nodes[drag.node];
      if (contour && node) {
        const previousIndex =
          (drag.node - 1 + contour.nodes.length) % contour.nodes.length;
        const nextIndex = (drag.node + 1) % contour.nodes.length;
        const previous = contour.nodes[previousIndex];
        const next = contour.nodes[nextIndex];
        const anchors = [
          ...(!previous.handleOut && !node.handleIn
            ? [
                {
                  xMm: previous.xMm,
                  yMm: previous.yMm,
                  nodeIndex: previousIndex,
                },
              ]
            : []),
          ...(!node.handleOut && !next.handleIn
            ? [{ xMm: next.xMm, yMm: next.yMm, nodeIndex: nextIndex }]
            : []),
        ];
        const result = findProfileAngularSnap(point, anchors);
        if (result) {
          dragPoint = result.snapped
            ? {
                xMm: roundCoordinate(result.point.xMm),
                yMm: roundCoordinate(result.point.yMm),
              }
            : point;
          setAngularGuide({
            anchor: result.anchor,
            point: dragPoint,
            angleDeg: result.angleDeg,
            snapped: result.snapped,
          });
        } else setAngularGuide(null);
      } else setAngularGuide(null);
    } else setAngularGuide(null);
    setDocument((current) => {
      const next = clone(current);
      const profileObject = next.profile.contours.find(
        (contour) => contour.id === drag.objectId,
      );
      const pathObject = next.modelPaths.find(
        (path) => path.id === drag.objectId,
      );
      const object = profileObject ?? pathObject;
      if (
        !object ||
        (profileObject
          ? objectLayerState(next, object.id).locked
          : pathObject?.locked)
      )
        return current;
      if (drag.type === "object") {
        const freeMove = tool !== "move" || event.ctrlKey || event.metaKey;
        const dx =
          freeMove || moveAxis === "x" ? point.xMm - drag.start.xMm : 0;
        const dy =
          freeMove || moveAxis === "y" ? point.yMm - drag.start.yMm : 0;
        object.nodes = drag.original.map((node) => ({
          ...node,
          xMm: roundCoordinate(node.xMm + dx),
          yMm: roundCoordinate(node.yMm + dy),
        }));
      } else {
        const node = object.nodes[drag.node];
        if (!node) return current;
        if (drag.type === "node") {
          node.xMm = dragPoint.xMm;
          node.yMm = dragPoint.yMm;
        } else {
          const relative = {
            xMm: roundCoordinate(point.xMm - node.xMm),
            yMm: roundCoordinate(point.yMm - node.yMm),
          };
          object.nodes = updateProfileNodeHandle(
            object.nodes,
            drag.node,
            drag.handle,
            relative,
          );
        }
      }
      return next;
    });
  }

  function pointerUp() {
    panRef.current = null;
    setPanning(false);
    if (primitive) {
      const width = Math.abs(primitive.current.xMm - primitive.start.xMm);
      const height = Math.abs(primitive.current.yMm - primitive.start.yMm);
      if (width >= 0.2 && height >= 0.2)
        addContour(
          primitive.type === "rectangle"
            ? rectangleNodes(primitive.start, primitive.current)
            : ellipseNodes(primitive.start, primitive.current),
          primitive.type === "rectangle" ? "Rectangle" : "Ellipse",
        );
      setPrimitive(null);
    }
    const completedDrag = dragRef.current;
    dragRef.current = null;
    setAngularGuide(null);
    if (completedDrag) {
      const before = completedDrag.before;
      setHistory((items) => [...items.slice(-39), before]);
      setFuture([]);
    }
  }

  function canvasDoubleClick(event: ReactMouseEvent<SVGSVGElement>) {
    if (tool !== "select" || !selectedVector || selectedState.locked) return;
    const point = pointForEvent(event);
    const svg = canvasRef.current;
    if (!point || !svg) return;
    const bounds = svg.getBoundingClientRect();
    const viewBox = svg.viewBox.baseVal;
    const toleranceMm =
      Math.max(
        viewBox.width / Math.max(bounds.width, 1),
        viewBox.height / Math.max(bounds.height, 1),
      ) * 8;
    const closed =
      mode === "profile" ||
      ("closed" in selectedVector && selectedVector.closed === true);
    const limit = mode === "profile" ? 128 : 512;
    if (selectedVector.nodes.length >= limit) {
      setFeedback({
        type: "error",
        message: `This ${mode === "profile" ? "profile" : "path"} already has the maximum number of nodes.`,
      });
      return;
    }
    const result = insertNodeOnNearestSegment(
      selectedVector.nodes,
      closed,
      point,
      toleranceMm,
    );
    if (!result) return;
    event.preventDefault();
    event.stopPropagation();
    mutate((next) => {
      const object =
        mode === "profile"
          ? next.profile.contours.find((item) => item.id === selectedVector.id)
          : next.modelPaths.find((item) => item.id === selectedVector.id);
      if (!object) return;
      object.nodes = result.nodes;
      if (result.index <= object.connectionNodeIndex)
        object.connectionNodeIndex += 1;
      if (mode === "profile" && "parameters" in object)
        object.parameters.forEach((parameter) => {
          parameter.fixedNodeIndices = parameter.fixedNodeIndices.map(
            (index) => (index >= result.index ? index + 1 : index),
          );
          parameter.controlNodeIndices = parameter.controlNodeIndices.map(
            (index) => (index >= result.index ? index + 1 : index),
          );
          parameter.followerNodeIndices = parameter.followerNodeIndices.map(
            (index) => (index >= result.index ? index + 1 : index),
          );
        });
    });
    setSelectedNode(result.index);
  }

  function setNodeType(nodeType: ProfileNodeType) {
    if (!selectedVector || selectedNode === null || selectedState.locked)
      return;
    mutate((next) => {
      const object =
        next.profile.contours.find(
          (contour) => contour.id === selectedVector.id,
        ) ?? next.modelPaths.find((path) => path.id === selectedVector.id);
      if (object)
        object.nodes = changeProfileNodeType(
          object.nodes,
          selectedNode,
          nodeType,
        );
    });
  }

  function setSelectedSegmentLength(lengthInDisplayUnits: number) {
    if (
      !selectedObject ||
      !selectedSegment ||
      selectedSegment.objectId !== selectedObject.id ||
      selectedState.locked
    )
      return;
    const lengthMm = lengthInDisplayUnits * printerUnitMm;
    const endIndex =
      (selectedSegment.segmentIndex + 1) % selectedObject.nodes.length;
    const fixedEnd =
      selectedSegment.fixedNodeIndex === endIndex ? "end" : "start";
    const nodes = resizeStraightSegment(
      selectedObject.nodes,
      true,
      selectedSegment.segmentIndex,
      lengthMm,
      fixedEnd,
    );
    if (!nodes) {
      setFeedback({
        type: "error",
        message: "Enter a positive length for a straight segment.",
      });
      return;
    }
    mutate((next) => {
      const object = next.profile.contours.find(
        (contour) => contour.id === selectedObject.id,
      );
      if (object)
        object.nodes = nodes.map((node) => ({
          ...node,
          xMm: roundCoordinate(node.xMm),
          yMm: roundCoordinate(node.yMm),
        }));
    });
  }

  function deleteProfileNode(objectId: string, nodeIndex: number) {
    const object = document.profile.contours.find(
      (contour) => contour.id === objectId,
    );
    if (!object || objectLayerState(document, objectId).locked) return;
    const usedBy = object.parameters.find(
      (parameter) =>
        parameter.fixedNodeIndices.includes(nodeIndex) ||
        parameter.controlNodeIndices.includes(nodeIndex) ||
        parameter.followerNodeIndices.includes(nodeIndex),
    );
    if (usedBy) {
      setFeedback({
        type: "error",
        message: `Point ${nodeIndex + 1} belongs to parameter ${usedBy.name}. Remove it from that parameter before deleting it.`,
      });
      return;
    }
    const result = removeProfileNode(
      object.nodes,
      nodeIndex,
      object.connectionNodeIndex,
    );
    if (!result) return;
    mutate((next) => {
      const contour = next.profile.contours.find(
        (item) => item.id === objectId,
      );
      if (!contour) return;
      contour.nodes = result.nodes;
      contour.connectionNodeIndex = result.connectionNodeIndex;
      contour.parameters.forEach((parameter) => {
        parameter.fixedNodeIndices = parameter.fixedNodeIndices.map((index) =>
          index > nodeIndex ? index - 1 : index,
        );
        parameter.controlNodeIndices = parameter.controlNodeIndices.map(
          (index) => (index > nodeIndex ? index - 1 : index),
        );
        parameter.followerNodeIndices = parameter.followerNodeIndices.map(
          (index) => (index > nodeIndex ? index - 1 : index),
        );
      });
    });
    setSelectedNode(Math.min(nodeIndex, result.nodes.length - 1));
  }

  function deleteSelectedProfileNode() {
    if (
      !selectedObject ||
      selectedNode === null ||
      selectedObject.nodes.length <= 3
    )
      return;
    deleteProfileNode(selectedObject.id, selectedNode);
  }

  function copySelectedProfile() {
    if (selectedObject) setProfileClipboard(clone(selectedObject));
  }

  function pasteProfile() {
    if (!profileClipboard || !selectedObject || selectedState.locked) return;
    const id = nextContourId(document);
    const folder = folderForObject(document, selectedObject.id);
    const offset = document.setup.snapMm;
    const pasted: ProfileContour = {
      ...clone(profileClipboard),
      id,
      name: `${profileClipboard.name} copy`,
      locked: false,
      nodes: profileClipboard.nodes.map((node) => ({
        ...node,
        xMm: roundCoordinate(node.xMm + offset),
        yMm: roundCoordinate(node.yMm + offset),
      })),
    };
    if (!catalogProfile && selectedObject.source)
      pasted.source = {
        ...selectedObject.source,
        contourId: nextGlobalContourId(
          document,
          selectedObject.source.profileId,
        ),
      };
    mutate((next) => {
      next.profile.contours.push(pasted);
      assignObjectToLayer(
        next,
        id,
        folder ? { type: "folder", id: folder.id } : { type: "root" },
        selectedObject.id,
      );
    });
    setSelectedObjectId(id);
    setLayerSelection({ type: "profile", id });
    setSelectedNode(null);
    setTool("select");
  }

  useEffect(() => {
    function keyboard(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const modifier = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (modifier && key === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (modifier && key === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (
        target?.isContentEditable ||
        (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
      )
        return;
      if (mode === "profile" && modifier && key === "c") {
        event.preventDefault();
        copySelectedProfile();
        return;
      }
      if (mode === "profile" && modifier && key === "v") {
        event.preventDefault();
        pasteProfile();
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        mode === "profile" &&
        selectedNode !== null
      ) {
        event.preventDefault();
        deleteSelectedProfileNode();
        return;
      }
      if (event.key === "Enter" && (tool === "polygon" || tool === "bezier"))
        finishDraft();
      if (event.key === "Escape") {
        setDraft([]);
        setPrimitive(null);
        setMeasurement(null);
        if (mode === "preview")
          setThreeDMeasureResetRequest((value) => value + 1);
        setTool("select");
        return;
      }
      if (mode !== "profile" || modifier) return;
      if (key === "v") setTool("select");
      if (key === "m") setTool("move");
      if (key === "h") setTool("pan");
      if (!activeTargetLocked && key === "r") setTool("rectangle");
      if (!activeTargetLocked && key === "e") setTool("ellipse");
      if (!activeTargetLocked && key === "p") {
        setNodeCreationType("corner");
        setDraft([]);
        setTool("polygon");
      }
      if (!activeTargetLocked && key === "b") {
        setNodeCreationType("smooth");
        setDraft([]);
        setTool("bezier");
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });

  function setConnectionPoint() {
    if (!selectedVector || selectedNode === null || selectedState.locked)
      return;
    if (
      mode === "path" &&
      selectedPath &&
      !selectedPath.closed &&
      selectedNode !== 0 &&
      selectedNode !== selectedPath.nodes.length - 1
    ) {
      setFeedback({
        type: "error",
        message:
          "An open Model Path connection must be one of its two endpoints.",
      });
      return;
    }
    mutate((next) => {
      if (mode === "path") {
        const path = next.modelPaths.find(
          (item) => item.id === selectedVector.id,
        );
        if (!path) return;
        path.connectionNodeIndex = selectedNode;
        if (!path.closed)
          next.sweeps
            .filter((sweep) => sweep.pathId === path.id)
            .forEach((sweep) => {
              sweep.direction = selectedNode === 0 ? "forward" : "reverse";
            });
      } else {
        const profile = next.profile.contours.find(
          (item) => item.id === selectedVector.id,
        );
        if (profile) profile.connectionNodeIndex = selectedNode;
      }
    });
    setFeedback({
      type: "success",
      message: `${mode === "path" ? "Path" : "Profile"} connection point set at node ${selectedNode + 1}.`,
    });
  }

  function deleteProfile(profileId: string) {
    const profile = document.profile.contours.find(
      (item) => item.id === profileId,
    );
    if (!profile || objectLayerState(document, profileId).locked) return;
    mutate((next) => {
      next.profile.contours = next.profile.contours.filter(
        (contour) => contour.id !== profileId,
      );
      next.sweeps = next.sweeps.filter(
        (sweep) => sweep.profileId !== profileId,
      );
      removeObjectFromLayers(next, profileId);
    });
    setSelectedObjectId(
      document.profile.contours.find((contour) => contour.id !== profileId)
        ?.id ?? null,
    );
    setSelectedNode(null);
    if (assemblyDraft?.profileId === profileId) setAssemblyDraft(null);
    setPendingLayerDelete(null);
    setFeedback({ type: "success", message: `${profile.name} deleted.` });
  }

  function deletePendingPath() {
    if (pendingLayerDelete?.type !== "path") return;
    const path = document.modelPaths.find(
      (item) => item.id === pendingLayerDelete.id,
    );
    if (!path) {
      setPendingLayerDelete(null);
      return;
    }
    const nextSelectedPathId =
      selectedPathId === path.id
        ? (document.modelPaths.find((item) => item.id !== path.id)?.id ?? null)
        : selectedPathId;
    mutate((next) => {
      next.modelPaths = next.modelPaths.filter((item) => item.id !== path.id);
      next.sweeps = next.sweeps.filter((sweep) => sweep.pathId !== path.id);
    });
    setSelectedPathId(nextSelectedPathId);
    setSelectedNode(null);
    if (assemblyDraft?.pathId === path.id) setAssemblyDraft(null);
    setSelectedSolidObjectId(null);
    setVisibleSolidObjectIds(new Set());
    setPendingLayerDelete(null);
    setFeedback({ type: "success", message: `${path.name} deleted.` });
  }

  function materializeAssembly(source = document) {
    const profile = source.profile.contours.find(
      (item) => item.id === selectedObjectId,
    );
    const path = source.modelPaths.find((item) => item.id === selectedPathId);
    if (!profile || !path) return { document: clone(source), sweep: null };
    const next = clone(source);
    let sweep = next.sweeps.find(
      (item) => item.profileId === profile.id && item.pathId === path.id,
    );
    if (!sweep) {
      let id = `sweep-${next.sweeps.length + 1}`;
      let index = next.sweeps.length + 2;
      while (next.sweeps.some((item) => item.id === id))
        id = `sweep-${index++}`;
      const direction =
        !path.closed && path.connectionNodeIndex === path.nodes.length - 1
          ? ("reverse" as const)
          : ("forward" as const);
      sweep = {
        id,
        name: `${path.name} + ${profile.name}`,
        pathId: path.id,
        profileId: profile.id,
        direction,
        pathConnection: "start",
        profileConnection: { xMm: 0, yMm: 0, yawDeg: assemblyYawDeg },
        fitClearanceMm: assemblyFitClearanceMm,
        fitClearanceDirection: assemblyFitClearanceDirection,
        profileParameterValues: assemblyProfileParameterValues,
        visible: true,
        locked: false,
      };
      next.sweeps.push(sweep);
    } else {
      sweep.name = `${path.name} + ${profile.name}`;
      sweep.profileConnection.yawDeg = assemblyYawDeg;
      sweep.fitClearanceMm = assemblyFitClearanceMm;
      sweep.fitClearanceDirection = assemblyFitClearanceDirection;
      sweep.profileParameterValues = assemblyProfileParameterValues;
    }
    return { document: next, sweep };
  }

  async function persistDocument(next: ThreeDModelDocument) {
    let documentToPersist = clone(next);
    if (!catalogProfile) {
      const selectedSnapshot = documentToPersist.profile.contours.find(
        (contour) => contour.id === selectedObjectId,
      );
      const source = selectedSnapshot?.source;
      const globalProfile = source
        ? globalProfiles.find((profile) => profile.id === source.profileId)
        : null;
      if (mode === "profile" && source && globalProfile) {
        const globalDocument = clone(globalProfile.document);
        const originalNames = new Map(
          globalProfile.document.profile.contours.map((contour) => [
            contour.id,
            contour.name,
          ]),
        );
        globalDocument.profile.contours = documentToPersist.profile.contours
          .filter((contour) => contour.source?.profileId === globalProfile.id)
          .map((edited) => {
            const { source: editedSource, ...geometry } = edited;
            return {
              ...geometry,
              id: editedSource!.contourId,
              name: originalNames.get(editedSource!.contourId) ?? geometry.name,
            };
          });
        globalDocument.layers = {
          rootObjectIds: globalDocument.profile.contours.map(
            (contour) => contour.id,
          ),
          folders: [],
        };
        const globalResponse = await fetch(
          `/api/profiles/${globalProfile.id}`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              document: globalDocument,
              revision: globalProfile.revision,
            }),
          },
        );
        const globalPayload = (await globalResponse.json()) as {
          document?: ThreeDModelDocument;
          revision?: number;
          error?: string;
        };
        if (
          !globalResponse.ok ||
          !globalPayload.document ||
          globalPayload.revision === undefined
        )
          throw new Error(
            globalPayload.error ?? "The global Profile could not be saved.",
          );
        documentToPersist.profile.contours =
          documentToPersist.profile.contours.map((contour) =>
            contour.source?.profileId === globalProfile.id
              ? {
                  ...contour,
                  source: {
                    ...contour.source,
                    revision: globalPayload.revision!,
                  },
                }
              : contour,
          );
        setGlobalProfiles((profiles) =>
          profiles.map((profile) =>
            profile.id === globalProfile.id
              ? {
                  ...profile,
                  document: globalPayload.document!,
                  revision: globalPayload.revision!,
                }
              : profile,
          ),
        );
      }
    }
    const response = await fetch(
      catalogProfile
        ? `/api/profiles/${catalogProfile.id}`
        : `/api/3d-modeler/projects/${project.id}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document: documentToPersist, revision }),
      },
    );
    const payload = (await response.json()) as {
      document?: ThreeDModelDocument;
      revision?: number;
      error?: string;
    };
    if (!response.ok || !payload.document || payload.revision === undefined)
      throw new Error(payload.error ?? "Save failed.");
    setDocument(payload.document);
    setConfirmed(JSON.stringify(payload.document));
    setRevision(payload.revision);
    return payload;
  }

  async function persistPreparedSave(
    next: ThreeDModelDocument,
    sweepId: string | null,
    outcome: "clean" | "corrected" | "saved-anyway",
  ) {
    setBusy(true);
    setFeedback(null);
    try {
      if (outcome === "corrected")
        setHistory((items) => [...items.slice(-39), clone(document)]);
      const saved = await persistDocument(next);
      const sweep = sweepId
        ? saved.document!.sweeps.find((item) => item.id === sweepId)
        : null;
      if (sweep)
        setAssemblyDraft({
          profileId: sweep.profileId,
          pathId: sweep.pathId,
          yawDeg: sweep.profileConnection.yawDeg,
          fitClearanceMm: sweep.fitClearanceMm,
          fitClearanceDirection: sweep.fitClearanceDirection,
          profileParameterValues: sweep.profileParameterValues,
        });
      setFeedback(
        outcome === "saved-anyway"
          ? {
              type: "warning",
              message:
                "The 3D document was saved with unresolved Profile geometry warnings.",
            }
          : {
              type: "success",
              message:
                outcome === "corrected"
                  ? "Profile geometry corrected and saved."
                  : sweep
                    ? "3D assembly saved."
                    : mode === "profile" && selectedObject?.source
                      ? "Global Profile saved."
                      : "3D document saved.",
            },
      );
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Save failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const assembly =
      mode === "preview"
        ? materializeAssembly()
        : { document: clone(document), sweep: null };
    if (
      mode === "preview" &&
      fitClearanceAnalysis &&
      !fitClearanceAnalysis.valid
    ) {
      setFeedback({ type: "error", message: fitClearanceAnalysis.summary });
      return;
    }
    const incompleteParameter = assembly.document.profile.contours
      .flatMap((contour) =>
        contour.parameters.map((parameter) => ({ contour, parameter })),
      )
      .find(({ parameter }) => {
        const memberships = [
          ...parameter.fixedNodeIndices,
          ...parameter.controlNodeIndices,
          ...parameter.followerNodeIndices,
        ];
        return (
          !parameter.fixedNodeIndices.length ||
          !parameter.controlNodeIndices.length ||
          new Set(memberships).size !== memberships.length
        );
      });
    if (incompleteParameter) {
      const missingGroup = !incompleteParameter.parameter.fixedNodeIndices
        .length
        ? "fixed"
        : "control";
      setMode("profile");
      setTool("select");
      setSelectedObjectId(incompleteParameter.contour.id);
      setSelectedParameterId(incompleteParameter.parameter.id);
      setParameterGroupMode(missingGroup);
      setFeedback({
        type: "error",
        message: `${incompleteParameter.parameter.name} is incomplete. Click the ${missingGroup} nodes in the canvas, then save again. Followers are optional.`,
      });
      return;
    }
    const validation = validateProfilesBeforeSave(assembly.document);
    if (validation.issues.length) {
      setPendingProfileSave({
        sourceDocument: assembly.document,
        sweepId: assembly.sweep?.id ?? null,
        validation,
      });
      return;
    }
    void persistPreparedSave(
      assembly.document,
      assembly.sweep?.id ?? null,
      "clean",
    );
  }

  function finishProfileSave(outcome: "corrected" | "saved-anyway") {
    if (!pendingProfileSave) return;
    const pending = pendingProfileSave;
    setPendingProfileSave(null);
    const next =
      outcome === "corrected"
        ? pending.validation.repairedDocument
        : pending.sourceDocument;
    void persistPreparedSave(next, pending.sweepId, outcome);
  }

  function selectSweepProfile(profileId: string) {
    const matching = selectedPathId
      ? document.sweeps.find(
          (item) =>
            item.profileId === profileId && item.pathId === selectedPathId,
        )
      : null;
    const profile = document.profile.contours.find(
      (item) => item.id === profileId,
    );
    setSelectedObjectId(profileId);
    setLayerSelection({ type: "profile", id: profileId });
    setAssemblyDraft(
      selectedPathId && profile
        ? {
            profileId,
            pathId: selectedPathId,
            yawDeg: matching?.profileConnection.yawDeg ?? 0,
            fitClearanceMm: matching?.fitClearanceMm ?? 0,
            fitClearanceDirection: matching?.fitClearanceDirection ?? "outward",
            profileParameterValues: normalizedProfileParameterValues(
              profile,
              matching?.profileParameterValues,
            ),
          }
        : null,
    );
    setSelectedNode(null);
    setSelectedSolidObjectId(null);
    setMode("preview");
    setTool("select");
  }

  function selectSweepPath(pathId: string) {
    const matching = selectedObjectId
      ? document.sweeps.find(
          (item) =>
            item.profileId === selectedObjectId && item.pathId === pathId,
        )
      : null;
    setSelectedPathId(pathId);
    setLayerSelection({ type: "path", id: pathId });
    setAssemblyDraft(
      selectedObject
        ? {
            profileId: selectedObject.id,
            pathId,
            yawDeg: matching?.profileConnection.yawDeg ?? 0,
            fitClearanceMm: matching?.fitClearanceMm ?? 0,
            fitClearanceDirection: matching?.fitClearanceDirection ?? "outward",
            profileParameterValues: normalizedProfileParameterValues(
              selectedObject,
              matching?.profileParameterValues,
            ),
          }
        : null,
    );
    setSelectedNode(null);
    setSelectedSolidObjectId(null);
    setMode("preview");
    setTool("select");
  }

  async function executeSweep() {
    if (!selectedObject || !selectedPath) {
      setFeedback({
        type: "error",
        message: "Select one Path and one Profile in Layers.",
      });
      return;
    }
    if (fitClearanceAnalysis && !fitClearanceAnalysis.valid) {
      setFeedback({ type: "error", message: fitClearanceAnalysis.summary });
      return;
    }
    const assembly = materializeAssembly();
    if (!assembly.sweep) return;
    const sweep = assembly.sweep;
    setBusy(true);
    setFeedback(null);
    setActiveJobId(null);
    setSelectedSolidObjectId(null);
    setOpenSweepErrorsJobId(null);
    setVisibleRiskMarkersJobId(null);
    setRiskFocus(null);
    try {
      const saved = await persistDocument(assembly.document);
      const response = await fetch(
        `/api/3d-modeler/projects/${project.id}/jobs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sweepId: sweep.id, document: saved.document }),
        },
      );
      const payload = (await response.json()) as {
        id?: string;
        status?: string;
        reused?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.id || !payload.status)
        throw new Error(payload.error ?? "The Sweep could not be executed.");
      const jobId = payload.id;
      const jobStatus = payload.status;
      setAssemblyDraft({
        profileId: sweep.profileId,
        pathId: sweep.pathId,
        yawDeg: sweep.profileConnection.yawDeg,
        fitClearanceMm: sweep.fitClearanceMm,
        fitClearanceDirection: sweep.fitClearanceDirection,
        profileParameterValues: sweep.profileParameterValues,
      });
      setMode("preview");
      observedJobStatusesRef.current.set(jobId, jobStatus);
      setJobs((current) => [
        {
          id: jobId,
          sweepId: sweep.id,
          status: jobStatus,
          fitClearanceMm: sweep.fitClearanceMm,
          fitClearanceDirection: sweep.fitClearanceDirection,
          createdAt:
            current.find((item) => item.id === jobId)?.createdAt ??
            new Date().toISOString(),
        },
        ...current.filter((item) => item.id !== jobId),
      ]);
      setActiveJobId(jobId);
      if (jobStatus === "succeeded")
        setVisibleSolidObjectIds((current) => new Set(current).add(jobId));
      setFeedback({
        type: "success",
        message:
          jobStatus === "succeeded"
            ? "The existing Solid Object is ready."
            : payload.reused
              ? "The existing Sweep is still processing."
              : "Sweep submitted for processing.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Sweep could not be executed.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function deleteSolidObject(jobId: string) {
    const selectedJob = jobs.find((job) => job.id === jobId);
    if (!selectedJob || selectedJob.status !== "succeeded") return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/3d-modeler/projects/${project.id}/jobs/${selectedJob.id}`,
        { method: "DELETE" },
      );
      const payload = (await response.json()) as {
        deleted?: boolean;
        error?: string;
      };
      if (!response.ok || !payload.deleted)
        throw new Error(
          payload.error ?? "The Solid Object could not be deleted.",
        );
      setJobs((current) => current.filter((job) => job.id !== selectedJob.id));
      if (activeJobId === selectedJob.id) setActiveJobId(null);
      setVisibleSolidObjectIds((current) => {
        const next = new Set(current);
        next.delete(selectedJob.id);
        return next;
      });
      setSelectedSolidObjectId(null);
      setPendingLayerDelete(null);
      setFeedback({ type: "success", message: "Solid Object deleted." });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Solid Object could not be deleted.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function renameSolidObject(jobId: string, name: string) {
    const previousName = jobs.find((job) => job.id === jobId)?.displayName;
    setJobs((current) =>
      current.map((job) =>
        job.id === jobId ? { ...job, displayName: name } : job,
      ),
    );
    try {
      const response = await fetch(
        `/api/3d-modeler/projects/${project.id}/jobs/${jobId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      const payload = (await response.json()) as {
        displayName?: string;
        error?: string;
      };
      if (!response.ok || !payload.displayName)
        throw new Error(
          payload.error ?? "The Solid Object could not be renamed.",
        );
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, displayName: payload.displayName } : job,
        ),
      );
    } catch (error) {
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, displayName: previousName } : job,
        ),
      );
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "The Solid Object could not be renamed.",
      });
    }
  }

  async function importSvg(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const source = await file.text();
      const paths = importSvgModelPaths(source, file.name);
      const form = new FormData();
      form.set(
        "file",
        new File([source], file.name, { type: "image/svg+xml" }),
      );
      const upload = await fetch(
        `/api/3d-modeler/projects/${project.id}/assets`,
        { method: "POST", body: form },
      );
      const payload = (await upload.json()) as {
        assetId?: string;
        error?: string;
      };
      if (!upload.ok || !payload.assetId)
        throw new Error(
          payload.error ?? "The original SVG could not be stored.",
        );
      paths.forEach((path) => {
        path.source.assetId = payload.assetId;
      });
      const used = new Set(document.modelPaths.map((path) => path.id));
      paths.forEach((path) => {
        const base = path.id;
        let index = 2;
        while (used.has(path.id)) path.id = `${base.slice(0, 110)}-${index++}`;
        used.add(path.id);
      });
      mutate((next) => {
        next.modelPaths.push(...paths);
      });
      setSelectedPathId(paths[0].id);
      setLayerSelection({ type: "path", id: paths[0].id });
      setMode("preview");
      setFeedback({
        type: "success",
        message: `${paths.length} Model Path(s) normalized; the original SVG was stored in Assets.`,
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "SVG import failed.",
      });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  function importFabricationPlan(plan: ModelPath) {
    const snapshot = clone(plan);
    const used = new Set(document.modelPaths.map((path) => path.id));
    const base = snapshot.id;
    let index = 2;
    while (used.has(snapshot.id))
      snapshot.id = `${base.slice(0, 110)}-${index++}`;
    mutate((next) => {
      next.modelPaths.push(snapshot);
    });
    setSelectedPathId(snapshot.id);
    setLayerSelection({ type: "path", id: snapshot.id });
    setSelectedNode(null);
    setMode("preview");
    setFeedback({
      type: "success",
      message: `${snapshot.name} materialized as an independent Model Path snapshot.`,
    });
  }

  const primitivePath = primitive
    ? profilePath({
        id: "draft",
        name: "Draft",
        visible: true,
        locked: false,
        connectionNodeIndex: 0,
        parameters: [],
        nodes:
          primitive.type === "rectangle"
            ? rectangleNodes(primitive.start, primitive.current)
            : ellipseNodes(primitive.start, primitive.current),
      })
    : "";
  const pathBounds = useMemo(() => {
    const points = document.modelPaths.flatMap((path) => path.nodes);
    if (!points.length) return { x: -50, y: -50, width: 100, height: 100 };
    const minX = Math.min(...points.map((point) => point.xMm));
    const maxX = Math.max(...points.map((point) => point.xMm));
    const minY = Math.min(...points.map((point) => -point.yMm));
    const maxY = Math.max(...points.map((point) => -point.yMm));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const pad = Math.max(width, height) * 0.05;
    return {
      x: minX - pad,
      y: minY - pad,
      width: width + pad * 2,
      height: height + pad * 2,
    };
  }, [document.modelPaths]);
  const pathViewBox = `${pathBounds.x + (pathBounds.width - pathBounds.width / zoom) / 2 + pan.x} ${pathBounds.y + (pathBounds.height - pathBounds.height / zoom) / 2 + pan.y} ${pathBounds.width / zoom} ${pathBounds.height / zoom}`;
  const pathNodeRadius = Math.max(
    0.7,
    Math.max(pathBounds.width, pathBounds.height) / (180 * zoom),
  );
  function showSweepRiskIn3D(nodeIndex: number) {
    setMode("preview");
    setTool("select");
    setVisibleSolidObjectIds(new Set());
    setSelectedSolidObjectId(null);
    setOpenSweepErrorsJobId(null);
    setVisibleRiskMarkersJobId(diagnosticJob?.id ?? null);
    setRiskFocus((current) => ({
      nodeIndex,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }
  const pendingLayerName =
    pendingLayerDelete?.type === "profile"
      ? document.profile.contours.find(
          (item) => item.id === pendingLayerDelete.id,
        )?.name
      : pendingLayerDelete?.type === "path"
        ? document.modelPaths.find((item) => item.id === pendingLayerDelete.id)
            ?.name
        : pendingLayerDelete?.type === "solid"
          ? solidObjects.find((item) => item.id === pendingLayerDelete.id)?.name
          : undefined;
  const canDeleteLayerSelection =
    layerSelection.type === "profile"
      ? Boolean(
          document.profile.contours.some(
            (item) => item.id === layerSelection.id,
          ) && !objectLayerState(document, layerSelection.id).locked,
        )
      : layerSelection.type === "path"
        ? Boolean(
            document.modelPaths.some(
              (item) => item.id === layerSelection.id && !item.locked,
            ),
          )
        : Boolean(
            jobs.some(
              (item) =>
                item.id === layerSelection.id && item.status === "succeeded",
            ),
          );

  function confirmLayerDelete() {
    if (!pendingLayerDelete) return;
    if (pendingLayerDelete.type === "profile")
      deleteProfile(pendingLayerDelete.id);
    else if (pendingLayerDelete.type === "path") deletePendingPath();
    else void deleteSolidObject(pendingLayerDelete.id);
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="relative z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border-2 bg-card px-2 whitespace-nowrap">
        <Button asChild density="compact" variant="outline" className="px-2">
          <Link href={catalogProfile ? "/profiles" : "/3d-modeler"}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        {catalogProfile ? (
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-label font-semibold uppercase text-muted-foreground">
              Profile
            </span>
            <span className="max-w-64 truncate text-body-sm font-medium">
              {catalogProfile.name}
            </span>
          </div>
        ) : (
          <div className="flex h-8 items-center rounded-md border border-input bg-surface-2 p-0.5">
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1 rounded px-2 text-body-sm",
                mode === "profile"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:bg-surface-hover",
              )}
              onClick={() => {
                setMode("profile");
              }}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
              Profile
            </button>
            <button
              type="button"
              className={cn(
                "flex h-7 items-center gap-1 rounded px-2 text-body-sm",
                mode === "preview"
                  ? "bg-blue-600 text-white"
                  : "text-muted-foreground hover:bg-surface-hover",
              )}
              onClick={() => {
                setMode("preview");
                setTool("select");
                setSelectedNode(null);
              }}
            >
              <Box className="h-3.5 w-3.5" />
              3D
            </button>
          </div>
        )}
        <div className="h-7 w-px bg-border" />
        <div ref={setupRef} className="relative">
          <button
            type="button"
            aria-expanded={setupOpen}
            className="flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-2 text-body-sm hover:bg-surface-hover"
            onClick={() => setSetupOpen((value) => !value)}
          >
            <Settings2 className="h-4 w-4" />
            Setup
          </button>
          {setupOpen ? (
            <div className="absolute left-0 top-10 z-50 w-72 max-w-[calc(100vw-1rem)] space-y-3 overflow-hidden rounded-lg border border-border-2 bg-card p-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div className="text-label font-semibold uppercase text-muted-foreground">
                  Printer area
                </div>
                <button
                  type="button"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground"
                  aria-label="Close Setup"
                  title="Close Setup"
                  onClick={() => setSetupOpen(false)}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <label className="block text-body-sm">
                Units
                <select
                  value={printerArea.unit}
                  onChange={(event) =>
                    mutate((next) => {
                      next.setup.printerArea.unit = event.target
                        .value as PrinterUnit;
                    })
                  }
                  className="mt-1 h-8 w-full rounded-md border bg-card px-2"
                >
                  <option value="mm">Millimeters (mm)</option>
                  <option value="cm">Centimeters (cm)</option>
                  <option value="in">Inches (in)</option>
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <SetupNumber
                  key={`width-${printerArea.unit}-${printerArea.widthMm}`}
                  label="W"
                  value={roundCoordinate(printerArea.widthMm / printerUnitMm)}
                  suffix={printerArea.unit}
                  step={printerArea.unit === "in" ? 0.01 : 0.1}
                  onChange={(value) =>
                    mutate((next) => {
                      next.setup.printerArea.widthMm = Math.max(
                        10,
                        Math.min(
                          2000,
                          value * PRINTER_UNIT_MM[next.setup.printerArea.unit],
                        ),
                      );
                    })
                  }
                />
                <SetupNumber
                  key={`height-${printerArea.unit}-${printerArea.heightMm}`}
                  label="H"
                  value={roundCoordinate(printerArea.heightMm / printerUnitMm)}
                  suffix={printerArea.unit}
                  step={printerArea.unit === "in" ? 0.01 : 0.1}
                  onChange={(value) =>
                    mutate((next) => {
                      next.setup.printerArea.heightMm = Math.max(
                        10,
                        Math.min(
                          2000,
                          value * PRINTER_UNIT_MM[next.setup.printerArea.unit],
                        ),
                      );
                    })
                  }
                />
              </div>
              <SetupNumber
                key={`snap-${printerArea.unit}-${document.setup.snapMm}`}
                label="Snap"
                value={roundCoordinate(document.setup.snapMm / printerUnitMm)}
                suffix={printerArea.unit}
                step={printerArea.unit === "in" ? 0.01 : 0.1}
                onChange={(value) =>
                  mutate((next) => {
                    next.setup.snapMm = Math.max(
                      0.01,
                      Math.min(
                        100,
                        value * PRINTER_UNIT_MM[next.setup.printerArea.unit],
                      ),
                    );
                  })
                }
              />
              {!catalogProfile ? (
                <>
                  <div className="text-label font-semibold uppercase text-muted-foreground">
                    Sweep
                  </div>
                  <label className="block min-w-0 text-body-sm">
                    Corner transition
                    <select
                      value={document.setup.cornerPolicy}
                      onChange={(event) =>
                        mutate((next) => {
                          next.setup.cornerPolicy = event.target.value as
                            | "miter"
                            | "round";
                        })
                      }
                      className="mt-1 h-8 w-full min-w-0 max-w-full rounded-md border bg-card px-2"
                    >
                      <option value="round">Round</option>
                      <option value="miter">Miter</option>
                    </select>
                  </label>
                  <label className="block min-w-0 text-body-sm">
                    Body policy
                    <select
                      value={document.setup.bodyPolicy}
                      onChange={(event) =>
                        mutate((next) => {
                          next.setup.bodyPolicy = event.target.value as
                            | "separate"
                            | "union";
                        })
                      }
                      className="mt-1 h-8 w-full min-w-0 max-w-full rounded-md border bg-card px-2"
                    >
                      <option value="separate">Separate</option>
                      <option value="union">Union</option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        {mode === "profile" ? (
          <>
            <Button
              density="compact"
              variant={snap ? "default" : "outline"}
              className="w-8 px-0"
              aria-label={`Snap to ${roundCoordinate(document.setup.snapMm / printerUnitMm)} ${printerArea.unit}`}
              onClick={() => setSnap((value) => !value)}
            >
              <Magnet className="h-4 w-4" />
            </Button>
            <Button
              density="compact"
              variant={angularSnap ? "default" : "outline"}
              className="w-10 px-0 font-mono"
              title="Angular snap: 0°, 30°, 45°, 60°, and 90°"
              aria-label="Toggle angular snap for 0, 30, 45, 60, and 90 degrees"
              aria-pressed={angularSnap}
              onClick={() => {
                setAngularSnap((value) => !value);
                setAngularGuide(null);
              }}
            >
              45°
            </Button>
            <Button
              density="compact"
              variant="outline"
              className="w-8 px-0"
              aria-label="Fit printer area"
              onClick={() => {
                setPan({ x: 0, y: 0 });
                setZoom(1);
              }}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-input bg-card px-2 text-body-sm hover:bg-surface-hover">
              <FileUp className="h-4 w-4" />
              Import SVG
              <input
                className="sr-only"
                type="file"
                accept="image/svg+xml,.svg"
                onChange={importSvg}
                disabled={busy || assemblyProcessing}
              />
            </label>
            <Button
              density="compact"
              onClick={executeSweep}
              disabled={
                busy || !selectedObject || !selectedPath || assemblyProcessing
              }
            >
              {busy || assemblyProcessing ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Box className="h-4 w-4" />
              )}
              {busy || assemblyProcessing
                ? "Processing…"
                : assemblyJob?.status === "failed"
                  ? "Retry Sweep"
                  : "Sweep"}
            </Button>
            {sweepDiagnostic ? (
              <Button
                density="compact"
                variant="outline"
                className="border-amber-500/60 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
                onClick={() =>
                  setOpenSweepErrorsJobId(diagnosticJob?.id ?? null)
                }
              >
                <AlertTriangle className="h-4 w-4" />
                Errors <Badge>{sweepDiagnostic.candidates.length}</Badge>
              </Button>
            ) : null}
          </>
        )}
        <div className="ml-auto flex min-w-0 shrink items-center gap-1.5" aria-live="polite">
          <Button
            density="compact"
            variant="outline"
            className="px-2"
            aria-label="Undo"
            disabled={!history.length}
            onClick={undo}
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            density="compact"
            variant="outline"
            className="px-2"
            aria-label="Redo"
            disabled={!future.length}
            onClick={redo}
          >
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button
            density="compact"
            variant="outline"
            className={cn(
              "px-2",
              dirty
                ? "border-amber-500 bg-amber-500 text-slate-950 hover:border-amber-400 hover:bg-amber-400 hover:text-slate-950"
                : "text-muted-foreground",
            )}
            onClick={save}
            disabled={!dirty || busy || (mode === "preview" && assemblyProcessing)}
            title={
              busy
                ? "Saving changes"
                : dirty
                  ? "Save pending changes"
                  : "All changes are saved"
            }
            aria-label={
              busy
                ? "Saving changes"
                : dirty
                  ? "Save pending changes"
                  : "All changes are saved"
            }
          >
            <Save className="h-4 w-4" />
            <span>Save</span>
          </Button>
        </div>
      </header>
      {mode === "preview" ? (
        <div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-2 text-body-sm">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              {tool === "rotate-profile" && selectedObject && selectedPath ? (
                <>
                  <span className="text-label font-semibold uppercase text-muted-foreground">
                    Rotate Profile
                  </span>
                  <span className="text-muted-foreground">
                    Horizontal XY · local +Y reference · connection-point pivot
                  </span>
                  <Button
                    density="compact"
                    variant="outline"
                    onClick={() => setAssemblyYaw(assemblyYawDeg - 15)}
                  >
                    −15°
                  </Button>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="1"
                    value={assemblyYawDeg}
                    aria-label="Horizontal profile rotation"
                    className="w-56"
                    onChange={(event) =>
                      setAssemblyYaw(Number(event.target.value))
                    }
                  />
                  <label className="flex items-center gap-1">
                    <input
                      type="number"
                      min="-180"
                      max="180"
                      step="1"
                      value={assemblyYawDeg}
                      className="h-8 w-20 rounded-md border bg-card px-2 text-right font-mono"
                      onChange={(event) =>
                        setAssemblyYaw(Number(event.target.value) || 0)
                      }
                    />
                    deg
                  </label>
                  <Button
                    density="compact"
                    variant="outline"
                    onClick={() => setAssemblyYaw(0)}
                  >
                    Reset
                  </Button>
                  <Button
                    density="compact"
                    variant="outline"
                    onClick={() => setAssemblyYaw(assemblyYawDeg + 15)}
                  >
                    +15°
                  </Button>
                  <Button
                    density="compact"
                    variant="outline"
                    onClick={() => setAssemblyYaw(assemblyYawDeg + 180)}
                  >
                    Flip Profile Side
                  </Button>
                </>
              ) : null}
              {selectedObject?.parameters.length ? (
                <div
                  className={cn(
                    "flex h-8 items-center gap-2 pr-1",
                    tool === "rotate-profile" &&
                      selectedPath &&
                      "border-l border-border pl-3",
                  )}
                >
                  <span className="shrink-0 text-meta font-semibold uppercase tracking-wide text-muted-foreground">
                    Profile parameters
                  </span>
                  {selectedObject.parameters.map((parameter) => (
                    <label
                      key={parameter.id}
                      className="flex shrink-0 items-center gap-1.5"
                    >
                      <span>{parameter.name}</span>
                      <input
                        type="number"
                        min={parameter.minMm}
                        max={parameter.maxMm}
                        step="0.1"
                        value={assemblyProfileParameterValues[parameter.id]}
                        className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                        aria-label={`Sweep parameter ${parameter.name}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onClick={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setAssemblyProfileParameter(
                            parameter,
                            Number(event.target.value),
                          )
                        }
                      />
                      <span className="text-muted-foreground">mm</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border-2 bg-card px-2 hover:bg-surface-hover">
                <input
                  type="checkbox"
                  checked={
                    visibleResults.length === 0 && clearanceComparisonVisible
                  }
                  disabled={
                    visibleResults.length > 0 ||
                    assemblyFitClearanceMm <= 0 ||
                    !selectedPath?.closed
                  }
                  onChange={(event) =>
                    setClearanceComparisonVisible(event.target.checked)
                  }
                />
                Compare clearance
              </label>
              <label className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border-2 bg-card px-2">
                <span className="text-meta font-medium uppercase text-muted-foreground">
                  Clearance
                </span>
                <select
                  aria-label="Fit clearance direction"
                  value={assemblyFitClearanceDirection}
                  disabled={!selectedPath?.closed}
                  onChange={(event) =>
                    setAssemblyFitClearanceDirection(
                      event.target.value as FitClearanceDirection,
                    )
                  }
                  className="h-6 rounded border border-input bg-background px-1.5 text-body-sm font-semibold"
                >
                  <option value="outward">OUT</option>
                  <option value="inward">IN</option>
                </select>
              </label>
              <label className="flex h-8 shrink-0 items-center gap-1.5">
                <span className="text-meta font-medium uppercase text-muted-foreground">
                  Fit clearance
                </span>
                <input
                  type="number"
                  min="0"
                  max="5"
                  step="0.05"
                  value={assemblyFitClearanceMm}
                  className="h-8 w-20 rounded-md border border-input bg-background px-2 text-right font-mono tabular-nums outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Fit clearance"
                  disabled={!selectedPath || !selectedObject}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  onChange={(event) =>
                    setAssemblyFitClearance(Number(event.target.value))
                  }
                />
                <span className="text-muted-foreground">mm</span>
              </label>
              <div className="ml-1 border-l border-border pl-2">
                <label className="flex h-8 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border-2 bg-card px-2 hover:bg-surface-hover">
                  <input
                    type="checkbox"
                    checked={threeDGridVisible}
                    onChange={(event) =>
                      setThreeDGridVisible(event.target.checked)
                    }
                  />
                  Show printer area
                </label>
              </div>
            </div>
          </div>
          <div className="ml-2 flex shrink-0 items-center border-l border-border pl-2">
            <Button
              type="button"
              variant="destructive"
              density="compact"
              title="Delete selection"
              aria-label="Delete selection"
              className="w-8 px-0"
              disabled={!canDeleteLayerSelection || busy}
              onClick={() => setPendingLayerDelete(layerSelection)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
      {mode === "profile" ? (
        <div className="flex h-10 shrink-0 items-center border-b border-border-2 bg-surface-2 px-3 whitespace-nowrap">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2">
              {tool === "move" ? (
                <label className="flex items-center gap-2">
                  <span className="text-label font-semibold uppercase text-muted-foreground">
                    Fixed axis
                  </span>
                  <select
                    className="h-8 rounded-md border border-input bg-card px-2 text-body-sm"
                    value={moveAxis}
                    onChange={(event) =>
                      setMoveAxis(event.target.value as "x" | "y")
                    }
                  >
                    <option value="x">X only</option>
                    <option value="y">Z only</option>
                  </select>
                </label>
              ) : tool === "polygon" || tool === "bezier" ? (
                <label className="flex items-center gap-2">
                  <span className="text-label font-semibold uppercase text-muted-foreground">
                    New node
                  </span>
                  <NodeTypePicker
                    value={nodeCreationType}
                    onChange={setNodeCreationType}
                  />
                </label>
              ) : selectedObject ? (
                <>
                  {activeNode ? (
                    <>
                      <Badge>Point {selectedNode! + 1}</Badge>
                      <span className="text-label font-semibold uppercase text-muted-foreground">
                        Node
                      </span>
                      <NodeTypePicker
                        value={activeNode.nodeType}
                        onChange={setNodeType}
                      />
                      <span className="font-mono text-body-sm text-muted-foreground">
                        X {roundCoordinate(activeNode.xMm / printerUnitMm)}{" "}
                        {printerArea.unit} · Z{" "}
                        {roundCoordinate(activeNode.yMm / printerUnitMm)}{" "}
                        {printerArea.unit}
                      </span>
                      <Button
                        density="compact"
                        variant={
                          selectedObject.connectionNodeIndex === selectedNode
                            ? "default"
                            : "outline"
                        }
                        onClick={setConnectionPoint}
                        disabled={selectedState.locked}
                      >
                        <Magnet className="h-4 w-4" />
                        Set Connection Point
                      </Button>
                    </>
                  ) : activeSegment ? (
                    <>
                      <Badge>Segment {activeSegment.segmentIndex + 1}</Badge>
                      <Button
                        density="compact"
                        variant="outline"
                        disabled={selectedState.locked}
                        title="Switch fixed node"
                        aria-label={`Switch fixed node from Point ${activeSegment.fixedNodeIndex + 1}`}
                        onClick={() =>
                          setSelectedSegment((current) =>
                            current
                              ? {
                                  ...current,
                                  fixedNodeIndex:
                                    current.fixedNodeIndex ===
                                    activeSegment.segmentIndex
                                      ? activeSegment.endIndex
                                      : activeSegment.segmentIndex,
                                }
                              : null,
                          )
                        }
                      >
                        Fixed: Point {activeSegment.fixedNodeIndex + 1} ↔
                      </Button>
                      <label className="flex items-center gap-2">
                        <span className="text-label font-semibold uppercase text-muted-foreground">
                          Length
                        </span>
                        <input
                          key={`${selectedObject.id}-${activeSegment.segmentIndex}-${activeSegment.lengthMm}`}
                          type="number"
                          min="0.001"
                          step={printerArea.unit === "in" ? 0.01 : 0.1}
                          defaultValue={roundCoordinate(
                            activeSegment.lengthMm / printerUnitMm,
                          )}
                          className="h-8 w-24 rounded-md border border-input bg-card px-2 text-right font-mono text-body-sm"
                          aria-label="Selected segment length"
                          disabled={selectedState.locked}
                          onFocus={(event) => event.currentTarget.select()}
                          onClick={(event) => event.currentTarget.select()}
                          onBlur={(event) =>
                            setSelectedSegmentLength(Number(event.target.value))
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              event.currentTarget.blur();
                          }}
                        />
                        <span className="text-body-sm text-muted-foreground">
                          {printerArea.unit}
                        </span>
                      </label>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          {selectedObject &&
          tool !== "polygon" &&
          tool !== "bezier" &&
          tool !== "move" ? (
            <div className="ml-2 flex shrink-0 items-center gap-1 border-l border-border pl-2">
              <Button
                density="compact"
                variant="outline"
                className="w-8 px-0"
                title="Copy selected object (Ctrl/Cmd+C)"
                aria-label="Copy selected object"
                onClick={copySelectedProfile}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                density="compact"
                variant="outline"
                className="w-8 px-0"
                title={
                  profileClipboard
                    ? "Paste copied object (Ctrl/Cmd+V)"
                    : "Paste becomes available after copying a compatible object"
                }
                aria-label="Paste copied object"
                disabled={!profileClipboard || selectedState.locked}
                onClick={pasteProfile}
              >
                <ClipboardPaste className="h-4 w-4" />
              </Button>
              <Button
                density="compact"
                variant="destructive"
                className="w-8 px-0"
                title="Delete selection"
                aria-label="Delete selection"
                disabled={
                  selectedState.locked ||
                  (activeNode !== null && selectedObject.nodes.length <= 3)
                }
                onClick={() =>
                  activeNode
                    ? deleteSelectedProfileNode()
                    : setPendingLayerDelete({
                        type: "profile",
                        id: selectedObject.id,
                      })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {feedback ? (
        <div className="absolute left-1/2 top-24 z-40 w-[min(560px,90vw)] -translate-x-1/2">
          <FeedbackAlert feedback={feedback} />
        </div>
      ) : null}
      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns:
            mode === "profile"
              ? "56px minmax(0,1fr) 320px"
              : "56px minmax(0,1fr) 330px",
        }}
      >
        {mode === "profile" ? (
          <aside className="flex min-h-0 flex-col border-r border-border-2 bg-card py-2">
            <div className="flex shrink-0 flex-col items-center gap-2 px-2">
              <ThreeDToolButton
                active={tool === "select"}
                label="Select (V)"
                icon={MousePointer2}
                onClick={() => setTool("select")}
              />
              <ThreeDToolButton
                active={tool === "move"}
                label="Move · fixed X/Z axis; Ctrl/Cmd releases both axes (M)"
                icon={Move}
                onClick={() => setTool("move")}
              />
              <ThreeDToolButton
                active={tool === "pan"}
                label="Pan (H)"
                icon={Hand}
                onClick={() => setTool("pan")}
              />
              <ThreeDToolButton
                active={tool === "measure"}
                label="Measure distance"
                icon={Ruler}
                onClick={() => setTool("measure")}
              />
            </div>
            <div className="mx-3 my-2 h-px shrink-0 bg-border" />
            <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2">
              <ThreeDToolButton
                active={tool === "rectangle"}
                label="Rectangle profile (R)"
                icon={Square}
                disabled={activeTargetLocked}
                onClick={() => {
                  setMode("profile");
                  setTool("rectangle");
                }}
              />
              <ThreeDToolButton
                active={tool === "ellipse"}
                label="Ellipse profile (E)"
                icon={Circle}
                disabled={activeTargetLocked}
                onClick={() => {
                  setMode("profile");
                  setTool("ellipse");
                }}
              />
              <ThreeDToolButton
                active={tool === "polygon"}
                label="Polygon profile (P)"
                icon={PenLine}
                disabled={activeTargetLocked}
                onClick={() => {
                  setMode("profile");
                  setNodeCreationType("corner");
                  setTool("polygon");
                  setDraft([]);
                  setSelectedNode(null);
                }}
              />
              <ThreeDToolButton
                active={tool === "bezier"}
                label="Bezier profile (B)"
                icon={Spline}
                disabled={activeTargetLocked}
                onClick={() => {
                  setMode("profile");
                  setNodeCreationType("smooth");
                  setTool("bezier");
                  setDraft([]);
                  setSelectedNode(null);
                }}
              />
            </div>
          </aside>
        ) : null}
        {mode === "preview" ? (
          <aside className="flex min-h-0 flex-col items-center gap-2 border-r border-border-2 bg-card px-2 py-2">
            <ThreeDToolButton
              active={tool === "select"}
              label="Select"
              icon={MousePointer2}
              onClick={() => setTool("select")}
            />
            <ThreeDToolButton
              active={tool === "measure"}
              label="Measure distance on XY plane"
              icon={Ruler}
              disabled={!selectedPath}
              onClick={() => setTool("measure")}
            />
            <ThreeDToolButton
              active={tool === "move-printer-area"}
              label="Move printer area temporarily"
              icon={Grid3X3}
              onClick={() => setTool("move-printer-area")}
            />
            <ThreeDToolButton
              active={tool === "rotate-profile"}
              label="Rotate Profile"
              icon={RotateCw}
              disabled={!selectedObject || !selectedPath}
              onClick={activateProfileRotation}
            />
          </aside>
        ) : null}
        <main className="relative min-w-0 overflow-hidden bg-[var(--surface-2)]">
          {mode === "path" && selectedPath ? (
            <svg
              className="pointer-events-none absolute bottom-0 left-0 top-10 z-10"
              style={{
                width: "calc(100% - 18rem)",
                height: "calc(100% - 2.5rem)",
              }}
              viewBox={pathViewBox}
              preserveAspectRatio="xMidYMid meet"
              aria-hidden="true"
            >
              <ConnectionAxes
                node={selectedPath.nodes[selectedPath.connectionNodeIndex]}
                plane="path"
                scale={pathNodeRadius / 1.5}
              />
            </svg>
          ) : null}
          {mode === "profile" ? (
            <div className="grid h-full grid-cols-[52px_minmax(0,1fr)] grid-rows-[28px_minmax(0,1fr)]">
              <div className="border-b border-r border-border-2 bg-card" />
              <div className="relative overflow-hidden border-b border-border-2 bg-card text-[10px] text-muted-foreground">
                {horizontalRulerMarks.map((mark) => (
                  <span
                    key={mark}
                    className="absolute bottom-0 border-l border-border-strong pl-1"
                    style={{
                      left: `${((mark - profileViewBox.x) / profileViewBox.width) * 100}%`,
                    }}
                  >
                    {roundCoordinate(mark / printerUnitMm)} {printerArea.unit}
                  </span>
                ))}
              </div>
              <div className="relative overflow-hidden border-r border-border-2 bg-card text-[10px] text-muted-foreground">
                {verticalRulerMarks.map((mark) => (
                  <span
                    key={mark}
                    className="absolute right-0 border-t border-border-strong pr-1 pt-0.5"
                    style={{
                      top: `${((mark - profileViewBox.y) / profileViewBox.height) * 100}%`,
                    }}
                  >
                    {roundCoordinate(-mark / printerUnitMm)}
                  </span>
                ))}
              </div>
              <div
                ref={profileViewportRef}
                className="relative overflow-hidden"
              >
                <svg
                  ref={canvasRef}
                  className={cn(
                    "h-full w-full touch-none",
                    (tool === "polygon" || tool === "bezier") &&
                      "cursor-crosshair",
                    (tool === "pan" || panning) && "cursor-grab",
                    panning && "cursor-grabbing",
                    (tool === "rectangle" ||
                      tool === "ellipse" ||
                      tool === "measure") &&
                      "cursor-crosshair",
                  )}
                  viewBox={`${profileViewBox.x} ${profileViewBox.y} ${profileViewBox.width} ${profileViewBox.height}`}
                  preserveAspectRatio="none"
                  onPointerDown={canvasPointerDown}
                  onPointerMove={pointerMove}
                  onPointerUp={pointerUp}
                  onPointerCancel={pointerUp}
                  onDoubleClick={canvasDoubleClick}
                  onContextMenu={(event) => event.preventDefault()}
                  onWheel={(event) => {
                    event.preventDefault();
                    setZoom((value) =>
                      Math.max(
                        0.4,
                        Math.min(
                          PROFILE_MAX_ZOOM,
                          value * (event.deltaY < 0 ? 1.1 : 0.9),
                        ),
                      ),
                    );
                  }}
                >
                  <defs>
                    <pattern
                      id="profile-grid-small"
                      width={printerUnitMm}
                      height={printerUnitMm}
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d={`M ${printerUnitMm} 0 L 0 0 0 ${printerUnitMm}`}
                        fill="none"
                        stroke="var(--border)"
                        strokeWidth={gridMinorStroke}
                      />
                    </pattern>
                    <pattern
                      id="profile-grid"
                      width={majorGridMm}
                      height={majorGridMm}
                      patternUnits="userSpaceOnUse"
                    >
                      <rect
                        width={majorGridMm}
                        height={majorGridMm}
                        fill="url(#profile-grid-small)"
                      />
                      <path
                        d={`M ${majorGridMm} 0 L 0 0 0 ${majorGridMm}`}
                        fill="none"
                        stroke="var(--border-strong)"
                        strokeWidth={gridMajorStroke}
                      />
                    </pattern>
                  </defs>
                  <rect
                    x={profileViewBox.x}
                    y={profileViewBox.y}
                    width={profileViewBox.width}
                    height={profileViewBox.height}
                    fill="var(--surface-2)"
                    pointerEvents="all"
                  />
                  <rect
                    x={-printerArea.widthMm / 2}
                    y={-printerArea.heightMm / 2}
                    width={printerArea.widthMm}
                    height={printerArea.heightMm}
                    fill="url(#profile-grid)"
                    stroke="var(--primary)"
                    strokeWidth={printerBoundaryStroke}
                  />
                  <path
                    d={`M ${-printerArea.widthMm / 2} 0 H ${printerArea.widthMm / 2} M 0 ${-printerArea.heightMm / 2} V ${printerArea.heightMm / 2}`}
                    stroke="var(--border-strong)"
                    strokeWidth={gridMajorStroke}
                  />
                  {angularGuide ? (
                    <g pointerEvents="none">
                      <line
                        x1={profileViewBox.x}
                        y1={-angularGuide.anchor.yMm}
                        x2={profileViewBox.x + profileViewBox.width}
                        y2={-angularGuide.anchor.yMm}
                        stroke={
                          angularGuide.snapped
                            ? "var(--green-text)"
                            : "var(--ink-muted)"
                        }
                        strokeWidth={screenMmPerPixel * 1.25}
                        strokeDasharray={`${screenMmPerPixel * 5} ${screenMmPerPixel * 4}`}
                      />
                      <line
                        x1={angularGuide.anchor.xMm}
                        y1={profileViewBox.y}
                        x2={angularGuide.anchor.xMm}
                        y2={profileViewBox.y + profileViewBox.height}
                        stroke={
                          angularGuide.snapped
                            ? "var(--green-text)"
                            : "var(--ink-muted)"
                        }
                        strokeWidth={screenMmPerPixel * 1.25}
                        strokeDasharray={`${screenMmPerPixel * 5} ${screenMmPerPixel * 4}`}
                      />
                      <path
                        d={`M ${angularGuide.anchor.xMm} ${-angularGuide.anchor.yMm} L ${angularGuide.point.xMm} ${-angularGuide.point.yMm}`}
                        fill="none"
                        stroke={
                          angularGuide.snapped
                            ? "var(--green-text)"
                            : "var(--ink-muted)"
                        }
                        strokeWidth={screenMmPerPixel * 2}
                      />
                      <text
                        x={angularGuide.anchor.xMm + screenMmPerPixel * 7}
                        y={-angularGuide.anchor.yMm - screenMmPerPixel * 7}
                        fill={
                          angularGuide.snapped
                            ? "var(--green-text)"
                            : "var(--ink-muted)"
                        }
                        stroke="var(--surface-2)"
                        strokeWidth={screenMmPerPixel * 3}
                        paintOrder="stroke"
                        fontSize={profileMeasurementFont}
                        fontWeight="600"
                      >
                        X / Z · {angularGuide.angleDeg}°
                      </text>
                    </g>
                  ) : null}
                  {visibleProfileContours.map((contour) => {
                    const state = objectLayerState(document, contour.id);
                    if (!state.visible) return null;
                    const selected = contour.id === selectedObjectId;
                    return (
                      <g key={contour.id}>
                        <path
                          d={profilePath(contour)}
                          fill={
                            selected
                              ? "color-mix(in srgb, var(--primary) 24%, transparent)"
                              : "color-mix(in srgb, var(--purple-text) 14%, transparent)"
                          }
                          fillRule="evenodd"
                          stroke={
                            selected ? "var(--amber-text)" : "var(--primary)"
                          }
                          strokeWidth={screenMmPerPixel * (selected ? 2 : 1.5)}
                        />
                        {contour.nodes.map((node, index) => {
                          const end =
                            contour.nodes[(index + 1) % contour.nodes.length];
                          if (
                            node.handleOut ||
                            end.handleIn ||
                            profileSegmentSnapAngle(node, end) === null
                          )
                            return null;
                          return (
                            <path
                              key={`segment-snap-${index}`}
                              d={`M ${node.xMm} ${-node.yMm} L ${end.xMm} ${-end.yMm}`}
                              fill="none"
                              stroke="var(--green-text)"
                              strokeWidth={
                                screenMmPerPixel * (selected ? 2.75 : 2.25)
                              }
                              pointerEvents="none"
                            />
                          );
                        })}
                        <path
                          d={profilePath(contour)}
                          fill="transparent"
                          stroke="transparent"
                          strokeWidth={profileHitStroke}
                          pointerEvents="all"
                          onPointerDown={(event) =>
                            objectPointerDown(event, contour.id)
                          }
                        />
                        {contour.nodes.map((node, index) => {
                          const end =
                            contour.nodes[(index + 1) % contour.nodes.length];
                          if (node.handleOut || end.handleIn) return null;
                          return (
                            <path
                              key={`segment-hit-${index}`}
                              d={`M ${node.xMm} ${-node.yMm} L ${end.xMm} ${-end.yMm}`}
                              fill="none"
                              stroke="transparent"
                              strokeWidth={profileHitStroke}
                              pointerEvents="stroke"
                              onPointerDown={(event) =>
                                objectPointerDown(event, contour.id, index)
                              }
                            />
                          );
                        })}
                        {selected
                          ? contour.nodes.map((node, index) => (
                              <circle
                                key={index}
                                cx={node.xMm}
                                cy={-node.yMm}
                                r={
                                  selectedNode === index
                                    ? profileSelectedNodeRadius
                                    : profileNodeRadius
                                }
                                fill={
                                  selectedNode === index
                                    ? "var(--amber-text)"
                                    : "var(--surface)"
                                }
                                stroke="var(--primary)"
                                strokeWidth={profileNodeStroke}
                                onPointerDown={(event) =>
                                  nodePointerDown(event, contour.id, index)
                                }
                              />
                            ))
                          : null}
                        <ConnectionAxes
                          node={contour.nodes[contour.connectionNodeIndex]}
                          plane="profile"
                          scale={profileConnectionScale}
                        />
                      </g>
                    );
                  })}
                  {selectedObject && activeParameter ? (
                    <g>
                      {activeParameter.fixedNodeIndices.map((index) => {
                        const node = selectedObject.nodes[index];
                        return node ? (
                          <circle
                            key={`parameter-fixed-${index}`}
                            cx={node.xMm}
                            cy={-node.yMm}
                            r={profileSelectedNodeRadius}
                            fill="var(--red-text)"
                            stroke="var(--surface)"
                            strokeWidth={profileNodeStroke}
                            onPointerDown={(event) =>
                              nodePointerDown(event, selectedObject.id, index)
                            }
                          />
                        ) : null;
                      })}
                      {activeParameter.controlNodeIndices.map((index) => {
                        const node = selectedObject.nodes[index];
                        return node ? (
                          <circle
                            key={`parameter-control-${index}`}
                            cx={node.xMm}
                            cy={-node.yMm}
                            r={profileSelectedNodeRadius}
                            fill="var(--green-text)"
                            stroke="var(--surface)"
                            strokeWidth={profileNodeStroke}
                            onPointerDown={(event) =>
                              nodePointerDown(event, selectedObject.id, index)
                            }
                          />
                        ) : null;
                      })}
                      {activeParameter.followerNodeIndices.map((index) => {
                        const node = selectedObject.nodes[index];
                        return node ? (
                          <circle
                            key={`parameter-follower-${index}`}
                            cx={node.xMm}
                            cy={-node.yMm}
                            r={profileSelectedNodeRadius}
                            fill="var(--purple-text)"
                            stroke="var(--surface)"
                            strokeWidth={profileNodeStroke}
                            onPointerDown={(event) =>
                              nodePointerDown(event, selectedObject.id, index)
                            }
                          />
                        ) : null;
                      })}
                    </g>
                  ) : null}
                  {profileEditorPreview &&
                  activeParameter &&
                  (parameterPreviewValues[activeParameter.id] ??
                    activeParameter.defaultMm) !== activeParameter.defaultMm ? (
                    <path
                      d={profilePath(profileEditorPreview)}
                      fill="none"
                      stroke="var(--green-text)"
                      strokeWidth={screenMmPerPixel * 2.5}
                      strokeDasharray={`${screenMmPerPixel * 6} ${screenMmPerPixel * 4}`}
                      pointerEvents="none"
                    />
                  ) : null}
                  {activeSegment ? (
                    <>
                      <path
                        d={`M ${activeSegment.start.xMm} ${-activeSegment.start.yMm} L ${activeSegment.end.xMm} ${-activeSegment.end.yMm}`}
                        fill="none"
                        stroke="var(--primary)"
                        strokeWidth={screenMmPerPixel * 3.5}
                        pointerEvents="none"
                      />
                      <circle
                        cx={activeSegment.fixedNode.xMm}
                        cy={-activeSegment.fixedNode.yMm}
                        r={profileSelectedNodeRadius * 1.45}
                        fill="none"
                        stroke="var(--amber-text)"
                        strokeWidth={profileNodeStroke * 1.5}
                        pointerEvents="none"
                      />
                    </>
                  ) : null}
                  {activeNode?.handleIn ? (
                    <g>
                      <path
                        d={`M ${activeNode.xMm} ${-activeNode.yMm} L ${activeNode.xMm + activeNode.handleIn.xMm} ${-(activeNode.yMm + activeNode.handleIn.yMm)}`}
                        stroke="var(--ink-muted)"
                        strokeWidth={screenMmPerPixel}
                      />
                      <circle
                        cx={activeNode.xMm + activeNode.handleIn.xMm}
                        cy={-(activeNode.yMm + activeNode.handleIn.yMm)}
                        r={profileHandleRadius}
                        fill="var(--surface)"
                        stroke="var(--purple-text)"
                        strokeWidth={profileNodeStroke}
                        onPointerDown={(event) =>
                          handlePointerDown(event, "handleIn")
                        }
                      />
                    </g>
                  ) : null}
                  {activeNode?.handleOut ? (
                    <g>
                      <path
                        d={`M ${activeNode.xMm} ${-activeNode.yMm} L ${activeNode.xMm + activeNode.handleOut.xMm} ${-(activeNode.yMm + activeNode.handleOut.yMm)}`}
                        stroke="var(--ink-muted)"
                        strokeWidth={screenMmPerPixel}
                      />
                      <circle
                        cx={activeNode.xMm + activeNode.handleOut.xMm}
                        cy={-(activeNode.yMm + activeNode.handleOut.yMm)}
                        r={profileHandleRadius}
                        fill="var(--surface)"
                        stroke="var(--purple-text)"
                        strokeWidth={profileNodeStroke}
                        onPointerDown={(event) =>
                          handlePointerDown(event, "handleOut")
                        }
                      />
                    </g>
                  ) : null}
                  {draft.length ? (
                    <>
                      <path
                        d={`M ${draft.map((node) => `${node.xMm} ${-node.yMm}`).join(" L ")}`}
                        fill="none"
                        stroke="var(--amber-text)"
                        strokeWidth={screenMmPerPixel * 1.5}
                        strokeDasharray={`${screenMmPerPixel * 4} ${screenMmPerPixel * 4}`}
                      />
                      {draft.map((node, index) => (
                        <circle
                          key={index}
                          cx={node.xMm}
                          cy={-node.yMm}
                          r={profileNodeRadius}
                          fill="var(--amber-text)"
                        />
                      ))}
                    </>
                  ) : null}
                  {primitivePath ? (
                    <path
                      d={primitivePath}
                      fill="color-mix(in srgb, var(--primary) 12%, transparent)"
                      stroke="var(--amber-text)"
                      strokeWidth={screenMmPerPixel * 1.5}
                      strokeDasharray={`${screenMmPerPixel * 4} ${screenMmPerPixel * 4}`}
                    />
                  ) : null}
                  {measurement ? (
                    <g>
                      <path
                        d={`M ${measurement.start.xMm} ${-measurement.start.yMm} L ${measurement.current.xMm} ${-measurement.current.yMm}`}
                        stroke="var(--amber-text)"
                        strokeWidth={screenMmPerPixel * 1.5}
                      />
                      <text
                        x={
                          (measurement.start.xMm + measurement.current.xMm) / 2
                        }
                        y={
                          -(measurement.start.yMm + measurement.current.yMm) /
                            2 -
                          profileMeasurementFont * 0.7
                        }
                        fill="var(--amber-text)"
                        stroke="var(--surface)"
                        strokeWidth={screenMmPerPixel * 3}
                        paintOrder="stroke"
                        strokeLinejoin="round"
                        fontSize={profileMeasurementFont}
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {Math.hypot(
                          measurement.current.xMm - measurement.start.xMm,
                          measurement.current.yMm - measurement.start.yMm,
                        ).toFixed(2)}{" "}
                        mm
                      </text>
                    </g>
                  ) : null}
                </svg>
                {tool === "polygon" || tool === "bezier" ? (
                  <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-body-sm shadow">
                    <span>{draft.length} nodes</span>
                    <Button
                      density="compact"
                      onClick={finishDraft}
                      disabled={draft.length < 3}
                    >
                      <Check className="h-4 w-4" />
                      Close profile
                    </Button>
                    <Button
                      density="compact"
                      variant="ghost"
                      className="w-8 px-0"
                      aria-label="Cancel drawing"
                      onClick={() => {
                        setDraft([]);
                        setTool("select");
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : mode === "path" ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-3 text-body-sm">
                <span className="font-semibold">Fabrication Plans</span>
                <span className="text-muted-foreground">
                  Canonical Model Paths · editable snapshot
                </span>
                <span className="ml-auto text-muted-foreground">
                  {document.modelPaths.length} path(s)
                </span>
              </div>
              <div className="flex min-h-0 flex-1">
                <div className="relative flex-1 overflow-hidden">
                  <svg
                    ref={canvasRef}
                    className={cn(
                      "h-full w-full touch-none",
                      (tool === "pan" || panning) && "cursor-grab",
                      panning && "cursor-grabbing",
                      tool === "measure" && "cursor-crosshair",
                    )}
                    viewBox={pathViewBox}
                    onPointerDown={canvasPointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={pointerUp}
                    onDoubleClick={canvasDoubleClick}
                    onContextMenu={(event) => event.preventDefault()}
                    onWheel={(event) => {
                      event.preventDefault();
                      setZoom((value) =>
                        Math.max(
                          0.4,
                          Math.min(12, value * (event.deltaY < 0 ? 1.1 : 0.9)),
                        ),
                      );
                    }}
                  >
                    <rect
                      x={-10000}
                      y={-10000}
                      width={20000}
                      height={20000}
                      fill="var(--surface-2)"
                      pointerEvents="all"
                    />
                    {document.modelPaths
                      .filter((path) => path.visible)
                      .map((path) => {
                        const selected = selectedPathId === path.id;
                        return (
                          <g key={path.id}>
                            <path
                              d={modelPathData(path)}
                              fill="none"
                              stroke={
                                selected
                                  ? "var(--amber-text)"
                                  : "var(--primary)"
                              }
                              strokeWidth={selected ? 2 : 1}
                              vectorEffect="non-scaling-stroke"
                            />
                            <path
                              d={modelPathData(path)}
                              fill="none"
                              stroke="transparent"
                              strokeWidth="12"
                              vectorEffect="non-scaling-stroke"
                              pointerEvents="stroke"
                              onPointerDown={(event) =>
                                pathPointerDown(event, path.id)
                              }
                            />
                            {selected
                              ? path.nodes.map((node, index) => (
                                  <circle
                                    key={index}
                                    cx={node.xMm}
                                    cy={-node.yMm}
                                    r={
                                      selectedNode === index
                                        ? pathNodeRadius * 1.35
                                        : pathNodeRadius
                                    }
                                    fill={
                                      selectedNode === index
                                        ? "var(--amber-text)"
                                        : "var(--surface)"
                                    }
                                    stroke="var(--primary)"
                                    strokeWidth={pathNodeRadius * 0.3}
                                    onPointerDown={(event) =>
                                      pathNodePointerDown(event, path.id, index)
                                    }
                                  />
                                ))
                              : null}
                          </g>
                        );
                      })}
                    {sweepDiagnostic ? (
                      <g pointerEvents="none">
                        {sweepDiagnostic.candidates.map((candidate, index) => (
                          <g key={candidate.nodeIndex}>
                            <circle
                              cx={candidate.xMm}
                              cy={-candidate.yMm}
                              r={pathNodeRadius * 3.2}
                              fill="var(--amber-text)"
                              fillOpacity=".2"
                              stroke="var(--red-text)"
                              strokeWidth={pathNodeRadius * 0.65}
                            />
                            <text
                              x={candidate.xMm}
                              y={-candidate.yMm + pathNodeRadius}
                              fill="var(--red-text)"
                              fontSize={pathNodeRadius * 3}
                              fontWeight="700"
                              textAnchor="middle"
                            >
                              {index + 1}
                            </text>
                          </g>
                        ))}
                      </g>
                    ) : null}
                    {activeNode?.handleIn ? (
                      <g>
                        <path
                          d={`M ${activeNode.xMm} ${-activeNode.yMm} L ${activeNode.xMm + activeNode.handleIn.xMm} ${-(activeNode.yMm + activeNode.handleIn.yMm)}`}
                          stroke="var(--ink-muted)"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle
                          cx={activeNode.xMm + activeNode.handleIn.xMm}
                          cy={-(activeNode.yMm + activeNode.handleIn.yMm)}
                          r={pathNodeRadius}
                          fill="var(--surface)"
                          stroke="var(--purple-text)"
                          strokeWidth={pathNodeRadius * 0.3}
                          onPointerDown={(event) =>
                            handlePointerDown(event, "handleIn")
                          }
                        />
                      </g>
                    ) : null}
                    {activeNode?.handleOut ? (
                      <g>
                        <path
                          d={`M ${activeNode.xMm} ${-activeNode.yMm} L ${activeNode.xMm + activeNode.handleOut.xMm} ${-(activeNode.yMm + activeNode.handleOut.yMm)}`}
                          stroke="var(--ink-muted)"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                        <circle
                          cx={activeNode.xMm + activeNode.handleOut.xMm}
                          cy={-(activeNode.yMm + activeNode.handleOut.yMm)}
                          r={pathNodeRadius}
                          fill="var(--surface)"
                          stroke="var(--purple-text)"
                          strokeWidth={pathNodeRadius * 0.3}
                          onPointerDown={(event) =>
                            handlePointerDown(event, "handleOut")
                          }
                        />
                      </g>
                    ) : null}
                    {measurement ? (
                      <g>
                        <path
                          d={`M ${measurement.start.xMm} ${-measurement.start.yMm} L ${measurement.current.xMm} ${-measurement.current.yMm}`}
                          stroke="var(--amber-text)"
                          strokeWidth="1"
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={
                            (measurement.start.xMm + measurement.current.xMm) /
                            2
                          }
                          y={
                            -(measurement.start.yMm + measurement.current.yMm) /
                              2 -
                            pathNodeRadius * 2
                          }
                          fill="var(--amber-text)"
                          fontSize={pathNodeRadius * 3}
                          textAnchor="middle"
                        >
                          {Math.hypot(
                            measurement.current.xMm - measurement.start.xMm,
                            measurement.current.yMm - measurement.start.yMm,
                          ).toFixed(2)}{" "}
                          mm
                        </text>
                      </g>
                    ) : null}
                  </svg>
                </div>
                <div className="w-72 overflow-y-auto border-l bg-card p-2">
                  {document.modelPaths.map((path) => (
                    <button
                      type="button"
                      key={path.id}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-body-sm hover:bg-surface-hover",
                        selectedPathId === path.id &&
                          "bg-blue-600 text-white hover:bg-blue-600",
                      )}
                      onClick={() => selectSweepPath(path.id)}
                    >
                      <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />
                      <span className="min-w-0 flex-1 truncate">
                        {path.name}
                      </span>
                      <span className="text-meta opacity-70">
                        {path.nodes.length} nodes
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <ThreeDWorkspaceViewport
              projectId={project.id}
              results={visibleResults}
              selectedResultId={selectedSolidObjectId}
              paths={document.modelPaths}
              path={selectedPath}
              profile={resolvedAssemblyProfile}
              pathVisible={selectedPath?.visible !== false}
              profileVisible={selectedState.visible}
              yawDeg={assemblyYawDeg}
              fitClearanceMm={displayedFitClearanceMm}
              fitClearanceDirection={displayedFitClearanceDirection}
              gridVisible={threeDGridVisible}
              clearanceComparisonVisible={clearanceComparisonVisible}
              printerArea={printerArea}
              gridStepMm={printerUnitMm}
              printerAreaMoveActive={tool === "move-printer-area"}
              measureActive={tool === "measure"}
              measureResetRequest={threeDMeasureResetRequest}
              snapEnabled={snap}
              snapMm={document.setup.snapMm}
              riskCandidates={
                showSweepRiskMarkers ? (sweepDiagnostic?.candidates ?? []) : []
              }
              focusRiskNodeIndex={riskFocus?.nodeIndex ?? null}
              focusRiskRequest={riskFocus?.requestId ?? 0}
              onResultSelectionChange={(id) => {
                setSelectedSolidObjectId(id);
                if (id) {
                  setActiveJobId(id);
                  setLayerSelection({ type: "solid", id });
                }
              }}
              viewStateRef={threeDViewStateRef}
            />
          )}
        </main>
        {mode === "profile" ? (
          <aside className="min-h-0 overflow-y-auto border-l border-border-2 bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="text-label font-semibold uppercase text-muted-foreground">
                Profile parameters
              </div>
              <Button
                density="compact"
                className="w-8 px-0"
                aria-label="Add Profile parameter"
                title="Add Profile parameter"
                disabled={
                  !selectedObject ||
                  selectedState.locked ||
                  selectedObject.parameters.length >= 16
                }
                onClick={addProfileParameter}
              >
                +
              </Button>
            </div>
            {!selectedObject ? (
              <div className="mt-4 text-body-sm text-muted-foreground">
                Select a Profile to define its parameters.
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                <div className="space-y-1">
                  {selectedObject.parameters.map((parameter) => (
                    <button
                      type="button"
                      key={parameter.id}
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border px-2 py-2 text-left text-body-sm",
                        activeParameter?.id === parameter.id
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-border hover:bg-surface-hover",
                      )}
                      onClick={() => {
                        setSelectedParameterId(parameter.id);
                        setParameterGroupMode(null);
                      }}
                    >
                      <span className="truncate font-medium">
                        {parameter.name}
                      </span>
                      <span className="font-mono text-meta text-muted-foreground">
                        {parameter.axis === "x" ? "X" : "Z"} ·{" "}
                        {parameter.defaultMm} mm
                      </span>
                    </button>
                  ))}
                  {!selectedObject.parameters.length ? (
                    <div className="rounded-md border border-dashed p-3 text-body-sm text-muted-foreground">
                      Add Height, Wall width, or another linear parameter.
                    </div>
                  ) : null}
                </div>
                {activeParameter ? (
                  <div className="space-y-2 border-t border-border pt-2">
                    <label className="block text-body-sm">
                      Name
                      <input
                        key={`${activeParameter.id}:name:${activeParameter.name}`}
                        defaultValue={activeParameter.name}
                        maxLength={80}
                        className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2"
                        onBlur={(event) =>
                          patchProfileParameter(activeParameter.id, {
                            name:
                              event.target.value.trim() || activeParameter.name,
                          })
                        }
                      />
                    </label>
                    <label className="block text-body-sm">
                      Axis
                      <select
                        value={activeParameter.axis}
                        className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2"
                        onChange={(event) =>
                          patchProfileParameter(activeParameter.id, {
                            axis: event.target.value as "x" | "y",
                          })
                        }
                      >
                        <option value="y">Z · height</option>
                        <option value="x">X · width</option>
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-body-sm">
                        Minimum
                        <input
                          type="number"
                          min="0.01"
                          max={activeParameter.defaultMm}
                          step="0.1"
                          value={activeParameter.minMm}
                          className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 font-mono"
                          onChange={(event) =>
                            patchProfileParameter(activeParameter.id, {
                              minMm: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="text-body-sm">
                        Maximum
                        <input
                          type="number"
                          min={activeParameter.defaultMm}
                          max="2000"
                          step="0.1"
                          value={activeParameter.maxMm}
                          className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 font-mono"
                          onChange={(event) =>
                            patchProfileParameter(activeParameter.id, {
                              maxMm: Number(event.target.value),
                            })
                          }
                        />
                      </label>
                    </div>
                    <div>
                      <div className="mb-1 text-label font-semibold uppercase text-muted-foreground">
                        Node groups
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <div className="mb-1 text-center text-meta text-muted-foreground">
                            Fixed
                          </div>
                          <Button
                            density="compact"
                            className="w-full font-mono"
                            aria-label="Select Fixed nodes"
                            variant={
                              parameterGroupMode === "fixed"
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              setParameterGroupMode((current) =>
                                current === "fixed" ? null : "fixed",
                              )
                            }
                          >
                            {activeParameter.fixedNodeIndices.length}
                          </Button>
                        </div>
                        <div>
                          <div className="mb-1 text-center text-meta text-muted-foreground">
                            Control
                          </div>
                          <Button
                            density="compact"
                            className="w-full font-mono"
                            aria-label="Select Control nodes"
                            variant={
                              parameterGroupMode === "control"
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              setParameterGroupMode((current) =>
                                current === "control" ? null : "control",
                              )
                            }
                          >
                            {activeParameter.controlNodeIndices.length}
                          </Button>
                        </div>
                        <div>
                          <div className="mb-1 text-center text-meta text-muted-foreground">
                            Followers
                          </div>
                          <Button
                            density="compact"
                            className="w-full font-mono"
                            aria-label="Select Follower nodes"
                            variant={
                              parameterGroupMode === "follower"
                                ? "default"
                                : "outline"
                            }
                            onClick={() =>
                              setParameterGroupMode((current) =>
                                current === "follower" ? null : "follower",
                              )
                            }
                          >
                            {activeParameter.followerNodeIndices.length}
                          </Button>
                        </div>
                      </div>
                    </div>
                    <label className="block text-body-sm">
                      Preview value
                      <input
                        type="number"
                        min={activeParameter.minMm}
                        max={activeParameter.maxMm}
                        step="0.1"
                        value={
                          parameterPreviewValues[activeParameter.id] ??
                          activeParameter.defaultMm
                        }
                        className="mt-1 h-8 w-full rounded-md border border-input bg-card px-2 font-mono"
                        onChange={(event) =>
                          setParameterPreviewValues((current) => ({
                            ...current,
                            [activeParameter.id]: Math.max(
                              activeParameter.minMm,
                              Math.min(
                                activeParameter.maxMm,
                                Number(event.target.value) ||
                                  activeParameter.defaultMm,
                              ),
                            ),
                          }))
                        }
                      />
                    </label>
                    <Button
                      density="compact"
                      variant="destructive"
                      className="w-full"
                      onClick={() => deleteProfileParameter(activeParameter.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete parameter
                    </Button>
                    {!activeParameter.fixedNodeIndices.length ||
                    !activeParameter.controlNodeIndices.length ? (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-2 text-meta text-amber-700 dark:text-amber-300">
                        Select at least one Fixed node and one Control node
                        before saving. Followers are optional.
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </aside>
        ) : null}
        {mode === "preview" ? (
          <ThreeDLayersPanel
            document={document}
            availablePlans={availablePlans}
            selectedObjectId={selectedObjectId}
            selectedPathId={selectedPathId}
            solidObjects={solidObjects}
            selectedSolidObjectId={selectedSolidObjectId}
            activeTarget={activeLayerTarget}
            onSelectObject={selectSweepProfile}
            onSelectPath={selectSweepPath}
            onSelectSolidObject={(id) => {
              const job = jobs.find((item) => item.id === id);
              const sweep = document.sweeps.find(
                (item) => item.id === job?.sweepId,
              );
              setActiveJobId(id);
              setSelectedSolidObjectId(id);
              setLayerSelection({ type: "solid", id });
              setVisibleSolidObjectIds((current) => new Set(current).add(id));
              if (sweep) {
                setSelectedPathId(sweep.pathId);
                setSelectedObjectId(sweep.profileId);
                setAssemblyDraft({
                  profileId: sweep.profileId,
                  pathId: sweep.pathId,
                  yawDeg: sweep.profileConnection.yawDeg,
                  fitClearanceMm: job?.fitClearanceMm ?? 0,
                  fitClearanceDirection:
                    job?.fitClearanceDirection ?? sweep.fitClearanceDirection,
                });
              }
              setMode("preview");
            }}
            onSetAllVisibility={(visible) => {
              mutate((next) => {
                next.modelPaths.forEach((path) => {
                  path.visible = visible;
                });
                next.profile.contours.forEach((contour) => {
                  contour.visible = visible;
                });
              });
              setVisibleSolidObjectIds(
                visible ? new Set(solidObjects.map((solid) => solid.id)) : new Set(),
              );
              if (!visible) setSelectedSolidObjectId(null);
            }}
            onSetAllPathVisibility={(visible) =>
              mutate((next) => {
                next.modelPaths.forEach((path) => {
                  path.visible = visible;
                });
              })
            }
            onSetAllSolidObjectVisibility={(visible) => {
              setVisibleSolidObjectIds(
                visible ? new Set(solidObjects.map((solid) => solid.id)) : new Set(),
              );
              if (!visible) setSelectedSolidObjectId(null);
            }}
            onToggleSolidObjectVisibility={(id) => {
              setVisibleSolidObjectIds((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
              if (selectedSolidObjectId === id) setSelectedSolidObjectId(null);
            }}
            onRenameSolidObject={renameSolidObject}
            onImportPlan={importFabricationPlan}
            onActivateTarget={setActiveLayerTarget}
            onAddFolder={() =>
              mutate((next) => next.layers.folders.push(nextLayerFolder(next)))
            }
            onPatchFolder={(id, patch) =>
              mutate((next) => {
                const folder = next.layers.folders.find(
                  (entry) => entry.id === id,
                );
                if (folder) Object.assign(folder, patch);
              })
            }
            onDeleteFolder={(id) => {
              mutate((next) => {
                next.layers.folders = next.layers.folders.filter(
                  (folder) => folder.id !== id || folder.objectIds.length > 0,
                );
              });
              if (
                activeLayerTarget?.type === "folder" &&
                activeLayerTarget.id === id
              )
                setActiveLayerTarget(null);
            }}
            onPatchObject={(id, patch) =>
              mutate((next) => {
                const object = next.profile.contours.find(
                  (contour) => contour.id === id,
                );
                if (object) Object.assign(object, patch);
              })
            }
            onPatchPath={(id, patch) =>
              mutate((next) => {
                const path = next.modelPaths.find((item) => item.id === id);
                if (path) Object.assign(path, patch);
              })
            }
            onMoveObject={(id, target, beforeId) => {
              const targetLocked =
                target.type === "folder" &&
                document.layers.folders.find(
                  (folder) => folder.id === target.id,
                )?.locked;
              if (objectLayerState(document, id).locked || targetLocked) return;
              mutate((next) => assignObjectToLayer(next, id, target, beforeId));
            }}
          />
        ) : null}
      </div>
      <Modal
        open={
          openSweepErrorsJobId !== null &&
          openSweepErrorsJobId === diagnosticJob?.id &&
          sweepDiagnostic !== null
        }
        title="Sweep errors"
        description="Review the last failed Sweep without reducing the 3D canvas workspace."
        onClose={() => setOpenSweepErrorsJobId(null)}
        closeOnBackdrop
        className="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-body-sm">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {sweepDiagnostic?.title}
            </div>
            <div className="mt-1 text-muted-foreground">
              {diagnosticJob?.errorSummary ?? sweepDiagnostic?.summary}
            </div>
            {diagnosticJob?.errorSummary ? (
              <div className="mt-1 text-muted-foreground">
                {sweepDiagnostic?.summary}
              </div>
            ) : null}
          </div>
          <div className="space-y-2">
            {sweepDiagnostic?.candidates.map((candidate, index) => (
              <button
                type="button"
                className="block w-full rounded-md border border-border px-3 py-2 text-left text-body-sm hover:border-amber-500/50 hover:bg-amber-500/10"
                key={candidate.nodeIndex}
                onClick={() => showSweepRiskIn3D(candidate.nodeIndex)}
              >
                <span className="font-medium text-foreground">
                  Candidate #{index + 1} · Node {candidate.nodeIndex + 1} ·{" "}
                  {candidate.adjacentSegmentMm.toFixed(2)} mm segment ·{" "}
                  {candidate.turnDeg.toFixed(1)}° turn
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  {candidate.reason}
                </span>
                <span className="mt-1 block font-medium text-amber-600 dark:text-amber-300">
                  Show in 3D
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-md bg-surface-2 px-3 py-2 text-body-sm text-muted-foreground">
            <span className="font-medium text-foreground">Suggestions: </span>
            {sweepDiagnostic?.suggestions.join(" ")}
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenSweepErrorsJobId(null)}
            >
              Close
            </Button>
            {sweepDiagnostic ? (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  showSweepRiskIn3D(sweepDiagnostic.candidates[0].nodeIndex)
                }
              >
                Show #1 in 3D
              </Button>
            ) : null}
            {document.setup.cornerPolicy === "round" ? (
              <Button
                type="button"
                onClick={() => {
                  mutate((next) => {
                    next.setup.cornerPolicy = "miter";
                  });
                  setOpenSweepErrorsJobId(null);
                  setFeedback({
                    type: "success",
                    message:
                      "Corner transition changed to Miter. Save or run Sweep to validate the corrected setup.",
                  });
                }}
              >
                Use Miter
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setAssemblyYaw(assemblyYawDeg + 180);
                  setOpenSweepErrorsJobId(null);
                }}
              >
                Flip Profile Side
              </Button>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        open={pendingProfileSave !== null}
        title="Profile geometry warning"
        description="Review these geometry problems before saving the 3D document."
        onClose={() => setPendingProfileSave(null)}
        closeOnBackdrop
        className="max-w-2xl"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-amber-500/30 bg-[var(--amber-bg)] px-4 py-3 text-body-sm text-[var(--amber-text)]">
            <div className="font-semibold">
              The Profile may fail during Sweep.
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {pendingProfileSave?.validation.issues.map((issue, index) => (
                <li key={`${issue.contourId}:${issue.code}:${index}`}>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
          <div className="text-body-sm text-muted-foreground">
            Correct automatically resolves crossings with the even-odd rule and
            removes smaller crossing loops. Save anyway preserves the geometry
            exactly as drawn.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingProfileSave(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => finishProfileSave("saved-anyway")}
            >
              Save anyway
            </Button>
            <Button
              type="button"
              disabled={!pendingProfileSave?.validation.canAutoCorrect}
              title={
                pendingProfileSave?.validation.canAutoCorrect
                  ? "Correct Profile geometry and save"
                  : "These problems cannot all be corrected automatically"
              }
              onClick={() => finishProfileSave("corrected")}
            >
              Correct automatically
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={pendingLayerDelete !== null}
        title="Confirm delete"
        description="This action deletes the selected component."
        onClose={() => setPendingLayerDelete(null)}
        closeOnBackdrop
        className="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-md border border-destructive/30 bg-[var(--red-bg)] px-3 py-3 text-body-sm text-[var(--red-text)]">
            You are about to delete{" "}
            <span className="font-medium">
              {pendingLayerName ?? "this component"}
            </span>
            . Related Sweep data will also be removed when applicable.
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPendingLayerDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={confirmLayerDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
