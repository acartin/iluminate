import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from iluminate_3d_worker.contracts import ModelJob, model_artifact_prefix, model_job_json_schema


def valid_job() -> dict:
    return {
        "version": "3d-model-job.v1",
        "engineVersion": "build123d-0.13.0-ocp-8.0.1.1.0-r7",
        "clientId": 7,
        "projectId": 11,
        "jobId": 19,
        "source": {
            "objectKey": "clients/7/3d-models/11/19/source.svg",
            "checksum": "sha256:" + "a" * 64,
            "mediaType": "image/svg+xml",
            "sizeBytes": 100,
        },
        "recipe": {
            "operation": "profile_sweep",
            "sweepId": "sweep-1",
            "pathIds": ["route-1"],
            "profile": {"type": "rectangle", "catalogId": "rectangular-channel.v1", "widthMm": 2, "heightMm": 10},
            "cornerPolicy": "round",
            "endCap": "flat",
            "bodyPolicy": "separate",
            "outputs": ["step", "3mf", "stl"],
            "linearToleranceMm": 0.05,
            "angularToleranceRad": 0.1,
        },
    }


def test_contract_accepts_trusted_prefix_and_is_deterministic() -> None:
    job = ModelJob.model_validate(valid_job())
    assert model_artifact_prefix(job.client_id, job.project_id, job.job_id) == "clients/7/3d-models/11/19/"
    assert job.recipe_checksum().startswith("sha256:")
    assert job.recipe_checksum() == job.recipe_checksum()


def test_published_json_schema_matches_runtime_contract() -> None:
    published = json.loads(Path("contracts/3d-model-job.v1.schema.json").read_text(encoding="utf-8"))
    assert published == model_job_json_schema()


@pytest.mark.parametrize("mutation", [
    lambda value: value["source"].update(objectKey="clients/8/3d-models/11/19/source.svg"),
    lambda value: value["recipe"].update(pathIds=["../unsafe"]),
    lambda value: value["recipe"].update(outputs=["stl"]),
    lambda value: value.update(unexpected=True),
])
def test_contract_rejects_unsafe_jobs(mutation) -> None:
    payload = valid_job()
    mutation(payload)
    with pytest.raises(ValidationError):
        ModelJob.model_validate(payload)


def test_contract_accepts_bounded_vector_profile() -> None:
    payload = valid_job()
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": -2, "yMm": 0},
                {"xMm": 2, "yMm": 0, "nodeType": "straight"},
                {"xMm": 0, "yMm": 8, "nodeType": "smooth", "handleIn": {"xMm": 1, "yMm": 0}},
            ],
        }],
    }
    profile = ModelJob.model_validate(payload).recipe.profile
    assert profile.type == "vector"
    assert profile.contours[0].nodes[1].node_type == "straight"


def test_contract_rejects_handles_on_straight_profile_nodes() -> None:
    payload = valid_job()
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{
            "id": "outer",
            "nodes": [
                {"xMm": -2, "yMm": 0},
                {"xMm": 2, "yMm": 0, "nodeType": "straight", "handleOut": {"xMm": 1, "yMm": 0}},
                {"xMm": 0, "yMm": 8},
            ],
        }],
    }
    with pytest.raises(ValidationError, match="corner and straight"):
        ModelJob.model_validate(payload)


def test_contract_accepts_bounded_profile_yaw() -> None:
    payload = valid_job()
    payload["recipe"]["profileYawDeg"] = -90
    assert ModelJob.model_validate(payload).recipe.profile_yaw_deg == -90
    payload["recipe"]["profileYawDeg"] = 181
    with pytest.raises(ValidationError):
        ModelJob.model_validate(payload)


def test_contract_accepts_bounded_fit_clearance() -> None:
    payload = valid_job()
    payload["recipe"]["fitClearanceMm"] = 0.25
    payload["recipe"]["fitClearanceDirection"] = "inward"
    recipe = ModelJob.model_validate(payload).recipe
    assert recipe.fit_clearance_mm == 0.25
    assert recipe.fit_clearance_direction == "inward"
    payload["recipe"]["fitClearanceMm"] = 5.01
    with pytest.raises(ValidationError):
        ModelJob.model_validate(payload)


def test_contract_rejects_unbounded_vector_profile() -> None:
    payload = valid_job()
    payload["recipe"]["profile"] = {
        "type": "vector",
        "catalogId": "custom-vector.v1",
        "fillRule": "evenodd",
        "contours": [{"id": "outer", "nodes": [{"xMm": index, "yMm": index % 2} for index in range(129)]}],
    }
    with pytest.raises(ValidationError):
        ModelJob.model_validate(payload)
