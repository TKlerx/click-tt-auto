from __future__ import annotations

import json
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

    def fail_job(self, job_id: str, error: str) -> None:
        if self._is_sqlite:
            self._fail_sqlite_job(job_id, error)
            return

        self._fail_postgres_job(job_id, error)

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
                        jobId = ?
                    WHERE id = ?
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
                        "jobId" = %s
                    WHERE id = %s
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

    def get_raster_run_context(self, run_id: str) -> dict[str, Any]:
        if self._is_sqlite:
            with closing(self._sqlite_conn()) as connection:
                connection.row_factory = sqlite3.Row
                row = connection.execute(
                    """
                    SELECT run.id, run.settings, input.district, input.seasonModelJson
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
                    SELECT run.id, run.settings, input.district, input."seasonModelJson"
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
        optimality = "PROVEN_OPTIMAL" if metadata.get("status") == "OPTIMAL" else "FEASIBLE"
        outcome = "PROVEN_OPTIMAL" if metadata.get("status") == "OPTIMAL" else "FEASIBLE"
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

    def _fail_sqlite_job(self, job_id: str, error: str) -> None:
        with closing(self._sqlite_conn()) as connection:
            connection.row_factory = sqlite3.Row
            row = connection.execute(
                "SELECT attemptCount FROM BackgroundJob WHERE id = ?",
                (job_id,),
            ).fetchone()
            if row is None:
                return

            attempt_count = int(row["attemptCount"])
            should_retry = attempt_count < self._config.max_attempts
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

    def _fail_postgres_job(self, job_id: str, error: str) -> None:
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
                should_retry = attempt_count < self._config.max_attempts
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
            len(row["teams"]),
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
    slots: dict[tuple[str, str, str, int], dict[str, Any]] = {}
    for team in teams:
        team_id = str(team.get("id") or "")
        group = team_group.get(team_id)
        rasterzahl = int(assignment.get(team_id) or 0)
        if not group or not rasterzahl:
            continue
        capacity = _capacity_for(clubs, team)
        if capacity is None:
            continue
        for week in _home_weeks(int(group.get("size") or 0), rasterzahl):
            key = (
                str(team.get("clubId") or ""),
                str(team.get("hall") or "1"),
                str(team.get("homeWeekday") or ""),
                week,
            )
            slot = slots.setdefault(key, {"teams": [], "capacity": capacity})
            slot["teams"].append(team_id)
            slot["capacity"] = capacity
    rows: list[dict[str, Any]] = []
    for (club_id, hall, weekday, week), slot in slots.items():
        excess = len(slot["teams"]) - int(slot["capacity"])
        if excess > 0:
            rows.append(
                {
                    "clubId": club_id,
                    "hall": hall,
                    "weekday": weekday,
                    "week": week,
                    "teams": slot["teams"],
                    "capacity": slot["capacity"],
                    "excess": excess,
                }
            )
    return rows


def _capacity_for(clubs: list[dict[str, Any]], team: dict[str, Any]) -> int | None:
    club = next((row for row in clubs if row.get("id") == team.get("clubId")), None)
    venues = club.get("venues") if club else None
    if not isinstance(venues, list):
        return None
    venue = next(
        (
            row
            for row in venues
            if isinstance(row, dict) and str(row.get("hall") or "") == str(team.get("hall") or "")
        ),
        None,
    )
    if not venue:
        return None
    by_day = venue.get("capacityByWeekday")
    weekday = str(team.get("homeWeekday") or "")
    if isinstance(by_day, dict) and weekday in by_day:
        return int(by_day[weekday])
    if venue.get("capacity") is not None:
        return int(venue["capacity"])
    return None


def _home_weeks(group_size: int, rasterzahl: int) -> list[int]:
    weeks_by_rz = {
        1: [1, 3, 5, 7, 9, 11, 13, 15, 17],
        2: [2, 4, 6, 8, 10, 12, 14, 16, 18],
        3: [1, 4, 5, 8, 9, 12, 13, 16, 17],
        4: [2, 3, 6, 7, 10, 11, 14, 15, 18],
        5: [1, 3, 6, 8, 9, 11, 14, 16, 17],
        6: [2, 4, 5, 7, 10, 12, 13, 15, 18],
        7: [1, 4, 6, 7, 9, 12, 14, 15, 17],
        8: [2, 3, 5, 8, 10, 11, 13, 16, 18],
        9: [1, 3, 5, 7, 10, 12, 14, 16, 17],
        10: [],
    }
    if group_size not in (9, 10):
        return []
    return weeks_by_rz.get(rasterzahl, [])


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
