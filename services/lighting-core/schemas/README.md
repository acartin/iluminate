# Lighting Schemas

Versioned schemas for partitura authoring, validation and export.

The schema must not be a private serialization format from Konva, a timeline library, or any UI component. The domain model is the source of truth.

Current schemas:

- `partitura.v2.schema.json`

The v2 schema is strict and requires a source checksum, all three logical
outputs, dense pixel indices, flattened target membership and versioned core
compatibility.
