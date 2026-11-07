import pytest

from iluminate_3d_worker.errors import ThreeDWorkerError
from iluminate_3d_worker.svg_input import validate_svg


VALID = b'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50">
  <title>Fixture</title>
  <metadata>{"units":"mm"}</metadata>
  <g id="routes"><path id="route-1" d="M 10 10 L 90 10" fill="none" stroke="#000" stroke-width="0.1" vector-effect="non-scaling-stroke"/></g>
</svg>'''


def test_accepts_and_sanitizes_designer_subset() -> None:
    result = validate_svg(VALID, ["route-1"])
    assert result.width_mm == 100
    assert list(result.paths) == ["route-1"]
    assert "metadata" not in result.document_for_path("route-1")


@pytest.mark.parametrize(
    "malicious",
    [
        b'<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><path id="p" d="M0 0L1 1"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><script>alert(1)</script><path id="p" d="M0 0L1 1"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><path id="p" onclick="x" d="M0 0L1 1"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" width="1mm" height="1mm" viewBox="0 0 1 1"><path id="p" transform="scale(2)" d="M0 0L1 1"/></svg>',
        b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:e="urn:evil" width="1mm" height="1mm" viewBox="0 0 1 1"><e:path id="p" d="M0 0L1 1"/></svg>',
    ],
)
def test_rejects_active_or_ambiguous_svg(malicious: bytes) -> None:
    with pytest.raises(ThreeDWorkerError):
        validate_svg(malicious, ["p"])


def test_rejects_missing_selected_path() -> None:
    with pytest.raises(ThreeDWorkerError, match="selected path"):
        validate_svg(VALID, ["absent"])
