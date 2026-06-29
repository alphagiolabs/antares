# AGENTS.md — Instrucciones para Agentes de Código

## Principio Fundamental: Simplificar al Esencial

> **"Agrega menos líneas de las que quitas"**

Todo cambio debe hacer el código **más corto, no más largo**. Si agregas 10 líneas, quita al menos 11.

---

## Reglas de Oro

### 1. Negatividad Primero
- **Antes de agregar**, pregunta: ¿se puede resolver eliminando código?
- Busca código muerto, duplicado, o innecesario
- Un archivo que crece es una señal de alerta

### 2. Funcionalidad > Complejidad
- **Mantén el proyecto funcional** en todo momento
- Nunca rompas tests existentes para agregar features
- Si un cambio requiere más de 3 tests nuevos, reconsidera el diseño

### 3. Profundidad, no Anchura
- Módulos profundos = interface pequeña + implementación grande
- Evita interfaces grandes con implementaciones delgadas
- Un método que hace una cosa bien vale más que diez que hacen todo

### 4. Deletability Test
- Antes de agregar un módulo/function, imagina eliminarlo
- Si la complejidad desaparece → era pass-through (no lo necesitas)
- Si reaparece en N call sites → estaba ganándose su lugar

---

## Checklist de Cambios

Antes de cada commit, verifica:

```
[ ] ¿Este cambio elimina más código del que agrega?
[ ] ¿Los tests existentes siguen pasando?
[ ] ¿La interfaz es más simple que antes?
[ ] ¿Hay código duplicado que se puede consolidar?
[ ] ¿El cambio mantiene la funcionalidad existente?
```

---

## Anti-Patrones a Evitar

| Mal | Buen |
|-----|------|
| Agregar wrapper que solo passthrough | Eliminar el wrapper, usar directo |
| Agregar configuración para cada edge case | Manejar edge cases internamente |
| Crear "utils" genéricos | Funciones específicas en su módulo |
| Agregar comments explicando código complejo | Simplificar el código para que no necesite comments |
| Agregar tests para código trivial | Tests para comportamiento crítico |

---

## Workflow de Implementación

1. **Entender** - Lee el código existente antes de modificar
2. **Eliminar** - ¿Qué se puede quitar?
3. **Simplificar** - ¿Cómo se puede hacer más corto?
4. **Implementar** - Solo lo esencial
5. **Verificar** - Tests pasan, funcionalidad preservada
6. **Revisar** - ¿Agregué menos líneas de las que quité?

---

## Referencia de Skills

- `/review` - Revisión de código (Standards + Spec)
- `/tdd` - Test-driven development
- `/codebase-design` - Diseño de módulos profundos
- `/diagnosing-bugs` - Diagnóstico de bugs
- `/request-refactor-plan` - Planes de refactorización incremental

---

## Métricas de Éxito

Un cambio es exitoso si:
- **Líneas netas**: negativas (menos código)
- **Complejidad ciclomatica**: igual o menor
- **Tests**: mismos o menos (consolidados)
- **Funcionalidad**: 100% preservada
- **Legibilidad**: mejorada

---

*Última actualización: 2026-06-29*
