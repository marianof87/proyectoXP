# HU-12 — Concurrencia, transacciones y calendario en vivo

Historia técnica: que varios usuarios reserven salas a la vez sin que el
sistema se corrompa, y poder **verlo** en un calendario. Todos los datos son
simulados (proyecto académico).

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Dinero | Migrar `Float` -> `Decimal(12,2)` (Prisma) |
| Simulador | Endpoint en el servidor (`POST /api/sim/run`), apagado por defecto |
| Ramas | Una rama y un PR por fase; cada fase nace de la anterior (PR apilados) |
| Método | TDD: prueba roja -> verde -> refactor; documentación actualizada en cada PR |

## Fases

| Fase | Documento | Contenido |
|---|---|---|
| 1 | [fase-1](fase-1-correccion-en-base-de-datos.md) | Correctitud en BD: restricción de exclusión, saldo atómico, transacciones completas, idempotencia, Decimal |
| 2 | [fase-2](fase-2-pruebas-de-concurrencia.md) | Pruebas de integración contra PostgreSQL real + CI |
| 3 | [fase-3](fase-3-simulador-y-datos-mock.md) | Semilla de datos y simulador de reservas paralelas |
| 4 | [fase-4](fase-4-calendario-en-vivo.md) | Endpoint de calendario, SSE y páginas estáticas |
| 5 | [fase-5](fase-5-documentacion-y-cierre.md) | README, backlog, demo, Dockerfile |

## Hallazgos que motivan la historia (estado previo)

1. El chequeo de solape ocurre **fuera** de la transacción (check-then-act).
2. El chequeo de saldo usa una lectura obsoleta: el saldo puede quedar negativo.
3. `cancelReservation` lee el estado fuera de la transacción: dos DELETE
   simultáneos reembolsan **dos veces**.
4. Misma `X-Idempotency-Key` en paralelo: el perdedor recibe un 500 (P2002).
5. `findOverlapping` ignora `IN_PROGRESS`: se puede reservar una sala en uso.
6. `balance`/`totalCost` son `Float`: deriva de redondeo en dinero.
7. `advanceStatus` es lectura-luego-escritura: actualizaciones perdidas.

## Límites conocidos

- Node es de un solo hilo: "concurrencia" = peticiones intercaladas, con
  PostgreSQL como árbitro. El paralelismo real llega con varias réplicas del
  contenedor, seguras solo porque la BD garantiza la corrección.
- El bus SSE es en proceso; con varias réplicas haría falta `LISTEN/NOTIFY`.
- Los repositorios en memoria no pueden demostrar carreras: las pruebas de
  concurrencia corren contra PostgreSQL real (Fase 2).
