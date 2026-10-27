#!/usr/bin/env bash
# Escenarios de carga para ver la presión en el monitor (http://localhost:3000/monitor/).
# Requiere el stack levantado: podman compose up -d --build
#
#   ./escenarios.sh baja                  poca carga: todo admitido, CPU casi en reposo
#   ./escenarios.sh creciente             escalones 2 → 80 sesiones/s: la presión sube a la vista
#   ./escenarios.sh saturacion [tasa]     logins en masa (bcrypt): satura los worker threads
#   ./escenarios.sh rate-limit            todo desde UNA IP: choca contra el límite y llueven 429
#
# Con docker en vez de podman: COMPOSE="docker compose" ./escenarios.sh ...
set -euo pipefail

COMPOSE=${COMPOSE:-podman compose}
sim() { $COMPOSE run --rm "$@" sim run "${ARGS[@]}"; }

case "${1:-}" in
  baja)
    ARGS=(-d 1m -r 2 -u 20)
    sim
    ;;
  creciente)
    ARGS=(-d 3m --escalones 2,5,10,20,40,80 -u 200 --max-concurrent 300)
    sim
    ;;
  saturacion)
    # Cada sesión es un login: un hash bcrypt en un worker thread. Probar
    # durante la corrida los botones de "Hilos" del monitor (1 → todos).
    ARGS=(-d 2m -r "${2:-60}" -u 300 --max-concurrent 400 --mezcla autenticacion)
    sim
    ;;
  rate-limit)
    ARGS=(-d 1m -r 20 -u 25)
    sim -e SIM_IPS_VIRTUALES=false
    ;;
  *)
    sed -n '2,10p' "$0"
    exit 1
    ;;
esac
