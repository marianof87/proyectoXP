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

Requiere Git y Podman (con `podman-compose`) o Docker. Los dos repositorios
van clonados uno al lado del otro:

```bash
git clone https://github.com/marianof87/proyectoXP
git clone https://github.com/marianof87/coworking-traffic-sim
cd proyectoXP
echo "JWT_SECRET=$(openssl rand -hex 32)" > .env
podman compose up -d --build     # o: docker compose up -d --build
```

La primera vez tarda unos minutos (construye dos imágenes). Después:

1. Abrir **http://localhost:3000/monitor/**.
2. En **Generador de carga**, apretar un escenario (por ejemplo *Carga creciente*).
3. Mirar cómo sube la presión: tráfico, núcleos, hilos, base de datos.
   **■ Detener** lo corta en cualquier momento.

| Dirección | Qué hay |
| --- | --- |
| http://localhost:3000/monitor/ | **Monitor de recursos** y botones de carga |
| http://localhost:3000/ | Panel: calendario en vivo, reservas, carreras, simulador interno, ráfagas contra el rate limit |
| http://localhost:3000/api | La API REST (detalle en [docs/API.md](docs/API.md)) |

Apagar: `podman compose down` (agregar `-v` para borrar también la base).

Cuentas demo: `demo@coworking.demo` / `Demo1234!` y `admin@coworking.demo` / `Admin1234!`.

## Qué muestra el monitor

Todo con datos reales, una muestra por segundo:

- **Núcleos de la CPU**: cada núcleo físico con sus núcleos lógicos. Los que
  tienen dos son *hyperthreading* (en un i5-1335U: 2 núcleos P con HT + 8 E = 12 lógicos).
- **Worker threads**: ocupación de cada hilo del pool que calcula bcrypt, y
  botones para cambiar el tamaño del pool en caliente.
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
| Pool de worker threads para bcrypt, redimensionable en caliente con cola propia | `src/workers/` |
| Botones de carga: el monitor le pide escenarios al simulador (servidor de control) | `src/app.ts`, `public/monitor/`, `escenarios.sh` |
| Monitor integrado: muestreo, cálculos, PostgreSQL, SSE y tablero | `src/monitor/`, `src/metrics/runtime.ts`, `public/monitor/` |
| Simulador de tráfico: escalones de carga, mezcla de logins, una IP por usuario, admitidas contra rechazadas | repo `coworking-traffic-sim` |
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

## Escenarios de carga

Los cuatro escenarios están como botones en el monitor y también por consola
(`escenarios.sh` hace lo mismo que los botones, con `curl`):

| Escenario | Qué hace | Qué se ve |
| --- | --- | --- |
| Carga baja | 2 sesiones/s, 1 min | todo admitido, CPU casi en reposo |
| Carga creciente | escalones 2 → 5 → 10 → 20 → 40 → 80 sesiones/s, 3 min | la presión sube por escalones: tráfico, CPU, event loop, transacciones |
| Saturación de CPU | 60 logins/s (configurable), 2 min | cada login es un bcrypt en un worker thread: cola, hilos y núcleos al máximo |
| Rate limit | 20 sesiones/s desde UNA sola IP, 1 min | la mayoría de las peticiones recibe 429 |

```bash
./escenarios.sh creciente        # o: baja · saturacion 60 · rate-limit
./escenarios.sh estado
./escenarios.sh detener
```

Una corrida a medida, sin botones: `podman compose run --rm sim run -d 1m -r 30 -u 25`
(opciones en el README del simulador).

**De 1 hilo a muchos, en caliente.** El monitor tiene botones de *Hilos*
(libuv, 1, 2, 4, 6, 12). Durante `saturacion`, empezar en 1 y pasar a 12:

| Medido (60 logins/s, i5-1335U) | 1 hilo | primeros 5 s con 12 | resto con 12 |
| --- | --- | --- | --- |
| Cola de logins (media) | 440 | se vacía | 102 |
| Hashes por segundo | 19 | 151 | 74 |
| CPU de la API | 1,1 núcleos | 9,3 núcleos | 8,7 núcleos |

Con 1 hilo la cola crece y muchos logins superan el timeout de 10 s del
simulador. Con 12 la cola se vacía en segundos y se encienden casi todos los
núcleos. A 60 logins/s, 12 hilos también quedan al límite: el simulador,
PostgreSQL y la API comparten la misma máquina.

**IPs virtuales.** El simulador manda una IP por usuario en `X-Forwarded-For`
y la API la usa para el rate limit (`TRUST_PROXY=true`, activo en este compose
de demostración; en producción, solo detrás de un proxy de confianza). Así el
límite frena a quien se excede y no a todo el simulador junto. Con
`rate-limit` se ve lo contrario: todos desde una IP.

**Reparto de carga.** piscina entrega cada tarea a un hilo libre (barras de
*Worker threads*) y el sistema operativo reparte esos hilos entre los núcleos
(cuadrícula de *Núcleos*).

Para cambiar variables de la API (`RATE_LIMIT_*`, `BCRYPT_ROUNDS`…) hay que
recrear los contenedores: `podman compose down && podman compose up -d`.
Con podman-compose 1.0.6, `--force-recreate` sobre un solo servicio falla en
silencio porque `sim` depende de `api`.

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
