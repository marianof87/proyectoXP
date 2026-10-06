# Fase 4 — Calendario en vivo

**Objetivo:** ver las reservas concurrentes llegar a un calendario por sala.

## Cambios

- `GET /api/reservations?from&to` (público, solo datos no sensibles: sala,
  franja, estado) para pintar el calendario.
- `GET /api/events` (SSE): evento tras cada *commit* (nunca de una transacción
  revertida): `reservation.created|cancelled|status`.
- `public/` servida por Express: `index.html`, JS y CSS sin build; cuadrícula
  semanal con salas en columnas, color por estado, botón "Simular".
- Dockerfile: copiar `public/` a la imagen final.

## Criterios de aceptación

- [ ] El calendario refleja en vivo una simulación en curso.
- [ ] Responsive y accesible (contraste, teclado).
- [ ] Imagen de contenedor sirve la UI.
