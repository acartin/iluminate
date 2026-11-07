from __future__ import annotations

import json
import math
import platform
import struct
from dataclasses import dataclass
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any

import build123d
from build123d import (
    Align,
    Axis,
    Compound,
    Edge,
    Face,
    Kind,
    Mesher,
    Plane,
    Rectangle,
    Shape,
    Side,
    Transition,
    Unit,
    Vector,
    Wire,
    export_step,
    export_stl,
    extrude,
    import_step,
    import_svg,
    sweep,
)

from .contracts import ModelJob, sha256_bytes
from .errors import ThreeDWorkerError
from .svg_input import SanitizedSvg

MAX_SWEEP_WIRES = 128


@dataclass(frozen=True)
class EngineResult:
    manifest: dict[str, Any]
    files: dict[str, Path]


def build_model(job: ModelJob, svg: SanitizedSvg, output_dir: Path) -> EngineResult:
    output_dir.mkdir(parents=True, exist_ok=True)
    solids: list[Shape] = []
    path_lengths: dict[str, float] = {}
    healed_sweeps = 0
    contained_sweeps = 0
    reconstructed_sweeps = 0
    clearance_sweeps = 0
    clearance_offset_fallbacks = 0
    for path_id in job.recipe.path_ids:
        paths = _import_wires(svg.document_for_path(path_id), path_id)
        if len(solids) + len(paths) > MAX_SWEEP_WIRES:
            raise ThreeDWorkerError("path_count_limit", "The SVG contains too many sweep wires.")
        effective_paths: list[Wire] = []
        for path in paths:
            path, used_offset_fallback = _apply_fit_clearance(path, job)
            effective_paths.append(path)
            clearance_sweeps += int(job.recipe.fit_clearance_mm > 0)
            clearance_offset_fallbacks += int(used_offset_fallback)
            solid, healed, contained, reconstructed = _sweep_path(path, job)
            solids.append(solid)
            healed_sweeps += int(healed)
            contained_sweeps += int(contained)
            reconstructed_sweeps += int(reconstructed)
        path_lengths[path_id] = sum(path.length for path in effective_paths)

    if job.recipe.body_policy == "union" and len(solids) > 1:
        try:
            model = solids[0].fuse(*solids[1:])
        except Exception as error:
            raise ThreeDWorkerError("model_union_failed", "The requested bodies could not be safely united.") from error
    else:
        model = Compound(solids)
    model = _restore_authored_y(model)
    _validate_model(model)
    expected_solids = 1 if job.recipe.body_policy == "union" else len(solids)
    if len(model.solids()) != expected_solids:
        raise ThreeDWorkerError("model_body_count_invalid", "The result does not contain the expected number of solids.")

    files: dict[str, Path] = {}
    step_path = output_dir / "model.step"
    export_step(model, step_path)
    reopened = import_step(step_path)
    _validate_model(reopened)
    if len(reopened.solids()) != len(model.solids()):
        raise ThreeDWorkerError("output_step_invalid", "The STEP round-trip changed the expected solid count.")
    files["step"] = step_path

    if "3mf" in job.recipe.outputs:
        three_mf_path = output_dir / "model.3mf"
        mesher = Mesher(unit=Unit.MM)
        mesher.add_shape(model, linear_deflection=job.recipe.linear_tolerance_mm, angular_deflection=job.recipe.angular_tolerance_rad)
        mesher.write(three_mf_path)
        validation_mesher = Mesher()
        reopened_meshes = validation_mesher.read(three_mf_path)
        if not reopened_meshes or any(not shape.is_valid for shape in reopened_meshes):
            raise ThreeDWorkerError("output_3mf_invalid", "The 3MF output contains no valid mesh objects.")
        files["3mf"] = three_mf_path

    if "stl" in job.recipe.outputs:
        stl_path = output_dir / "model.stl"
        export_stl(
            model,
            stl_path,
            tolerance=job.recipe.linear_tolerance_mm,
            angular_tolerance=job.recipe.angular_tolerance_rad,
            ascii_format=False,
        )
        _remove_degenerate_stl_triangles(stl_path)
        _validate_binary_stl(stl_path)
        files["stl"] = stl_path

    warnings = []
    if healed_sweeps:
        warnings.append(
            f"The CAD kernel repaired {healed_sweeps} topological sweep defect(s); "
            "the repaired B-Rep and exported artifacts passed validation."
        )
    if contained_sweeps:
        warnings.append(
            f"The worker trimmed corner overrun on {contained_sweeps} closed sweep(s) "
            "to the signed profile envelope."
        )
    if reconstructed_sweeps:
        warnings.append(
            f"The worker reconstructed {reconstructed_sweeps} invalid planar sweep(s) "
            "from tolerance-bounded profile bands; all exports passed round-trip validation."
        )
    if clearance_sweeps:
        warnings.append(
            f"Fit clearance of {job.recipe.fit_clearance_mm:.3f} mm per side was applied "
            f"{job.recipe.fit_clearance_direction} on {clearance_sweeps} closed sweep(s)."
        )
    if clearance_offset_fallbacks:
        warnings.append(
            f"Fit clearance used the tangent-preserving offset fallback on "
            f"{clearance_offset_fallbacks} closed sweep(s); the resulting wires passed CAD validation."
        )
    if "stl" in files:
        warnings.append("STL is unitless; dimensions are intended as millimeters.")
    manifest = _manifest(job, model, path_lengths, files, warnings)
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=True, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    files["manifest"] = manifest_path
    return EngineResult(manifest=manifest, files=files)


