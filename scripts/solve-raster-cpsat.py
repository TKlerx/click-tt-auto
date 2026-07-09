# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = ["ortools>=9.14,<10"]
# ///

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from ortools.sat.python import cp_model


ROOT = Path(__file__).resolve().parents[1]
RULEBOOK = ROOT / "src" / "raster" / "rulebook"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


HOME_ROWS = load_json(RULEBOOK / "templates.json")
SPIELWOCHEN = load_json(RULEBOOK / "spielwochen.json")
CROSS_SIZE = load_json(RULEBOOK / "cross-size.json")
DEFAULT_WEIGHTS = {
    "overUsage": 10,
    "overUsageFairness": 1,
    "wechsel": 5,
    "zeitgleich": 5,
    "sameClubDerbySt4": 1000,
    "spielwoche": 0,
}


def raster_size_for_group_size(size: int) -> int:
    if size in (9, 10):
        return 10
    if size in (11, 12):
        return 12
    if size in (13, 14):
        return 14
    raise ValueError(f"Unsupported group size {size}; supported district sizes are 9..14.")


def circle_pairs(size: int) -> list[list[dict[str, int]]]:
    teams = list(range(1, size + 1))
    rotating = teams[1:]
    rounds: list[list[dict[str, int]]] = []
    for round_index in range(size - 1):
        row = [teams[0], *rotating]
        raw_pairs = [(row[index], row[size - 1 - index]) for index in range(size // 2)]
        homes = set(HOME_ROWS[str(size)][round_index])
        rounds.append(
            [{"home": a, "away": b} if a in homes else {"home": b, "away": a} for a, b in raw_pairs]
        )
        rotating = [rotating[-1], *rotating[:-1]]
    return rounds


def home_weeks(group_size: int, rasterzahl: int) -> list[int]:
    size = raster_size_for_group_size(group_size)
    bye = size if group_size % 2 == 1 else None
    if rasterzahl == bye:
        return []
    weeks: list[int] = []
    week_map = SPIELWOCHEN[str(size)]
    template = circle_pairs(size)
    for round_index, pairings in enumerate(template):
        pairing = next(
            (
                candidate
                for candidate in pairings
                if candidate["home"] == rasterzahl or candidate["away"] == rasterzahl
            ),
            None,
        )
        homes = set(HOME_ROWS[str(size)][round_index])
        if pairing and rasterzahl in homes and pairing["home"] != bye and pairing["away"] != bye:
            weeks.append(week_map[round_index])
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


def week_slot(group_size: int, rasterzahl: int) -> str:
    weeks = home_weeks(group_size, rasterzahl)
    odd = sum(1 for week in weeks if week % 2 == 1)
    return "A" if odd >= len(weeks) - odd else "B"


def derby_spieltag(group_size: int, a: int, b: int) -> int | None:
    size = raster_size_for_group_size(group_size)
    key = tuple(sorted((a, b)))
    for round_index, pairings in enumerate(circle_pairs(size)):
        for pairing in pairings:
            if tuple(sorted((pairing["home"], pairing["away"]))) == key:
                return round_index + 1
    return None


def relation(group_size_a: int, rz_a: int, group_size_b: int, rz_b: int) -> str:
    size_a = raster_size_for_group_size(group_size_a)
    size_b = raster_size_for_group_size(group_size_b)
    if size_a == size_b:
        rows = HOME_ROWS[str(size_a)]
        a_home = {index + 1 for index, homes in enumerate(rows) if rz_a in homes}
        b_home = {index + 1 for index, homes in enumerate(rows) if rz_b in homes}
        overlap = len(a_home & b_home)
        if overlap == 0:
            return "wechsel"
        if overlap == min(len(a_home), len(b_home)):
            return "zeitgleich"
        return "neither"
    for row in CROSS_SIZE:
        if row["a"] == size_a and row["b"] == size_b:
            if [rz_a, rz_b] in row["imWechsel"]:
                return "wechsel"
            if [rz_a, rz_b] in row["zeitgleich"]:
                return "zeitgleich"
        if row["a"] == size_b and row["b"] == size_a:
            if [rz_b, rz_a] in row["imWechsel"]:
                return "wechsel"
            if [rz_b, rz_a] in row["zeitgleich"]:
                return "zeitgleich"
    weeks_a = set(home_weeks(group_size_a, rz_a))
    weeks_b = set(home_weeks(group_size_b, rz_b))
    overlap = len(weeks_a & weeks_b)
    if overlap == 0:
        return "wechsel"
    if overlap == min(len(weeks_a), len(weeks_b)):
        return "zeitgleich"
    return "neither"


def capacity_for(model: dict[str, Any], team: dict[str, Any]) -> int | None:
    inferred: dict[tuple[str, str, str, str], int] = {}
    for candidate in model["teams"]:
        pref = candidate.get("spielwochePref")
        if not pref:
            continue
        key = (candidate["clubId"], candidate["hall"], candidate["homeWeekday"], pref)
        inferred[key] = inferred.get(key, 0) + 1
    club = next((candidate for candidate in model["clubs"] if candidate["id"] == team["clubId"]), None)
    venue = None
    if club:
        venue = next((candidate for candidate in club.get("venues", []) if candidate["hall"] == team["hall"]), None)
    if venue:
        by_day = venue.get("capacityByWeekday") or {}
        if team["homeWeekday"] in by_day:
            return int(by_day[team["homeWeekday"]])
        if venue.get("capacity") is not None:
            return int(venue["capacity"])
    inferred_capacity = max(
        inferred.get((team["clubId"], team["hall"], team["homeWeekday"], "A"), 0),
        inferred.get((team["clubId"], team["hall"], team["homeWeekday"], "B"), 0),
    )
    return inferred_capacity or None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--metadata")
    parser.add_argument("--weights")
    parser.add_argument("--time-limit", type=float, default=300)
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    season = load_json(Path(args.model))
    season = season.get("model", season)
    weights = DEFAULT_WEIGHTS | (load_json(Path(args.weights)) if args.weights else {})
    model = cp_model.CpModel()

    teams = {team["id"]: team for team in season["teams"]}
    team_group = {
        team_id: group
        for group in season["groups"]
        for team_id in group["teamIds"]
    }
    rz: dict[str, cp_model.IntVar] = {}
    for group in season["groups"]:
        group_vars = []
        for team_id in group["teamIds"]:
            team = teams[team_id]
            var = model.new_int_var(1, int(group["size"]), f"rz_{team_id}")
            rz[team_id] = var
            group_vars.append(var)
            kind = team["rasterzahl"]["kind"]
            if kind in ("fixed", "pinned"):
                model.add(var == int(team["rasterzahl"]["value"]))
        model.add_all_different(group_vars)

    objective_terms: list[cp_model.LinearExpr] = []

    for group in season["groups"]:
        ids = group["teamIds"]
        for left_index, left_id in enumerate(ids):
            left = teams[left_id]
            for right_id in ids[left_index + 1 :]:
                right = teams[right_id]
                if left["clubId"] != right["clubId"]:
                    continue
                allowed = []
                is_st4 = model.new_bool_var(f"same_club_st4_{left_id}_{right_id}")
                for a in range(1, int(group["size"]) + 1):
                    for b in range(1, int(group["size"]) + 1):
                        if a == b:
                            continue
                        day = derby_spieltag(int(group["size"]), a, b)
                        if day is None or day <= 4:
                            allowed.append((a, b, int(day == 4)))
                model.add_allowed_assignments([rz[left_id], rz[right_id], is_st4], allowed)
                objective_terms.append(is_st4 * int(weights["sameClubDerbySt4"]))

    home_bool: dict[tuple[str, int], cp_model.IntVar] = {}
    for team_id, team in teams.items():
        group = team_group.get(team_id)
        if not group:
            continue
        all_weeks = sorted({week for value in range(1, int(group["size"]) + 1) for week in home_weeks(int(group["size"]), value)})
        for week in all_weeks:
            var = model.new_bool_var(f"home_{team_id}_{week}")
            table = [(value, int(week in home_weeks(int(group["size"]), value))) for value in range(1, int(group["size"]) + 1)]
            model.add_allowed_assignments([rz[team_id], var], table)
            home_bool[(team_id, week)] = var

    excess_by_club: dict[str, list[cp_model.IntVar]] = {}
    slot_keys = sorted(
        {
            (team["clubId"], team["hall"], team["homeWeekday"], week)
            for team in season["teams"]
            for week in sorted({week for value in range(1, int(team_group.get(team["id"], {"size": 0})["size"]) + 1) for week in home_weeks(int(team_group.get(team["id"], {"size": 0})["size"]), value)})
            if capacity_for(season, team) is not None and team["id"] in team_group
        }
    )
    for club_id, hall, weekday, week in slot_keys:
        slot_teams = [
            team
            for team in season["teams"]
            if team["clubId"] == club_id
            and team["hall"] == hall
            and team["homeWeekday"] == weekday
            and team["id"] in team_group
            and (team["id"], week) in home_bool
        ]
        if not slot_teams:
            continue
        capacity = capacity_for(season, slot_teams[0])
        if capacity is None:
            continue
        count = sum(home_bool[(team["id"], week)] for team in slot_teams)
        excess = model.new_bool_var(f"excess_{club_id}_{hall}_{weekday}_{week}")
        model.add(count <= capacity + 1)
        model.add(count >= capacity + 1).only_enforce_if(excess)
        model.add(count <= capacity).only_enforce_if(excess.Not())
        objective_terms.append(excess * int(weights["overUsage"]))
        excess_by_club.setdefault(club_id, []).append(excess)

    for club_id, excesses in excess_by_club.items():
        total = model.new_int_var(0, len(excesses), f"club_excess_{club_id}")
        square = model.new_int_var(0, len(excesses) ** 2, f"club_excess_square_{club_id}")
        model.add(total == sum(excesses))
        model.add_element(total, [value * value for value in range(len(excesses) + 1)], square)
        objective_terms.append(square * int(weights["overUsageFairness"]))

    for wish in season["wishes"]:
        team_a = teams.get(wish["teamA"])
        team_b = teams.get(wish["teamB"])
        group_a = team_group.get(wish["teamA"])
        group_b = team_group.get(wish["teamB"])
        if not team_a or not team_b or not group_a or not group_b:
            continue
        ok_pairs = []
        for a in range(1, int(group_a["size"]) + 1):
            for b in range(1, int(group_b["size"]) + 1):
                if relation(int(group_a["size"]), a, int(group_b["size"]), b) == wish["relation"]:
                    ok_pairs.append((a, b, 0))
                else:
                    ok_pairs.append((a, b, 1))
        broken = model.new_bool_var(f"wish_{wish['teamA']}_{wish['teamB']}")
        model.add_allowed_assignments([rz[wish["teamA"]], rz[wish["teamB"]], broken], ok_pairs)
        objective_terms.append(broken * int(weights[wish["relation"]]))

    if int(weights["spielwoche"]):
        for team_id, team in teams.items():
            pref = team.get("spielwochePref")
            group = team_group.get(team_id)
            if not pref or not group:
                continue
            miss = model.new_bool_var(f"spielwoche_{team_id}")
            table = [(value, int(week_slot(int(group["size"]), value) != pref)) for value in range(1, int(group["size"]) + 1)]
            model.add_allowed_assignments([rz[team_id], miss], table)
            objective_terms.append(miss * int(weights["spielwoche"]))

    model.minimize(sum(objective_terms) if objective_terms else 0)
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = args.time_limit
    solver.parameters.num_search_workers = args.workers
    status = solver.solve(model)
    status_name = solver.status_name(status)

    metadata = {
        "solver": "ortools-cpsat",
        "status": status_name,
        "objective": solver.objective_value if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "bestBound": solver.best_objective_bound if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else None,
        "wallTimeSeconds": solver.wall_time,
    }
    if args.metadata:
        Path(args.metadata).parent.mkdir(parents=True, exist_ok=True)
        Path(args.metadata).write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise SystemExit(f"CP-SAT did not find an assignment: {status_name}")

    assignment = {team_id: int(solver.value(var)) for team_id, var in rz.items()}
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(assignment, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
