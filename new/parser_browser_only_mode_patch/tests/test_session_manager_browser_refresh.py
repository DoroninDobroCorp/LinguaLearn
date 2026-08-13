from core import session_manager


def test_session_runtime_url_preserves_path_but_switches_to_runtime_origin():
    session = {"runtime_site_origin": "https://www.vividmountain28.xyz"}

    url = session_manager._session_runtime_url(
        session,
        "https://www.pinnacle888.com/en/sports/soccer?view=compact",
    )

    assert url == "https://www.vividmountain28.xyz/en/sports/soccer?view=compact"


def test_playwright_cookies_from_session_filters_cross_domain_cookies():
    session = {
        "runtime_site_host": "www.vividmountain28.xyz",
        "cookies": [
            {
                "name": "_ulp",
                "value": "abc",
                "domain": ".vividmountain28.xyz",
                "path": "/",
                "sameSite": "lax",
                "secure": True,
            },
            {
                "name": "other",
                "value": "skip-me",
                "domain": ".example.com",
                "path": "/",
            },
        ],
    }

    cookies = session_manager._playwright_cookies_from_session(session)

    assert cookies == [
        {
            "name": "_ulp",
            "value": "abc",
            "domain": ".vividmountain28.xyz",
            "path": "/",
            "sameSite": "Lax",
            "secure": True,
        }
    ]


def test_playwright_cookies_from_session_falls_back_to_site_host_when_runtime_host_is_stale():
    session = {
        "runtime_site_host": "www.quietthunder61.xyz",
        "site_host": "www.pinnacle888.com",
        "session_site_binding": {"host": "www.pinnacle888.com"},
        "cookies": [
            {
                "name": "_ulp",
                "value": "abc",
                "domain": ".pinnacle888.com",
                "path": "/",
            }
        ],
    }

    cookies = session_manager._playwright_cookies_from_session(session)
    origin = session_manager._session_runtime_origin(session)

    assert origin == "https://www.pinnacle888.com"
    assert cookies == [
        {
            "name": "_ulp",
            "value": "abc",
            "domain": ".pinnacle888.com",
            "path": "/",
        }
    ]
