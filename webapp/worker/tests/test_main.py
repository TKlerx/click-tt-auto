from __future__ import annotations

import json
import os
import subprocess
import sqlite3
import sys
import tempfile
import unittest
import unittest.mock
from contextlib import closing
from pathlib import Path
from typing import Any, cast
from unittest.mock import patch

from starter_worker.config import WorkerConfig, load_config
from starter_worker.db import BackgroundJob, JobStore, _find_overage_rows, normalize_postgres_database_url
from starter_worker.main import (
    RasterInputInvalid,
    RasterSolverInfeasible,
    _exclude_unplanned_groups,
    _process_claimed_job,
    _log_job_claimed,
    _log_job_completed,
    _log_job_failed,
    _log_jobs_requeued_stale,
    _log_teams_poll_scheduled,
    _raster_run_model,
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
                INSERT INTO RasterInputSet (id, scopeId, seasonModelJson)
                VALUES ('input-1', 'scope-owl', ?)
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
                INSERT INTO RasterInputSet (id, scopeId, seasonModelJson)
                VALUES ('input-1', 'scope-owl', '{}')
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

    @staticmethod
    def _combined_context(
        *,
        fixed_rasterzahlen: list[dict[str, object]] | None = None,
    ) -> dict[str, Any]:
        """Two scopes sharing one real club, which is the case combined runs exist for.

        Club ids are slugs of club names, so a club fielding a Verband team and a
        Bezirk team carries the same id in both models.
        """
        context: dict[str, Any] = {
            "seasonModels": [
                {
                    "scopeId": "scope-a",
                    "seasonModelJson": json.dumps(
                        {
                            "clubs": [
                                {
                                    "id": "ttc-muster",
                                    "name": "TTC Muster",
                                    "venues": [{"hall": "1", "capacity": 2}],
                                }
                            ],
                            "teams": [
                                {
                                    "id": "oberliga-ttc-muster-i",
                                    "clubId": "ttc-muster",
                                    "label": "I",
                                    "hall": "1",
                                    "rasterzahl": {"kind": "fixed", "value": 3},
                                }
                            ],
                            "groups": [
                                {
                                    "ref": {"league": "Kreisliga", "name": "Gruppe 1"},
                                    "size": 10,
                                    "teamIds": ["oberliga-ttc-muster-i"],
                                }
                            ],
                            "wishes": [
                                {
                                    "clubId": "ttc-muster",
                                    "teamA": "oberliga-ttc-muster-i",
                                    "teamB": "kreisliga-ttc-muster-ii",
                                    "relation": "wechsel",
                                }
                            ],
                        }
                    ),
                },
                {
                    "scopeId": "scope-b",
                    "seasonModelJson": json.dumps(
                        {
                            "clubs": [
                                {
                                    "id": "ttc-muster",
                                    "name": "TTC Muster",
                                    "venues": [{"hall": "2", "capacity": 1}],
                                }
                            ],
                            "teams": [
                                {
                                    "id": "kreisliga-ttc-muster-ii",
                                    "clubId": "ttc-muster",
                                    "label": "II",
                                    "hall": "2",
                                    "rasterzahl": {"kind": "pinned", "value": 5},
                                }
                            ],
                            "groups": [
                                {
                                    "ref": {"league": "Kreisliga", "name": "Gruppe 1"},
                                    "size": 10,
                                    "teamIds": ["kreisliga-ttc-muster-ii"],
                                }
                            ],
                        }
                    ),
                },
            ]
        }
        if fixed_rasterzahlen is not None:
            context["fixedRasterzahlen"] = fixed_rasterzahlen
        return context

    def test_combined_raster_model_keeps_ids_so_wishes_and_clubs_still_resolve(self) -> None:
        model = _raster_run_model(self._combined_context())
        teams = cast(list[dict[str, object]], model["teams"])
        clubs = cast(list[dict[str, object]], model["clubs"])
        wishes = cast(list[dict[str, object]], model["wishes"])

        team_ids = {str(team["id"]) for team in teams}
        # A wish naming a team in the other spanned scope must still find it.
        self.assertIn(str(wishes[0]["teamA"]), team_ids)
        self.assertIn(str(wishes[0]["teamB"]), team_ids)
        # One real club stays one club, so hall capacity and same-club spacing
        # see both of its teams.
        self.assertEqual([club["id"] for club in clubs], ["ttc-muster"])
        self.assertEqual({str(team["clubId"]) for team in teams}, {"ttc-muster"})

    def test_combined_raster_model_keeps_every_venue_of_a_shared_club(self) -> None:
        model = _raster_run_model(self._combined_context())
        clubs = cast(list[dict[str, object]], model["clubs"])
        venues = cast(list[dict[str, object]], clubs[0]["venues"])

        self.assertEqual([venue["hall"] for venue in venues], ["1", "2"])

    def test_combined_raster_model_unfixes_inherited_but_keeps_pins(self) -> None:
        model = _raster_run_model(self._combined_context())
        teams = cast(list[dict[str, object]], model["teams"])
        by_id = {str(team["id"]): team for team in teams}

        # Inherited upper-league number: the combined run decides it (FR-013).
        self.assertEqual(
            by_id["oberliga-ttc-muster-i"]["rasterzahl"], {"kind": "assignable"}
        )
        # A deliberate pin is not an inherited constraint and survives.
        self.assertEqual(
            by_id["kreisliga-ttc-muster-ii"]["rasterzahl"], {"kind": "pinned", "value": 5}
        )

    def test_combined_raster_model_honours_numbers_supplied_for_the_combined_set(self) -> None:
        model = _raster_run_model(
            self._combined_context(
                fixed_rasterzahlen=[
                    {"clubId": "ttc-muster", "teamLabel": "I", "rasterzahl": 7}
                ]
            )
        )
        teams = cast(list[dict[str, object]], model["teams"])
        by_id = {str(team["id"]): team for team in teams}

        # FR-014: supplied against the combined set, so a hard constraint here.
        self.assertEqual(
            by_id["oberliga-ttc-muster-i"]["rasterzahl"], {"kind": "fixed", "value": 7}
        )

    def test_combined_raster_model_tags_groups_with_scope_to_keep_them_distinct(self) -> None:
        model = _raster_run_model(self._combined_context())
        groups = cast(list[dict[str, object]], model["groups"])

        # Both are "Kreisliga / Gruppe 1"; only the scope tells them apart.
        self.assertEqual([group["scopeId"] for group in groups], ["scope-a", "scope-b"])

    def test_combined_raster_model_refuses_a_team_id_claimed_by_two_scopes(self) -> None:
        # Two different clubs sharing a name, in identically named groups, in
        # different Bezirke: both slug to one team id.
        def scope(scope_id: str) -> dict[str, object]:
            return {
                "scopeId": scope_id,
                "seasonModelJson": json.dumps(
                    {
                        "clubs": [{"id": "tus-germania", "name": "TuS Germania"}],
                        "teams": [
                            {
                                "id": "gruppe-1-tus-germania-i",
                                "clubId": "tus-germania",
                                "label": "I",
                            }
                        ],
                        "groups": [
                            {
                                "ref": {"league": "Kreisliga", "name": "Gruppe 1"},
                                "size": 10,
                                "teamIds": ["gruppe-1-tus-germania-i"],
                            }
                        ],
                    }
                ),
            }

        with self.assertRaises(RasterInputInvalid) as caught:
            _raster_run_model({"seasonModels": [scope("bezirk-a"), scope("bezirk-b")]})

        self.assertIn("gruppe-1-tus-germania-i", str(caught.exception))
        self.assertIn("bezirk-a", str(caught.exception))
        self.assertIn("bezirk-b", str(caught.exception))

    def test_invalid_combined_input_fails_the_run_without_retrying(self) -> None:
        # The id collision is decided by the inputs, so all a retry buys is the
        # same failure twice more.
        store = unittest.mock.MagicMock()
        job = BackgroundJob(
            id="job-1",
            job_type="raster_run",
            payload={"runId": "run-1"},
            attempt_count=1,
        )
        config = WorkerConfig(
            database_url="postgresql://ignored/db",
            poll_interval_seconds=0.1,
            worker_id="worker-test",
            max_attempts=3,
            retry_backoff_seconds=15,
            stale_lock_seconds=300,
            teams_poll_interval_seconds=60,
        )

        with patch(
            "starter_worker.main.process_raster_run",
            side_effect=RasterInputInvalid("two teams share an id"),
        ):
            _process_claimed_job(store, config, job)

        store.fail_job.assert_called_once_with(
            "job-1", "two teams share an id", retry=False
        )
        # Not an infeasible plan; the inputs never described one.
        store.mark_raster_run_failed.assert_called_once()
        store.mark_raster_run_infeasible.assert_not_called()

    def test_combined_raster_model_allows_one_club_across_verband_and_bezirk(self) -> None:
        # The legitimate case the guard must not catch: one club, two teams, two
        # scopes, different team ids. This is what combined planning is for.
        model = _raster_run_model(self._combined_context())
        teams = cast(list[dict[str, object]], model["teams"])

        self.assertEqual(len(teams), 2)
        self.assertEqual({str(team["clubId"]) for team in teams}, {"ttc-muster"})

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

    def test_raster_solver_can_use_initial_heuristic(self) -> None:
        completed = subprocess.CompletedProcess(
            args=[],
            returncode=0,
            stdout="",
            stderr="",
        )
        with (
            patch.dict(os.environ, {"RASTER_HEURISTIC_SOLVER_SCRIPT": __file__}),
            patch("starter_worker.main.subprocess.run", return_value=completed) as run,
            patch("starter_worker.main.Path.read_text", side_effect=['{"team-a": 1}', '{"status": "FEASIBLE"}']),
        ):
            _solve_raster_model(
                {"clubs": [], "teams": [], "groups": []},
                {"strategy": "initial_heuristic"},
            )

        command = run.call_args.args[0]
        self.assertTrue(Path(command[0]).name.lower().startswith("pnpm"))
        self.assertEqual(command[1:3], ["exec", "tsx"])

    def test_raster_solver_maps_infeasible_metadata_to_domain_error(self) -> None:
        def run_solver(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
            metadata_path = Path(command[command.index("--metadata") + 1])
            metadata_path.write_text('{"status": "INFEASIBLE"}', encoding="utf-8")
            return subprocess.CompletedProcess(
                args=command,
                returncode=1,
                stdout="",
                stderr="CP-SAT did not find an assignment: INFEASIBLE",
            )

        with patch("starter_worker.main.subprocess.run", side_effect=run_solver):
            with self.assertRaisesRegex(RasterSolverInfeasible, "No feasible assignment"):
                _solve_raster_model({"clubs": [], "teams": [], "groups": []}, {})

    def test_persisted_overages_use_inferred_capacity(self) -> None:
        model = {
            "clubs": [{"id": "club", "name": "Club", "venues": [{"hall": "1"}]}],
            "teams": [
                {
                    "id": "team-a",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "spielwochePref": "A",
                    "rasterzahl": {"kind": "assignable"},
                },
                {
                    "id": "team-b",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "spielwochePref": "B",
                    "rasterzahl": {"kind": "assignable"},
                },
            ],
            "groups": [
                {
                    "ref": {"league": "L", "name": "G"},
                    "size": 6,
                    "teamIds": ["team-a", "team-b"],
                }
            ],
        }

        rows = _find_overage_rows(model, {"team-a": 1, "team-b": 1})

        self.assertTrue(rows)
        self.assertEqual(rows[0]["capacity"], 1)

    def test_persisted_overages_do_not_duplicate_same_team_home_week(self) -> None:
        model = {
            "clubs": [{"id": "club", "name": "Club", "venues": [{"hall": "1", "capacity": 1}]}],
            "teams": [
                {
                    "id": "team-a",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "rasterzahl": {"kind": "assignable"},
                },
                {
                    "id": "team-b",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "rasterzahl": {"kind": "assignable"},
                },
            ],
            "groups": [
                {
                    "ref": {"league": "L", "name": "G12"},
                    "size": 12,
                    "teamIds": ["team-a", "team-b"],
                }
            ],
        }

        rows = _find_overage_rows(model, {"team-a": 7, "team-b": 8})
        week_11 = next(row for row in rows if row["week"] == 11)

        self.assertEqual([team["id"] for team in week_11["teams"]], ["team-a", "team-b"])
        self.assertEqual(week_11["actualCount"], 2)
        self.assertEqual(week_11["excess"], 1)

    def test_persisted_overages_keep_same_named_odd_groups_distinct_by_scope(self) -> None:
        model = {
            "clubs": [{"id": "club", "name": "Club", "venues": [{"hall": "1", "capacity": 1}]}],
            "teams": [
                {
                    "id": "team-a",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "rasterzahl": {"kind": "assignable"},
                },
                {
                    "id": "team-b",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "rasterzahl": {"kind": "assignable"},
                },
            ],
            "groups": [
                {
                    "scopeId": "scope-a",
                    "ref": {"league": "Kreisliga", "name": "Gruppe 1"},
                    "size": 5,
                    "teamIds": ["team-a"],
                },
                {
                    "scopeId": "scope-b",
                    "ref": {"league": "Kreisliga", "name": "Gruppe 1"},
                    "size": 5,
                    "teamIds": ["team-b"],
                },
            ],
        }

        rows = _find_overage_rows(model, {"team-a": 1, "team-b": 2})

        week_1 = next(row for row in rows if row["week"] == 1)
        self.assertEqual([team["id"] for team in week_1["teams"]], ["team-a", "team-b"])
        self.assertEqual(week_1["actualCount"], 2)
        self.assertEqual(week_1["excess"], 1)

    def test_persisted_overages_ignore_capacity_irrelevant_teams(self) -> None:
        model = {
            "clubs": [{"id": "club", "name": "Club", "venues": [{"hall": "1", "capacity": 1}]}],
            "teams": [
                {
                    "id": "team-a",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "rasterzahl": {"kind": "assignable"},
                },
                {
                    "id": "team-b",
                    "clubId": "club",
                    "hall": "1",
                    "homeWeekday": "friday",
                    "capacityRelevant": False,
                    "rasterzahl": {"kind": "assignable"},
                },
            ],
            "groups": [
                {
                    "ref": {"league": "L", "name": "G12"},
                    "size": 12,
                    "teamIds": ["team-a", "team-b"],
                }
            ],
        }

        rows = _find_overage_rows(model, {"team-a": 7, "team-b": 8})

        self.assertEqual(rows, [])

    def test_excludes_unplanned_groups_before_solver(self) -> None:
        model = {
            "teams": [
                {"id": "planned"},
                {"id": "skipped"},
            ],
            "groups": [
                {"teamIds": ["planned"], "planningStatus": "include"},
                {"teamIds": ["skipped"], "planningStatus": "exclude"},
            ],
        }

        filtered = _exclude_unplanned_groups(model)

        self.assertEqual(filtered["groups"], [{"teamIds": ["planned"], "planningStatus": "include"}])
        self.assertEqual(filtered["teams"], [{"id": "planned"}])

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

    def test_sqlite_job_store_can_skip_retries_for_terminal_failure(self) -> None:
        self._insert_job(job_id="job-terminal", job_type="echo", payload={"message": "x"})
        store = self._make_store(max_attempts=3)

        job = store.claim_next_job()

        self.assertIsNotNone(job)
        assert job is not None
        store.fail_job(job.id, "no feasible assignment", retry=False)
        row = self._fetch_job("job-terminal")

        self.assertEqual(row["status"], "FAILED")
        self.assertEqual(row["error"], "no feasible assignment")
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
                    scopeId TEXT NOT NULL,
                    seasonModelJson TEXT
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE RasterHallCapacity (
                    id TEXT PRIMARY KEY,
                    scopeId TEXT NOT NULL,
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
                    scopeId TEXT NOT NULL,
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
