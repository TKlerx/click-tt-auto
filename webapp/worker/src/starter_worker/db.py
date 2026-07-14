from __future__ import annotations

import json
import re
import sqlite3
import uuid
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg.rows import dict_row

from .config import WorkerConfig

PRISMA_ONLY_QUERY_PARAMS = frozenset({"connection_limit"})


def normalize_postgres_database_url(database_url: str) -> str:
    if database_url.startswith("file:"):
        return database_url

    parsed = urlsplit(database_url)
    query = urlencode(
        [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if key not in PRISMA_ONLY_QUERY_PARAMS
        ],
    )
    return urlunsplit(parsed._replace(query=query))


@dataclass
class BackgroundJob:
    id: str
    job_type: str
    payload: dict[str, Any]
    attempt_count: int


class JobStore:
    def __init__(self, config: WorkerConfig) -> None:
        self._config = config
        self._is_sqlite = config.database_url.startswith("file:")
        self._sqlite_path: Path | None = None
        self._postgres_database_url = normalize_postgres_database_url(
            config.database_url,
        )
        if self._is_sqlite:
            self._sqlite_path = Path(config.database_url.removeprefix("file:")).resolve()

    def _sqlite_conn(self) -> sqlite3.Connection:
        assert self._sqlite_path is not None
        return sqlite3.connect(self._sqlite_path)

    def claim_next_job(self) -> BackgroundJob | None:
        if self._is_sqlite:
            return self._claim_sqlite_job()

        return self._claim_postgres_job()

    def requeue_stale_jobs(self) -> int:
        if self._is_sqlite:
            return self._requeue_stale_sqlite_jobs()

        return self._requeue_stale_postgres_jobs()

    def complete_job(self, job_id: str, result: dict[str, Any]) -> None:
        payload = json.dumps(result)
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE BackgroundJob
                    SET status = 'COMPLETED',
                        result = ?,
                        error = NULL,
                        lockedAt = NULL,
                        finishedAt = CURRENT_TIMESTAMP,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (payload, job_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "BackgroundJob"
                    SET status = 'COMPLETED',
                        result = %s,
                        error = NULL,
                        "lockedAt" = NULL,
                        "finishedAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (payload, job_id),
                )
            connection.commit()

    def fail_job(self, job_id: str, error: str, *, retry: bool = True) -> None:
        if self._is_sqlite:
            self._fail_sqlite_job(job_id, error, retry=retry)
            return

        self._fail_postgres_job(job_id, error, retry=retry)

    def mark_notification_processing(self, notification_id: str, attempt_count: int) -> None:
        retry_count = max(attempt_count - 1, 0)
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE Notification
                    SET status = 'SENDING',
                        retryCount = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (retry_count, notification_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Notification"
                    SET status = 'SENDING',
                        "retryCount" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (retry_count, notification_id),
                )
            connection.commit()

    def mark_notification_sent(self, notification_id: str, attempt_count: int) -> None:
        retry_count = max(attempt_count - 1, 0)
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE Notification
                    SET status = 'SENT',
                        retryCount = ?,
                        lastError = NULL,
                        sentAt = CURRENT_TIMESTAMP,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (retry_count, notification_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Notification"
                    SET status = 'SENT',
                        "retryCount" = %s,
                        "lastError" = NULL,
                        "sentAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (retry_count, notification_id),
                )
            connection.commit()

    def mark_notification_failed(
        self,
        notification_id: str,
        error: str,
        attempt_count: int,
        *,
        will_retry: bool,
    ) -> None:
        retry_count = max(attempt_count - 1, 0)
        status = "RETRYING" if will_retry else "FAILED"
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE Notification
                    SET status = ?,
                        retryCount = ?,
                        lastError = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, retry_count, error, notification_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Notification"
                    SET status = %s,
                        "retryCount" = %s,
                        "lastError" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (status, retry_count, error, notification_id),
                )
            connection.commit()

    def mark_raster_run_running(self, run_id: str, job_id: str) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE RasterOptimizationRun
                    SET status = 'RUNNING',
                        outcome = NULL,
                        solverStatus = NULL,
                        finishedAt = NULL,
                        jobId = ?
                    WHERE id = ?
                      AND status != 'CANCELLED'
                    """,
                    (job_id, run_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "RasterOptimizationRun"
                    SET status = 'RUNNING',
                        outcome = NULL,
                        "solverStatus" = NULL,
                        "finishedAt" = NULL,
                        "jobId" = %s
                    WHERE id = %s
                      AND status != 'CANCELLED'
                    """,
                    (job_id, run_id),
                )
            connection.commit()

    def mark_raster_run_succeeded(self, run_id: str) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE RasterOptimizationRun
                    SET status = 'SUCCEEDED',
                        finishedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (run_id,),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "RasterOptimizationRun"
                    SET status = 'SUCCEEDED',
                        "finishedAt" = NOW()
                    WHERE id = %s
                    """,
                    (run_id,),
                )
            connection.commit()

    def mark_raster_run_failed(self, run_id: str, error: str) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE RasterOptimizationRun
                    SET status = 'FAILED',
                        outcome = 'FAILED',
                        solverStatus = ?,
                        finishedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (error, run_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "RasterOptimizationRun"
                    SET status = 'FAILED',
                        outcome = 'FAILED',
                        "solverStatus" = %s,
                        "finishedAt" = NOW()
                    WHERE id = %s
                    """,
                    (error, run_id),
                )
            connection.commit()

    def mark_raster_run_infeasible(self, run_id: str, reason: str) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE RasterOptimizationRun
                    SET status = 'FAILED',
                        outcome = 'INFEASIBLE',
                        solverStatus = ?,
                        finishedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (reason, run_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "RasterOptimizationRun"
                    SET status = 'FAILED',
                        outcome = 'INFEASIBLE',
                        "solverStatus" = %s,
                        "finishedAt" = NOW()
                    WHERE id = %s
                    """,
                    (reason, run_id),
                )
            connection.commit()

    def get_raster_run_context(self, run_id: str) -> dict[str, Any]:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                row = connection.execute(
                    """
                    SELECT run.id, run.status, run.settings, input.district, input.seasonModelJson
                    FROM RasterOptimizationRun run
                    JOIN RasterInputSet input ON input.id = run.inputSetId
                    WHERE run.id = ?
                    """,
                    (run_id,),
                ).fetchone()
                if row is None:
                    raise ValueError(f"Raster run {run_id} not found")
                return dict(row)

        with psycopg.connect(self._postgres_database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT run.id, run.status, run.settings, input.district, input."seasonModelJson"
                    FROM "RasterOptimizationRun" run
                    JOIN "RasterInputSet" input ON input.id = run."inputSetId"
                    WHERE run.id = %s
                    """,
                    (run_id,),
                )
                row = cursor.fetchone()
            connection.commit()
            if row is None:
                raise ValueError(f"Raster run {run_id} not found")
            return dict(row)

    def get_raster_run_status(self, run_id: str) -> str:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                row = connection.execute(
                    "SELECT status FROM RasterOptimizationRun WHERE id = ?",
                    (run_id,),
                ).fetchone()
                if row is None:
                    raise ValueError(f"Raster run {run_id} not found")
                return str(row[0])

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT status FROM "RasterOptimizationRun" WHERE id = %s',
                    (run_id,),
                )
                row = cursor.fetchone()
            connection.commit()
            if row is None:
                raise ValueError(f"Raster run {run_id} not found")
            return str(row[0])

    def list_raster_hall_capacities(self, district: str) -> list[dict[str, Any]]:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """
                    SELECT clubId, hall, weekday, capacity
                    FROM RasterHallCapacity
                    WHERE district = ?
                    """,
                    (district,),
                ).fetchall()
                return [dict(row) for row in rows]

        with psycopg.connect(self._postgres_database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT "clubId", hall, weekday, capacity
                    FROM "RasterHallCapacity"
                    WHERE district = %s
                    """,
                    (district,),
                )
                rows = cursor.fetchall()
            connection.commit()
            return list(rows)

    def persist_raster_run_result(
        self,
        *,
        run_id: str,
        district: str,
        model: dict[str, Any],
        solver_output: dict[str, Any],
    ) -> str:
        snapshot_id = _new_id()
        metadata = solver_output["metadata"]
        assignment = solver_output["assignment"]
        overages = _find_overage_rows(model, assignment)
        total_excess = sum(int(row["excess"]) for row in overages)
        affected_clubs = len({str(row["clubId"]) for row in overages})
        max_excess = max([int(row["excess"]) for row in overages], default=0)
        optimality = _raster_success_outcome(str(metadata.get("status") or ""))
        outcome = optimality
        assignments = _assignment_rows(snapshot_id, model, assignment)
        objective_breakdown = json.dumps(
            metadata.get("objectiveBreakdown")
            or _objective_breakdown(overages, metadata.get("weights"))
        )

        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute("BEGIN")
                connection.execute(
                    """
                    INSERT INTO RasterSnapshot (
                        id, runId, district, origin, optimality, stale, totalConflicts,
                        totalExcess, maxExcess, affectedClubs, objectiveBreakdown, createdAt
                    ) VALUES (?, ?, ?, 'GENERATED', ?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    """,
                    (
                        snapshot_id,
                        run_id,
                        district,
                        optimality,
                        len(overages),
                        total_excess,
                        max_excess,
                        affected_clubs,
                        objective_breakdown,
                    ),
                )
                connection.executemany(
                    """
                    INSERT INTO RasterAssignment (
                        id, snapshotId, league, "group", clubId, clubName, team, rasterzahl,
                        status, weekday, hall, startTime, weekSlot
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    assignments,
                )
                connection.executemany(
                    """
                    INSERT INTO RasterConflict (
                        id, snapshotId, matchWeek, clubId, clubName, weekday, hall,
                        capacity, actualCount, excess, teams
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    _conflict_rows(snapshot_id, model, overages),
                )
                connection.execute(
                    """
                    UPDATE RasterOptimizationRun
                    SET status = 'SUCCEEDED', outcome = ?, objectiveValue = ?,
                        objectiveBreakdown = ?, solverStatus = ?, finishedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        outcome,
                        metadata.get("objective"),
                        objective_breakdown,
                        metadata.get("status"),
                        run_id,
                    ),
                )
                connection.commit()
                return snapshot_id

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO "RasterSnapshot" (
                        id, "runId", district, origin, optimality, stale, "totalConflicts",
                        "totalExcess", "maxExcess", "affectedClubs", "objectiveBreakdown", "createdAt"
                    ) VALUES (%s, %s, %s, 'GENERATED', %s, false, %s, %s, %s, %s, %s, NOW())
                    """,
                    (
                        snapshot_id,
                        run_id,
                        district,
                        optimality,
                        len(overages),
                        total_excess,
                        max_excess,
                        affected_clubs,
                        objective_breakdown,
                    ),
                )
                cursor.executemany(
                    """
                    INSERT INTO "RasterAssignment" (
                        id, "snapshotId", league, "group", "clubId", "clubName", team, rasterzahl,
                        status, weekday, hall, "startTime", "weekSlot"
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    assignments,
                )
                cursor.executemany(
                    """
                    INSERT INTO "RasterConflict" (
                        id, "snapshotId", "matchWeek", "clubId", "clubName", weekday, hall,
                        capacity, "actualCount", excess, teams
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    _conflict_rows(snapshot_id, model, overages),
                )
                cursor.execute(
                    """
                    UPDATE "RasterOptimizationRun"
                    SET status = 'SUCCEEDED', outcome = %s, "objectiveValue" = %s,
                        "objectiveBreakdown" = %s, "solverStatus" = %s, "finishedAt" = NOW()
                    WHERE id = %s
                    """,
                    (
                        outcome,
                        metadata.get("objective"),
                        objective_breakdown,
                        metadata.get("status"),
                        run_id,
                    ),
                )
            connection.commit()
            return snapshot_id

    def has_inbound_email(self, provider_message_id: str) -> bool:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                row = connection.execute(
                    "SELECT 1 FROM InboundEmail WHERE providerMessageId = ? LIMIT 1",
                    (provider_message_id,),
                ).fetchone()
                return row is not None

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT 1 FROM "InboundEmail" WHERE "providerMessageId" = %s LIMIT 1',
                    (provider_message_id,),
                )
                row = cursor.fetchone()
            connection.commit()
            return row is not None

    def create_inbound_email(self, payload: dict[str, Any]) -> str:
        reference_ids = json.dumps(payload.get("referenceIds") or [])
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                cursor = connection.execute(
                    """
                    INSERT INTO InboundEmail (
                        id, providerMessageId, mailbox, internetMessageId, conversationId,
                        senderEmail, senderName, subject, bodyPreview, bodyText, bodyHtml,
                        inReplyTo, referenceIds, receivedAt, processingStatus, createdAt, updatedAt
                    ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    )
                    """,
                    (
                        payload["id"],
                        payload["providerMessageId"],
                        payload["mailbox"],
                        payload.get("internetMessageId"),
                        payload.get("conversationId"),
                        payload.get("senderEmail"),
                        payload.get("senderName"),
                        payload.get("subject") or "",
                        payload.get("bodyPreview"),
                        payload.get("bodyText"),
                        payload.get("bodyHtml"),
                        payload.get("inReplyTo"),
                        reference_ids,
                        payload["receivedAt"],
                    ),
                )
                connection.commit()
                return str(payload["id"] if cursor.rowcount else payload["id"])

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as pg_cursor:
                pg_cursor.execute(
                    """
                    INSERT INTO "InboundEmail" (
                        id, "providerMessageId", mailbox, "internetMessageId", "conversationId",
                        "senderEmail", "senderName", subject, "bodyPreview", "bodyText", "bodyHtml",
                        "inReplyTo", "referenceIds", "receivedAt", "processingStatus", "createdAt", "updatedAt"
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'RECEIVED', NOW(), NOW()
                    )
                    """,
                    (
                        payload["id"],
                        payload["providerMessageId"],
                        payload["mailbox"],
                        payload.get("internetMessageId"),
                        payload.get("conversationId"),
                        payload.get("senderEmail"),
                        payload.get("senderName"),
                        payload.get("subject") or "",
                        payload.get("bodyPreview"),
                        payload.get("bodyText"),
                        payload.get("bodyHtml"),
                        payload.get("inReplyTo"),
                        reference_ids,
                        payload["receivedAt"],
                    ),
                )
            connection.commit()
        return str(payload["id"])

    def update_inbound_email(
        self,
        inbound_email_id: str,
        *,
        processing_status: str,
        processing_notes: str,
        correlated_notification_id: str | None = None,
        linked_entity_type: str | None = None,
        linked_entity_id: str | None = None,
    ) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE InboundEmail
                    SET processingStatus = ?,
                        processingNotes = ?,
                        correlatedNotificationId = ?,
                        linkedEntityType = ?,
                        linkedEntityId = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        processing_status,
                        processing_notes,
                        correlated_notification_id,
                        linked_entity_type,
                        linked_entity_id,
                        inbound_email_id,
                    ),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "InboundEmail"
                    SET "processingStatus" = %s,
                        "processingNotes" = %s,
                        "correlatedNotificationId" = %s,
                        "linkedEntityType" = %s,
                        "linkedEntityId" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (
                        processing_status,
                        processing_notes,
                        correlated_notification_id,
                        linked_entity_type,
                        linked_entity_id,
                        inbound_email_id,
                    ),
                )
            connection.commit()

    def mark_notification_bounced(self, notification_id: str, error: str) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE Notification
                    SET status = 'BOUNCED',
                        lastError = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (error, notification_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "Notification"
                    SET status = 'BOUNCED',
                        "lastError" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (error, notification_id),
                )
            connection.commit()

    def find_notification_by_provider_message_id(
        self, provider_message_ids: list[str]
    ) -> dict[str, object] | None:
        if not provider_message_ids:
            return None

        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                for provider_message_id in provider_message_ids:
                    row = connection.execute(
                        """
                        SELECT id, providerMessageId
                        FROM Notification
                        WHERE providerMessageId = ?
                        LIMIT 1
                        """,
                        (provider_message_id,),
                    ).fetchone()
                    if row is not None:
                        return dict(row)
            return None

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT id, "providerMessageId"
                    FROM "Notification"
                    WHERE "providerMessageId" = ANY(%s)
                    LIMIT 1
                    """,
                    (provider_message_ids,),
                )
                return cursor.fetchone()

    def mark_teams_outbound_processing(self, outbound_message_id: str, attempt_count: int) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE TeamsOutboundMessage
                    SET status = 'SENDING',
                        attemptCount = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (attempt_count, outbound_message_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "TeamsOutboundMessage"
                    SET status = 'SENDING',
                        "attemptCount" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (attempt_count, outbound_message_id),
                )
            connection.commit()

    def mark_teams_outbound_sent(
        self, outbound_message_id: str, graph_message_id: str | None
    ) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE TeamsOutboundMessage
                    SET status = 'SENT',
                        graphMessageId = ?,
                        lastError = NULL,
                        sentAt = CURRENT_TIMESTAMP,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (graph_message_id, outbound_message_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "TeamsOutboundMessage"
                    SET status = 'SENT',
                        "graphMessageId" = %s,
                        "lastError" = NULL,
                        "sentAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (graph_message_id, outbound_message_id),
                )
            connection.commit()

    def mark_teams_outbound_failed(
        self,
        outbound_message_id: str,
        error: str,
        attempt_count: int,
        *,
        will_retry: bool,
    ) -> None:
        status = "RETRYING" if will_retry else "FAILED"
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE TeamsOutboundMessage
                    SET status = ?,
                        attemptCount = ?,
                        lastError = ?,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (status, attempt_count, error, outbound_message_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "TeamsOutboundMessage"
                    SET status = %s,
                        "attemptCount" = %s,
                        "lastError" = %s,
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (status, attempt_count, error, outbound_message_id),
                )
            connection.commit()

    def has_teams_inbound_message(self, provider_message_id: str) -> bool:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                row = connection.execute(
                    "SELECT 1 FROM TeamsInboundMessage WHERE providerMessageId = ? LIMIT 1",
                    (provider_message_id,),
                ).fetchone()
                return row is not None

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT 1 FROM "TeamsInboundMessage" WHERE "providerMessageId" = %s LIMIT 1',
                    (provider_message_id,),
                )
                row = cursor.fetchone()
            connection.commit()
            return row is not None

    def create_teams_inbound_message(self, payload: dict[str, Any]) -> str:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    INSERT INTO TeamsInboundMessage (
                        id, subscriptionId, providerMessageId, teamId, channelId, senderDisplayName,
                        senderUserId, content, contentType, truncated, processingStatus,
                        processingNotes, messageCreatedAt, createdAt, updatedAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED', NULL, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                    """,
                    (
                        payload["id"],
                        payload["subscriptionId"],
                        payload["providerMessageId"],
                        payload["teamId"],
                        payload["channelId"],
                        payload.get("senderDisplayName"),
                        payload.get("senderUserId"),
                        payload.get("content"),
                        payload.get("contentType"),
                        bool(payload.get("truncated")),
                        payload["messageCreatedAt"],
                    ),
                )
                connection.commit()
            return str(payload["id"])

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO "TeamsInboundMessage" (
                        id, "subscriptionId", "providerMessageId", "teamId", "channelId", "senderDisplayName",
                        "senderUserId", content, "contentType", truncated, "processingStatus",
                        "processingNotes", "messageCreatedAt", "createdAt", "updatedAt"
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'RECEIVED', NULL, %s, NOW(), NOW())
                    """,
                    (
                        payload["id"],
                        payload["subscriptionId"],
                        payload["providerMessageId"],
                        payload["teamId"],
                        payload["channelId"],
                        payload.get("senderDisplayName"),
                        payload.get("senderUserId"),
                        payload.get("content"),
                        payload.get("contentType"),
                        bool(payload.get("truncated")),
                        payload["messageCreatedAt"],
                    ),
                )
            connection.commit()
        return str(payload["id"])

    def update_teams_subscription_poll_state(
        self,
        subscription_id: str,
        delta_token: str | None,
    ) -> None:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.execute(
                    """
                    UPDATE TeamsIntakeSubscription
                    SET deltaToken = ?,
                        lastPolledAt = CURRENT_TIMESTAMP,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (delta_token, subscription_id),
                )
                connection.commit()
            return

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "TeamsIntakeSubscription"
                    SET "deltaToken" = %s,
                        "lastPolledAt" = NOW(),
                        "updatedAt" = NOW()
                    WHERE id = %s
                    """,
                    (delta_token, subscription_id),
                )
            connection.commit()

    def list_active_teams_subscriptions(self) -> list[dict[str, Any]]:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                rows = connection.execute(
                    """
                    SELECT id, teamId, channelId, deltaToken
                    FROM TeamsIntakeSubscription
                    WHERE active = 1
                    ORDER BY createdAt ASC
                    """
                ).fetchall()
                return [dict(row) for row in rows]

        with psycopg.connect(self._postgres_database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, "teamId", "channelId", "deltaToken"
                    FROM "TeamsIntakeSubscription"
                    WHERE active = true
                    ORDER BY "createdAt" ASC
                    """
                )
                rows = cursor.fetchall()
            connection.commit()
            return list(rows)

    def create_teams_intake_poll_job_if_missing(self) -> bool:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                existing = connection.execute(
                    """
                    SELECT 1 FROM BackgroundJob
                    WHERE jobType = 'teams_intake_poll'
                      AND status IN ('PENDING', 'IN_PROGRESS')
                    LIMIT 1
                    """
                ).fetchone()
                if existing:
                    return False

                connection.execute(
                    """
                    INSERT INTO BackgroundJob (
                        id, jobType, status, payload, attemptCount, availableAt, createdAt, updatedAt
                    ) VALUES (
                        lower(hex(randomblob(16))),
                        'teams_intake_poll',
                        'PENDING',
                        '{}',
                        0,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    """
                )
                connection.commit()
                return True

        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT 1 FROM "BackgroundJob"
                    WHERE "jobType" = 'teams_intake_poll'
                      AND status IN ('PENDING', 'IN_PROGRESS')
                    LIMIT 1
                    """
                )
                if cursor.fetchone():
                    connection.commit()
                    return False

                cursor.execute(
                    """
                    INSERT INTO "BackgroundJob" (
                        id, "jobType", status, payload, "attemptCount", "availableAt", "createdAt", "updatedAt"
                    ) VALUES (
                        md5(random()::text || clock_timestamp()::text),
                        'teams_intake_poll',
                        'PENDING',
                        '{}',
                        0,
                        NOW(),
                        NOW(),
                        NOW()
                    )
                    """
                )
            connection.commit()
            return True

    def get_teams_integration_flags(self) -> dict[str, bool]:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                row = connection.execute(
                    """
                    SELECT sendEnabled, intakeEnabled
                    FROM TeamsIntegrationConfig
                    ORDER BY createdAt ASC
                    LIMIT 1
                    """
                ).fetchone()
                if not row:
                    return {"sendEnabled": False, "intakeEnabled": False}
                return {
                    "sendEnabled": bool(row["sendEnabled"]),
                    "intakeEnabled": bool(row["intakeEnabled"]),
                }

        with psycopg.connect(self._postgres_database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT "sendEnabled", "intakeEnabled"
                    FROM "TeamsIntegrationConfig"
                    ORDER BY "createdAt" ASC
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()
            connection.commit()
            if not row:
                return {"sendEnabled": False, "intakeEnabled": False}
            return {
                "sendEnabled": bool(row["sendEnabled"]),
                "intakeEnabled": bool(row["intakeEnabled"]),
            }

    def _claim_sqlite_job(self) -> BackgroundJob | None:
        with closing(self._sqlite_conn()) as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                """
                SELECT id, jobType, payload, attemptCount
                FROM BackgroundJob
                WHERE status = 'PENDING'
                  AND datetime(availableAt) <= datetime('now')
                ORDER BY createdAt ASC
                LIMIT 1
                """
            ).fetchone()

            if row is None:
                connection.commit()
                return None

            connection.execute(
                """
                UPDATE BackgroundJob
                SET status = 'IN_PROGRESS',
                    attemptCount = attemptCount + 1,
                    startedAt = COALESCE(startedAt, CURRENT_TIMESTAMP),
                    lockedAt = CURRENT_TIMESTAMP,
                    workerId = ?,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (self._config.worker_id, row["id"]),
            )
            connection.commit()

            return BackgroundJob(
                id=row["id"],
                job_type=row["jobType"],
                payload=_parse_payload(row["payload"]),
                attempt_count=row["attemptCount"] + 1,
            )

    def _claim_postgres_job(self) -> BackgroundJob | None:
        with psycopg.connect(self._postgres_database_url, row_factory=dict_row) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    WITH next_job AS (
                        SELECT id
                        FROM "BackgroundJob"
                        WHERE status = 'PENDING'
                          AND "availableAt" <= NOW()
                        ORDER BY "createdAt" ASC
                        FOR UPDATE SKIP LOCKED
                        LIMIT 1
                    )
                    UPDATE "BackgroundJob" job
                    SET status = 'IN_PROGRESS',
                        "attemptCount" = job."attemptCount" + 1,
                        "startedAt" = COALESCE(job."startedAt", NOW()),
                        "lockedAt" = NOW(),
                        "workerId" = %s,
                        "updatedAt" = NOW()
                    FROM next_job
                    WHERE job.id = next_job.id
                    RETURNING job.id, job."jobType", job.payload, job."attemptCount"
                    """,
                    (self._config.worker_id,),
                )
                row = cursor.fetchone()
            connection.commit()

        if row is None:
            return None

        return BackgroundJob(
            id=row["id"],
            job_type=row["jobType"],
            payload=_parse_payload(row["payload"]),
            attempt_count=row["attemptCount"],
        )

    def _requeue_stale_sqlite_jobs(self) -> int:
        with closing(self._sqlite_conn()) as connection:
            cursor = connection.execute(
                """
                UPDATE BackgroundJob
                SET status = 'PENDING',
                    error = CASE
                        WHEN error IS NULL OR error = '' THEN 'Worker lock expired; job requeued.'
                        ELSE error || '\nWorker lock expired; job requeued.'
                    END,
                    availableAt = CURRENT_TIMESTAMP,
                    lockedAt = NULL,
                    workerId = NULL,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE status = 'IN_PROGRESS'
                  AND lockedAt IS NOT NULL
                  AND datetime(lockedAt) <= datetime('now', ?)
                """,
                (f"-{self._config.stale_lock_seconds} seconds",),
            )
            connection.commit()
            return int(cursor.rowcount or 0)

    def _requeue_stale_postgres_jobs(self) -> int:
        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    UPDATE "BackgroundJob"
                    SET status = 'PENDING',
                        error = CASE
                            WHEN error IS NULL OR error = '' THEN 'Worker lock expired; job requeued.'
                            ELSE error || E'\nWorker lock expired; job requeued.'
                        END,
                        "availableAt" = NOW(),
                        "lockedAt" = NULL,
                        "workerId" = NULL,
                        "updatedAt" = NOW()
                    WHERE status = 'IN_PROGRESS'
                      AND "lockedAt" IS NOT NULL
                      AND "lockedAt" <= NOW() - (%s * INTERVAL '1 second')
                    """,
                    (self._config.stale_lock_seconds,),
                )
                row_count = int(cursor.rowcount or 0)
            connection.commit()
            return row_count

    def _fail_sqlite_job(self, job_id: str, error: str, *, retry: bool) -> None:
        with closing(self._sqlite_conn()) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT attemptCount FROM BackgroundJob WHERE id = ?",
                (job_id,),
            ).fetchone()
            if row is None:
                return

            attempt_count = int(row["attemptCount"])
            should_retry = retry and attempt_count < self._config.max_attempts
            if should_retry:
                connection.execute(
                    """
                    UPDATE BackgroundJob
                    SET status = 'PENDING',
                        error = ?,
                        availableAt = ?,
                        lockedAt = NULL,
                        finishedAt = NULL,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        error,
                        _sqlite_timestamp_after_seconds(self._retry_delay_seconds(attempt_count)),
                        job_id,
                    ),
                )
            else:
                connection.execute(
                    """
                    UPDATE BackgroundJob
                    SET status = 'FAILED',
                        error = ?,
                        lockedAt = NULL,
                        finishedAt = CURRENT_TIMESTAMP,
                        updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (error, job_id),
                )
            connection.commit()

    def _fail_postgres_job(self, job_id: str, error: str, *, retry: bool) -> None:
        with psycopg.connect(self._postgres_database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    'SELECT "attemptCount" FROM "BackgroundJob" WHERE id = %s',
                    (job_id,),
                )
                row = cursor.fetchone()
                if row is None:
                    connection.commit()
                    return

                attempt_count = int(row[0])
                should_retry = retry and attempt_count < self._config.max_attempts
                if should_retry:
                    cursor.execute(
                        """
                        UPDATE "BackgroundJob"
                        SET status = 'PENDING',
                            error = %s,
                            "availableAt" = %s,
                            "lockedAt" = NULL,
                            "finishedAt" = NULL,
                            "updatedAt" = NOW()
                        WHERE id = %s
                        """,
                        (
                            error,
                            datetime.now(timezone.utc)
                            + timedelta(seconds=self._retry_delay_seconds(attempt_count)),
                            job_id,
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        UPDATE "BackgroundJob"
                        SET status = 'FAILED',
                            error = %s,
                            "lockedAt" = NULL,
                            "finishedAt" = NOW(),
                            "updatedAt" = NOW()
                        WHERE id = %s
                        """,
                        (error, job_id),
                    )
            connection.commit()

    def _retry_delay_seconds(self, attempt_count: int) -> float:
        multiplier = max(attempt_count, 1)
        return max(self._config.retry_backoff_seconds, 0) * multiplier


def _parse_payload(value: str | None) -> dict[str, Any]:
    if not value:
        return {}

    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {"raw": value}

    return parsed if isinstance(parsed, dict) else {"value": parsed}


def _sqlite_timestamp_after_seconds(delay_seconds: float) -> str:
    scheduled_for = datetime.now(timezone.utc) + timedelta(seconds=delay_seconds)
    return scheduled_for.strftime("%Y-%m-%d %H:%M:%S")


def _new_id() -> str:
    return uuid.uuid4().hex


def _objective_breakdown(overages: list[dict[str, Any]], weights: object) -> dict[str, int]:
    parsed = weights if isinstance(weights, dict) else {}
    over_usage_weight = int(parsed.get("overUsage") or 10)
    fairness_weight = int(parsed.get("overUsageFairness") or 1)
    over_usage = sum(int(row["excess"]) ** 2 for row in overages) * over_usage_weight
    by_club: dict[str, int] = {}
    for row in overages:
        club_id = str(row["clubId"])
        by_club[club_id] = by_club.get(club_id, 0) + int(row["excess"])
    return {
        "overUsage": over_usage,
        "overUsageFairness": sum(excess**2 for excess in by_club.values()) * fairness_weight,
        "wechsel": 0,
        "zeitgleich": 0,
        "sameClubDerbySt4": 0,
        "spielwoche": 0,
    }


def _raster_success_outcome(status: str) -> str:
    normalized = status.strip().upper()
    if normalized == "OPTIMAL":
        return "PROVEN_OPTIMAL"
    return "FEASIBLE"


def _assignment_rows(
    snapshot_id: str, model: dict[str, Any], assignment: dict[str, Any]
) -> list[tuple[Any, ...]]:
    teams = {str(team.get("id") or ""): team for team in _dicts(model.get("teams"))}
    clubs = {str(club.get("id") or ""): club for club in _dicts(model.get("clubs"))}
    rows: list[tuple[Any, ...]] = []
    for group in _dicts(model.get("groups")):
        ref_raw = group.get("ref")
        ref: dict[str, Any] = ref_raw if isinstance(ref_raw, dict) else {}
        league = str(ref.get("league") or "")
        group_name = str(ref.get("name") or "")
        for team_id in group.get("teamIds") or []:
            team = teams.get(str(team_id))
            if not team:
                continue
            club = clubs.get(str(team.get("clubId") or "")) or {}
            rasterzahl = int(assignment.get(str(team_id)) or 0)
            raster_raw = team.get("rasterzahl")
            raster: dict[str, Any] = raster_raw if isinstance(raster_raw, dict) else {}
            rows.append(
                (
                    _new_id(),
                    snapshot_id,
                    league,
                    group_name,
                    str(team.get("clubId") or ""),
                    str(club.get("name") or team.get("clubId") or ""),
                    str(team.get("name") or team.get("label") or team_id),
                    rasterzahl,
                    _assignment_status(str(raster.get("kind") or "")),
                    _weekday_to_db(str(team.get("homeWeekday") or "")),
                    str(team.get("hall") or "1"),
                    team.get("startTime"),
                    team.get("spielwochePref"),
                )
            )
    return rows


def _conflict_rows(
    snapshot_id: str, model: dict[str, Any], overages: list[dict[str, Any]]
) -> list[tuple[Any, ...]]:
    clubs = {str(club.get("id") or ""): club for club in _dicts(model.get("clubs"))}
    return [
        (
            _new_id(),
            snapshot_id,
            int(row["week"]),
            str(row["clubId"]),
            str(clubs.get(str(row["clubId"]), {}).get("name") or row["clubId"]),
            _weekday_to_db(str(row["weekday"])),
            str(row["hall"]),
            int(row["capacity"]),
            int(row["actualCount"]),
            int(row["excess"]),
            json.dumps(row["teams"]),
        )
        for row in overages
    ]


def _find_overage_rows(model: dict[str, Any], assignment: dict[str, Any]) -> list[dict[str, Any]]:
    teams = _dicts(model.get("teams"))
    groups = _dicts(model.get("groups"))
    clubs = _dicts(model.get("clubs"))
    team_group = {str(team_id): group for group in groups for team_id in group.get("teamIds", [])}
    group_byes = {_group_key(group): _unused_rasterzahl(group, assignment) for group in groups}
    inferred_capacities = _inferred_capacities(teams)
    slots: dict[tuple[str, str, str, int], dict[str, Any]] = {}
    for team in teams:
        if team.get("capacityRelevant") is False:
            continue
        team_id = str(team.get("id") or "")
        group = team_group.get(team_id)
        rasterzahl = int(assignment.get(team_id) or 0)
        if not isinstance(group, dict) or not rasterzahl:
            continue
        capacity = _capacity_for(clubs, team, inferred_capacities)
        if capacity is None:
            continue
        raw_raster = team.get("rasterzahl")
        raster: dict[str, Any] = raw_raster if isinstance(raw_raster, dict) else {}
        for week in _unique_home_weeks(group, rasterzahl, group_byes.get(_group_key(group))):
            key = (
                str(team.get("clubId") or ""),
                str(team.get("hall") or "1"),
                str(team.get("homeWeekday") or ""),
                week,
            )
            slot = slots.setdefault(key, {"teams": [], "capacity": capacity})
            slot["teams"].append(
                {
                    "id": team_id,
                    "league": str((group.get("ref") or {}).get("league") or ""),
                    "group": str((group.get("ref") or {}).get("name") or ""),
                    "label": team.get("label"),
                    "assignedRasterzahl": rasterzahl,
                    "requestedRasterzahl": team.get("requestedRasterzahl"),
                    "assignmentStatus": _assignment_status(str(raster.get("kind") or "")),
                    "weekSlot": team.get("spielwochePref"),
                    "startTime": team.get("startTime"),
                    "start_minutes": _parse_start_minutes(team.get("startTime")),
                    "duration_minutes": _match_duration_minutes(team.get("label")),
                }
            )
            slot["capacity"] = capacity
    rows: list[dict[str, Any]] = []
    for (club_id, hall, weekday, week), slot in slots.items():
        actual_count = _required_capacity(slot["teams"])
        excess = actual_count - int(slot["capacity"])
        if excess > 0:
            rows.append(
                {
                    "clubId": club_id,
                    "hall": hall,
                    "weekday": weekday,
                    "week": week,
                    "teams": _unique_team_refs(slot["teams"]),
                    "capacity": slot["capacity"],
                    "actualCount": actual_count,
                    "excess": excess,
                }
            )
    return rows


def _required_capacity(teams: list[dict[str, Any]]) -> int:
    unknown_times = sum(1 for team in teams if team.get("start_minutes") is None)
    events: list[tuple[int, int]] = []
    for team in teams:
        start = team.get("start_minutes")
        if isinstance(start, int):
            events.append((start, 1))
            events.append((start + int(team.get("duration_minutes") or 180), -1))
    events.sort(key=lambda event: (event[0], event[1]))
    concurrent = 0
    max_concurrent = 0
    for _, delta in events:
        concurrent += delta
        max_concurrent = max(max_concurrent, concurrent)
    return max_concurrent + unknown_times


def _unique_team_refs(teams: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for team in teams:
        team_id = str(team.get("id") or "")
        if team_id and team_id not in seen:
            seen.add(team_id)
            refs.append(
                {
                    "id": team_id,
                    "league": team.get("league"),
                    "group": team.get("group"),
                    "label": team.get("label"),
                    "assignedRasterzahl": team.get("assignedRasterzahl"),
                    "requestedRasterzahl": team.get("requestedRasterzahl"),
                    "assignmentStatus": team.get("assignmentStatus"),
                    "weekSlot": team.get("weekSlot"),
                    "startTime": team.get("startTime"),
                    "durationMinutes": team.get("duration_minutes"),
                }
            )
    return refs


def _parse_start_minutes(value: Any) -> int | None:
    match = re.match(r"^(\d{1,2})[:.](\d{2})$", str(value or "").strip())
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def _match_duration_minutes(label: Any) -> int:
    return 120 if re.search(r"\bjugend\b", str(label or ""), re.IGNORECASE) else 180


def _capacity_for(
    clubs: list[dict[str, Any]],
    team: dict[str, Any],
    inferred_capacities: dict[tuple[str, str, str, str], int] | None = None,
) -> int | None:
    club = next((row for row in clubs if row.get("id") == team.get("clubId")), None)
    venues = club.get("venues") if club else None
    venue = (
        next(
            (
                row
                for row in venues
                if isinstance(row, dict)
                and str(row.get("hall") or "") == str(team.get("hall") or "")
            ),
            None,
        )
        if isinstance(venues, list)
        else None
    )
    weekday = str(team.get("homeWeekday") or "")
    hall = str(team.get("hall") or "1")
    club_id = str(team.get("clubId") or "")
    inferred_capacity = max(
        (inferred_capacities or {}).get((club_id, hall, weekday, "A"), 0),
        (inferred_capacities or {}).get((club_id, hall, weekday, "B"), 0),
    )
    if not venue:
        return inferred_capacity or None
    by_day = venue.get("capacityByWeekday")
    if isinstance(by_day, dict) and weekday in by_day:
        return int(by_day[weekday])
    if venue.get("capacity") is not None:
        return int(venue["capacity"])
    return inferred_capacity or None


def _inferred_capacities(teams: list[dict[str, Any]]) -> dict[tuple[str, str, str, str], int]:
    inferred: dict[tuple[str, str, str, str], int] = {}
    for team in teams:
        pref = team.get("spielwochePref")
        if not pref:
            continue
        key = (
            str(team.get("clubId") or ""),
            str(team.get("hall") or "1"),
            str(team.get("homeWeekday") or ""),
            str(pref),
        )
        inferred[key] = inferred.get(key, 0) + 1
    return inferred


def _group_key(group: dict[str, Any]) -> str:
    raw_ref = group.get("ref")
    ref: dict[str, Any] = raw_ref if isinstance(raw_ref, dict) else {}
    return f"{ref.get('league') or ''}::{ref.get('name') or ''}"


def _unused_rasterzahl(group: dict[str, Any], assignment: dict[str, Any]) -> int | None:
    group_size = int(group.get("size") or 0)
    if group_size % 2 == 0:
        return None
    size = _numeric_raster_size(_raster_size_for_group(group))
    used = {int(assignment.get(str(team_id)) or 0) for team_id in group.get("teamIds", [])}
    return next((value for value in range(1, size + 1) if value not in used), None)


def _numeric_raster_size(size: int | str) -> int:
    return 6 if size == "6d" else int(size)


def _home_weeks(group: dict[str, Any], rasterzahl: int, bye: int | None = None) -> list[int]:
    size = _raster_size_for_group(group)
    group_size = int(group.get("size") or 0)
    if bye is None and group_size % 2 == 1:
        bye = _numeric_raster_size(size)
    if rasterzahl == bye:
        return []

    weeks: list[int] = []
    week_map = _SPIELWOCHEN[size]
    template = _circle_pairs(size)
    for round_index, pairings in enumerate(template):
        pairing = next(
            (
                candidate
                for candidate in pairings
                if candidate["home"] == rasterzahl or candidate["away"] == rasterzahl
            ),
            None,
        )
        homes = set(_HOME_ROWS[size][round_index])
        if pairing and rasterzahl in homes and pairing["home"] != bye and pairing["away"] != bye:
            weeks.append(week_map[round_index])
    if size != "6d":
        for round_index, pairings in enumerate(template):
            pairing = next(
                (
                    candidate
                    for candidate in pairings
                    if candidate["home"] == rasterzahl or candidate["away"] == rasterzahl
                ),
                None,
            )
            if pairing and pairing["away"] == rasterzahl and pairing["home"] != bye:
                weeks.append(week_map[len(template) + round_index])
    return weeks


def _unique_home_weeks(
    group: dict[str, Any], rasterzahl: int, bye: int | None = None
) -> list[int]:
    return list(dict.fromkeys(_home_weeks(group, rasterzahl, bye)))


def _raster_size_for_group(group: dict[str, Any]) -> int | str:
    group_size = int(group.get("size") or 0)
    if group_size == 5:
        return 6
    if group_size == 6 and group.get("rasterMode") == "double":
        return "6d"
    if group_size == 6:
        return 6
    if group_size in (7, 8):
        return 8
    if group_size in (9, 10):
        return 10
    if group_size in (11, 12):
        return 12
    if group_size in (13, 14):
        return 14
    raise ValueError(f"Unsupported group size {group_size}")


def _circle_pairs(size: int | str) -> list[list[dict[str, int]]]:
    if size in _PAIRING_ROWS:
        return _PAIRING_ROWS[size]
    size = int(size)
    teams = list(range(1, size + 1))
    rotating = teams[1:]
    rounds: list[list[dict[str, int]]] = []
    for round_index in range(size - 1):
        row = [teams[0], *rotating]
        raw_pairs = [(row[index], row[size - 1 - index]) for index in range(size // 2)]
        homes = set(_HOME_ROWS[size][round_index])
        rounds.append(
            [{"home": a, "away": b} if a in homes else {"home": b, "away": a} for a, b in raw_pairs]
        )
        rotating = [rotating[-1], *rotating[:-1]]
    return rounds


_HOME_ROWS = {
    6: [[1, 2, 3], [6, 5, 1], [2, 3, 4], [6, 1, 2], [3, 4, 5]],
    "6d": [[1, 2, 3], [6, 5, 1], [2, 3, 4], [6, 1, 2], [3, 4, 5], [6, 5, 4], [4, 3, 2], [6, 1, 5], [5, 4, 3], [6, 2, 1]],
    8: [[1, 2, 3, 4], [8, 6, 7, 1], [2, 3, 4, 5], [8, 7, 1, 2], [3, 4, 5, 6], [8, 1, 2, 3], [4, 5, 6, 7]],
    10: [
        [1, 2, 3, 4, 5],
        [10, 7, 8, 9, 1],
        [2, 3, 4, 5, 6],
        [10, 8, 9, 1, 2],
        [3, 4, 5, 6, 7],
        [10, 9, 1, 2, 3],
        [4, 5, 6, 7, 8],
        [10, 1, 2, 3, 4],
        [5, 6, 7, 8, 9],
    ],
    12: [
        [1, 2, 3, 4, 5, 6],
        [12, 8, 9, 10, 11, 1],
        [2, 3, 4, 5, 6, 7],
        [12, 9, 10, 11, 1, 2],
        [3, 4, 5, 6, 7, 8],
        [12, 10, 11, 1, 2, 3],
        [4, 5, 6, 7, 8, 9],
        [12, 11, 1, 2, 3, 4],
        [5, 6, 7, 8, 9, 10],
        [12, 1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10, 11],
    ],
    14: [
        [1, 2, 3, 4, 5, 6, 7],
        [14, 9, 10, 11, 12, 13, 1],
        [2, 3, 4, 5, 6, 7, 8],
        [14, 10, 11, 12, 13, 1, 2],
        [3, 4, 5, 6, 7, 8, 9],
        [14, 11, 12, 13, 1, 2, 3],
        [4, 5, 6, 7, 8, 9, 10],
        [14, 12, 13, 1, 2, 3, 4],
        [5, 6, 7, 8, 9, 10, 11],
        [14, 13, 1, 2, 3, 4, 5],
        [6, 7, 8, 9, 10, 11, 12],
        [14, 1, 2, 3, 4, 5, 6],
        [7, 8, 9, 10, 11, 12, 13],
    ],
}

_PAIRING_ROWS = {
    "6d": [
        [{"home": 1, "away": 6}, {"home": 2, "away": 5}, {"home": 3, "away": 4}],
        [{"home": 6, "away": 4}, {"home": 5, "away": 3}, {"home": 1, "away": 2}],
        [{"home": 2, "away": 6}, {"home": 3, "away": 1}, {"home": 4, "away": 5}],
        [{"home": 6, "away": 5}, {"home": 1, "away": 4}, {"home": 2, "away": 3}],
        [{"home": 3, "away": 6}, {"home": 4, "away": 2}, {"home": 5, "away": 1}],
        [{"home": 6, "away": 1}, {"home": 5, "away": 2}, {"home": 4, "away": 3}],
        [{"home": 4, "away": 6}, {"home": 3, "away": 5}, {"home": 2, "away": 1}],
        [{"home": 6, "away": 2}, {"home": 1, "away": 3}, {"home": 5, "away": 4}],
        [{"home": 5, "away": 6}, {"home": 4, "away": 1}, {"home": 3, "away": 2}],
        [{"home": 6, "away": 3}, {"home": 2, "away": 4}, {"home": 1, "away": 5}],
    ]
}

_SPIELWOCHEN = {
    6: [1, 2, 5, 6, 9, 11, 12, 15, 16, 19],
    "6d": [1, 2, 5, 6, 9, 11, 12, 15, 16, 19],
    8: [1, 2, 3, 4, 5, 6, 7, 11, 12, 15, 16, 17, 18, 19],
    10: [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    12: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
    14: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25],
    }


def _weekday_to_db(value: str) -> str:
    return value.strip().upper()


def _assignment_status(kind: str) -> str:
    if kind == "fixed":
        return "FIXED"
    if kind == "pinned":
        return "PINNED"
    return "OPTIMIZED"


def _dicts(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [row for row in value if isinstance(row, dict)]
