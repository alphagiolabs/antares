from backend.core.config_theme import DEFAULT_THEME, get_preset_names, load_preset


def test_default_theme_uses_precision_linear_identity() -> None:
    assert DEFAULT_THEME["name"] == "Precision Linear"
    assert DEFAULT_THEME["accent"] == "#5E6AD2"
    assert DEFAULT_THEME["accent_light"] == "#8B93FF"
    assert DEFAULT_THEME["blue_hover"] == "#22C7A9"
    assert "Precision Linear" in get_preset_names()
    assert load_preset("Precision Linear")["name"] == "Precision Linear"
