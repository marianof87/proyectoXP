# Fase 1 — Correctitud en la base de datos

**Objetivo:** que ninguna carrera pueda producir doble reserva, saldo
negativo, doble reembolso ni 500 por idempotencia, y que un fallo aislado
revierta solo su propia operación.

## Cambios

1. **Restricción de exclusión** (migración con SQL crudo; Prisma no la modela):
   `CREATE EXTENSION btree_gist` +
   `EXCLUDE USING gist ("roomId" WITH =, tsrange("startDate","endDate") WITH &&) WHERE (status IN ('PENDING','CONFIRMED','IN_PROGRESS'))`.
   Corrige también que `IN_PROGRESS` no bloqueaba la sala.
2. **Saldo atómico:** `UPDATE ... SET balance = balance - c WHERE id = x AND balance >= c`;
   0 filas afectadas -> "Insufficient balance". Sin versionado optimista.
3. **Todo dentro de la transacción:** validaciones + escritura en un único
   `uow.transaction`. Cancelar/avanzar pasan a ser actualizaciones
   condicionales por estado (`WHERE status = 'CONFIRMED'`).
4. **Idempotencia concurrente:** capturar P2002 sobre la clave y devolver la
   reserva original. Mapear SQLSTATE `23P01` (exclusión) a `ConflictError` 409.
   *Riesgo:* confirmar con un spike cómo Prisma 6 expone `23P01`.
5. **Dinero a `Decimal(12,2)`:** `User.balance`, `Room.hourlyRate`,
   `Reservation.totalCost`. Aritmética con `Prisma.Decimal` en los
   repositorios; la API sigue entregando números JSON.
6. Repositorios en memoria con las mismas semantics (contrato idéntico).

## Pruebas (TDD)

- Unitarias/BDD existentes siguen verdes (contrato sin cambios).
- Nuevas unitarias: reserva con saldo justo, cancelación repetida (2.ª falla
  409), idempotencia ya vista.
- Las pruebas de carrera reales van en la Fase 2 (necesitan PostgreSQL).

## Criterios de aceptación

- [ ] Migración aplica limpia sobre BD vacía y sobre BD con datos de HU-11.
- [ ] Solape parcial rechazado a nivel BD aunque se salte el servicio.
- [ ] Saldo nunca negativo; cancelación nunca reembolsa dos veces.
- [ ] Lint, typecheck, Jest (cobertura >= 80 %) y Cucumber en verde.
