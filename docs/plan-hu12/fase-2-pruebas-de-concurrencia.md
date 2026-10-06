# Fase 2 — Pruebas de concurrencia contra PostgreSQL real

**Objetivo:** demostrar con pruebas que las garantías de la Fase 1 resisten
carreras reales.

## Cambios

- Suite Jest de integración (`tests/integration/`, config propia y script
  `npm run test:integration`) que usa `DATABASE_URL` real.
- Escenarios con `Promise.all`:
  - N reservas de la misma franja -> exactamente 1 éxito y N-1 conflictos.
  - Reservas solapadas parcialmente -> solo una gana.
  - Saldo justo para 1 reserva y 5 intentos paralelos -> 1 éxito, saldo >= 0.
  - 2 cancelaciones simultáneas -> 1 reembolso.
  - Misma `X-Idempotency-Key` x10 en paralelo -> 1 reserva, 10 respuestas iguales.
  - Fallo de una operación no afecta a las demás (aislamiento).
- CI: `services: postgres:16` en `main.yml`, `prisma migrate deploy` y el nuevo script.

## Criterios de aceptación

- [ ] Suite determinista (sin `sleep`), estable en 20 ejecuciones seguidas.
- [ ] Corre en CI y en local con `podman compose up db`.
