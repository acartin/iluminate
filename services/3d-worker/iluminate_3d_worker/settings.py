from __future__ import annotations

import os
import socket
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    r2_endpoint: str
    r2_region: str
    r2_access_key_id: str
    r2_secret_access_key: str
    r2_bucket: str
    worker_id: str
    poll_seconds: float
    job_timeout_seconds: int
    job_memory_mb: int

    @classmethod
    def from_environment(cls) -> "Settings":
        return cls(
            database_url=_required("ILUMINATE_DATABASE_URL"),
            r2_endpoint=_required("CLOUDFLARE_R2_ENDPOINT"),
            r2_region=os.environ.get("CLOUDFLARE_R2_REGION", "auto"),
            r2_access_key_id=_required("CLOUDFLARE_R2_ACCESS_KEY_ID"),
            r2_secret_access_key=_required("CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
            r2_bucket=_required("CLOUDFLARE_R2_BUCKET"),
            worker_id=os.environ.get("ILUMINATE_3D_WORKER_ID", socket.gethostname())[:128],
            poll_seconds=_bounded_float("ILUMINATE_3D_POLL_SECONDS", 2.0, 0.25, 30.0),
            job_timeout_seconds=int(_bounded_float("ILUMINATE_3D_JOB_TIMEOUT_SECONDS", 300, 10, 1800)),
            job_memory_mb=int(_bounded_float("ILUMINATE_3D_JOB_MEMORY_MB", 2048, 256, 8192)),
        )


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Required environment variable {name} is missing.")
    return value


def _bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.environ.get(name, str(default)))
    except ValueError as error:
        raise RuntimeError(f"Environment variable {name} is invalid.") from error
    if not minimum <= value <= maximum:
        raise RuntimeError(f"Environment variable {name} is outside its allowed range.")
    return value
