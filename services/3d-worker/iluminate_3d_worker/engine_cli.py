from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from .contracts import ModelJob
from .engine import build_model
from .errors import ThreeDWorkerError
from .svg_input import validate_svg


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--job", required=True)
    parser.add_argument("--svg", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        job = ModelJob.model_validate_json(Path(args.job).read_bytes())
        source = Path(args.svg).read_bytes()
        svg = validate_svg(source, job.recipe.path_ids)
        build_model(job, svg, Path(args.output))
        return 0
    except ThreeDWorkerError as error:
        _emit_error(error.code, error.safe_message)
    except ValidationError:
        _emit_error("job_contract_invalid", "The 3D model job does not satisfy its versioned contract.")
    except Exception:
        _emit_error("engine_unexpected_failure", "The isolated CAD process failed unexpectedly.")
    return 1


def _emit_error(code: str, message: str) -> None:
    sys.stderr.write(json.dumps({"code": code, "message": message}, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
