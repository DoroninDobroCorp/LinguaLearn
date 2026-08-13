from __future__ import annotations

import pytest

from pin888_role_controller import OTHER_SPORTS, plan_roles, serialize_plan


def test_one_pin_temporarily_owns_all_sports_without_rotation():
    plan = plan_roles(["pin-a"], 99)
    assert plan.cycle_index == 0
    assert plan.football_owner == "pin-a"
    assert plan.other_owner == "pin-a"
    assert plan.active_pin_ids == ("pin-a",)
    assert "soccer" in plan.assignment
    assert all(sport in plan.assignment for sport in OTHER_SPORTS)


def test_two_pins_keep_fixed_roles_without_rotation():
    plans = [plan_roles(["pin-a", "pin-b"], i) for i in range(8)]
    for plan in plans:
        assert plan.cycle_index == 0
        assert plan.football_owner == "pin-a"
        assert plan.other_owner == "pin-b"
        assert plan.active_pin_ids == ("pin-a", "pin-b")


def test_three_pins_keep_two_active_and_leave_the_rest_at_rest():
    logins = ["pin-a", "pin-b", "pin-c"]
    football_owners = []
    for cycle in range(8):
        plan = plan_roles(logins, cycle)
        football_owners.append(plan.football_owner)
        assert len(plan.active_pin_ids) == 2
        assert set(plan.active_pin_ids) <= set(logins)
        assert plan.football_owner != plan.other_owner
    assert football_owners[:4] == ["pin-a", "pin-b", "pin-c", "pin-a"]


def test_serialized_plan_matches_its_json_round_trip():
    plan = plan_roles(["pin-a"], 0)
    serialized = serialize_plan(plan)
    assert serialized["active_pin_ids"] == ["pin-a"]
    assert serialized == __import__("json").loads(__import__("json").dumps(serialized))


@pytest.mark.parametrize("bad", [[], ["same", "same"], ["unsafe=id"]])
def test_invalid_pools_fail_closed(bad):
    with pytest.raises(ValueError):
        plan_roles(bad, 0)