def _import_wires(document: str, path_id: str) -> list[Wire]:
    try:
        imported = import_svg(StringIO(document), flip_y=False, align=None, label_by="id")
    except Exception as error:
        raise ThreeDWorkerError("svg_path_invalid", f"Path '{path_id}' cannot be converted to CAD geometry.") from error
    wires: list[Wire] = []
    for shape in imported:
        if isinstance(shape, Wire):
            wires.append(shape)
        else:
            wires.extend(shape.wires())
    if not wires:
        raise ThreeDWorkerError("svg_path_invalid", f"Path '{path_id}' contains no usable wires.")
    if any(not wire.is_valid or wire.length <= 0 for wire in wires):
        raise ThreeDWorkerError("svg_path_invalid", f"Path '{path_id}' is not a valid non-empty wire.")
    return wires


def _restore_authored_y(shape: Shape) -> Shape:
    """Reflect browser-SVG Y after sweeping, without destabilizing closed wires."""
    bounds = shape.bounding_box()
    center_y = (bounds.min.Y + bounds.max.Y) / 2
    authored_plane = Plane(origin=(0, center_y, 0), x_dir=(1, 0, 0), z_dir=(0, 1, 0))
    return shape.mirror(authored_plane)


def _apply_fit_clearance(path: Wire, job: ModelJob) -> tuple[Wire, bool]:
    clearance = job.recipe.fit_clearance_mm
    if clearance <= 0:
        # With no geometric offset, preserve the authored traversal exactly.
        # The start tangent is part of the Profile placement frame.
        return path, False
    if not path.is_closed:
        raise ThreeDWorkerError(
            "fit_clearance_open_path",
            "Fit clearance requires a closed Path with a defined inside and outside.",
        )
    authored_winding = 1 if _path_signed_area(path) > 0 else -1
    if authored_winding < 0:
        # OCCT offsets are orientation-sensitive. Normalize only the traversal
        # used by the offset operation. The authored traversal is restored
        # before this wire is used by the Sweep frame.
        path = Wire([edge.reversed() for edge in reversed(path.edges())])
    distance = clearance if job.recipe.fit_clearance_direction == "outward" else -clearance
    last_error: Exception | None = None
    for kind in (Kind.INTERSECTION, Kind.TANGENT):
        try:
            # INTERSECTION preserves authored corners. TANGENT is the bounded
            # fallback for dense concave contours where OCCT cannot extend all
            # adjacent edges to an intersection; unlike ARC it does not round
            # every receiver corner before the independent Sweep policy runs.
            adjusted = path.offset_2d(distance, kind=kind, side=Side.BOTH, closed=True)
            if not isinstance(adjusted, Wire) or not adjusted.is_closed or not adjusted.is_valid or adjusted.length <= 0:
                raise ValueError("invalid offset wire")
            # OCCT's offset wire can retain a stale curvilinear start tangent even
            # though its ordered edges are valid. Rebuilding from those edges keeps
            # the profile placement frame consistent with the actual first edge.
            adjusted = Wire(adjusted.edges())
            if (1 if _path_signed_area(adjusted) > 0 else -1) != authored_winding:
                adjusted = Wire([edge.reversed() for edge in reversed(adjusted.edges())])
            face = Face(adjusted)
            if not face.is_valid or face.area <= max(1e-8, job.recipe.linear_tolerance_mm ** 2):
                raise ValueError("collapsed offset face")
            return adjusted, kind == Kind.TANGENT
        except Exception as error:
            last_error = error
    if last_error is not None:
        direction = "expanding the exterior" if distance > 0 else "contracting an interior opening"
        raise ThreeDWorkerError(
            "fit_clearance_invalid",
            f"Fit clearance failed while {direction}; reduce the value or clean the highlighted Path geometry.",
        ) from last_error
    raise AssertionError("Fit clearance offset attempts were not executed.")


