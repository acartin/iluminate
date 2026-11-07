# Third-party notices

The `3d-worker` image redistributes pinned Python wheels and their packaged
license/notice files under each installed `*.dist-info/licenses` or
`*.dist-info` directory. In particular:

- build123d 0.13.0 — Apache License 2.0; its wheel includes `LICENSE` and
  `NOTICE`.
- cadquery-ocp-novtk 8.0.1.1.0 and cadquery-ocp-proxy 8.0.1.1.0 — Apache
  License 2.0 according to their wheel metadata.
- lib3mf 2.5.0 — BSD license; its wheel includes `LICENSE`.

The complete dependency versions are in `requirements.lock`. Do not strip
installed distribution metadata from release images; it carries the upstream
license and notice material. Review license metadata again during every
dependency upgrade.
