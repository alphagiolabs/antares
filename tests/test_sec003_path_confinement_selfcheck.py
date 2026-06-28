"""Self-check SEC-003 Capa 2 — guard_user_path / resolve_allowed_roots.

pytest no está en el venv local (hermes); la suite canonical corre en CI.
Este self-check stdlib valida la lógica de confinamiento in-vivo, siguiendo
el patrón de cambios_auditoria_security.md (self-check funcional stdlib-only).
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

# Asegurar raíz del repo en sys.path para import backend.* desde fuente
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.utils.paths import guard_user_path, resolve_allowed_roots  # noqa: E402

passed = 0
failed = 0


def check(cond: bool, msg: str) -> None:
    global passed, failed
    if cond:
        print(f"  [OK] {msg}")
        passed += 1
    else:
        print(f"  [FAIL] {msg}")
        failed += 1


def main() -> None:
    print("Self-check SEC-003 Capa 2: guard_user_path / resolve_allowed_roots\n")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp).resolve()
        legit_file = tmp_path / "data.xlsx"
        legit_file.write_bytes(b"x")
        sibling = tmp_path / "other.xlsx"
        out_of_root = Path(tempfile.gettempdir()).resolve() / "antares_sec003_leak.xlsx"

        # --- resolve_allowed_roots ---
        check(resolve_allowed_roots({}) == (), "allowed_roots ausente → ()")
        check(resolve_allowed_roots({"allowed_roots": []}) == (), "allowed_roots vacío → ()")
        check(resolve_allowed_roots({"allowed_roots": "not-a-list"}) == (), "allowed_roots no-list → ()")
        roots = resolve_allowed_roots({"allowed_roots": [str(tmp_path), ""]})
        check(len(roots) == 1 and roots[0] == tmp_path, "allowed_roots válido → tuple de Path resueltos (filtra vacíos)")

        # --- warn mode (allowed_roots vacío): solo piso system-sensitive ---
        # Path legítimo de usuario pasa (no es system-sensitive).
        resolved = guard_user_path(str(legit_file), {}, label="legit")
        check(resolved == legit_file, "warn: path legítimo pasa y se resuelve")
        # Path system-sensitive se rechaza incluso sin allowed_roots (piso).
        sys_path = r"C:\Windows\System32\drivers\etc\hosts" if sys.platform == "win32" else "/etc/passwd"
        try:
            guard_user_path(sys_path, {}, label="sys")
            check(False, "warn: path system-sensitive debería rechazarse")
        except ValueError:
            check(True, "warn: path system-sensitive rechazado por piso")

        # --- enforce mode (allowed_roots = [tmp]): confina a la raíz ---
        params = {"allowed_roots": [str(tmp_path)]}
        resolved2 = guard_user_path(str(legit_file), params, label="legit")
        check(resolved2 == legit_file, "enforce: path bajo raíz vouched pasa")
        try:
            guard_user_path(str(out_of_root), params, label="leak")
            check(False, "enforce: path fuera de raíz debería rechazarse")
        except ValueError:
            check(True, "enforce: path fuera de raíz vouched rechazado")
        # Sibling dentro de la raíz pasa (confinamiento por raíz, no por archivo exacto)
        resolved3 = guard_user_path(str(sibling), params, label="sibling")
        check(resolved3 == sibling, "enforce: sibling bajo la misma raíz vouched pasa")

    print(f"\n{'=' * 50}")
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
