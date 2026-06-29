import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from backend.utils.paths import assert_path_within_root, is_system_sensitive_path
from backend.utils.validators import is_safe_user_path, sanitizar_nombre


def test_path_traversal_prevention() -> None:
    """Test that path traversal characters are removed."""
    bad_names = [
        "../../../etc/passwd",
        "..\\..\\windows\\system32",
        "normal_file_../traversal",
        "file with spaces and ../dots",
    ]

    for name in bad_names:
        result = sanitizar_nombre(name)
        assert "../" not in result, f"Path traversal not prevented: {result}"
        assert "..\\" not in result, f"Path traversal not prevented: {result}"


def test_control_characters() -> None:
    """Test that control characters are removed."""
    name_with_control = "file\x00name.txt"  # Null byte
    result = sanitizar_nombre(name_with_control)
    assert "\x00" not in result, "Control character not removed"

    name_with_tab = "file\tname.txt"
    result = sanitizar_nombre(name_with_tab)
    assert "\t" not in result, "Tab character not removed"


def test_leading_dots() -> None:
    """Test that leading dots are removed (hidden files on Unix)."""
    hidden_file = ".hidden_file.txt"
    result = sanitizar_nombre(hidden_file)
    assert not result.startswith("."), "Leading dot not removed"


# ─── SEC-003: system-sensitive path floor + positive confinement ────────────
def _system_path() -> Path:
    return Path(r"C:\Windows\System32\drivers\etc\hosts") if os.name == "nt" else Path("/etc/passwd")


def test_is_system_sensitive_path() -> None:
    assert is_system_sensitive_path(_system_path()) is True
    tmp = Path(tempfile.gettempdir()) / "antares_test.txt"
    assert is_system_sensitive_path(tmp) is False


def test_is_safe_user_path_rejects_system_dirs() -> None:
    assert is_safe_user_path(str(_system_path())) is False
    assert is_safe_user_path("C:/safe/data.xlsx") is True
    assert is_safe_user_path("data.xlsx") is True
    # No false positive on a user folder whose name merely starts with "Windows"
    assert is_safe_user_path("C:/WindowsBackup/x") is True


def test_assert_path_within_root_system_floor_and_confinement() -> None:
    # System-sensitive floor always rejects (even with empty allowed_roots).
    raised = False
    try:
        assert_path_within_root(_system_path(), (), label="x")
    except ValueError:
        raised = True
    assert raised, "system-sensitive path must be rejected"

    # Backward compatible: tmp path passes with empty allowed_roots.
    tmp = Path(tempfile.gettempdir()) / "antares_test.txt"
    assert_path_within_root(tmp, (), label="x")  # no raise

    # Positive confinement: under an allowed root passes, outside raises.
    root = Path(tempfile.mkdtemp())
    assert_path_within_root(root / "a.pdf", (root,), label="x")  # no raise
    raised = False
    try:
        assert_path_within_root(Path(tempfile.mkdtemp()) / "b.pdf", (root,), label="x")
    except ValueError:
        raised = True
    assert raised, "path outside allowed_roots must be rejected"

    # System dir is rejected even if an allowed_root claims it.
    raised = False
    try:
        assert_path_within_root(_system_path(), (_system_path().parent,), label="x")
    except ValueError:
        raised = True
    assert raised, "system dir must be rejected even when listed as allowed_root"


# ─── SEC-003 Capa 2: guard_user_path / resolve_allowed_roots ────────────────
from backend.utils.paths import guard_user_path, resolve_allowed_roots  # noqa: E402


def test_resolve_allowed_roots_handles_missing_and_invalid() -> None:
    assert resolve_allowed_roots({}) == ()
    assert resolve_allowed_roots({"allowed_roots": []}) == ()
    assert resolve_allowed_roots({"allowed_roots": "not-a-list"}) == ()  # type: ignore[arg-type]
    roots = resolve_allowed_roots({"allowed_roots": ["/x", "", None]})  # type: ignore[list-item]
    assert len(roots) == 1
    assert roots[0] == Path("/x").expanduser().resolve()


def test_guard_user_path_warn_mode_only_applies_system_floor() -> None:
    # Sin allowed_roots (warn): path legítimo pasa, system-sensitive rechazado.
    legit = Path(tempfile.gettempdir()) / "antares_guard_test.xlsx"
    assert guard_user_path(str(legit), {}) == legit
    raised = False
    try:
        guard_user_path(str(_system_path()), {})
    except ValueError:
        raised = True
    assert raised, "system-sensitive path must be rejected even in warn mode"


def test_guard_user_path_enforce_mode_confines_to_roots() -> None:
    root = Path(tempfile.mkdtemp())
    inside = root / "data.xlsx"
    inside.write_bytes(b"x")
    outside = Path(tempfile.mkdtemp()) / "leak.xlsx"
    params = {"allowed_roots": [str(root)]}

    assert guard_user_path(str(inside), params) == inside  # bajo la raíz → pasa
    raised = False
    try:
        guard_user_path(str(outside), params)
    except ValueError:
        raised = True
    assert raised, "path outside allowed_roots must be rejected in enforce mode"


if __name__ == "__main__":
    test_path_traversal_prevention()
    test_control_characters()
    test_leading_dots()
    test_is_system_sensitive_path()
    test_is_safe_user_path_rejects_system_dirs()
    test_assert_path_within_root_system_floor_and_confinement()
    test_resolve_allowed_roots_handles_missing_and_invalid()
    test_guard_user_path_warn_mode_only_applies_system_floor()
    test_guard_user_path_enforce_mode_confines_to_roots()
