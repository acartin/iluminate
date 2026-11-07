import math
import struct
from pathlib import Path

import pytest
from build123d import Axis, Box, Compound, Kind, Wire, export_step, import_step

from iluminate_3d_worker.contracts import ModelJob, sha256_bytes
from iluminate_3d_worker.engine import (
    _apply_fit_clearance,
    _contain_closed_sweep,
    _import_wires,
    _path_signed_area,
    _reconstruct_rectilinear_profile,
    _restore_authored_y,
    build_model,
)
from iluminate_3d_worker.errors import ThreeDWorkerError
from iluminate_3d_worker.svg_input import validate_svg
from test_contracts import valid_job


def test_rectilinear_profile_fallback_round_trips_as_one_step_solid(tmp_path: Path) -> None:
    payload = valid_job()
    payload["recipe"]["profileYawDeg"] = 0
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "stepped-channel",
            "nodes": [
                {"xMm": 0, "yMm": 0}, {"xMm": 2, "yMm": 0},
                {"xMm": 2, "yMm": 9}, {"xMm": 3, "yMm": 9},
                {"xMm": 3, "yMm": 10}, {"xMm": 0, "yMm": 10},
            ],
        }],
    }
    job = ModelJob.model_validate(payload)
    result = _reconstruct_rectilinear_profile(Wire.make_circle(30), job)
    assert result is not None and result.is_valid and len(result.solids()) == 1
    step_path = tmp_path / "fallback.step"
    export_step(Compound([result]), step_path)
    reopened = import_step(step_path)
    assert reopened.is_valid and len(reopened.solids()) == 1 and reopened.volume > 0


def test_line_sweep_exports_valid_step_3mf_and_stl(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="route-1" d="M 10 10 L 90 10" fill="none"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)

    assert set(result.files) == {"step", "3mf", "stl", "manifest"}
    reopened = import_step(result.files["step"])
    assert reopened.is_valid
    assert len(reopened.solids()) == 1
    bounds = result.manifest["geometry"]["boundsMm"]
    assert abs(bounds["max"][2] - bounds["min"][2] - 10) < 1e-6
    assert result.manifest["geometry"]["volumeMm3"] > 0


def test_output_restores_model_path_y_handedness() -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path id="asymmetric" d="M 2 1 L 8 9" fill="none"/></svg>'
    path = _restore_authored_y(_import_wires(document, "asymmetric")[0])

    start = path.position_at(0)
    end = path.position_at(1)
    assert (start.X, start.Y) == pytest.approx((2, 9))
    assert (end.X, end.Y) == pytest.approx((8, 1))


