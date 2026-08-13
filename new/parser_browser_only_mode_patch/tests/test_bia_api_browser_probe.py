from tools.bia_api_browser_probe import summarize_json_payload


def test_summarize_json_payload_detects_event_list_shape():
    payload = [
        {
            "event_id": "2026-04-10,95,47",
            "competition_id": 3,
            "competition_name": "UEFA Champions League",
            "home": "Barcelona",
            "away": "PSG",
        }
    ]

    summary = summarize_json_payload(payload)

    assert summary["payload_type"] == "list"
    assert summary["item_count"] == 1
    assert "event_id" in summary["sample_item_keys"]
    assert summary["has_event_fields"] is True
    assert summary["has_market_fields"] is False


def test_summarize_json_payload_detects_market_fields_inside_results():
    payload = {
        "results": [
            {
                "event_id": "2026-04-10,95,47",
                "markets": {"wdw": [], "exact_total": []},
            }
        ]
    }

    summary = summarize_json_payload(payload)

    assert summary["payload_type"] == "dict"
    assert summary["collection_key"] == "results"
    assert summary["item_count"] == 1
    assert summary["has_event_fields"] is True
    assert summary["has_market_fields"] is True


def test_summarize_json_payload_handles_non_json_text():
    summary = summarize_json_payload("<html>login required</html>")

    assert summary["payload_type"] == "str"
    assert summary["has_event_fields"] is False
    assert summary["has_market_fields"] is False
    assert "login required" in summary["excerpt"]
