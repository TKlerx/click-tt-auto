"""PostgreSQL test database for the worker suite.

The worker runs against PostgreSQL in every environment, so its tests do too.
The schema comes from the real Prisma migrations rather than a hand-written copy,
which is what let the SQLite fixture drift out of step with production.
"""

from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import psycopg
from psycopg import sql
from dotenv import load_dotenv
from starter_worker.db import normalize_postgres_database_url

# The worker tests get their own database on the shared E2E PostgreSQL container.
# Sharing the public schema would let a Playwright run and a pytest run truncate
# each other's rows.
DEFAULT_E2E_DATABASE_URL = (
    "postgresql://starter:starter_e2e_password@localhost:45432/"
    "business_app_starter_e2e_test"
)
WORKER_TEST_SCHEMA_NAME = "business_app_starter_worker_test"

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "prisma" / "migrations-postgres"
WEBAPP_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

load_dotenv(WEBAPP_ENV_PATH, override=False)

_schema_ready = False


def worker_test_database_url() -> str:
    if os.environ.get("WORKER_TEST_DATABASE_URL"):
        return normalize_postgres_database_url(os.environ["WORKER_TEST_DATABASE_URL"])
    return _with_worker_test_schema(
        os.environ.get("E2E_DATABASE_URL", DEFAULT_E2E_DATABASE_URL)
    )


def _with_worker_test_schema(database_url: str) -> str:
    parsed = urlsplit(database_url)
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "options"
    ]
    query.append(("options", f"-csearch_path={WORKER_TEST_SCHEMA_NAME}"))
    return normalize_postgres_database_url(
        urlunsplit(parsed._replace(query=urlencode(query)))
    )


def _ensure_database(database_url: str) -> None:
    try:
        with psycopg.connect(database_url, autocommit=True) as connection:
            connection.execute(
                sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(
                    sql.Identifier(WORKER_TEST_SCHEMA_NAME)
                )
            )
    except psycopg.OperationalError as error:
        raise RuntimeError(
            f"Cannot reach PostgreSQL for the worker tests ({database_url}).\n"
            "Start the E2E PostgreSQL container first:\n"
            "  pnpm run e2e:db          (from webapp/)\n"
            "or point WORKER_TEST_DATABASE_URL at another PostgreSQL instance."
        ) from error


def _apply_migrations(database_url: str) -> None:
    migrations = sorted(
        path for path in MIGRATIONS_DIR.iterdir() if (path / "migration.sql").is_file()
    )
    if not migrations:
        raise RuntimeError(f"No migrations found under {MIGRATIONS_DIR}")

    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            sql.SQL("DROP SCHEMA IF EXISTS {} CASCADE").format(
                sql.Identifier(WORKER_TEST_SCHEMA_NAME)
            )
        )
        connection.execute(
            sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(WORKER_TEST_SCHEMA_NAME))
        )
        for migration in migrations:
            statement = (migration / "migration.sql").read_text(encoding="utf-8")
            try:
                connection.execute(statement)
            except psycopg.Error as error:
                raise RuntimeError(f"Migration {migration.name} failed: {error}") from error


def ensure_worker_database() -> str:
    """Create and migrate the worker test database once per process."""
    global _schema_ready
    database_url = worker_test_database_url()
    if not _schema_ready:
        _ensure_database(database_url)
        _apply_migrations(database_url)
        _schema_ready = True
    return database_url


def truncate_all(database_url: str) -> None:
    with psycopg.connect(database_url, autocommit=True) as connection:
        tables = [
            str(row[0])
            for row in connection.execute(
                """
                SELECT tablename FROM pg_tables
                WHERE schemaname = %s AND tablename <> '_prisma_migrations'
                """,
                (WORKER_TEST_SCHEMA_NAME,),
            ).fetchall()
        ]
        if not tables:
            return
        connection.execute(
            sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
                sql.SQL(", ").join(sql.Identifier(table) for table in tables)
            )
        )