def _sweep_path(path: Wire, job: ModelJob) -> tuple[Shape, bool, bool, bool]:
    start = path.position_at(0)
    tangent = path.tangent_at(0).normalized()
    # Keep the proven sweep frame stable. SVG import already restores the
    # authored positive-Y axis before the profile is placed on the path.
    base_horizontal = Vector(tangent.Y, -tangent.X, 0)
    if base_horizontal.length < 1e-9 or abs(tangent.Z) > 1e-7:
        raise ThreeDWorkerError("path_orientation_invalid", "Sweep paths must be planar in the SVG XY plane.")
    # Path traversal, Profile coordinates and the saved yaw are authoritative.
    # Never reflect the Profile from winding or an inferred inside/outside.
    if job.recipe.profile.type == "rectangle":
        local_profile = Rectangle(
            job.recipe.profile.width_mm,
            job.recipe.profile.height_mm,
            align=(Align.CENTER, Align.MIN),
        )
    else:
        local_profile = _vector_profile_face(job.recipe.profile.contours)
    yaw_deg = -job.recipe.profile_yaw_deg
    horizontal = base_horizontal.rotate(Axis.Z, yaw_deg)
    profile_normal = (-tangent).rotate(Axis.Z, yaw_deg)
    profile_plane = Plane(origin=start, x_dir=horizontal, z_dir=profile_normal)
    profile = profile_plane.location * local_profile
    transition = Transition.RIGHT if job.recipe.corner_policy == "miter" else Transition.ROUND
    try:
        result = sweep(profile, path=path, transition=transition)
    except Exception as error:
        raise ThreeDWorkerError("model_sweep_failed", "The profile cannot be swept along the selected path.") from error
    contained = False
    if path.is_closed:
        result, contained = _contain_closed_sweep(
            result,
            path,
            local_profile.bounding_box().min.X,
            local_profile.bounding_box().max.X,
            job.recipe.profile_yaw_deg,
            job.recipe.linear_tolerance_mm,
        )
    healed = False
    if not result.is_valid:
        # OCCT can leave repairable edge/face tolerances at dense curved and
        # concave transitions even when the sweep has one positive-volume
        # solid. Healing is bounded to that result and never replaces the
        # strict body, STEP round-trip and manifold validations below.
        try:
            result = result.fix()
            healed = True
        except Exception as error:
            raise ThreeDWorkerError(
                "model_brep_invalid",
                "The modeling operation did not produce valid positive-volume solids.",
            ) from error
    reconstructed = False
    result_solids = result.solids()
    if path.is_closed and (not result.is_valid or not result_solids or any(not solid.is_valid or solid.volume <= 0 for solid in result_solids)):
        fallback = _reconstruct_rectilinear_profile(path, job)
        if fallback is not None:
            result = fallback
            contained = True
            reconstructed = True
    _validate_model(result)
    return result, healed, contained, reconstructed


