from __future__ import annotations

import json
import unittest
from typing import Any, cast
from unittest.mock import patch

from starter_worker.logging import create_worker_logger, sanitize_log_meta


class WorkerLoggingTests(unittest.TestCase):
    def test_sanitizes_sensitive_metadata(self) -> None:
        sanitized = sanitize_log_meta(
            {
                "actorId": "user-1",
                "access_token": "secret-token",
                "recipientEmail": "person@example.com",
                "nested": {
                    "password": "secret-password",
                    "items": [{"clientSecret": "secret-client"}],
                },
            }
        )

        self.assertEqual(sanitized["actorId"], "user-1")
        self.assertEqual(sanitized["access_token"], "[REDACTED]")
        self.assertEqual(sanitized["recipientEmail"], "[REDACTED]")
        nested = cast(dict[str, Any], sanitized["nested"])
        items = cast(list[dict[str, Any]], nested["items"])
        self.assertEqual(nested["password"], "[REDACTED]")
        self.assertEqual(items[0]["clientSecret"], "[REDACTED]")

    def test_emits_json_log_shape(self) -> None:
        logger = create_worker_logger("test-worker")

        with patch.object(logger.logger, "info") as info:
            logger.info("job.completed", jobId="job-1", jobType="noop")

        payload = json.loads(info.call_args.args[0])
        self.assertEqual(payload["level"], "info")
        self.assertEqual(payload["event"], "job.completed")
        self.assertEqual(payload["component"], "worker")
        self.assertEqual(payload["jobId"], "job-1")
        self.assertIn("timestamp", payload)


if __name__ == "__main__":
    unittest.main()
