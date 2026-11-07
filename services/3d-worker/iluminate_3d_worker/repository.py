from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import psycopg
from psycopg.rows import dict_row
from pydantic import ValidationError

from .contracts import ModelJob
from .errors import ThreeDWorkerError

MAX_ATTEMPTS = 3


@dataclass(frozen=True)
class LeasedJob:
    model: ModelJob
    attempts: int


class JobRepository:
    def __init__(self, database_url: str, worker_id: str) -> None:
        self.database_url = database_url
        self.worker_id = worker_id

    def claim(self) -> LeasedJob | None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            with connection.transaction():
                row = connection.execute(
                    """
                    select id, client_id, project_id, source_object_key, source_checksum,
                           source_size_bytes, recipe_json, attempts
                      from iluminate.three_d_model_jobs
                     where attempts < %s
                       and ((status = 'queued' and available_at <= now())
                         or (status in ('leased', 'processing') and lease_expires_at < now()))
                     order by created_at
                     for update skip locked
                     limit 1
                    """,
                    (MAX_ATTEMPTS,),
                ).fetchone()
                if row is None:
                    return None
                updated = connection.execute(
                    """
                    update iluminate.three_d_model_jobs
                       set status = 'leased', attempts = attempts + 1, lease_owner = %s,
                           lease_expires_at = now() + interval '10 minutes', heartbeat_at = now(),
                           error_code = null, error_summary = null, updated_at = now()
                     where id = %s
                    returning attempts
                    """,
                    (self.worker_id, row["id"]),
                ).fetchone()
                payload: dict[str, Any] = {
                    "version": "3d-model-job.v1",
                    "engineVersion": "build123d-0.13.0-ocp-8.0.1.1.0-r7",
                    "clientId": row["client_id"],
                    "projectId": row["project_id"],
                    "jobId": row["id"],
                    "source": {
                        "objectKey": row["source_object_key"],
                        "checksum": row["source_checksum"],
                        "mediaType": "image/svg+xml",
                        "sizeBytes": row["source_size_bytes"],
                    },
                    "recipe": row["recipe_json"],
                }
                try:
                    model = ModelJob.model_validate(payload)
                except ValidationError:
                    connection.execute(
                        """update iluminate.three_d_model_jobs
                               set status = 'failed', lease_owner = null, lease_expires_at = null,
                                   heartbeat_at = null, error_code = 'job_contract_invalid',
                                   error_summary = 'The queued job does not satisfy 3d-model-job.v1.',
                                   completed_at = now(), updated_at = now()
                             where id = %s and lease_owner = %s""",
                        (row["id"], self.worker_id),
                    )
                    return None
                return LeasedJob(model, int(updated["attempts"]))

    def mark_processing(self, job_id: int) -> None:
        self._owned_update(
            """update iluminate.three_d_model_jobs
                   set status = 'processing', heartbeat_at = now(),
                       lease_expires_at = now() + interval '10 minutes', updated_at = now()
                 where id = %s and lease_owner = %s and status = 'leased'""",
            job_id,
        )

    def heartbeat(self, job_id: int) -> None:
        self._owned_update(
            """update iluminate.three_d_model_jobs
                   set heartbeat_at = now(), lease_expires_at = now() + interval '10 minutes', updated_at = now()
                 where id = %s and lease_owner = %s and status in ('leased', 'processing')""",
            job_id,
        )

    def complete(self, job: ModelJob, manifest: dict[str, Any]) -> None:
        with psycopg.connect(self.database_url) as connection:
            result = connection.execute(
                """update iluminate.three_d_model_jobs
                       set status = 'succeeded', manifest_json = %s::jsonb,
                           manifest_object_key = %s, lease_owner = null, lease_expires_at = null,
                           heartbeat_at = null, completed_at = now(), updated_at = now()
                     where id = %s and client_id = %s and lease_owner = %s and status = 'processing'""",
                (
                    json.dumps(manifest, separators=(",", ":")),
                    f"clients/{job.client_id}/3d-models/{job.project_id}/{job.job_id}/manifest.json",
                    job.job_id,
                    job.client_id,
                    self.worker_id,
                ),
            )
            if result.rowcount != 1:
                raise ThreeDWorkerError("job_lease_lost", "The job lease was lost before completion.")

    def fail(self, job_id: int, code: str, summary: str, retryable: bool) -> str:
        bounded_code = code[:80]
        bounded_summary = summary[:1000]
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            row = connection.execute(
                """update iluminate.three_d_model_jobs
                       set status = case when %s and attempts < %s then 'queued' else 'failed' end,
                           available_at = case when %s and attempts < %s then now() + interval '30 seconds' else available_at end,
                           lease_owner = null, lease_expires_at = null, heartbeat_at = null,
                           error_code = %s, error_summary = %s,
                           completed_at = case when %s and attempts < %s then null else now() end,
                           updated_at = now()
                     where id = %s and lease_owner = %s
                    returning status""",
                (
                    retryable, MAX_ATTEMPTS, retryable, MAX_ATTEMPTS, bounded_code, bounded_summary,
                    retryable, MAX_ATTEMPTS, job_id, self.worker_id,
                ),
            ).fetchone()
            return str(row["status"]) if row else "lease_lost"

    def ping(self) -> None:
        with psycopg.connect(self.database_url, row_factory=dict_row) as connection:
            row = connection.execute("select to_regclass('iluminate.three_d_model_jobs') as queue_table").fetchone()
            if row is None or row["queue_table"] is None:
                raise RuntimeError("3d-worker migration is not applied.")

    def _owned_update(self, query: str, job_id: int) -> None:
        with psycopg.connect(self.database_url) as connection:
            result = connection.execute(query, (job_id, self.worker_id))
            if result.rowcount != 1:
                raise ThreeDWorkerError("job_lease_lost", "The job lease is no longer owned by this worker.")
