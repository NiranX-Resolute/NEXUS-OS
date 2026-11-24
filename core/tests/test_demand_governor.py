"""
Tests for SubsystemDemandGovernor (On-Demand Engine Resource System)
"""

import pytest
from engine.demand_governor import SubsystemDemandGovernor


class MockHarness:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


def test_initial_subsystems_dormant():
    gov = SubsystemDemandGovernor(on_demand_mode=True)
    telemetry = gov.get_telemetry()
    assert telemetry["demand_mode_enabled"] is True
    assert telemetry["active_count"] == 0
    assert telemetry["dormant_count"] > 0
    assert telemetry["ram_saved_mb"] > 0
    assert not gov.is_active("terminal_pty")


def test_lazy_activation_on_demand():
    gov = SubsystemDemandGovernor(on_demand_mode=True)
    created = []

    def factory():
        h = MockHarness()
        created.append(h)
        return h

    # Prior to request, not active
    assert not gov.is_active("terminal_pty")
    assert len(created) == 0

    # Explicitly request subsystem
    inst1 = gov.get_or_activate("terminal_pty", factory)
    assert inst1 is not None
    assert len(created) == 1
    assert gov.is_active("terminal_pty")

    # Second call returns same active instance without re-instantiating
    inst2 = gov.get_or_activate("terminal_pty", factory)
    assert inst1 is inst2
    assert len(created) == 1

    telemetry = gov.get_telemetry()
    assert telemetry["active_count"] == 1
    assert "terminal_pty" in telemetry["active_subsystems"]


def test_hibernate_releases_resources():
    gov = SubsystemDemandGovernor(on_demand_mode=True)
    h = MockHarness()
    gov.get_or_activate("browser_verifier", lambda: h)

    assert gov.is_active("browser_verifier")
    assert h.closed is False

    # Hibernate browser verifier
    hibernated = gov.hibernate("browser_verifier")
    assert hibernated is True
    assert h.closed is True
    assert not gov.is_active("browser_verifier")


def test_hibernate_all():
    gov = SubsystemDemandGovernor(on_demand_mode=True)
    h1 = MockHarness()
    h2 = MockHarness()

    gov.get_or_activate("terminal_pty", lambda: h1)
    gov.get_or_activate("desktop_ufo", lambda: h2)

    assert gov.get_telemetry()["active_count"] == 2

    closed_count = gov.hibernate_all()
    assert closed_count == 2
    assert h1.closed is True
    assert h2.closed is True
    assert gov.get_telemetry()["active_count"] == 0