def _reconstruct_rectilinear_profile(path: Wire, job: ModelJob) -> Shape | None:
    """Deterministic fallback for failed 0/180-degree channel-letter sweeps."""
    if job.recipe.profile.type != "vector" or len(job.recipe.profile.contours) != 1:
        return None
    projection = math.cos(math.radians(job.recipe.profile_yaw_deg))
    if abs(abs(projection) - 1) > 1e-7:
        return None
    contour = job.recipe.profile.contours[0]
    if any(node.handle_in is not None or node.handle_out is not None for node in contour.nodes):
        return None
    epsilon = max(1e-8, job.recipe.linear_tolerance_mm * 1e-4)
    edges = list(zip(contour.nodes, contour.nodes[1:] + contour.nodes[:1], strict=True))
    if any(abs(a.x_mm - b.x_mm) > epsilon and abs(a.y_mm - b.y_mm) > epsilon for a, b in edges):
        return None
    levels = sorted({node.y_mm for node in contour.nodes})
    if len(levels) < 2:
        return None
    sample_count = min(4096, max(256, len(path.edges()) * 16, math.ceil(path.length / max(job.recipe.linear_tolerance_mm * 4, 0.2))))
    sampled_path = Wire.make_polygon([path.position_at(index / sample_count) for index in range(sample_count)], close=True)
    if not sampled_path.is_valid or not sampled_path.is_closed:
        return None

    def offset(distance: float) -> Wire:
        if abs(distance) <= epsilon:
            return sampled_path
        wire = sampled_path.offset_2d(distance, kind=Kind.ARC, side=Side.BOTH, closed=True)
        if not isinstance(wire, Wire) or not wire.is_valid or not wire.is_closed:
            raise ValueError("invalid regularized offset")
        return wire

    solids: list[Shape] = []
    try:
        overlap = max(job.recipe.linear_tolerance_mm * 0.1, 1e-4)
        for lower, upper in zip(levels, levels[1:]):
            if upper - lower <= epsilon:
                continue
            sample_y = (lower + upper) / 2
            intersections: list[float] = []
            for start, end in edges:
                if abs(start.y_mm - end.y_mm) <= epsilon:
                    continue
                if min(start.y_mm, end.y_mm) <= sample_y < max(start.y_mm, end.y_mm):
                    ratio = (sample_y - start.y_mm) / (end.y_mm - start.y_mm)
                    intersections.append(start.x_mm + (end.x_mm - start.x_mm) * ratio)
            intersections.sort()
            if len(intersections) % 2:
                return None
            band_lower = lower if lower == levels[0] else lower - overlap
            band_upper = upper if upper == levels[-1] else upper + overlap
            for left, right in zip(intersections[::2], intersections[1::2], strict=True):
                exterior_factor = 1 if _path_signed_area(path) > 0 else -1
                distances = sorted((left * projection * exterior_factor, right * projection * exterior_factor))
                face = Face(offset(distances[1]), [offset(distances[0])])
                solid = extrude(
                    face.translate((0, 0, band_lower)),
                    amount=band_upper - band_lower,
                    dir=(0, 0, 1),
                )
                if not solid.is_valid or not solid.solids() or solid.volume <= epsilon:
                    raise ValueError("invalid regularized band")
                solids.append(solid)
        if not solids:
            return None
        result = (solids[0] if len(solids) == 1 else solids[0].fuse(*solids[1:])).clean()
        if not result.is_valid or len(result.solids()) != 1 or result.volume <= epsilon:
            return None
        return result
    except Exception:
        return None


