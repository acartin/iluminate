from __future__ import annotations

from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from .errors import ThreeDWorkerError
from .settings import Settings

MAX_SOURCE_BYTES = 2 * 1024 * 1024
MAX_OUTPUT_BYTES = 250 * 1024 * 1024
CONTENT_TYPES = {
    "recipe.json": "application/json",
    "model.step": "model/step",
    "model.3mf": "model/3mf",
    "model.stl": "model/stl",
    "manifest.json": "application/json",
}


class ObjectStorage:
    def __init__(self, settings: Settings) -> None:
        self.bucket = settings.r2_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.r2_endpoint,
            region_name=settings.r2_region,
            aws_access_key_id=settings.r2_access_key_id,
            aws_secret_access_key=settings.r2_secret_access_key,
            config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"}),
        )

    def download_source(self, key: str, expected_size: int) -> bytes:
        if expected_size < 1 or expected_size > MAX_SOURCE_BYTES:
            raise ThreeDWorkerError("source_size_invalid", "The source SVG size is outside the allowed range.")
        try:
            response = self.client.get_object(Bucket=self.bucket, Key=key)
            declared = int(response.get("ContentLength", 0))
            if declared != expected_size:
                raise ThreeDWorkerError("source_size_mismatch", "The source SVG size does not match the immutable job.")
            body = response["Body"]
            data = body.read(MAX_SOURCE_BYTES + 1)
            body.close()
        except ThreeDWorkerError:
            raise
        except (BotoCoreError, ClientError, KeyError, OSError) as error:
            raise ThreeDWorkerError("storage_source_unavailable", "The private source artifact could not be read.") from error
        if len(data) != expected_size:
            raise ThreeDWorkerError("source_size_mismatch", "The source SVG size does not match the immutable job.")
        return data

    def upload_file(self, key: str, path: Path) -> None:
        file_name = path.name
        if file_name not in CONTENT_TYPES or path.stat().st_size > MAX_OUTPUT_BYTES:
            raise ThreeDWorkerError("output_upload_invalid", "An output artifact is not allowlisted or exceeds the size limit.")
        try:
            with path.open("rb") as stream:
                self.client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=stream,
                    ContentType=CONTENT_TYPES[file_name],
                    CacheControl="private, no-store",
                )
        except (BotoCoreError, ClientError, OSError) as error:
            raise ThreeDWorkerError("storage_output_failed", "A private output artifact could not be stored.") from error
