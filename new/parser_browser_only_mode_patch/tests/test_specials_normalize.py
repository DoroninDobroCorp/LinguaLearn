from parsing.specials_parser import normalize_htft_key


def test_normalize_htft_key_keeps_hyphenated_team_names():
    home = "Bonaire"
    away = "Saint-Martin"

    assert normalize_htft_key("Bonaire - Bonaire", home, away) == "1/1"
    assert normalize_htft_key("Bonaire - Draw", home, away) == "1/X"
    assert normalize_htft_key("Bonaire - Saint-Martin", home, away) == "1/2"
    assert normalize_htft_key("Draw - Bonaire", home, away) == "X/1"
    assert normalize_htft_key("Draw - Draw", home, away) == "X/X"
    assert normalize_htft_key("Draw - Saint-Martin", home, away) == "X/2"
    assert normalize_htft_key("Saint-Martin - Bonaire", home, away) == "2/1"
    assert normalize_htft_key("Saint-Martin - Draw", home, away) == "2/X"
    assert normalize_htft_key("Saint-Martin - Saint-Martin", home, away) == "2/2"