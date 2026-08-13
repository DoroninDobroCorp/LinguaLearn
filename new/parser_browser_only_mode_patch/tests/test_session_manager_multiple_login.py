import asyncio

import core.session_manager as session_manager
from state import state


def test_multiple_login_refresh_limit_trips_on_fourth_attempt():
    async def _run():
        prev_fatal = state.login_fatal
        prev_reason = state.login_fatal_reason
        prev_history = list(state.multiple_login_refresh_attempt_ts)
        prev_revalidation_required = state.session_revalidation_required
        prev_revalidation_baseline = state.session_revalidation_baseline_mtime
        try:
            state.login_fatal = False
            state.login_fatal_reason = ""
            state.multiple_login_refresh_attempt_ts = []

            assert session_manager._register_multiple_login_refresh_attempt(1000.0) is True
            assert session_manager._register_multiple_login_refresh_attempt(1100.0) is True
            assert session_manager._register_multiple_login_refresh_attempt(1200.0) is True
            assert session_manager._register_multiple_login_refresh_attempt(1300.0) is False
            assert state.login_fatal is True
            assert "MULTIPLE_LOGIN relogin limit exceeded" in state.login_fatal_reason
        finally:
            state.login_fatal = prev_fatal
            state.login_fatal_reason = prev_reason
            state.multiple_login_refresh_attempt_ts = prev_history
            state.session_revalidation_required = prev_revalidation_required
            state.session_revalidation_baseline_mtime = prev_revalidation_baseline
            session_manager.clear_auth_cooldown()

    asyncio.run(_run())


def test_multiple_login_refresh_window_expires_old_attempts():
    async def _run():
        prev_fatal = state.login_fatal
        prev_reason = state.login_fatal_reason
        prev_history = list(state.multiple_login_refresh_attempt_ts)
        prev_revalidation_required = state.session_revalidation_required
        prev_revalidation_baseline = state.session_revalidation_baseline_mtime
        try:
            state.login_fatal = False
            state.login_fatal_reason = ""
            state.multiple_login_refresh_attempt_ts = []

            assert session_manager._register_multiple_login_refresh_attempt(1000.0) is True
            assert session_manager._register_multiple_login_refresh_attempt(1100.0) is True
            assert session_manager._register_multiple_login_refresh_attempt(1200.0) is True
            # first attempt is already outside 900s window here
            assert session_manager._register_multiple_login_refresh_attempt(1901.0) is True
            assert state.login_fatal is False
            assert len(state.multiple_login_refresh_attempt_ts) == 3
        finally:
            state.login_fatal = prev_fatal
            state.login_fatal_reason = prev_reason
            state.multiple_login_refresh_attempt_ts = prev_history
            state.session_revalidation_required = prev_revalidation_required
            state.session_revalidation_baseline_mtime = prev_revalidation_baseline
            session_manager.clear_auth_cooldown()

    asyncio.run(_run())
