# Fase 3 — Simulador y datos de prueba

**Objetivo:** generar tráfico concurrente de mentira para observar el sistema.

## Cambios

- `src/sim/seed.ts`: ~5 salas y ~20 usuarios ficticios con saldos.
- `POST /api/sim/run` `{ operations, concurrency }`: lanza reservas y
  cancelaciones aleatorias en paralelo contra los servicios reales; devuelve
  conteos (confirmadas, conflictos, saldo insuficiente, errores).
- Activado solo con `ENABLE_SIMULATOR=true` (apagado por defecto; 404 si no) y
  con límites (`operations <= 500`).
- Cada operación aislada: un fallo no interrumpe al resto.

## Criterios de aceptación

- [ ] Con el flag apagado la ruta no existe.
- [ ] Tras una simulación, invariantes: sin solapes, saldos >= 0.
- [ ] Pruebas de integración del simulador.
