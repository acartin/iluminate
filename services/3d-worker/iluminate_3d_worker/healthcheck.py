from .repository import JobRepository
from .settings import Settings


def main() -> int:
    settings = Settings.from_environment()
    JobRepository(settings.database_url, settings.worker_id).ping()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
