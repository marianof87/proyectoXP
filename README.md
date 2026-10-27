# Simulador de coworking: concurrencia, hilos y límites de tasa

Plataforma de reserva de salas de coworking construida con **XP y BDD**, más un
banco de pruebas para ver **qué pasa adentro del servidor cuando recibe carga**:
reservas que compiten por la misma franja, peticiones rechazadas por el límite
de tasa, hilos de trabajo repartidos entre los núcleos de la CPU
(hyperthreading incluido) y el uso real de CPU, memoria y base de datos.

## Los tres sistemas

```
┌───────────────────────┐  HTTP  ┌──────────────────────────────┐  SQL  ┌───────────────┐
│ sim                   │ ─────▶ │ api (proyectoXP)             │ ────▶ │ db            │
│ coworking-traffic-sim │        │ · API REST       /api        │       │ PostgreSQL 16 │
│ usuarios virtuales    │ ◀───── │ · panel web      /           │ ◀──── │               │
└───────────────────────┘  JSON  │ · monitor        /monitor/   │       └───────────────┘
                                 │ · bcrypt en worker threads   │
                                 └──────────────────────────────┘
```

| Contenedor | Qué es | Repositorio |
| --- | --- | --- |
| `db` | PostgreSQL: arbitra las carreras (restricción de exclusión, débito atómico) | — |
| `api` | La API de reservas, el panel web y el **monitor de recursos** | este |
| `sim` | Genera tráfico realista: registra usuarios, reserva, cancela, provoca errores | [coworking-traffic-sim](https://github.com/marianof87/coworking-traffic-sim) |

## Puesta en marcha

Requiere Podman o Docker y los dos repositorios clonados uno al lado del otro:

```bash
git clone https://github.com/marianof87/proyectoXP
git clone https://github.com/marianof87/coworking-traffic-sim
cd proyectoXP
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
podman compose up --build        # o: docker compose up --build
```

| Dirección | Qué hay |
| --- | --- |
| http://localhost:3000/ | Panel: calendario en vivo, reservas, carreras, simulador interno, ráfagas contra el rate limit |
| http://localhost:3000/monitor/ | **Monitor de recursos** en vivo |
| http://localhost:3000/api | La API REST (detalle en [docs/API.md](docs/API.md)) |

El contenedor `sim` corre 3 minutos de tráfico y termina. Para otra corrida:

```bash
podman compose run --rm sim run -d 1m -r 30 -u 8   # 1 minuto, 30 sesiones/s
podman compose run --rm sim smoke                  # valida el contrato de los endpoints
```

Cuentas demo: `demo@coworking.demo` / `Demo1234!` y `admin@coworking.demo` / `Admin1234!`.

## Qué muestra el monitor

Todo con datos reales, una muestra por segundo:

- **Núcleos de la CPU**: cada núcleo físico con sus núcleos lógicos. Los que
  tienen dos son *hyperthreading* (en un i5-1335U: 2 núcleos P con HT + 8 E = 12 lógicos).
- **Worker threads**: ocupación de cada hilo del pool que calcula bcrypt.
- **Tráfico**: peticiones admitidas, **rechazadas con 429** y errores 5xx por segundo; peticiones en vuelo.
- **Hilo principal**: ocupación del event loop y su demora.
- **Servidor**: hilos del sistema operativo del proceso, CPU y memoria del
  contenedor (cgroup), y PostgreSQL (transacciones confirmadas y revertidas,
  conexiones activas o esperando un bloqueo, aciertos de caché).

## Qué construimos

| Pieza | Dónde |
| --- | --- |
| Reservas sin carreras: transacción + restricción de exclusión + débito condicional | `src/services/ReservationService.ts`, `prisma/` |
| Límite de tasa por IP (300/min general, 20/min login y registro), con `Retry-After` | `src/middleware/rateLimiter.ts` |
| Pool de worker threads para bcrypt, un hilo por núcleo lógico | `src/workers/` |
| Monitor integrado: muestreo, cálculos, PostgreSQL, SSE y tablero | `src/monitor/`, `src/metrics/runtime.ts`, `public/monitor/` |
| Simulador de tráfico con métricas de admitidas y rechazadas | repo `coworking-traffic-sim` |
| Pruebas de concurrencia y rate limit desde el consumidor | `coworking-traffic-sim/src/e2e/` |

### Optimizaciones

- **bcrypt fuera del hilo principal**: con 12 hilos en vez de los 4 de libuv,
  bajo la misma carga el p99 del login bajó de 918 ms a 310 ms y la peor demora
  del event loop de 198 ms a 55 ms (una corrida de 40 s por configuración, en
  una laptop con otros procesos).
- **Pool precalentado y de tamaño fijo**: sin costo de arranque en la primera ráfaga.
- **Un solo muestreador por proceso**: el costo del monitor no crece con las
  pestañas abiertas; si la base tarda, se salta un turno en vez de apilar consultas.
- **Monitor fuera de `/api`**: no lo frena el rate limit y su tráfico no se cuenta.

## Experimentos

```bash
# Pool de hilos contra libuv: comparar latencia de login y demora del event loop
RATE_LIMIT_MAX=1000000 RATE_LIMIT_AUTH_MAX=1000000 WORKER_THREADS=auto podman compose up -d --force-recreate api
podman compose run --rm sim run -d 40s -r 60 -u 150 --max-concurrent 200
#   repetir con WORKER_THREADS=0

# Rate limit: con los límites por defecto, más usuarios de los que entran en 20 logins/min
podman compose up -d --force-recreate api
podman compose run --rm sim run -d 1m -r 20 -u 25
```

`--force-recreate` hace falta porque podman-compose no recrea el contenedor si solo cambió una variable.

## Pruebas

| Repositorio | Comando | Qué cubre |
| --- | --- | --- |
| proyectoXP | `npm test` · `npm run test:api` · `npm run test:e2e` | Unitarias (Jest), API por HTTP, escenarios BDD (Cucumber) |
| coworking-traffic-sim | `npm test` | Unitarias y de componente (Vitest + fast-check) |
| coworking-traffic-sim | `npm run test:e2e` | Contra la API real: carreras, idempotencia, saldo y rate limit |

Seguimos [javascript-testing-best-practices](https://github.com/sinaptek/javascript-testing-best-practices/blob/master/readme-es.md):
nombres en tres partes, patrón AAA, caja negra, datos realistas, pruebas por propiedades y sin datos compartidos entre pruebas.

### Defectos conocidos

Las pruebas del simulador (`src/e2e/hallazgos.e2e.test.ts`) documentan dos defectos de la API todavía sin corregir:

1. `POST /api/reservations` usa el `userId` del body sin compararlo con el del token: un usuario puede reservar cobrándole a otro.
2. Las claves `X-Idempotency-Key` son globales: otro usuario que repite una clave recibe la reserva ajena.

## Más documentación

- [docs/API.md](docs/API.md): endpoints, decisiones XP, contenedor y estado de las pruebas.
- [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md) · [docs/guion-presentacion.md](docs/guion-presentacion.md) · [docs/plan-hu12/](docs/plan-hu12/)
