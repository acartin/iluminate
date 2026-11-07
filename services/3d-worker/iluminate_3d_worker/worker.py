from __future__ import annotations

import logging
import signal
import threading
import time

from pydantic import ValidationError

from .errors import ThreeDWorkerError
from .processor import JobProcessor
from .repository import JobRepository, LeasedJob
from .settings import Settings
from .storage import ObjectStorage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("iluminate.3d-worker")
STOP = threading.Event()
RETRYABLE_CODES = {"storage_source_unavailable", "storage_output_failed", "engine_timeout", "engine_process_failed"}


def main() -> int:
    settings = Settings.from_environment()
    repository = JobRepository(settings.database_url, settings.worker_id)
    processor = JobProcessor(settings, ObjectStorage(settings))
    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    LOGGER.info("3d-worker started worker=%s", settings.worker_id)
    while not STOP.is_set():
        try:
            leased = repository.claim()
            if leased is None:
                STOP.wait(settings.poll_seconds)
                continue
            _run_job(repository, processor, leased)
        except (ThreeDWorkerError, ValidationError) as error:
            LOGGER.error("queue cycle failed type=%s", type(error).__name__)
            STOP.wait(settings.poll_seconds)
        except Exception:
            LOGGER.exception("unexpected queue cycle failure")
            STOP.wait(settings.poll_seconds)
    LOGGER.info("3d-worker stopped")
    return 0


def _run_job(repository: JobRepository, processor: JobProcessor, leased: LeasedJob) -> None:
    job = leased.model
    LOGGER.info("job started id=%s client=%s attempt=%s", job.job_id, job.client_id, leased.attempts)
    try:
        repository.mark_processing(job.job_id)
        manifest = processor.process(job, lambda: repository.heartbeat(job.job_id))
        repository.complete(job, manifest)
        LOGGER.info("job succeeded id=%s client=%s", job.job_id, job.client_id)
    except ThreeDWorkerError as error:
        status = repository.fail(job.job_id, error.code, error.safe_message, error.code in RETRYABLE_CODES)
        LOGGER.error("job failed id=%s client=%s code=%s status=%s", job.job_id, job.client_id, error.code, status)
    except Exception:
        status = repository.fail(job.job_id, "worker_unexpected_failure", "The worker failed unexpectedly.", True)
        LOGGER.exception("job failed unexpectedly id=%s client=%s status=%s", job.job_id, job.client_id, status)


def _stop(_signal_number: int, _frame: object) -> None:
    STOP.set()


if __name__ == "__main__":
    raise SystemExit(main())
