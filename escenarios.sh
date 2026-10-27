#!/usr/bin/env bash
# Escenarios de carga desde la consola: hacen lo mismo que los botones del
# monitor (http://localhost:3000/monitor/). Requiere el stack levantado:
#   podman compose up -d --build      (o: docker compose up -d --build)
#
#   ./escenarios.sh baja                  poca carga: todo admitido, CPU casi en reposo
#   ./escenarios.sh creciente             escalones 2 → 80 sesiones/s: la presión sube a la vista
#   ./escenarios.sh saturacion [tasa]     logins en masa (bcrypt): satura los worker threads
#   ./escenarios.sh rate-limit            todo desde UNA IP: choca contra el límite y llueven 429
#   ./escenarios.sh detener               corta el escenario en curso
#   ./escenarios.sh estado                muestra qué está corriendo
#
# Otra URL de la API: API=http://otra-maquina:3000 ./escenarios.sh baja
set -euo pipefail

API=${API:-http://localhost:${PORT:-3000}}

uso() { sed -n '2,12p' "$0"; exit 1; }
estado() { curl -fsS "$API/monitor/escenarios"; echo; }

case "${1:-}" in
  baja | creciente | rate-limit)
    ruta="/monitor/escenarios/$1"
    ;;
  saturacion)
    ruta="/monitor/escenarios/saturacion?tasa=${2:-60}"
    ;;
  detener)
    curl -fsS -X POST "$API/monitor/escenarios/detener"; echo
    exit 0
    ;;
  estado)
    estado
    exit 0
    ;;
  *)
    uso
    ;;
esac

curl -sS -X POST "$API$ruta"; echo
echo "Mirá la presión en $API/monitor/  ·  detener: ./escenarios.sh detener"
