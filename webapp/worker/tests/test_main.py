from __future__ import annotations

import json
import os
import subprocess
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from starter_worker.config import WorkerConfig, load_config
from starter_worker.db import JobStore, normalize_postgres_database_url
from starter_worker.main import (
    _log_job_claimed,
    _log_job_completed,
    _log_job_failed,
    _log_jobs_requeued_stale,
    _log_teams_poll_scheduled,
    _solve_raster_model,
    process_inbound_mail_poll,
    process_job,
    process_raster_run,
    process_teams_intake_poll,
)


class WorkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "worker-test.db"
        self._create_schema()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_process_job_echo_returns_payload(self) -> None:
        result = process_job(
            type("Job", (), {"job_type": "echo", "payload": {"message": "hello"}})()
        )

        self.assertEqual(result["echo"], {"message": "hello"})
        self.assertIn("processedAt", result)

    def test_process_job_notification_delivery_sends_mail(self) -> None:
        with patch("starter_worker.main.send_graph_mail") as send_graph_mail:
            result = process_job(
                type(
                    "Job",
                    (),
                    {
                        "job_type": "notification_delivery",
                        "payload": {
                            "notificationId": "notification-1",
                            "recipientEmail": "user@example.com",
                            "subject": "Test",
                            "bodyText": "Hello",
                        },
                    },
                )()
            )

        send_graph_mail.assert_called_once()
        self.assertEqual(result["notificationId"], "notification-1")
        self.assertEqual(result["status"], "sent")
        self.assertIn("processedAt", result)

    def test_process_job_teams_delivery_sends_message(self) -> None:
        with patch(
            "starter_worker.main.send_teams_channel_message", return_value={"id": "graph-1"}
        ) as send_teams:
            result = process_job(
                type(
                    "Job",
                    (),
                    {
                        "job_type": "teams_message_delivery",
                        "payload": {
                            "teamsOutboundMessageId": "outbound-1",
                            "teamId": "team-1",
                            "channelId": "channel-1",
                            "content": "<p>hello</p>",
                        },
                    },
                )()
            )

        send_teams.assert_called_once()
        self.assertEqual(result["teamsOutboundMessageId"], "outbound-1")
        self.assertEqual(result["graphMessageId"], "graph-1")
        self.assertEqual(result["status"], "sent")

    def test_process_raster_run_updates_run_status(self) -> None:
        store = self._make_store()
        season_model = {
            "clubs": [
                {
                    "id": "club-a",
                    "name": "Club A",
                    "venues": [{"hall": "1", "name": "Hall 1", "capacity": 2}],
                    "notes": "",
                }
            ],
            "teams": [
                {
                    "id": "team-a",
                    "clubId": "club-a",
                    "label": "I",
                    "homeWeekday": "friday",
                    "hall": "1",
                    "rasterzahl": {"kind": "assignable"},
                    "confidence": "ok",
                },
                {
                    "id": "team-b",
                    "clubId": "club-a",
                    "label": "II",
                    "homeWeekday": "friday",
                    "hall": "1",
                    "rasterzahl": {"kind": "assignable"},
                    "confidence": "ok",
                },
            ],
            "groups": [
                {
                    "ref": {"league": "Liga", "name": "Gruppe"},
                    "size": 10,
                    "teamIds": ["team-a", "team-b"],
                }
            ],
            "wishes": [],
            "absoluteConstraints": [],
            "warnings": [],
        }
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO RasterInputSet (id, district, seasonModelJson)
                VALUES ('input-1', 'OWL', ?)
                """,
                (json.dumps(season_model),),
            )
            connection.execute(
                """
                INSERT INTO RasterOptimizationRun (id, inputSetId, status, settings)
                VALUES ('run-1', 'input-1', 'PENDING', '{"timeLimitSeconds": 60}')
                """
            )
            connection.commit()

        with patch(
            "starter_worker.main._solve_raster_model",
            return_value={
                "assignment": {"team-a": 1, "team-b": 2},
                "metadata": {
                    "status": "OPTIMAL",
                    "objective": 0,
                    "bestBound": 0,
                    "wallTimeSeconds": 0.1,
                },
            },
        ):
            result = process_raster_run(
                store,
                type(
                    "Job",
                    (),
                    {
                        "id": "job-1",
                        "job_type": "raster_run",
                        "payload": {"runId": "run-1"},
                    },
                )(),
            )

        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                """
                SELECT status, jobId, outcome, solverStatus, finishedAt
                FROM RasterOptimizationRun
                WHERE id = 'run-1'
                """,
            ).fetchone()
            snapshot = connection.execute(
                "SELECT id, optimality, totalConflicts FROM RasterSnapshot WHERE runId = 'run-1'",
            ).fetchone()
            assignments = connection.execute(
                "SELECT team, rasterzahl FROM RasterAssignment ORDER BY team",
            ).fetchall()

        assert row is not None
        assert snapshot is not None
        self.assertEqual(result["status"], "OPTIMAL")
        self.assertEqual(row["status"], "SUCCEEDED")
        self.assertEqual(row["outcome"], "PROVEN_OPTIMAL")
        self.assertEqual(row["solverStatus"], "OPTIMAL")
        self.assertEqual(row["jobId"], "job-1")
        self.assertIsNotNone(row["finishedAt"])
        self.assertEqual(snapshot["optimality"], "PROVEN_OPTIMAL")
        self.assertEqual(snapshot["totalConflicts"], 0)
        self.assertEqual([tuple(row) for row in assignments], [("I", 1), ("II", 2)])

    def test_process_raster_run_skips_cancelled_run(self) -> None:
        store = self._make_store()
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO RasterInputSet (id, district, seasonModelJson)
                VALUES ('input-1', 'OWL', '{}')
                """
            )
            connection.execute(
                """
                INSERT INTO RasterOptimizationRun (id, inputSetId, status, outcome, settings)
                VALUES ('run-1', 'input-1', 'CANCELLED', 'CANCELLED', '{}')
                """
            )
            connection.commit()

        with patch("starter_worker.main._solve_raster_model") as solve:
            result = process_raster_run(
                store,
                type(
                    "Job",
                    (),
                    {
                        "id": "job-1",
                        "job_type": "raster_run",
                        "payload": {"runId": "run-1"},
                    },
                )(),
            )

        with closing(sqlite3.connect(self.db_path)) as connection:
            row = connection.execute(
                "SELECT status, outcome, jobId FROM RasterOptimizationRun WHERE id = 'run-1'",
            ).fetchone()
            snapshots = connection.execute(
                "SELECT COUNT(*) FROM RasterSnapshot WHERE runId = 'run-1'",
            ).fetchone()[0]

        solve.assert_not_called()
        self.assertEqual(result["status"], "CANCELLED")
        self.assertEqual(row, ("CANCELLED", "CANCELLED", None))
        self.assertEqual(snapshots, 0)

    def test_worker_runtime_has_ortools(self) -> None:
        result = subprocess.run(
            [sys.executable, "-c", "import ortools"],
            check=False,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_raster_solver_uses_worker_uv_project(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="",
            stderr="",
        )
        with (
            patch.dict(os.environ, {"RASTER_SOLVER_SCRIPT": __file__}),
            patch("starter_worker.main.subprocess.run", return_value=completed) as run,
            patch("starter_worker.main.Path.read_text", side_effect=['{"team-a": 1}', '{"status": "OPTIMAL"}']),
        ):
            _solve_raster_model({"clubs": [], "teams": [], "groups": []}, {})

        command = run.call_args.args[0]
        self.assertEqual(command[:4], ["uv", "run", "--project", str(Path(__file__).parents[1])])

    def test_process_inbound_mail_poll_stores_bounces_and_entity_links(self) -> None:
        with (
            patch(
                "starter_worker.main.list_graph_mail_messages",
                return_value=[
                    {"id": "msg-bounce"},
                    {"id": "msg-link"},
                ],
            ),
            patch(
                "starter_worker.main.get_graph_mail_message",
                side_effect=[
                    {
                        "id": "msg-bounce",
                        "subject": "Undeliverable [notification:notification-1]",
                        "bodyPreview": "Delivery failed",
                        "receivedDateTime": "2026-04-20T10:00:00Z",
                        "from": {
                            "emailAddress": {
                                "address": "postmaster@example.com",
                                "name": "Postmaster",
                            }
                        },
                        "body": {
                            "contentType": "text",
                            "content": "Delivery failed [notification:notification-1]",
                        },
                        "internetMessageHeaders": [
                            {
                                "name": "In-Reply-To",
                                "value": "<provider-message-1@example.com>",
                            }
                        ],
                    },
                    {
                        "id": "msg-link",
                        "subject": "Question [ref:Scope:scope-7]",
                        "bodyPreview": "Can you help?",
                        "receivedDateTime": "2026-04-20T10:05:00Z",
                        "from": {
                            "emailAddress": {"address": "person@example.com", "name": "Person"}
                        },
                        "body": {
                            "contentType": "text",
                            "content": "Following up on [ref:Scope:scope-7]",
                        },
                        "internetMessageHeaders": [],
                    },
                ],
            ),
        ):
            self._insert_notification(
                "notification-1",
                provider_message_id="<provider-message-1@example.com>",
            )
            store = self._make_store()
            result = process_inbound_mail_poll(store, {"mailbox": "shared@example.com"})

        self.assertEqual(result["created"], 2)
        self.assertEqual(result["bounced"], 1)
        self.assertEqual(result["linked"], 1)

        inbound_bounce = self._fetch_inbound_email("msg-bounce")
        inbound_link = self._fetch_inbound_email("msg-link")
        bounced_notification = self._fetch_notification("notification-1")

        self.assertEqual(inbound_bounce["processingStatus"], "PROCESSED")
        self.assertEqual(inbound_bounce["correlatedNotificationId"], "notification-1")
        self.assertEqual(inbound_link["processingStatus"], "PROCESSED")
        self.assertEqual(inbound_link["linkedEntityType"], "Scope")
        self.assertEqual(inbound_link["linkedEntityId"], "scope-7")
        self.assertEqual(bounced_notification["status"], "BOUNCED")

    def test_process_inbound_mail_poll_ignores_spoofed_bounce_content(self) -> None:
        with (
            patch(
                "starter_worker.main.list_graph_mail_messages",
                return_value=[{"id": "msg-bounce-spoof"}],
            ),
            patch(
                "starter_worker.main.get_graph_mail_message",
                return_value={
                    "id": "msg-bounce-spoof",
                    "subject": "Undeliverable [notification:notification-1]",
                    "bodyPreview": "Delivery failed",
                    "receivedDateTime": "2026-04-20T10:00:00Z",
                    "from": {
                        "emailAddress": {
                            "address": "postmaster@example.com",
                            "name": "Postmaster",
                        }
                    },
                    "body": {
                        "contentType": "text",
                        "content": "Delivery failed [notification:notification-1]",
                    },
                    "internetMessageHeaders": [
                        {
                            "name": "In-Reply-To",
                            "value": "<different-provider-message@example.com>",
                        }
                    ],
                },
            ),
        ):
            self._insert_notification(
                "notification-1",
                provider_message_id="<provider-message-1@example.com>",
            )
            store = self._make_store()
            result = process_inbound_mail_poll(store, {"mailbox": "shared@example.com"})

        self.assertEqual(result["created"], 1)
        self.assertEqual(result["bounced"], 0)
        self.assertEqual(result["ignored"], 1)

        inbound_bounce = self._fetch_inbound_email("msg-bounce-spoof")
        notification = self._fetch_notification("notification-1")

        self.assertEqual(inbound_bounce["processingStatus"], "IGNORED")
        self.assertEqual(notification["status"], "SENT")

    def test_sqlite_job_store_claims_and_completes_job(self) -> None:
        self._insert_job(job_id="job-1", job_type="noop", payload={"message": "hello"})
        store = self._make_store()

        job = store.claim_next_job()

        self.assertIsNotNone(job)
        assert job is not None
        self.assertEqual(job.id, "job-1")
        self.assertEqual(job.job_type, "noop")
        self.assertEqual(job.attempt_count, 1)

        store.complete_job(job.id, {"message": "done"})
        row = self._fetch_job("job-1")

        self.assertEqual(row["status"], "COMPLETED")
        self.assertEqual(row["workerId"], "worker-test")
        self.assertEqual(row["attemptCount"], 1)
        self.assertEqual(json.loads(row["result"]), {"message": "done"})
        self.assertIsNotNone(row["finishedAt"])
        self.assertIsNone(row["lockedAt"])

    def test_sqlite_job_store_retries_failure_before_max_attempts(self) -> None:
        self._insert_job(job_id="job-2", job_type="echo", payload={"message": "x"})
        store = self._make_store(max_attempts=3, retry_backoff_seconds=15)

        job = store.claim_next_job()

        self.assertIsNotNone(job)
        assert job is not None
        store.fail_job(job.id, "bad job")
        row = self._fetch_job("job-2")

        self.assertEqual(row["status"], "PENDING")
        self.assertEqual(row["error"], "bad job")
        self.assertEqual(row["workerId"], "worker-test")
        self.assertIsNone(row["finishedAt"])
        self.assertIsNone(row["lockedAt"])

    def test_sqlite_job_store_marks_terminal_failure_after_max_attempts(self) -> None:
        self._insert_job(job_id="job-3", job_type="echo", payload={"message": "x"})
        store = self._make_store(max_attempts=1)

        job = store.claim_next_job()

        self.assertIsNotNone(job)
        assert job is not None
        store.fail_job(job.id, "bad job")
        row = self._fetch_job("job-3")

        self.assertEqual(row["status"], "FAILED")
        self.assertEqual(row["error"], "bad job")
        self.assertEqual(row["workerId"], "worker-test")
        self.assertIsNotNone(row["finishedAt"])
        self.assertIsNone(row["lockedAt"])

    def test_sqlite_job_store_requeues_stale_in_progress_job(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO BackgroundJob (
                    id, jobType, status, payload, attemptCount, availableAt, startedAt,
                    lockedAt, workerId, createdAt, updatedAt
                ) VALUES (
                    ?, ?, 'IN_PROGRESS', ?, 1, datetime('now', '-10 minutes'),
                    datetime('now', '-10 minutes'), datetime('now', '-10 minutes'),
                    'worker-old', datetime('now', '-10 minutes'), datetime('now', '-10 minutes')
                )
                """,
                ("job-4", "noop", json.dumps({"message": "hello"})),
            )
            connection.commit()

        store = self._make_store(stale_lock_seconds=60)

        recovered_count = store.requeue_stale_jobs()
        row = self._fetch_job("job-4")

        self.assertEqual(recovered_count, 1)
        self.assertEqual(row["status"], "PENDING")
        self.assertIn("Worker lock expired; job requeued.", row["error"])
        self.assertIsNone(row["lockedAt"])
        self.assertIsNone(row["workerId"])

    def test_process_teams_intake_poll_stores_messages_and_updates_delta(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO TeamsIntakeSubscription (
                    id, teamId, channelId, active, deltaToken, createdByUserId, createdAt, updatedAt
                ) VALUES (
                    'sub-1', 'team-1', 'channel-1', 1, NULL, 'admin-1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                """
            )
            connection.commit()

        with patch(
            "starter_worker.main.list_teams_channel_messages",
            return_value={
                "value": [
                    {
                        "id": "teams-msg-1",
                        "createdDateTime": "2026-04-27T10:00:00Z",
                        "body": {"contentType": "html", "content": "<p>hi</p>"},
                        "from": {"user": {"id": "u-1", "displayName": "User One"}},
                    }
                ],
                "@odata.deltaLink": "/delta-token-1",
            },
        ):
            store = self._make_store()
            result = process_teams_intake_poll(store)

        self.assertEqual(result["created"], 1)
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT providerMessageId FROM TeamsInboundMessage WHERE providerMessageId = ?",
                ("teams-msg-1",),
            ).fetchone()
            self.assertIsNotNone(row)
            sub = connection.execute(
                "SELECT deltaToken FROM TeamsIntakeSubscription WHERE id = 'sub-1'",
            ).fetchone()
            self.assertEqual(sub["deltaToken"], "/delta-token-1")

    def test_load_config_reads_repo_env_file(self) -> None:
        env_path = Path(self.temp_dir.name) / ".env"
        env_path.write_text(
            'DATABASE_URL="postgresql://worker:test@localhost:5432/app"\n'
            'WORKER_POLL_INTERVAL_SECONDS="1.5"\n'
            'WORKER_ID="worker-from-env"\n'
            'WORKER_MAX_ATTEMPTS="5"\n'
            'WORKER_RETRY_BACKOFF_SECONDS="20"\n'
            'WORKER_STALE_LOCK_SECONDS="600"\n'
            'TEAMS_POLL_INTERVAL_SECONDS="45"\n',
            encoding="utf-8",
        )

        with patch.dict(os.environ, {}, clear=True):
            config = load_config(env_path=env_path)

        self.assertEqual(config.database_url, "postgresql://worker:test@localhost:5432/app")
        self.assertEqual(config.poll_interval_seconds, 1.5)
        self.assertEqual(config.worker_id, "worker-from-env")
        self.assertEqual(config.max_attempts, 5)
        self.assertEqual(config.retry_backoff_seconds, 20)
        self.assertEqual(config.stale_lock_seconds, 600)
        self.assertEqual(config.teams_poll_interval_seconds, 45)

    def test_load_config_prefers_worker_database_url(self) -> None:
        env_path = Path(self.temp_dir.name) / ".env"
        env_path.write_text(
            'DATABASE_URL="postgresql://legacy:test@localhost:5432/app"\n'
            'WORKER_DATABASE_URL="postgresql://worker:test@localhost:5432/app"\n',
            encoding="utf-8",
        )

        with patch.dict(os.environ, {}, clear=True):
            config = load_config(env_path=env_path)

        self.assertEqual(config.database_url, "postgresql://worker:test@localhost:5432/app")

    def test_worker_lifecycle_logs_use_structured_events(self) -> None:
        job = type(
            "Job",
            (),
            {"id": "job-1", "job_type": "noop", "attempt_count": 2},
        )()

        error = RuntimeError("bad job")
        with patch("starter_worker.main.worker_logger") as worker_logger:
            _log_jobs_requeued_stale(3)
            _log_teams_poll_scheduled()
            _log_job_claimed(job)
            _log_job_completed(job, {"status": "ok", "token": "secret"})
            _log_job_failed(job, error)

        worker_logger.warning.assert_called_once_with("jobs.requeued_stale", count=3)
        worker_logger.info.assert_any_call("teams.poll_scheduled")
        worker_logger.info.assert_any_call(
            "job.claimed",
            jobId="job-1",
            jobType="noop",
            attempt=2,
        )
        worker_logger.info.assert_any_call(
            "job.completed",
            jobId="job-1",
            jobType="noop",
            status="completed",
            result={"status": "ok", "token": "[REDACTED]"},
        )
        worker_logger.exception.assert_called_once_with(
            "job.failed",
            error,
            jobId="job-1",
            jobType="noop",
            attempt=2,
        )

    def test_worker_strips_prisma_only_postgres_url_params(self) -> None:
        url = normalize_postgres_database_url(
            "postgresql://worker:test@localhost:5432/app?connection_limit=10&sslmode=require"
        )

        self.assertEqual(
            url,
            "postgresql://worker:test@localhost:5432/app?sslmode=require",
        )

    def _make_store(
        self,
        *,
        max_attempts: int = 3,
        retry_backoff_seconds: float = 15,
        stale_lock_seconds: float = 300,
    ) -> JobStore:
        return JobStore(
            WorkerConfig(
                database_url=f"file:{self.db_path}",
                poll_interval_seconds=0.1,
                worker_id="worker-test",
                max_attempts=max_attempts,
                retry_backoff_seconds=retry_backoff_seconds,
                stale_lock_seconds=stale_lock_seconds,
                teams_poll_interval_seconds=60,
            )
        )

    def _create_schema(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                CREATE TABLE BackgroundJob (
                    id TEXT PRIMARY KEY,
                    jobType TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    payload TEXT,
                    result TEXT,
                    error TEXT,
                    attemptCount INTEGER NOT NULL DEFAULT 0,
                    availableAt TEXT NOT NULL,
                    startedAt TEXT,
                    lockedAt TEXT,
                    finishedAt TEXT,
                    workerId TEXT,
                    createdByUserId TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE Notification (
                    id TEXT PRIMARY KEY,
                    providerMessageId TEXT,
                    status TEXT NOT NULL DEFAULT 'QUEUED',
                    lastError TEXT,
                    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE InboundEmail (
                    id TEXT PRIMARY KEY,
                    providerMessageId TEXT NOT NULL UNIQUE,
                    mailbox TEXT NOT NULL,
                    internetMessageId TEXT,
                    conversationId TEXT,
                    senderEmail TEXT,
                    senderName TEXT,
                    subject TEXT NOT NULL,
                    bodyPreview TEXT,
                    bodyText TEXT,
                    bodyHtml TEXT,
                    inReplyTo TEXT,
                    referenceIds TEXT NOT NULL DEFAULT '[]',
                    receivedAt TEXT NOT NULL,
                    processingStatus TEXT NOT NULL DEFAULT 'RECEIVED',
                    processingNotes TEXT,
                    correlatedNotificationId TEXT,
                    linkedEntityType TEXT,
                    linkedEntityId TEXT,
                    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE TeamsOutboundMessage (
                    id TEXT PRIMARY KEY,
                    status TEXT NOT NULL DEFAULT 'QUEUED',
                    graphMessageId TEXT,
                    attemptCount INTEGER NOT NULL DEFAULT 0,
                    lastError TEXT,
                    sentAt TEXT,
                    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE TeamsIntegrationConfig (
                    id TEXT PRIMARY KEY,
                    sendEnabled INTEGER NOT NULL DEFAULT 0,
                    intakeEnabled INTEGER NOT NULL DEFAULT 0,
                    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE TeamsIntakeSubscription (
                    id TEXT PRIMARY KEY,
                    teamId TEXT NOT NULL,
                    channelId TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    deltaToken TEXT,
                    lastPolledAt TEXT,
                    createdByUserId TEXT NOT NULL,
                    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE TeamsInboundMessage (
                    id TEXT PRIMARY KEY,
                    subscriptionId TEXT NOT NULL,
                    providerMessageId TEXT NOT NULL UNIQUE,
                    teamId TEXT NOT NULL,
                    channelId TEXT NOT NULL,
                    senderDisplayName TEXT,
                    senderUserId TEXT,
                    content TEXT,
                    contentType TEXT,
                    truncated INTEGER NOT NULL DEFAULT 0,
                    processingStatus TEXT NOT NULL DEFAULT 'RECEIVED',
                    processingNotes TEXT,
                    messageCreatedAt TEXT NOT NULL,
                    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterOptimizationRun (
                    id TEXT PRIMARY KEY,
                    inputSetId TEXT,
                    jobId TEXT,
                    status TEXT NOT NULL DEFAULT 'PENDING',
                    outcome TEXT,
                    objectiveValue REAL,
                    objectiveBreakdown TEXT,
                    solverStatus TEXT,
                    settings TEXT NOT NULL DEFAULT '{}',
                    finishedAt TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterInputSet (
                    id TEXT PRIMARY KEY,
                    district TEXT NOT NULL,
                    seasonModelJson TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterHallCapacity (
                    id TEXT PRIMARY KEY,
                    district TEXT NOT NULL,
                    clubId TEXT NOT NULL,
                    hall TEXT NOT NULL,
                    weekday TEXT NOT NULL,
                    capacity INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterSnapshot (
                    id TEXT PRIMARY KEY,
                    runId TEXT,
                    district TEXT NOT NULL,
                    origin TEXT NOT NULL,
                    optimality TEXT NOT NULL,
                    stale INTEGER NOT NULL DEFAULT 0,
                    totalConflicts INTEGER NOT NULL DEFAULT 0,
                    totalExcess INTEGER NOT NULL DEFAULT 0,
                    maxExcess INTEGER NOT NULL DEFAULT 0,
                    affectedClubs INTEGER NOT NULL DEFAULT 0,
                    objectiveBreakdown TEXT NOT NULL DEFAULT '{}',
                    createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterAssignment (
                    id TEXT PRIMARY KEY,
                    snapshotId TEXT NOT NULL,
                    league TEXT NOT NULL,
                    "group" TEXT NOT NULL,
                    clubId TEXT NOT NULL,
                    clubName TEXT NOT NULL,
                    team TEXT NOT NULL,
                    rasterzahl INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    weekday TEXT NOT NULL,
                    hall TEXT NOT NULL,
                    startTime TEXT,
                    weekSlot TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterConflict (
                    id TEXT PRIMARY KEY,
                    snapshotId TEXT NOT NULL,
                    matchWeek INTEGER NOT NULL,
                    clubId TEXT NOT NULL,
                    clubName TEXT NOT NULL,
                    weekday TEXT NOT NULL,
                    hall TEXT NOT NULL,
                    capacity INTEGER NOT NULL,
                    actualCount INTEGER NOT NULL,
                    excess INTEGER NOT NULL,
                    teams TEXT NOT NULL
                )
                """
            )
            connection.commit()

    def _insert_job(self, job_id: str, job_type: str, payload: dict[str, object]) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO BackgroundJob (
                    id, jobType, status, payload, attemptCount,
                    availableAt, createdAt, updatedAt
                ) VALUES (?, ?, 'PENDING', ?, 0, datetime('now', '-1 minute'), datetime('now'), datetime('now'))
                """,
                (job_id, job_type, json.dumps(payload)),
            )
            connection.commit()

    def _fetch_job(self, job_id: str) -> sqlite3.Row:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            row: sqlite3.Row | None = connection.execute(
                "SELECT * FROM BackgroundJob WHERE id = ?",
                (job_id,),
            ).fetchone()

        assert row is not None
        return row

    def _insert_notification(
        self,
        notification_id: str,
        *,
        provider_message_id: str | None = None,
    ) -> None:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.execute(
                """
                INSERT INTO Notification (id, providerMessageId, status, lastError, updatedAt)
                VALUES (?, ?, 'SENT', NULL, CURRENT_TIMESTAMP)
                """,
                (
                    notification_id,
                    provider_message_id or f"<provider-{notification_id}@example.com>",
                ),
            )
            connection.commit()

    def _fetch_notification(self, notification_id: str) -> sqlite3.Row:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            row: sqlite3.Row | None = connection.execute(
                "SELECT * FROM Notification WHERE id = ?",
                (notification_id,),
            ).fetchone()

        assert row is not None
        return row

    def _fetch_inbound_email(self, inbound_email_id: str) -> sqlite3.Row:
        with closing(sqlite3.connect(self.db_path)) as connection:
            connection.row_factory = sqlite3.Row
            row: sqlite3.Row | None = connection.execute(
                "SELECT * FROM InboundEmail WHERE id = ?",
                (inbound_email_id,),
            ).fetchone()

        assert row is not None
        return row


if __name__ == "__main__":
    unittest.main()
