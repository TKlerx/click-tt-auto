"""Solver-to-worker regression tests, with no database or live Click-TT access.

Goal: real CP-SAT contradictions reach the persisted no-solution message, while
feasible plans and legacy/malformed metadata keep their established semantics.
"""
from __future__ import annotations

import unittest
from typing import Any
from unittest.mock import MagicMock, patch

from starter_worker.config import WorkerConfig
from starter_worker.db import BackgroundJob
from starter_worker.main import (
    RasterSolverInfeasible,
    _infeasible_message,
    _process_claimed_job,
    _solve_raster_model,
)


def six_team_model(same_club: bool) -> dict[str, Any]:
    teams = [
        {
            "id": f"team-{index}",
            "clubId": "club" if same_club else f"club-{index}",
            "label": f"Team {index}",
            "homeWeekday": "friday",
            "hall": "1",
            "rasterzahl": {"kind": "assignable"},
        }
        for index in range(1, 7)
    ]
    return {
        "clubs": [], "teams": teams,
        "groups": [{"ref": {"league": "L", "name": "G6"}, "size": 6,
                    "teamIds": [team["id"] for team in teams]}],
        "wishes": [], "absoluteConstraints": [], "warnings": [],
    }


class SolverDiagnosticsTests(unittest.TestCase):
    def test_real_assignable_derby_contradiction_reaches_terminal_run_message(self) -> None:
        store = MagicMock()
        job = BackgroundJob(id="job-1", job_type="raster_run",
                            payload={"runId": "run-1"}, attempt_count=1)
        config = WorkerConfig(
            database_url="postgresql://unused/db", poll_interval_seconds=0.1,
            worker_id="test", max_attempts=3, retry_backoff_seconds=15,
            stale_lock_seconds=300, teams_poll_interval_seconds=60,
        )
        with patch("starter_worker.main.process_raster_run", side_effect=lambda *_:
                   _solve_raster_model(six_team_model(True), {"timeLimitSeconds": 10})):
            _process_claimed_job(store, config, job)
        store.mark_raster_run_infeasible.assert_called_once()
        run_id, message = store.mark_raster_run_infeasible.call_args.args
        self.assertEqual(run_id, "run-1")
        self.assertIn("Same-club derby timing: Group L / G6 cannot assign", message)
        store.fail_job.assert_called_once_with("job-1", message, retry=False)
        store.mark_raster_run_failed.assert_not_called()

    def test_real_feasible_control_has_distinct_assignment_and_empty_diagnostics(self) -> None:
        result = _solve_raster_model(six_team_model(False), {"timeLimitSeconds": 10})
        self.assertEqual(result["metadata"]["status"], "OPTIMAL")
        self.assertEqual(result["metadata"]["infeasibilityDiagnostics"], [])
        self.assertEqual(set(result["assignment"].values()), set(range(1, 7)))

    def test_real_fixed_and_pinned_out_of_range_values_are_diagnosed(self) -> None:
        for kind, value in [("fixed", 0), ("pinned", 7)]:
            with self.subTest(kind=kind, value=value):
                model = six_team_model(False)
                model["teams"][0]["rasterzahl"] = {"kind": kind, "value": value}
                with self.assertRaisesRegex(RasterSolverInfeasible, "outside 1-6"):
                    _solve_raster_model(model, {"timeLimitSeconds": 10})

    def test_legacy_or_unusable_diagnostics_keep_the_hard_constraint_fallback(self) -> None:
        for diagnostics in [None, [], "invalid", [None, {}, {"message": "  "}]]:
            with self.subTest(diagnostics=diagnostics):
                message = _infeasible_message({"infeasibilityDiagnostics": diagnostics})
                self.assertIn("current hard constraints", message)
                self.assertIn("capacity alone should not", message)

    def test_unknown_constraint_families_have_a_safe_label(self) -> None:
        self.assertEqual(_infeasible_message({"infeasibilityDiagnostics": [
            {"family": "future_rule", "message": "  Conflicting rules.  "},
        ]}), "No feasible assignment exists. Hard constraint: Conflicting rules.")
