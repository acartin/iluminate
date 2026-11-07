from __future__ import annotations

import json
import os
import resource
import signal
import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path

from .contracts import ModelJob, model_artifact_prefix, sha256_bytes
from .errors import ThreeDWorkerError
from .settings import Settings
from .storage import ObjectStorage


class JobProcessor:
    def __init__(self, settings: Settings, storage: ObjectStorage) -> None:
        self.settings = settings
        self.storage = storage

    def process(self, job: ModelJob, heartbeat: Callable[[], None] | None = None) -> dict:
        source = self.storage.download_source(job.source.object_key, job.source.size_bytes)
        if sha256_bytes(source) != job.source.checksum:
            raise ThreeDWorkerError("source_checksum_mismatch", "The source SVG checksum does not match the immutable job.")
        with tempfile.TemporaryDirectory(prefix=f"iluminate-3d-{job.job_id}-") as temp_name:
            temp = Path(temp_name)
            input_dir = temp / "input"
            output_dir = temp / "output"
            input_dir.mkdir(mode=0o700)
            output_dir.mkdir(mode=0o700)
            cache_dir = temp / ".cache"
            cache_dir.mkdir(mode=0o700)
            job_path = input_dir / "job.json"
            svg_path = input_dir / "source.svg"
            job_path.write_bytes(job.model_dump_json(by_alias=True).encode("utf-8"))
            svg_path.write_bytes(source)
            command = [
                sys.executable,
                "-m",
                "iluminate_3d_worker.engine_cli",
                "--job",
                str(job_path),
                "--svg",
                str(svg_path),
                "--output",
                str(output_dir),
            ]
            process: subprocess.Popen[bytes] | None = None
            stderr = b""
            started = time.monotonic()
            next_heartbeat = started + 30
            stderr_path = temp / "engine.stderr"
            with stderr_path.open("w+b") as stderr_stream:
                try:
                    process = subprocess.Popen(
                        command,
                        stdin=subprocess.DEVNULL,
                        stdout=subprocess.DEVNULL,
                        stderr=stderr_stream,
                        env={
                            "PATH": os.environ.get("PATH", ""),
                            "PYTHONPATH": os.environ.get("PYTHONPATH", ""),
                            "HOME": str(temp),
                            "XDG_CACHE_HOME": str(cache_dir),
                        },
                        preexec_fn=self._resource_limits,
                    )
                    while process.poll() is None:
                        remaining = self.settings.job_timeout_seconds - (time.monotonic() - started)
                        if remaining <= 0:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()
                            raise ThreeDWorkerError("engine_timeout", "The CAD operation exceeded its wall-clock limit.")
                        try:
                            process.wait(timeout=min(5, remaining))
                        except subprocess.TimeoutExpired:
                            if heartbeat is not None and time.monotonic() >= next_heartbeat:
                                heartbeat()
                                next_heartbeat = time.monotonic() + 30
                    stderr_stream.flush()
                    size = os.fstat(stderr_stream.fileno()).st_size
                    stderr_stream.seek(max(0, size - 4096))
                    stderr = stderr_stream.read()
                finally:
                    if process is not None and process.poll() is None:
                        os.killpg(process.pid, signal.SIGKILL)
                        process.wait()
            if process is None or process.returncode != 0:
                raise _child_error(stderr)

            expected = {"model.step", "manifest.json"}
            expected.update(f"model.{output}" for output in job.recipe.outputs if output != "step")
            actual = {path.name for path in output_dir.iterdir() if path.is_file()}
            if actual != expected:
                raise ThreeDWorkerError("engine_output_invalid", "The isolated CAD process returned an unexpected artifact set.")
            manifest = json.loads((output_dir / "manifest.json").read_text(encoding="utf-8"))
            prefix = model_artifact_prefix(job.client_id, job.project_id, job.job_id)
            recipe_path = output_dir / "recipe.json"
            recipe_path.write_bytes(job.canonical_recipe_bytes())
            self.storage.upload_file(prefix + "recipe.json", recipe_path)
            for file_name in sorted(expected - {"manifest.json"}):
                self.storage.upload_file(prefix + file_name, output_dir / file_name)
            self.storage.upload_file(prefix + "manifest.json", output_dir / "manifest.json")
            return manifest

    def _resource_limits(self) -> None:
        os.setsid()
        memory = self.settings.job_memory_mb * 1024 * 1024
        cpu = min(self.settings.job_timeout_seconds, 900)
        resource.setrlimit(resource.RLIMIT_AS, (memory, memory))
        resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu + 5))
        resource.setrlimit(resource.RLIMIT_FSIZE, (250 * 1024 * 1024, 250 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_NOFILE, (128, 128))


def _child_error(stderr: bytes) -> ThreeDWorkerError:
    try:
        payload = json.loads(stderr.decode("utf-8").splitlines()[-1])
        code = str(payload["code"])
        message = str(payload["message"])
        if len(code) <= 80 and len(message) <= 1000:
            return ThreeDWorkerError(code, message)
    except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError):
        pass
    return ThreeDWorkerError("engine_process_failed", "The isolated CAD process failed without a valid diagnostic.")