def _contain_closed_sweep(
    result: Shape,
    path: Wire,
    profile_min_x: float,
    profile_max_x: float,
    yaw_deg: float,
    tolerance: float,
) -> tuple[Shape, bool]:
    exterior_factor = 1 if _path_signed_area(path) > 0 else -1

    normal_projection = math.cos(math.radians(yaw_deg))
    if abs(normal_projection) < 1e-4:
        raise ThreeDWorkerError(
            "profile_orientation_invalid",
            "The horizontal profile rotation cannot be parallel to the Sweep path.",
        )
    # Positive OCCT offset distance is geometric exterior. Local Profile +X
    # follows the authored traversal, so winding is used only to build this
    # containment envelope; it never changes Profile placement.
    offsets = [profile_min_x * normal_projection * exterior_factor, profile_max_x * normal_projection * exterior_factor]
    # Keep the Boolean boundary away from the intended swept faces. OCCT's
    # meshers otherwise retain sub-tolerance sliver faces at concave joins.
    # This expands the allowed envelope; it never removes additional profile.
    clearance = max(0.2, tolerance)
    maximum_distance = max(offsets) + clearance
    minimum_distance = min(offsets) - clearance
    outer_distance = maximum_distance
    inner_distance = minimum_distance

    def offset_wire(distance: float) -> Wire:
        if abs(distance) < 1e-9:
            return path
        return path.offset_2d(distance, kind=Kind.ARC, side=Side.BOTH, closed=True)

    try:
        envelope = Face(offset_wire(outer_distance), [offset_wire(inner_distance)])
        if not envelope.is_valid or envelope.area <= 0:
            raise ValueError("invalid signed envelope")
        bounds = result.bounding_box()
        envelope_prism = extrude(
            envelope.translate((0, 0, bounds.min.Z - clearance)),
            amount=(bounds.max.Z - bounds.min.Z) + clearance * 2,
            dir=(0, 0, 1),
        )
        parts = result.intersect(envelope_prism)
        if parts is None:
            raise ValueError("empty envelope intersection")
    except Exception as error:
        raise ThreeDWorkerError(
            "model_envelope_invalid",
            "The closed Sweep path cannot contain this profile without corner overrun.",
        ) from error
    if len(parts) != 1 or not parts[0].solids():
        raise ThreeDWorkerError(
            "model_envelope_invalid",
            "The signed profile envelope fragmented the closed Sweep result.",
        )
    contained = parts[0]
    trimmed = result.volume - contained.volume > max(1e-6, abs(result.volume) * 1e-9)
    return contained, trimmed


def _path_signed_area(path: Wire) -> float:
    samples = min(2048, max(64, len(path.edges()) * 8))
    points = [path.position_at(index / samples) for index in range(samples)]
    signed_area = sum(
        points[index].X * points[(index + 1) % samples].Y
        - points[(index + 1) % samples].X * points[index].Y
        for index in range(samples)
    ) / 2
    if abs(signed_area) < 1e-8:
        raise ThreeDWorkerError("path_orientation_invalid", "A closed Sweep path has no stable planar orientation.")
    return signed_area


def _vector_profile_face(contours: list[Any]) -> Face:
    wires: list[Wire] = []
    for contour in contours:
        edges: list[Edge] = []
        for index, node in enumerate(contour.nodes):
            next_node = contour.nodes[(index + 1) % len(contour.nodes)]
            start = Vector(node.x_mm, node.y_mm, 0)
            end = Vector(next_node.x_mm, next_node.y_mm, 0)
            if node.handle_out is not None or next_node.handle_in is not None:
                out_x = node.handle_out.x_mm if node.handle_out is not None else 0.0
                out_y = node.handle_out.y_mm if node.handle_out is not None else 0.0
                in_x = next_node.handle_in.x_mm if next_node.handle_in is not None else 0.0
                in_y = next_node.handle_in.y_mm if next_node.handle_in is not None else 0.0
                edges.append(Edge.make_bezier(
                    start,
                    Vector(node.x_mm + out_x, node.y_mm + out_y, 0),
                    Vector(next_node.x_mm + in_x, next_node.y_mm + in_y, 0),
                    end,
                ))
            else:
                edges.append(Edge.make_line(start, end))
        wire = Wire(edges)
        if not wire.is_valid or not wire.is_closed:
            raise ThreeDWorkerError("profile_invalid", "A vector profile contour is not a valid closed wire.")
        wires.append(wire)

    outer_index = max(range(len(wires)), key=lambda index: abs(Face(wires[index]).area))
    outer = wires[outer_index]
    holes = [wire for index, wire in enumerate(wires) if index != outer_index]
    try:
        face = Face(outer, holes)
    except Exception as error:
        raise ThreeDWorkerError("profile_invalid", "The vector profile contours do not form a valid face.") from error
    if not face.is_valid or face.area <= 0:
        raise ThreeDWorkerError("profile_invalid", "The vector profile must define a positive-area face.")
    return face


