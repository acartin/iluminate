"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Box, BoxSelect, Download, Maximize2, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/addons/loaders/3MFLoader.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ViewDirection = "iso" | "front" | "top" | "right";

export function ThreeDModelViewer({ project, resultId }: { project: { id: string; name: string }; resultId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const radiusRef = useRef(100);
  const targetZRef = useRef(0);
  const [gridVisible, setGridVisible] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [format, setFormat] = useState<"3MF" | "STL" | null>(null);
  const [dimensions, setDimensions] = useState({ x: 0, y: 0, z: 0 });

  const setView = useCallback((view: ViewDirection) => {
    const camera = cameraRef.current; const controls = controlsRef.current;
    if (!camera || !controls) return;
    const distance = radiusRef.current * 2.7;
    const direction = view === "front" ? new THREE.Vector3(0, -1, .15) : view === "top" ? new THREE.Vector3(0, 0, 1) : view === "right" ? new THREE.Vector3(1, 0, .15) : new THREE.Vector3(1, -1, .8);
    const target = new THREE.Vector3(0, 0, targetZRef.current);
    camera.position.copy(target).add(direction.normalize().multiplyScalar(distance));
    camera.up.set(0, 0, 1); controls.target.copy(target); controls.update();
  }, []);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let disposed = false; let frame: number | null = null;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(document.documentElement.classList.contains("dark") ? 0x101826 : 0xf1f5f9);
    const camera = new THREE.PerspectiveCamera(42, 1, .01, 100000); camera.up.set(0, 0, 1); cameraRef.current = camera;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.dampingFactor = .08; controls.zoomToCursor = true; controls.maxPolarAngle = Math.PI; controlsRef.current = controls;
    const render = () => { frame = null; controls.update(); renderer.render(scene, camera); };
    const invalidate = () => { if (frame === null) frame = window.requestAnimationFrame(render); };
    invalidateRef.current = invalidate;
    controls.addEventListener("change", invalidate);
    const grid = new THREE.GridHelper(1000, 100, 0x64748b, 0x334155); grid.rotation.x = Math.PI / 2; gridRef.current = grid; scene.add(grid);
    const axes = new THREE.AxesHelper(60); scene.add(axes);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(120, -160, 220); scene.add(key);
    const fill = new THREE.DirectionalLight(0x93c5fd, 1.5); fill.position.set(-180, 80, 100); scene.add(fill);

    const resize = () => { const width = Math.max(host.clientWidth, 1); const height = Math.max(host.clientHeight, 1); renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); invalidate(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    invalidate();

    async function loadModel() {
      try {
        const base = `/api/3d-modeler/projects/${project.id}/jobs/${resultId}/view`;
        let object: THREE.Object3D;
        const threeMfResponse = await fetch(`${base}/model.3mf`, { cache: "no-store" });
        if (threeMfResponse.ok) {
          object = new ThreeMFLoader().parse(await threeMfResponse.arrayBuffer()); setFormat("3MF");
        } else {
          const stlResponse = await fetch(`${base}/model.stl`, { cache: "no-store" });
          if (!stlResponse.ok) throw new Error("The generated 3D artifact is unavailable.");
          const geometry = new STLLoader().parse(await stlResponse.arrayBuffer()); geometry.computeVertexNormals();
          object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: .08, roughness: .58 })); setFormat("STL");
        }
        if (disposed) return;
        object.traverse((child) => { if (!(child instanceof THREE.Mesh)) return; child.castShadow = true; child.receiveShadow = true; if (!child.material) child.material = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: .58 }); });
        const box = new THREE.Box3().setFromObject(object); if (box.isEmpty()) throw new Error("The generated model contains no visible mesh.");
        const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3()); object.position.sub(new THREE.Vector3(center.x, center.y, 0));
        const radius = Math.max(size.length() / 2, 1); radiusRef.current = radius; targetZRef.current = center.z; camera.near = Math.max(radius / 1000, .01); camera.far = Math.max(radius * 100, 1000); camera.updateProjectionMatrix();
        grid.scale.setScalar(Math.max(radius / 500, .05)); axes.scale.setScalar(Math.max(radius / 100, .02));
        modelRef.current = object; scene.add(object); setDimensions({ x: size.x, y: size.y, z: size.z }); setView("iso"); setLoading(false); invalidate();
      } catch (value) { if (!disposed) { setError(value instanceof Error ? value.message : "The 3D model could not be loaded."); setLoading(false); } }
    }
    void loadModel();
    return () => { disposed = true; if (frame !== null) window.cancelAnimationFrame(frame); observer.disconnect(); controls.removeEventListener("change", invalidate); controls.dispose(); renderer.dispose(); renderer.domElement.remove(); scene.traverse((item) => { if (item instanceof THREE.Mesh) { item.geometry.dispose(); const materials = Array.isArray(item.material) ? item.material : [item.material]; materials.forEach((material) => material.dispose()); } }); cameraRef.current = null; controlsRef.current = null; modelRef.current = null; gridRef.current = null; invalidateRef.current = null; targetZRef.current = 0; };
  }, [project.id, resultId, setView]);

  useEffect(() => { if (gridRef.current) { gridRef.current.visible = gridVisible; invalidateRef.current?.(); } }, [gridVisible]);

  const downloadBase = `/api/3d-modeler/projects/${project.id}/jobs/${resultId}/download`;
  return <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
    <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-2 bg-card px-2">
      <Button asChild density="compact" variant="outline"><Link href={`/3d-modeler/${project.id}`}><ArrowLeft className="h-4 w-4"/>Back to Modeler</Link></Button>
      <Box className="h-4 w-4 text-primary"/><span className="truncate text-body-sm font-semibold">{project.name}</span><Badge>{format ?? "Loading"}</Badge>
      <div className="ml-auto flex items-center gap-1"><Button density="compact" variant="outline" onClick={() => setView("iso")}><BoxSelect className="h-4 w-4"/>Isometric</Button><Button density="compact" variant="outline" onClick={() => setView("front")}>Front</Button><Button density="compact" variant="outline" onClick={() => setView("top")}>Top</Button><Button density="compact" variant="outline" onClick={() => setView("right")}>Right</Button><Button density="compact" variant="outline" className="w-8 px-0" aria-label="Fit model" onClick={() => setView("iso")}><Maximize2 className="h-4 w-4"/></Button></div>
    </header>
    <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card px-3 text-body-sm"><label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-meta text-muted-foreground"><input type="checkbox" checked={gridVisible} onChange={(event) => setGridVisible(event.target.checked)}/>Show grid</label><span className="ml-3 font-mono text-meta">{dimensions.x.toFixed(2)} × {dimensions.y.toFixed(2)} × {dimensions.z.toFixed(2)} mm</span><span className="ml-auto text-meta text-muted-foreground">Drag to orbit above or below · wheel to zoom · right-drag to pan</span></div>
    <main className="relative min-h-0 flex-1"><div ref={hostRef} className="h-full w-full"/>{loading ? <div className="absolute inset-0 flex items-center justify-center bg-background/60"><div className="rounded-md border bg-card px-4 py-3 text-body-sm shadow"><RotateCcw className="mr-2 inline h-4 w-4 animate-spin"/>Loading generated model…</div></div> : null}{error ? <div className="absolute left-1/2 top-8 w-[min(560px,90vw)] -translate-x-1/2 rounded-md border border-destructive/40 bg-card p-4 text-body-sm text-destructive shadow">{error}</div> : null}
      <div className="absolute bottom-4 right-4 flex flex-wrap gap-1 rounded-lg border bg-card/95 p-2 shadow-xl"><span className="self-center px-2 text-label font-semibold uppercase text-muted-foreground">Download</span>{[["STEP", "model.step"], ["3MF", "model.3mf"], ["STL", "model.stl"], ["Manifest", "manifest.json"]].map(([label, artifact]) => <Button key={artifact} asChild density="compact" variant="outline"><a href={`${downloadBase}/${artifact}`}><Download className="h-3.5 w-3.5"/>{label}</a></Button>)}</div>
    </main>
  </div>;
}
