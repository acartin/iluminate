from pathlib import Path

from iluminate_3d_worker.contracts import ModelJob, sha256_bytes
from iluminate_3d_worker.processor import JobProcessor
from iluminate_3d_worker.settings import Settings
from test_contracts import valid_job


class MemoryStorage:
    def __init__(self, source: bytes) -> None:
        self.source = source
        self.uploads: dict[str, bytes] = {}

    def download_source(self, key: str, expected_size: int) -> bytes:
        assert key.endswith("/source.svg")
        assert expected_size == len(self.source)
        return self.source

    def upload_file(self, key: str, path: Path) -> None:
        self.uploads[key] = path.read_bytes()


def test_processor_runs_cad_in_child_and_uploads_manifest_last() -> None:
    source = b'<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><path id="route-1" d="M 2 5 L 18 5" fill="none"/></svg>'
    payload = valid_job()
    payload["source"]["checksum"] = sha256_bytes(source)
    payload["source"]["sizeBytes"] = len(source)
    payload["recipe"]["outputs"] = ["step"]
    job = ModelJob.model_validate(payload)
    storage = MemoryStorage(source)
    settings = Settings("db", "r2", "auto", "key", "secret", "bucket", "test", 1, 30, 2048)

    manifest = JobProcessor(settings, storage).process(job)

    assert manifest["job"]["id"] == 19
    assert list(storage.uploads)[-1].endswith("/manifest.json")
    assert set(key.rsplit("/", 1)[-1] for key in storage.uploads) == {"recipe.json", "model.step", "manifest.json"}
