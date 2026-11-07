FROM python:3.12-slim@sha256:b18b261e1b4974b4f321451ad5251ded85abb22c2b8b262da527dda1d031ab30 AS dependencies

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates libgl1 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 iluminate \
    && useradd --system --uid 10001 --gid iluminate --home-dir /nonexistent --shell /usr/sbin/nologin iluminate

WORKDIR /app
COPY services/3d-worker/requirements.lock ./requirements.lock
RUN python -m pip install --requirement requirements.lock

COPY services/3d-worker/iluminate_3d_worker ./iluminate_3d_worker
COPY services/3d-worker/contracts ./contracts
COPY services/3d-worker/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md

FROM dependencies AS test
COPY services/3d-worker/requirements-test.txt services/3d-worker/pyproject.toml ./
RUN python -m pip install --requirement requirements-test.txt
COPY services/3d-worker/tests ./tests
USER 10001:10001
CMD ["python", "-m", "pytest"]

FROM dependencies AS runtime
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD ["python", "-m", "iluminate_3d_worker.healthcheck"]
CMD ["python", "-m", "iluminate_3d_worker.worker"]
