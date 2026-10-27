-- HU-12 Fase 1: dinero exacto y no-solape garantizado por la base de datos.

-- 1) Dinero: DOUBLE PRECISION -> DECIMAL(12,2) (sin deriva de redondeo).
ALTER TABLE "users"        ALTER COLUMN "balance"    TYPE DECIMAL(12,2) USING round("balance"::numeric, 2);
ALTER TABLE "users"        ALTER COLUMN "balance"    SET DEFAULT 0;
ALTER TABLE "rooms"        ALTER COLUMN "hourlyRate" TYPE DECIMAL(12,2) USING round("hourlyRate"::numeric, 2);
ALTER TABLE "reservations" ALTER COLUMN "totalCost"  TYPE DECIMAL(12,2) USING round("totalCost"::numeric, 2);

-- 2) La unicidad exacta (sala, inicio, fin) bloqueaba volver a reservar una
--    franja cancelada; la restricción de exclusión de abajo la sustituye.
ALTER TABLE "reservations" DROP CONSTRAINT IF EXISTS "reservations_roomId_startDate_endDate_key";

-- 3) Dos reservas vivas de la misma sala no pueden solaparse en el tiempo.
--    [inicio, fin): 09-11 y 11-13 no chocan. Una cancelada/completada libera la sala.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    tsrange("startDate", "endDate") WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS'));
