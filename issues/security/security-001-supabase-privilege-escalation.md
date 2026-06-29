# SEC-001 — Escalada de privilegios: usuario se auto-asigna `is_admin`

- **Severidad:** P0 (Crítica)
- **Categoría:** Authentication / Authorization (RLS bypass → privilege escalation)
- **Archivos afectados:** `supabase/migrations/0001_user_profiles.sql` (policy `users_update_own_profile`), y por propagación `supabase/migrations/0002_admin_functions.sql`, `supabase/functions/admin-create-user/index.ts`, `supabase/functions/admin-delete-user/index.ts`

## Vulnerabilidad

La policy de RLS permite a cada usuario actualizar su propia fila de perfil:

```sql
CREATE POLICY "users_update_own_profile"
  ON public.user_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

El comentario del archivo dice "solo display_name", pero la policy **no restringe columnas**. `WITH CHECK` solo verifica que la fila siga perteneciendo al usuario — no valida qué columnas cambian. Como `is_admin` y `is_disabled` son columnas escribibles (con `DEFAULT false`), un usuario autenticado puede hacer, con la **anon key** (pública, que tiene cualquier cliente):

```ts
await supabase.from('user_profiles').update({ is_admin: true }).eq('user_id', myUserId);
```

RLS deja pasar el `UPDATE` (la fila es propia) y `is_admin` queda en `true`.

Esto compromete **toda** la puerta de admin, porque todo depende de `public.is_admin()`:

- `admin_list_users()`, `admin_toggle_disabled()`, `admin_set_admin()` (SECURITY DEFINER, check `is_admin()`) — `0002_admin_functions.sql`.
- Las edge functions `admin-create-user` y `admin-delete-user` leen `user_profiles.is_admin` con el token del caller (`admin-create-user/index.ts:63-74`, `admin-delete-user/index.ts:59-70`) — un atacante que se auto-promocionó pasa ese check y puede **crear/eliminar usuarios** vía la service role key.

No hay `BEFORE UPDATE` trigger, ni `GRANT UPDATE (display_name)` a nivel columna, ni `FORCE ROW LEVEL SECURITY` que detenga esto.

## Impacto

Cualquier usuario autenticado (incluso uno de baja confianza) se convierte en administrador: puede listar todos los usuarios (emails, `last_sign_in_at`), desactivar a otros, ascender/descender roles, crear cuentas nuevas y **eliminar usuarios** del sistema de auth. Compromiso total del módulo de administración. Vector remoto (solo requiere una sesión válida + anon key, ambas disponibles en el cliente).

## Fix propuesto (aditivo, conserva toda la funcionalidad)

Nueva migración `supabase/migrations/0003_protect_profile_flags.sql` que añade un trigger `BEFORE UPDATE` protector. Conserva: el usuario sigue pudiendo editar `display_name`; los admins siguen usando `admin_set_admin`/`admin_toggle_disabled` (el trigger permite cambios cuando `is_admin()` es true, y `auth.uid()` dentro del trigger sigue siendo el caller original incluso bajo SECURITY DEFINER).

```sql
-- 0003_protect_profile_flags.sql
-- Protege is_admin / is_disabled contra auto-escalada vía la policy
-- users_update_own_profile (que permite UPDATE de la fila propia sin
-- restringir columnas). Los admins siguen pudiendo cambiar los flags
-- vía las funciones SECURITY DEFINER admin_set_admin / admin_toggle_disabled,
-- porque el trigger permite la mutación cuando public.is_admin() = true.

CREATE OR REPLACE FUNCTION public.guard_profile_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Solo restringir cambios a los flags sensibles. display_name y
  -- updated_at quedan libres (conserva la funcionalidad de self-edit).
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
```

> Nota: el trigger se dispara también cuando `admin_set_admin`/`admin_toggle_disabled` hacen su `UPDATE` (los triggers corren sin importar RLS). En ese caso `auth.uid()` = el admin que invocó, `public.is_admin()` = true → el trigger permite. Funcionalidad admin intacta.

Alternativa equivalente (PostgreSQL 15+): revocar `UPDATE (is_admin, is_disabled)` al rol `authenticated` y dejar solo las funciones SECURITY DEFINER para mutar esos flags. El trigger es más portable y explícito.

## Testing (sin romper nada)

1. **Test SQL positivo (self-edit display_name sigue funcionando):**
   ```sql
   -- como un usuario normal autenticado
   update user_profiles set display_name = 'nuevo', updated_at = now()
     where user_id = auth.uid();
   -- debe pasar (1 fila actualizada)
   ```
2. **Test SQL negativo (auto-escalada bloqueada):**
   ```sql
   set role authenticated; -- o JWT de un usuario no-admin
   update user_profiles set is_admin = true where user_id = auth.uid();
   -- debe lanzar: 'Solo un administrador puede cambiar is_admin o is_disabled'
   ```
3. **Test admin sigue funcionando:**
   ```sql
   -- como admin
   select admin_set_admin('<otro_user_id>', true);  -- debe pasar
   select admin_toggle_disabled('<otro_user_id>', true);  -- debe pasar
   ```
4. **Edge functions:** re-ejecutar el flujo de `admin-create-user` / `admin-delete-user` con un caller admin → 200; con un caller no-admin → 403 (sin cambios, el fix no las toca).
5. **Frontend:** `frontend/src/auth/*.test.tsx` — login + panel de admin deben seguir funcionando sin cambios.

Aplicar la migración en Supabase y verificar `select * from pg_policies where tablename='user_profiles'` y `select tgname from pg_trigger where tgrelid='public.user_profiles'::regclass`.
