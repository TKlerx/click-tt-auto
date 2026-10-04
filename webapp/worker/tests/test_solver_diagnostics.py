"""Solver-to-worker regression tests, with no database or live Click-TT access.

Goal: real CP-SAT contradictions reach the persisted no-solution message, while
feasible plans and legacy/malformed metadata keep their established semantics.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
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


def mixed_group_model(blocker: str, reverse: bool = False) -> dict[str, Any]:
    model = six_team_model(True)
    feasible = model["teams"][:2]
    for team in feasible:
        team["id"] = "A-" + team["id"]
    model["teams"] = feasible
    model["groups"] = [{"ref": {"league": "L", "name": "A-feasible"}, "size": 6,
                        "teamIds": [team["id"] for team in feasible]}]
    other = six_team_model(blocker == "B-impossible")
    if blocker == "B-fixed-duplicate":
        other["teams"] = other["teams"][:2]
        for team in other["teams"]:
            team["rasterzahl"] = {"kind": "fixed", "value": 1}
    for team in other["teams"]:
        team["id"] = "B-" + team["id"]
    model["teams"].extend(other["teams"])
    model["groups"].append({"ref": {"league": "L", "name": blocker}, "size": 6,
                            "teamIds": [team["id"] for team in other["teams"]]})
    if reverse:
        model["groups"].reverse()
    return model


class SolverDiagnosticsTests(unittest.TestCase):
    def test_diagnostic_clone_handles_joint_base_and_exhausted_budget_safely(self) -> None:
        from ortools.sat.python import cp_model

        path = Path(__file__).resolve().parents[3] / "scripts" / "solve-raster-cpsat.py"
        spec = importlib.util.spec_from_file_location("diagnostic_solver", path)
        assert spec is not None and spec.loader is not None
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = cp_model.CpModel()
        left = model.new_bool_var("left")
        right = model.new_bool_var("right")
        value = model.new_bool_var("value")
        model.add(value == 0).only_enforce_if(left)
        model.add(value == 1).only_enforce_if(right)
        model.add_assumptions([left, right])
        model.minimize(value * 7)
        assumptions = {literal.index: {"family": "same_club_derby_timing",
                       "message": f"Group {literal.name} cannot assign its teams."}
                       for literal in (left, right)}
        season = {"teams": [], "groups": []}
        original = str(model.proto)
        joint = module.assumption_diagnostics(season, assumptions, model, 10)
        self.assertEqual(joint[0]["family"], "joint_hard_constraint_conflict")
        self.assertNotIn("Group left cannot", joint[0]["message"])
        self.assertNotIn("Group right cannot", joint[0]["message"])
        self.assertEqual(str(model.proto), original)
        exhausted = module.assumption_diagnostics(season, assumptions, model, 0)
        self.assertEqual(exhausted[0]["family"], "joint_hard_constraint_conflict")
        self.assertEqual(str(model.proto), original)
        model.add(value == 0)
        model.add(value == 1)
        base = module.assumption_diagnostics(season, assumptions, model, 10)
        self.assertEqual(base[0]["family"], "unconditional_hard_constraints")
        self.assertNotIn("Group", base[0]["message"])

    def test_real_feasible_derby_control_retains_zero_optimum(self) -> None:
        model = mixed_group_model("B-impossible")
        model["teams"] = model["teams"][:2]
        model["groups"] = model["groups"][:1]
        result = _solve_raster_model(model, {"timeLimitSeconds": 10})
        self.assertEqual(result["metadata"]["status"], "OPTIMAL")
        self.assertEqual(result["metadata"]["objective"], 0)
        self.assertEqual(result["metadata"]["bestBound"], 0)
        self.assertEqual(result["metadata"]["infeasibilityDiagnostics"], [])
        values = list(result["assignment"].values())
        self.assertEqual(len(set(values)), 2)
        self.assertTrue(all(1 <= value <= 6 for value in values))

    def test_real_mixed_fixed_conflict_never_blames_feasible_derby(self) -> None:
        for reverse in (False, True):
            with self.subTest(reverse=reverse):
                with self.assertRaises(RasterSolverInfeasible) as raised:
                    _solve_raster_model(mixed_group_model("B-fixed-duplicate", reverse),
                                        {"timeLimitSeconds": 10})
                message = str(raised.exception)
                self.assertIn("B-fixed-duplicate", message)
                self.assertIn("Fixed schedule numbers", message)
                self.assertNotIn("A-feasible", message)
                self.assertNotIn("Same-club derby timing", message)

    def test_real_mixed_derby_conflict_identifies_blocker_in_either_order(self) -> None:
        for reverse in (False, True):
            with self.subTest(reverse=reverse):
                with self.assertRaises(RasterSolverInfeasible) as raised:
                    _solve_raster_model(mixed_group_model("B-impossible", reverse),
                                        {"timeLimitSeconds": 10})
                message = str(raised.exception)
                self.assertIn("Same-club derby timing: Group L / B-impossible cannot assign", message)
                self.assertNotIn("A-feasible", message)

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
