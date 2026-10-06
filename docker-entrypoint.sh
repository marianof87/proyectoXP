#!/bin/sh
set -e
# Aplica migraciones pendientes antes de arrancar (idempotente).
npx prisma migrate deploy
exec "$@"
