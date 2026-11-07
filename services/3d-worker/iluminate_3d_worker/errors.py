from __future__ import annotations


class ThreeDWorkerError(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable

    @property
    def safe_message(self) -> str:
        return bounded_error_message(self)


def bounded_error_message(error: BaseException, limit: int = 1_000) -> str:
    message = " ".join(str(error).split()) or error.__class__.__name__
    return message[:limit]
