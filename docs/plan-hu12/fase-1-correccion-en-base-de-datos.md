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

- [x] Migración aplica limpia sobre BD vacía (verificado en PostgreSQL 16; `migrate diff`: sin deriva).
- [x] Solape parcial rechazado a nivel BD (SQLSTATE 23P01 -> ConflictError 409).
- [x] Saldo nunca negativo; cancelación nunca reembolsa dos veces (verificado con peticiones paralelas reales).
- [ ] Lint, typecheck, Jest (cobertura >= 80 %) y Cucumber en verde.

## Resultados del spike (PostgreSQL 16 real)

- Prisma 6 expone la violación de `EXCLUDE` como `PrismaClientUnknownRequestError`
  con `23P01` en el mensaje; se detecta por texto.
- La migración `001_init` creó `@@unique(roomId,startDate,endDate)` como
  *constraint*, no como índice: hay que borrarla con `DROP CONSTRAINT`.
- Bonus: esa unicidad impedía re-reservar una franja cancelada; ya no.
- Si una BD existente ya tuviera reservas vivas solapadas, la migración
  fallaría al crear la restricción: habría que limpiar los datos antes.

## Notas de diseño

- El dominio sigue usando `number` (redondeado a centavos); la conversión
  `Decimal <-> number` está en el borde de `PrismaRepositories.ts`.
- Los repositorios en memoria ahora serializan las transacciones y hacen
  *rollback* por instantánea, para que las pruebas BDD/unitarias tengan la
  misma semántica "todo o nada" que PostgreSQL.
