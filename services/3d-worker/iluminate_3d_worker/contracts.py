from __future__ import annotations

import hashlib
import json
import re
from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, PositiveInt, model_validator

SHA256_PATTERN = r"^sha256:[0-9a-f]{64}$"
SAFE_PATH_ID_PATTERN = r"^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,127}$"
SafePathId = Annotated[str, Field(pattern=SAFE_PATH_ID_PATTERN)]


def _to_camel(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part[:1].upper() + part[1:] for part in tail)


class ContractModel(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: _to_camel(value), populate_by_name=True, extra="forbid")


class SourceArtifact(ContractModel):
    object_key: str = Field(min_length=1, max_length=512)
    checksum: str = Field(pattern=SHA256_PATTERN)
    media_type: Literal["image/svg+xml"] = "image/svg+xml"
    size_bytes: Annotated[int, Field(gt=0, le=2 * 1024 * 1024)]


class RectangleProfile(ContractModel):
    type: Literal["rectangle"] = "rectangle"
    catalog_id: Literal["rectangular-channel.v1"] = "rectangular-channel.v1"
    width_mm: Annotated[float, Field(ge=0.5, le=100.0)]
    height_mm: Annotated[float, Field(ge=0.5, le=100.0)]


class ProfileVector(ContractModel):
    x_mm: Annotated[float, Field(ge=-1000.0, le=1000.0)]
    y_mm: Annotated[float, Field(ge=-1000.0, le=1000.0)]


class SolidOrigin(ContractModel):
    x_mm: Annotated[float, Field(ge=-100000.0, le=100000.0)]
    y_mm: Annotated[float, Field(ge=-100000.0, le=100000.0)]
    z_mm: Annotated[float, Field(ge=-100000.0, le=100000.0)] = 0.0


class ProfileNode(ProfileVector):
    node_type: Literal["corner", "straight", "smooth", "symmetric"] = "corner"
    handle_in: ProfileVector | None = None
    handle_out: ProfileVector | None = None


class ProfileContour(ContractModel):
    id: SafePathId
    nodes: Annotated[list[ProfileNode], Field(min_length=3, max_length=128)]


class VectorProfile(ContractModel):
    type: Literal["vector"] = "vector"
    catalog_id: Literal["custom-vector.v1"] = "custom-vector.v1"
    fill_rule: Literal["evenodd"] = "evenodd"
    contours: Annotated[list[ProfileContour], Field(min_length=1, max_length=8)]

    @model_validator(mode="after")
    def validate_profile(self) -> "VectorProfile":
        if sum(len(contour.nodes) for contour in self.contours) > 256:
            raise ValueError("profile contours may contain at most 256 nodes")
        if len({contour.id for contour in self.contours}) != len(self.contours):
            raise ValueError("profile contour IDs must be unique")
        for contour in self.contours:
            if len({(node.x_mm, node.y_mm) for node in contour.nodes}) < 3:
                raise ValueError("profile contours require three distinct nodes")
            for node in contour.nodes:
                if node.node_type in {"corner", "straight"} and (node.handle_in is not None or node.handle_out is not None):
                    raise ValueError("corner and straight profile nodes cannot contain Bezier handles")
        return self


class ProfileSweepRecipe(ContractModel):
    operation: Literal["profile_sweep"] = "profile_sweep"
    sweep_id: SafePathId
    path_ids: Annotated[list[SafePathId], Field(min_length=1, max_length=128, json_schema_extra={"uniqueItems": True})]
    profile: Union[RectangleProfile, VectorProfile] = Field(discriminator="type")
    source_origin_mm: SolidOrigin | None = None
    profile_yaw_deg: Annotated[float, Field(ge=-180.0, le=180.0)] = 0.0
    fit_clearance_mm: Annotated[float, Field(ge=0.0, le=5.0)] = 0.0
    fit_clearance_direction: Literal["outward", "inward"] = "outward"
    corner_policy: Literal["miter", "round"] = "round"
    end_cap: Literal["flat"] = "flat"
    body_policy: Literal["separate", "union"] = "separate"
    outputs: Annotated[list[Literal["step", "3mf", "stl"]], Field(min_length=1, max_length=3)] = Field(
        default_factory=lambda: ["step", "3mf", "stl"],
        json_schema_extra={"uniqueItems": True, "contains": {"const": "step"}},
    )
    linear_tolerance_mm: Annotated[float, Field(ge=0.01, le=0.5)] = 0.05
    angular_tolerance_rad: Annotated[float, Field(ge=0.01, le=0.5)] = 0.1

    @model_validator(mode="after")
    def validate_lists(self) -> "ProfileSweepRecipe":
        if len(self.path_ids) != len(set(self.path_ids)):
            raise ValueError("pathIds must be unique")
        if any(re.fullmatch(SAFE_PATH_ID_PATTERN, value) is None for value in self.path_ids):
            raise ValueError("pathIds contains an unsafe SVG identifier")
        if len(self.outputs) != len(set(self.outputs)):
            raise ValueError("outputs must be unique")
        if "step" not in self.outputs:
            raise ValueError("STEP is the required canonical output")
        return self


class ModelJob(ContractModel):
    version: Literal["3d-model-job.v1"] = "3d-model-job.v1"
    engine_version: Literal["build123d-0.13.0-ocp-8.0.1.1.0-r7"] = "build123d-0.13.0-ocp-8.0.1.1.0-r7"
    client_id: PositiveInt
    project_id: PositiveInt
    job_id: PositiveInt
    source: SourceArtifact
    recipe: ProfileSweepRecipe

    @model_validator(mode="after")
    def validate_source_key(self) -> "ModelJob":
        expected = model_artifact_prefix(self.client_id, self.project_id, self.job_id) + "source.svg"
        if self.source.object_key != expected:
            raise ValueError("source.objectKey does not match the trusted tenant/job prefix")
        return self

    def canonical_recipe_bytes(self) -> bytes:
        return json.dumps(
            self.recipe.model_dump(by_alias=True, mode="json"),
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")

    def recipe_checksum(self) -> str:
        return sha256_bytes(self.canonical_recipe_bytes())


def model_artifact_prefix(client_id: int, project_id: int, job_id: int) -> str:
    if min(client_id, project_id, job_id) < 1:
        raise ValueError("tenant, project and job IDs must be positive")
    return f"clients/{client_id}/3d-models/{project_id}/{job_id}/"


def sha256_bytes(value: bytes) -> str:
    return "sha256:" + hashlib.sha256(value).hexdigest()


def model_job_json_schema() -> dict:
    schema = ModelJob.model_json_schema(by_alias=True)
    _remove_generated_titles(schema)
    return schema


def _remove_generated_titles(value: object) -> None:
    if isinstance(value, dict):
        value.pop("title", None)
        for child in value.values():
            _remove_generated_titles(child)
    elif isinstance(value, list):
        for child in value:
            _remove_generated_titles(child)
