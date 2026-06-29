-- 0003_protect_profile_flags.sql
-- SEC-001: la policy `users_update_own_profile` (0001) permite UPDATE de la fila
-- propia sin restringir columnas, de modo que un usuario podia hacer
-- `update user_profiles set is_admin = true where user_id = auth.uid()` y
-- auto-escalarse a admin. Este trigger protege las columnas sensibles
-- (is_admin, is_disabled) salvo cuando el caller es admin.
--
-- Conserva toda la funcionalidad:
--   * El usuario sigue pudiendo editar display_name / updated_at de su fila.
--   * Los admins siguen usando las funciones SECURITY DEFINER
--     admin_set_admin / admin_toggle_disabled (0002): el trigger se dispara
--     tambien para esos UPDATE, pero public.is_admin() = true los permite.
--     auth.uid() dentro del trigger sigue siendo el caller original incluso
--     bajo SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.guard_profile_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.is_admin IS DISTINCT FROM OLD.is_admin
      OR NEW.is_disabled IS DISTINCT FROM OLD.is_disabled)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar is_admin o is_disabled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_flags ON public.user_profiles;
CREATE TRIGGER trg_guard_profile_flags
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_flags();