def _validate_model(model: Shape) -> None:
    solids = model.solids()
    if not model.is_valid or not solids or any(not solid.is_valid or solid.volume <= 0 for solid in solids):
        raise ThreeDWorkerError("model_brep_invalid", "The modeling operation did not produce valid positive-volume solids.")


def _validate_binary_stl(path: Path) -> None:
    data = path.read_bytes()
    if len(data) < 84:
        raise ThreeDWorkerError("output_stl_invalid", "The STL output is incomplete.")
    triangles = struct.unpack_from("<I", data, 80)[0]
    if triangles < 4 or len(data) != 84 + triangles * 50:
        raise ThreeDWorkerError("output_stl_invalid", "The STL output has an invalid triangle table.")
    edges: dict[tuple[tuple[float, float, float], tuple[float, float, float]], int] = {}
    for index in range(triangles):
        values = struct.unpack_from("<12fH", data, 84 + index * 50)
        vertices = [tuple(values[offset : offset + 3]) for offset in (3, 6, 9)]
        if _stl_triangle_is_degenerate(vertices):
            raise ThreeDWorkerError("output_stl_non_manifold", "The STL output contains a degenerate triangle.")
        for start, end in zip(vertices, vertices[1:] + vertices[:1], strict=True):
            edge = tuple(sorted((start, end)))
            edges[edge] = edges.get(edge, 0) + 1
    if any(count != 2 for count in edges.values()):
        raise ThreeDWorkerError("output_stl_non_manifold", "The STL output is not a closed two-manifold mesh.")


def _remove_degenerate_stl_triangles(path: Path) -> None:
    data = path.read_bytes()
    if len(data) < 84:
        return
    triangles = struct.unpack_from("<I", data, 80)[0]
    if len(data) != 84 + triangles * 50:
        return
    records: list[bytes] = []
    for index in range(triangles):
        offset = 84 + index * 50
        record = data[offset : offset + 50]
        values = struct.unpack("<12fH", record)
        vertices = [tuple(values[vertex_offset : vertex_offset + 3]) for vertex_offset in (3, 6, 9)]
        if not _stl_triangle_is_degenerate(vertices):
            records.append(record)
    if len(records) == triangles:
        return
    path.write_bytes(data[:80] + struct.pack("<I", len(records)) + b"".join(records))


def _stl_triangle_is_degenerate(vertices: list[tuple[float, float, float]]) -> bool:
    if len(set(vertices)) != 3:
        return True
    first, second, third = vertices
    a = tuple(second[index] - first[index] for index in range(3))
    b = tuple(third[index] - first[index] for index in range(3))
    cross = (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )
    return sum(component * component for component in cross) <= 1e-20


def _manifest(
    job: ModelJob,
    model: Shape,
    path_lengths: dict[str, float],
    files: dict[str, Path],
    warnings: list[str],
) -> dict[str, Any]:
    box = model.bounding_box()
    solids = model.solids()
    return {
        "version": "3d-model-manifest.v1",
        "job": {"id": job.job_id, "clientId": job.client_id, "projectId": job.project_id},
        "source": {"checksum": job.source.checksum, "objectKey": job.source.object_key},
        "recipeChecksum": job.recipe_checksum(),
        "units": "mm",
        "engine": {
            "contract": job.engine_version,
            "build123d": getattr(build123d, "__version__", "0.13.0"),
            "ocp": "8.0.1.1.0",
            "python": platform.python_version(),
        },
        "geometry": {
            "solidCount": len(solids),
            "volumeMm3": sum(solid.volume for solid in solids),
            "boundsMm": {
                "min": [box.min.X, box.min.Y, box.min.Z],
                "max": [box.max.X, box.max.Y, box.max.Z],
            },
            "pathLengthsMm": path_lengths,
        },
        "tolerances": {
            "linearMm": job.recipe.linear_tolerance_mm,
            "angularRad": job.recipe.angular_tolerance_rad,
        },
        "artifacts": {
            output: {"fileName": path.name, "sizeBytes": path.stat().st_size, "checksum": sha256_bytes(path.read_bytes())}
            for output, path in sorted(files.items())
        },
        "warnings": warnings,
        "validatedAt": datetime.now(UTC).isoformat(),
    }