def test_miter_corner_produces_valid_solid(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path id="route-1" d="M 10 10 L 60 10 L 60 60" fill="none"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["cornerPolicy"] = "miter"
    payload["recipe"]["outputs"] = ["step"]
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    assert result.manifest["geometry"]["solidCount"] == 1


@pytest.mark.parametrize(("direction", "expected_width"), [("outward", 21.0), ("inward", 19.0)])
def test_fit_clearance_offsets_closed_receiver_boundary(direction: str, expected_width: float) -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 25 5 L 25 25 L 5 25 Z"/></svg>'
    payload = valid_job()
    payload["recipe"]["fitClearanceMm"] = 0.5
    payload["recipe"]["fitClearanceDirection"] = direction
    adjusted, used_fallback = _apply_fit_clearance(_import_wires(document, "route-1")[0], ModelJob.model_validate(payload))
    bounds = adjusted.bounding_box()
    assert used_fallback is False
    assert bounds.max.X - bounds.min.X == pytest.approx(expected_width)
    assert bounds.max.Y - bounds.min.Y == pytest.approx(expected_width)


def test_fit_clearance_rejects_open_path() -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 25 5"/></svg>'
    payload = valid_job()
    payload["recipe"]["fitClearanceMm"] = 0.25
    with pytest.raises(ThreeDWorkerError, match="closed Path"):
        _apply_fit_clearance(_import_wires(document, "route-1")[0], ModelJob.model_validate(payload))


def test_zero_clearance_preserves_authored_closed_path_traversal() -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 5 25 L 25 25 L 25 5 Z"/></svg>'
    path = _import_wires(document, "route-1")[0]
    tangent = path.tangent_at(0).normalized()

    adjusted, used_fallback = _apply_fit_clearance(path, ModelJob.model_validate(valid_job()))

    adjusted_tangent = adjusted.tangent_at(0).normalized()
    assert used_fallback is False
    assert _path_signed_area(adjusted) == pytest.approx(_path_signed_area(path))
    assert adjusted_tangent.dot(tangent) > 0.999999


@pytest.mark.parametrize("direction", ["outward", "inward"])
def test_fit_clearance_restores_authored_closed_path_winding(direction: str) -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 5 25 L 25 25 L 25 5 Z"/></svg>'
    path = _import_wires(document, "route-1")[0]
    payload = valid_job()
    payload["recipe"]["fitClearanceMm"] = 0.25
    payload["recipe"]["fitClearanceDirection"] = direction

    adjusted, _ = _apply_fit_clearance(path, ModelJob.model_validate(payload))

    assert _path_signed_area(adjusted) * _path_signed_area(path) > 0


def test_fit_clearance_uses_validated_tangent_fallback_when_intersection_offset_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 25 5 L 25 25 L 5 25 Z"/></svg>'
    payload = valid_job()
    payload["recipe"]["fitClearanceMm"] = 0.25
    original_offset = Wire.offset_2d

    def offset_with_failed_intersection(self: Wire, distance: float, *, kind: Kind, **kwargs):
        if kind == Kind.INTERSECTION:
            raise RuntimeError("simulated OCCT intersection failure")
        return original_offset(self, distance, kind=kind, **kwargs)

    monkeypatch.setattr(Wire, "offset_2d", offset_with_failed_intersection)
    adjusted, used_fallback = _apply_fit_clearance(
        _import_wires(document, "route-1")[0],
        ModelJob.model_validate(payload),
    )

    assert used_fallback is True
    assert adjusted.is_closed
    assert adjusted.is_valid


def test_closed_sweep_reports_empty_envelope_intersection_as_controlled_error() -> None:
    document = '<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 25 5 L 25 25 L 5 25 Z"/></svg>'
    path = _import_wires(document, "route-1")[0]
    non_overlapping_result = Box(2, 2, 2).translate((100, 100, 0))

    with pytest.raises(ThreeDWorkerError) as raised:
        _contain_closed_sweep(non_overlapping_result, path, -1, 1, 0, 0.05)

    assert raised.value.code == "model_envelope_invalid"
    assert "cannot contain this profile" in raised.value.safe_message


def test_fit_clearance_builds_and_reports_valid_solid(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60"><path id="route-1" d="M 10 10 L 50 10 L 50 50 L 10 50 Z"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    payload["recipe"]["cornerPolicy"] = "miter"
    payload["recipe"]["fitClearanceMm"] = 0.25
    result = build_model(ModelJob.model_validate(payload), validate_svg(svg_bytes, ["route-1"]), tmp_path)
    assert result.manifest["geometry"]["solidCount"] == 1
    assert any("Fit clearance of 0.250 mm" in warning for warning in result.manifest["warnings"])


def test_clockwise_closed_path_preserves_authored_profile_side(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="30mm" height="30mm" viewBox="0 0 30 30"><path id="route-1" d="M 5 5 L 5 25 L 25 25 L 25 5 Z"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    payload["recipe"]["cornerPolicy"] = "miter"
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": 0, "yMm": 0},
                {"xMm": 3, "yMm": 0},
                {"xMm": 3, "yMm": 10},
                {"xMm": 2, "yMm": 8},
                {"xMm": 1, "yMm": 8},
                {"xMm": 1, "yMm": 10},
                {"xMm": 0, "yMm": 10},
            ],
        }],
    }

    result = build_model(
        ModelJob.model_validate(payload),
        validate_svg(svg_bytes, ["route-1"]),
        tmp_path,
    )

    assert result.manifest["geometry"]["solidCount"] == 1
    assert result.manifest["geometry"]["volumeMm3"] > 0
    bounds = result.manifest["geometry"]["boundsMm"]
    assert bounds["min"][0] >= 5 - 1e-4
    assert bounds["max"][0] <= 25 + 1e-4


def test_vector_profile_sweep_produces_expected_height(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="route-1" d="M 10 10 L 90 10" fill="none"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": -2, "yMm": 0},
                {"xMm": 2, "yMm": 0},
                {"xMm": 2, "yMm": 8},
                {"xMm": -2, "yMm": 8},
            ],
        }],
    }
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    bounds = result.manifest["geometry"]["boundsMm"]
    assert abs(bounds["max"][2] - bounds["min"][2] - 8) < 1e-6


