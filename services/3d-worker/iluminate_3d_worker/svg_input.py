from __future__ import annotations

import re
from dataclasses import dataclass
from xml.etree.ElementTree import Element, ParseError, tostring

from defusedxml import ElementTree

from .errors import ThreeDWorkerError

MAX_SVG_BYTES = 2 * 1024 * 1024
MAX_ELEMENTS = 4096
MAX_PATH_DATA_CHARS = 1_000_000
SVG_NAMESPACE = "http://www.w3.org/2000/svg"
ALLOWED_ELEMENTS = {"svg", "g", "path", "title", "metadata"}
ALLOWED_ROOT_ATTRIBUTES = {"width", "height", "viewBox", "xmlns"}
ALLOWED_GROUP_ATTRIBUTES = {"id", "data-name"}
ALLOWED_PATH_ATTRIBUTES = {"id", "data-name", "d", "fill", "fill-rule", "stroke", "stroke-width", "vector-effect"}
MM_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?mm$")
NUMBER_PATTERN = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")
EXTERNAL_VALUE_PATTERN = re.compile(r"(?:url\s*\(|https?:|data:|file:|javascript:)", re.IGNORECASE)


@dataclass(frozen=True)
class SanitizedSvg:
    width_mm: float
    height_mm: float
    paths: dict[str, str]

    def document_for_path(self, path_id: str) -> str:
        path_data = self.paths[path_id]
        return (
            f'<svg xmlns="{SVG_NAMESPACE}" width="{self.width_mm:g}mm" height="{self.height_mm:g}mm" '
            f'viewBox="0 0 {self.width_mm:g} {self.height_mm:g}">'
            f'<path id="{_escape_attribute(path_id)}" d="{_escape_attribute(path_data)}" fill="none"/>'
            "</svg>"
        )


def validate_svg(svg_bytes: bytes, selected_path_ids: list[str]) -> SanitizedSvg:
    if not svg_bytes or len(svg_bytes) > MAX_SVG_BYTES:
        raise ThreeDWorkerError("svg_size_invalid", "SVG input must be between 1 byte and 2 MiB.")
    lowered = svg_bytes.lower()
    if b"<!doctype" in lowered or b"<!entity" in lowered:
        raise ThreeDWorkerError("svg_xml_forbidden", "DTD and entity declarations are not allowed.")
    try:
        root = ElementTree.fromstring(svg_bytes)
    except (ParseError, ValueError) as error:
        raise ThreeDWorkerError("svg_xml_invalid", "SVG input is not well-formed XML.") from error

    if _local_name(root.tag) != "svg":
        raise ThreeDWorkerError("svg_root_invalid", "The document root must be svg.")
    _validate_attributes(root, ALLOWED_ROOT_ATTRIBUTES)
    width_mm = _metric_dimension(root.get("width"), "width")
    height_mm = _metric_dimension(root.get("height"), "height")
    view_box = root.get("viewBox", "").replace(",", " ").split()
    if len(view_box) != 4 or any(NUMBER_PATTERN.fullmatch(value) is None for value in view_box):
        raise ThreeDWorkerError("svg_viewbox_invalid", "viewBox must use non-negative plain numbers.")
    values = [float(value) for value in view_box]
    if values[0] != 0 or values[1] != 0 or abs(values[2] - width_mm) > 1e-9 or abs(values[3] - height_mm) > 1e-9:
        raise ThreeDWorkerError("svg_viewbox_mismatch", "viewBox must exactly match the metric document dimensions.")

    paths: dict[str, str] = {}
    element_count = 0
    for element in root.iter():
        element_count += 1
        if element_count > MAX_ELEMENTS:
            raise ThreeDWorkerError("svg_complexity_limit", "SVG element count exceeds the allowed limit.")
        name = _local_name(element.tag)
        if _namespace(element.tag) != SVG_NAMESPACE:
            raise ThreeDWorkerError("svg_namespace_invalid", "Every SVG element must use the standard SVG namespace.")
        if name not in ALLOWED_ELEMENTS:
            raise ThreeDWorkerError("svg_element_forbidden", f"SVG element '{name}' is not allowed.")
        if name == "svg":
            allowed = ALLOWED_ROOT_ATTRIBUTES
        elif name == "g":
            allowed = ALLOWED_GROUP_ATTRIBUTES
        elif name == "path":
            allowed = ALLOWED_PATH_ATTRIBUTES
        else:
            allowed = set()
        _validate_attributes(element, allowed)
        if name == "path":
            path_id = element.get("id", "")
            path_data = element.get("d", "")
            if not path_id or path_id in paths:
                raise ThreeDWorkerError("svg_path_id_invalid", "Every SVG path must have a unique non-empty ID.")
            if not path_data or len(path_data) > MAX_PATH_DATA_CHARS:
                raise ThreeDWorkerError("svg_path_data_invalid", "SVG path data is empty or exceeds the allowed limit.")
            paths[path_id] = path_data

    missing = [path_id for path_id in selected_path_ids if path_id not in paths]
    if missing:
        raise ThreeDWorkerError("svg_path_missing", "One or more selected path IDs are absent from the source SVG.")
    return SanitizedSvg(width_mm=width_mm, height_mm=height_mm, paths={path_id: paths[path_id] for path_id in selected_path_ids})


def _validate_attributes(element: Element, allowed: set[str]) -> None:
    for raw_name, value in element.attrib.items():
        if "}" in raw_name:
            raise ThreeDWorkerError("svg_attribute_forbidden", "Namespaced SVG attributes are not allowed.")
        name = _local_name(raw_name)
        if name not in allowed or name.lower().startswith("on") or name in {"style", "transform"}:
            raise ThreeDWorkerError("svg_attribute_forbidden", f"SVG attribute '{name}' is not allowed.")
        if EXTERNAL_VALUE_PATTERN.search(value):
            raise ThreeDWorkerError("svg_external_reference", "External and embedded resource references are not allowed.")


def _metric_dimension(value: str | None, label: str) -> float:
    if value is None or MM_PATTERN.fullmatch(value) is None:
        raise ThreeDWorkerError("svg_dimension_invalid", f"SVG {label} must be a positive millimeter dimension.")
    result = float(value[:-2])
    if result <= 0 or result > 100_000:
        raise ThreeDWorkerError("svg_dimension_limit", f"SVG {label} is outside the allowed range.")
    return result


def _local_name(name: str) -> str:
    return name.rsplit("}", 1)[-1]


def _namespace(name: str) -> str:
    return name[1:].split("}", 1)[0] if name.startswith("{") else ""


def _escape_attribute(value: str) -> str:
    element = Element("x", {"v": value})
    rendered = tostring(element, encoding="unicode", short_empty_elements=True)
    return rendered.split('v="', 1)[1].rsplit('"', 1)[0]
