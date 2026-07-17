"""PostgreSQL test database for the worker suite.

The worker runs against PostgreSQL in every environment, so its tests do too.
The schema comes from the real Prisma migrations rather than a hand-written copy,
which is what let the SQLite fixture drift out of step with production.
"""

from __future__ import annotations

import os
from pathlib import Path

import psycopg
from psycopg import sql

# The worker tests get their own database on the shared E2E PostgreSQL container.
# Sharing business_app_starter_e2e_test would let a Playwright run and a pytest run
# truncate each other's rows.
DEFAULT_TEST_DATABASE_URL = (
    "postgresql://starter:starter_e2e_password@localhost:45432/business_app_starter_worker_test"
)

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "prisma" / "migrations-postgres"

_schema_ready = False


def worker_test_database_url() -> str:
    return os.environ.get("WORKER_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)


def _maintenance_conninfo(database_url: str) -> tuple[str, str]:
    """Split a database URL into (conninfo against the 'postgres' db, target db name)."""
    parsed = psycopg.conninfo.conninfo_to_dict(database_url)
    database = str(parsed.get("dbname") or "")
    if not database:
        raise RuntimeError(f"WORKER_TEST_DATABASE_URL has no database name: {database_url}")
    return psycopg.conninfo.make_conninfo(database_url, dbname="postgres"), database


def _ensure_database(database_url: str) -> None:
    maintenance_conninfo, database = _maintenance_conninfo(database_url)
    try:
        with psycopg.connect(maintenance_conninfo, autocommit=True) as connection:
            exists = connection.execute(
                "SELECT 1 FROM pg_database WHERE datname = %s", (database,)
            ).fetchone()
            if not exists:
                connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
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
        connection.execute("DROP SCHEMA IF EXISTS public CASCADE")
        connection.execute("CREATE SCHEMA public")
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
                WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
                """
            ).fetchall()
        ]
        if not tables:
            return
        connection.execute(
            sql.SQL("TRUNCATE TABLE {} RESTART IDENTITY CASCADE").format(
                sql.SQL(", ").join(sql.Identifier(table) for table in tables)
            )
        )