def test_profile_yaw_rotates_only_in_xy_and_keeps_profile_vertical(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="route-1" d="M 10 10 L 90 10" fill="none"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    payload["recipe"]["profileYawDeg"] = 45
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    bounds = result.manifest["geometry"]["boundsMm"]
    assert abs(bounds["max"][2] - bounds["min"][2] - 10) < 1e-6
    assert bounds["max"][0] - bounds["min"][0] > 80
    assert bounds["max"][1] - bounds["min"][1] > 1


def test_round_segmented_loop_removes_only_exporter_degenerate_triangles(tmp_path: Path) -> None:
    points = [
        (30 + 28 * math.cos((math.pi / 2) + index * 2 * math.pi / 64), 30 + 28 * math.sin((math.pi / 2) + index * 2 * math.pi / 64))
        for index in range(64)
    ]
    path_data = "M " + " L ".join(f"{x} {y}" for x, y in points) + " Z"
    svg_bytes = f'<svg xmlns="http://www.w3.org/2000/svg" width="60mm" height="60mm" viewBox="0 0 60 60"><path id="route-1" d="{path_data}" fill="none"/></svg>'.encode()
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step", "stl"]
    payload["recipe"]["cornerPolicy"] = "round"
    payload["recipe"]["profileYawDeg"] = 2
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": 0, "yMm": 0}, {"xMm": 4, "yMm": 0},
                {"xMm": 4, "yMm": 25.5}, {"xMm": 9, "yMm": 25.5},
                {"xMm": 9, "yMm": 28.5}, {"xMm": -0.5, "yMm": 28.5},
                {"xMm": 0, "yMm": 14},
            ],
        }],
    }
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    bounds = result.manifest["geometry"]["boundsMm"]
    assert bounds["min"][0] < -5
    assert bounds["max"][0] > 65
    assert bounds["min"][1] < -5
    assert bounds["max"][1] > 65
    data = result.files["stl"].read_bytes()
    triangle_count = struct.unpack_from("<I", data, 80)[0]
    assert triangle_count > 0
    assert len(data) == 84 + triangle_count * 50
    for index in range(triangle_count):
        values = struct.unpack_from("<12fH", data, 84 + index * 50)
        assert len({tuple(values[offset : offset + 3]) for offset in (3, 6, 9)}) == 3


def test_concave_curved_letter_path_heals_and_exports_valid_solid(tmp_path: Path) -> None:
    svg_bytes = (Path(__file__).parent / "fixtures" / "m-offset-path.svg").read_bytes()
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["pathIds"] = ["route-1"]
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": 0, "yMm": 0}, {"xMm": 4, "yMm": 0},
                {"xMm": 4, "yMm": 25.5}, {"xMm": 9, "yMm": 25.5},
                {"xMm": 9, "yMm": 28.5}, {"xMm": -0.5, "yMm": 28.5},
                {"xMm": 0, "yMm": 14},
            ],
        }],
    }
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)

    assert result.manifest["geometry"]["solidCount"] == 1
    assert result.manifest["geometry"]["volumeMm3"] > 0
    assert any("repaired 1 topological sweep defect" in warning for warning in result.manifest["warnings"])
    assert any("trimmed corner overrun" in warning for warning in result.manifest["warnings"])
    reopened = import_step(result.files["step"])
    assert reopened.is_valid
    horizontal_faces = reopened.faces().filter_by(Axis.Z)
    bottom_z = min(face.center().Z for face in horizontal_faces)
    top_z = max(face.center().Z for face in horizontal_faces)
    bottom_area = sum(face.area for face in horizontal_faces if abs(face.center().Z - bottom_z) < 1e-5)
    top_area = sum(face.area for face in horizontal_faces if abs(face.center().Z - top_z) < 1e-5)
    assert top_area > bottom_area


@pytest.mark.parametrize("path_data", [
    "M 10 50 A 40 40 0 0 1 90 50",
    "M 10 50 C 30 10 70 90 90 50",
    "M 20 20 L 80 20 L 80 80 L 20 80 Z",
])
def test_arc_bezier_and_closed_loop_fixtures(path_data: str, tmp_path: Path) -> None:
    svg_bytes = f'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path id="route-1" d="{path_data}" fill="none"/></svg>'.encode()
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    payload["recipe"]["cornerPolicy"] = "miter"
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    assert result.manifest["geometry"]["solidCount"] == 1


def test_separate_paths_produce_two_solids(tmp_path: Path) -> None:
    svg_bytes = b'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="route-1" d="M 10 10 L 90 10"/><path id="route-2" d="M 10 30 L 90 30"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["pathIds"] = ["route-1", "route-2"]
    payload["recipe"]["outputs"] = ["step"]
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    assert result.manifest["geometry"]["solidCount"] == 2


def test_compound_path_subpaths_become_separate_solids(tmp_path: Path) -> None:
    path_data = "M 10 10 L 40 10 M 60 10 L 90 10"
    svg_bytes = f'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path id="route-1" d="{path_data}"/></svg>'.encode()
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    job = ModelJob.model_validate(payload)
    result = build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
    assert result.manifest["geometry"]["solidCount"] == 2


def test_rejects_self_intersecting_path(tmp_path: Path) -> None:
    path_data = "M 10 10 L 90 90 L 10 90 L 90 10"
    svg_bytes = f'<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="100mm" viewBox="0 0 100 100"><path id="route-1" d="{path_data}"/></svg>'.encode()
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(svg_bytes)
    payload["source"]["sizeBytes"] = len(svg_bytes)
    payload["recipe"]["outputs"] = ["step"]
    job = ModelJob.model_validate(payload)
    with pytest.raises(ThreeDWorkerError):
        build_model(job, validate_svg(svg_bytes, job.recipe.path_ids), tmp_path)
