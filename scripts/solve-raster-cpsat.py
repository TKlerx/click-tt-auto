# /// script
# requires-python = ">=3.12,<3.14"
# dependencies = ["ortools>=9.14,<10"]
# ///

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from ortools.sat.python import cp_model


ROOT = Path(__file__).resolve().parents[1]
RULEBOOK = ROOT / "src" / "raster" / "rulebook"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


HOME_ROWS = load_json(RULEBOOK / "templates.json")
PAIRING_ROWS = load_json(RULEBOOK / "pairings.json")
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


def raster_key_for_group(group: dict[str, Any]) -> str:
    size = int(group["size"])
    if size == 5:
        return "6"
    if size == 6 and group.get("rasterMode") == "double":
        return "6d"
    if size == 6:
        return "6"
    if size in (7, 8):
        return "8"
    if size in (9, 10):
        return "10"
    if size in (11, 12):
        return "12"
    if size in (13, 14):
        return "14"
    raise ValueError(f"Unsupported group size {size}; supported district sizes are 5..14.")


def raster_size_for_group_size(size: int) -> int:
    key = raster_key_for_group({"size": size})
    return 6 if key == "6d" else int(key)


def numeric_raster_size(key: str) -> int:
    return 6 if key == "6d" else int(key)


def circle_pairs(size: str) -> list[list[dict[str, int]]]:
    if size in PAIRING_ROWS:
        return PAIRING_ROWS[size]

    numeric_size = int(size)
    teams = list(range(1, numeric_size + 1))
    rotating = teams[1:]
    rounds: list[list[dict[str, int]]] = []
    for round_index in range(numeric_size - 1):
        row = [teams[0], *rotating]
        raw_pairs = [(row[index], row[numeric_size - 1 - index]) for index in range(numeric_size // 2)]
        homes = set(HOME_ROWS[size][round_index])
        rounds.append(
            [{"home": a, "away": b} if a in homes else {"home": b, "away": a} for a, b in raw_pairs]
        )
        rotating = [rotating[-1], *rotating[:-1]]
    return rounds


def raster_values_for_group(group: dict[str, Any]) -> range:
    return range(1, numeric_raster_size(raster_key_for_group(group)) + 1)


def home_weeks_for_group(group: dict[str, Any], rasterzahl: int, bye: int | None = None) -> list[int]:
    size = raster_key_for_group(group)
    group_size = int(group["size"])
    if bye is None and group_size % 2 == 1:
        bye = numeric_raster_size(size)
    if rasterzahl == bye:
        return []
    weeks: list[int] = []
    week_map = SPIELWOCHEN[size]
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
        homes = set(HOME_ROWS[size][round_index])
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


def home_weeks(group_size: int, rasterzahl: int) -> list[int]:
    return home_weeks_for_group({"size": group_size}, rasterzahl)


def week_slot_for_group(group: dict[str, Any], rasterzahl: int, bye: int | None = None) -> str:
    weeks = home_weeks_for_group(group, rasterzahl, bye)
    odd = sum(1 for week in weeks if week % 2 == 1)
    return "A" if odd >= len(weeks) - odd else "B"


def derby_spieltag_for_group(group: dict[str, Any], a: int, b: int) -> int | None:
    size = raster_key_for_group(group)
    key = tuple(sorted((a, b)))
    for round_index, pairings in enumerate(circle_pairs(size)):
        for pairing in pairings:
            if tuple(sorted((pairing["home"], pairing["away"]))) == key:
                return round_index + 1
    return None


def relation(
    group_a: dict[str, Any],
    rz_a: int,
    group_b: dict[str, Any],
    rz_b: int,
    bye_a: int | None = None,
    bye_b: int | None = None,
) -> str:
    size_a = raster_key_for_group(group_a)
    size_b = raster_key_for_group(group_b)
    if bye_a is not None or bye_b is not None:
        weeks_a = set(home_weeks_for_group(group_a, rz_a, bye_a))
        weeks_b = set(home_weeks_for_group(group_b, rz_b, bye_b))
        overlap = len(weeks_a & weeks_b)
        if overlap == 0:
            return "wechsel"
        if overlap == min(len(weeks_a), len(weeks_b)):
            return "zeitgleich"
        return "neither"
    if size_a == size_b:
        rows = HOME_ROWS[size_a]
        a_home = {index + 1 for index, homes in enumerate(rows) if rz_a in homes}
        b_home = {index + 1 for index, homes in enumerate(rows) if rz_b in homes}
        overlap = len(a_home & b_home)
        if overlap == 0:
            return "wechsel"
        if overlap == min(len(a_home), len(b_home)):
            return "zeitgleich"
        return "neither"
    for row in CROSS_SIZE:
        if row["a"] == numeric_raster_size(size_a) and row["b"] == numeric_raster_size(size_b):
            if [rz_a, rz_b] in row["imWechsel"]:
                return "wechsel"
            if [rz_a, rz_b] in row["zeitgleich"]:
                return "zeitgleich"
        if row["a"] == numeric_raster_size(size_b) and row["b"] == numeric_raster_size(size_a):
            if [rz_b, rz_a] in row["imWechsel"]:
                return "wechsel"
            if [rz_b, rz_a] in row["zeitgleich"]:
                return "zeitgleich"
    weeks_a = set(home_weeks_for_group(group_a, rz_a))
    weeks_b = set(home_weeks_for_group(group_b, rz_b))
    overlap = len(weeks_a & weeks_b)
    if overlap == 0:
        return "wechsel"
    if overlap == min(len(weeks_a), len(weeks_b)):
        return "zeitgleich"
    return "neither"


def capacity_for(model: dict[str, Any], team: dict[str, Any]) -> int | None:
    if team.get("capacityRelevant") is False:
        return None
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


def parse_start_minutes(value: object) -> int | None:
    if not isinstance(value, str):
        return None
    parts = value.strip().replace(".", ":").split(":")
    if len(parts) != 2:
        return None
    try:
        hours = int(parts[0])
        minutes = int(parts[1])
    except ValueError:
        return None
    if hours > 23 or minutes > 59:
        return None
    return hours * 60 + minutes


def match_duration_minutes(team: dict[str, Any]) -> int:
    # Keep in step with requiredCapacity's matchDurationMinutes in
    # src/raster/score/penalties.ts and _match_duration_minutes in
    # webapp/worker/src/starter_worker/db.py. All three must agree: the solver
    # optimizes against this duration and the other two score the result, so a
    # divergence makes the objective disagree with the reported score.
    return 120 if re.search(r"\bjugend\b", str(team.get("label") or ""), re.IGNORECASE) else 180


def capacity_buckets(slot_teams: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    unknown = [team for team in slot_teams if parse_start_minutes(team.get("startTime")) is None]
    known = [team for team in slot_teams if parse_start_minutes(team.get("startTime")) is not None]
    if not known:
        return [unknown] if unknown else []

    buckets: list[list[dict[str, Any]]] = []
    seen: set[tuple[str, ...]] = set()
    for minute in sorted({parse_start_minutes(team.get("startTime")) for team in known}):
        if minute is None:
            continue
        active = [
            team
            for team in known
            if (start := parse_start_minutes(team.get("startTime"))) is not None
            and start <= minute < start + match_duration_minutes(team)
        ]
        bucket = [*active, *unknown]
        key = tuple(sorted(str(team["id"]) for team in bucket))
        if bucket and key not in seen:
            seen.add(key)
            buckets.append(bucket)
    return buckets


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
    bye: dict[str, cp_model.IntVar] = {}
    for group in season["groups"]:
        group_vars = []
        for team_id in group["teamIds"]:
            team = teams[team_id]
            var = model.new_int_var(1, numeric_raster_size(raster_key_for_group(group)), f"rz_{team_id}")
            rz[team_id] = var
            group_vars.append(var)
            kind = team["rasterzahl"]["kind"]
            if kind in ("fixed", "pinned"):
                model.add(var == int(team["rasterzahl"]["value"]))
        if int(group["size"]) % 2 == 1:
            group_key = str(group["ref"]["league"]) + "::" + str(group["ref"]["name"])
            bye_var = model.new_int_var(1, numeric_raster_size(raster_key_for_group(group)), f"bye_{len(bye)}")
            bye[group_key] = bye_var
            model.add_all_different([*group_vars, bye_var])
        else:
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
                for a in raster_values_for_group(group):
                    for b in raster_values_for_group(group):
                        if a == b:
                            continue
                        day = derby_spieltag_for_group(group, a, b)
                        if day is None or day <= 4:
                            allowed.append((a, b, int(day == 4)))
                model.add_allowed_assignments([rz[left_id], rz[right_id], is_st4], allowed)
                objective_terms.append(is_st4 * int(weights["sameClubDerbySt4"]))

    home_bool: dict[tuple[str, int], cp_model.IntVar] = {}
    for team_id, team in teams.items():
        group = team_group.get(team_id)
        if not group:
            continue
        group_key = str(group["ref"]["league"]) + "::" + str(group["ref"]["name"])
        bye_var = bye.get(group_key)
        all_weeks = sorted({
            week
            for value in raster_values_for_group(group)
            for bye_value in (raster_values_for_group(group) if bye_var is not None else [None])
            for week in home_weeks_for_group(group, value, bye_value)
        })
        for week in all_weeks:
            var = model.new_bool_var(f"home_{team_id}_{week}")
            if bye_var is not None:
                table = [
                    (value, bye_value, int(week in home_weeks_for_group(group, value, bye_value)))
                    for value in raster_values_for_group(group)
                    for bye_value in raster_values_for_group(group)
                    if value != bye_value
                ]
                model.add_allowed_assignments([rz[team_id], bye_var, var], table)
            else:
                table = [(value, int(week in home_weeks_for_group(group, value))) for value in raster_values_for_group(group)]
                model.add_allowed_assignments([rz[team_id], var], table)
            home_bool[(team_id, week)] = var

    excess_by_club: dict[str, list[tuple[cp_model.IntVar, int]]] = {}
    slot_keys = sorted(
        {
            (team["clubId"], team["hall"], team["homeWeekday"], week)
            for team in season["teams"]
            if capacity_for(season, team) is not None and team["id"] in team_group
            for group in [team_group[team["id"]]]
            for week in sorted(
                {
                    week
                    for value in raster_values_for_group(group)
                    for bye_value in (raster_values_for_group(group) if int(group["size"]) % 2 == 1 else [None])
                    for week in home_weeks_for_group(group, value, bye_value)
                }
            )
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
        buckets = capacity_buckets(slot_teams)
        if not buckets:
            continue
        actual = model.new_int_var(0, len(slot_teams), f"actual_{club_id}_{hall}_{weekday}_{week}")
        for bucket in buckets:
            count = sum(home_bool[(team["id"], week)] for team in bucket)
            model.add(actual >= count)
        excess = model.new_int_var(0, len(slot_teams), f"excess_{club_id}_{hall}_{weekday}_{week}")
        excess_square = model.new_int_var(0, len(slot_teams) ** 2, f"excess_square_{club_id}_{hall}_{weekday}_{week}")
        model.add(excess >= actual - capacity)
        model.add(excess >= 0)
        model.add_element(excess, [value * value for value in range(len(slot_teams) + 1)], excess_square)
        objective_terms.append(excess_square * int(weights["overUsage"]))
        excess_by_club.setdefault(club_id, []).append((excess, len(slot_teams)))

    for club_id, excess_entries in excess_by_club.items():
        excesses = [excess for excess, _ in excess_entries]
        max_total_excess = sum(max_excess for _, max_excess in excess_entries)
        total = model.new_int_var(0, max_total_excess, f"club_excess_{club_id}")
        square = model.new_int_var(0, max_total_excess**2, f"club_excess_square_{club_id}")
        model.add(total == sum(excesses))
        model.add_element(total, [value * value for value in range(max_total_excess + 1)], square)
        objective_terms.append(square * int(weights["overUsageFairness"]))

    for wish in season["wishes"]:
        team_a = teams.get(wish["teamA"])
        team_b = teams.get(wish["teamB"])
        group_a = team_group.get(wish["teamA"])
        group_b = team_group.get(wish["teamB"])
        if not team_a or not team_b or not group_a or not group_b:
            continue
        ok_pairs = []
        key_a = str(group_a["ref"]["league"]) + "::" + str(group_a["ref"]["name"])
        key_b = str(group_b["ref"]["league"]) + "::" + str(group_b["ref"]["name"])
        bye_a = bye.get(key_a)
        bye_b = bye.get(key_b)
        same_bye = bye_a is not None and bye_a is bye_b
        for a in raster_values_for_group(group_a):
            for b in raster_values_for_group(group_b):
                for ba in (raster_values_for_group(group_a) if bye_a is not None else [None]):
                    for bb in (raster_values_for_group(group_b) if bye_b is not None else [None]):
                        if same_bye and ba != bb:
                            continue
                        if a == ba or b == bb:
                            continue
                        broken_value = int(relation(group_a, a, group_b, b, ba, bb) != wish["relation"])
                        row = [a]
                        if bye_a is not None:
                            row.append(int(ba))
                        row.append(b)
                        if bye_b is not None and not same_bye:
                            row.append(int(bb))
                        row.append(broken_value)
                        ok_pairs.append(tuple(row))
        broken = model.new_bool_var(f"wish_{wish['teamA']}_{wish['teamB']}")
        variables = [rz[wish["teamA"]]]
        if bye_a is not None:
            variables.append(bye_a)
        variables.append(rz[wish["teamB"]])
        if bye_b is not None and not same_bye:
            variables.append(bye_b)
        variables.append(broken)
        model.add_allowed_assignments(variables, ok_pairs)
        objective_terms.append(broken * int(weights[wish["relation"]]))

    if int(weights["spielwoche"]):
        rhythm_teams = [
            (team_id, team)
            for team_id, team in teams.items()
            if team.get("spielwochePref") and team.get("capacityRelevant") is not False and team_id in team_group
        ]
        for left_index, (left_id, left) in enumerate(rhythm_teams):
            for right_id, right in rhythm_teams[left_index + 1 :]:
                if (
                    left["clubId"] != right["clubId"]
                    or left["hall"] != right["hall"]
                    or left["homeWeekday"] != right["homeWeekday"]
                ):
                    continue
                group_a = team_group[left_id]
                group_b = team_group[right_id]
                expected = "zeitgleich" if left["spielwochePref"] == right["spielwochePref"] else "wechsel"
                key_a = str(group_a["ref"]["league"]) + "::" + str(group_a["ref"]["name"])
                key_b = str(group_b["ref"]["league"]) + "::" + str(group_b["ref"]["name"])
                bye_a = bye.get(key_a)
                bye_b = bye.get(key_b)
                same_bye = bye_a is not None and bye_a is bye_b
                rows = []
                for a in raster_values_for_group(group_a):
                    for b in raster_values_for_group(group_b):
                        for ba in (raster_values_for_group(group_a) if bye_a is not None else [None]):
                            for bb in (raster_values_for_group(group_b) if bye_b is not None else [None]):
                                if same_bye and ba != bb:
                                    continue
                                if a == ba or b == bb:
                                    continue
                                broken_value = int(relation(group_a, a, group_b, b, ba, bb) != expected)
                                row = [a]
                                if bye_a is not None:
                                    row.append(int(ba))
                                row.append(b)
                                if bye_b is not None and not same_bye:
                                    row.append(int(bb))
                                row.append(broken_value)
                                rows.append(tuple(row))
                broken = model.new_bool_var(f"spielwoche_{left_id}_{right_id}")
                variables = [rz[left_id]]
                if bye_a is not None:
                    variables.append(bye_a)
                variables.append(rz[right_id])
                if bye_b is not None and not same_bye:
                    variables.append(bye_b)
                variables.append(broken)
                model.add_allowed_assignments(variables, rows)
                objective_terms.append(broken * int(weights["spielwoche"]))

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
