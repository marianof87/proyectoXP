# Guion de presentación (≈ 10 minutos)

Sistema: reservas de salas de coworking con persistencia (PostgreSQL),
autenticación JWT, autorización por rol, gestión de sesión, concurrencia y
contenedor. Metodología: Extreme Programming (TDD/BDD, CI, refactorización).

## Antes de empezar (1 vez)

```bash
cd "$HOME/personal/study/tercero/prg. extrema/proyectos/proyectoXP"
cat > /tmp/demo.env <<'ENV'
PORT=3077
JWT_SECRET=secreto-de-demo-secreto-de-demo-1234
BCRYPT_ROUNDS=4
ENV
podman compose --env-file /tmp/demo.env down -v
podman compose --env-file /tmp/demo.env up --build -d
until curl -sf localhost:3077/health; do sleep 2; done
```

Abrir <http://localhost:3077>. Para apagar al final:
`podman compose --env-file /tmp/demo.env down -v`.

## Secuencia por pestañas

| # | Pestaña | Qué hacer | Qué decir |
|---|---|---|---|
| 1 | — (terminal) | `podman ps` y `podman logs proyectoxp_api_1` | Dos contenedores: API (usuario no root, healthcheck) y PostgreSQL con volumen. |
| 2 | **Sesión** | «Cargar cuenta demo» → *Iniciar sesión* → *Quién soy* | Autenticación con JWT; el token lleva un `jti` para poder revocarlo. |
| 3 | **Sesión** | *Cerrar sesión* y luego *Quién soy* | Gestión de sesión: tras el logout el token queda en lista negra (401). |
| 4 | **Sesión** | Cargar *admin demo* → *Iniciar sesión* | Autorización por rol: solo ADMIN crea salas y avanza estados. |
| 5 | **Reservas** | Con la cuenta demo: *Reservar* y luego **Carrera ×5** | 5 peticiones simultáneas al mismo horario: 1 gana y 4 reciben 409. Lo garantiza PostgreSQL (restricción de exclusión), no el código. |
| 6 | **Reservas** | Repetir con la misma clave de idempotencia | Reintentos seguros: no se cobra dos veces. |
| 7 | **En vivo** | **▶ Demo guiada (≈70 s)** | Se narra sola: tráfico aleatorio, más carga, ráfaga de 300 operaciones con 50 en paralelo y límite de tasa. Señalar «En vuelo ahora», los ⚠ rojos y el resultado «0 solapes, 0 saldos negativos». |
| 8 | **Límite de tasa** | *Lanzar ráfaga* | 20 por 10 s: el resto recibe 429 con `Retry-After`. Login tiene un límite más estricto (fuerza bruta). |
| 9 | **Petición libre** | `PATCH /api/reservations/1/status` `{"status":"IN_PROGRESS"}` con el admin | Máquina de estados; la celda del calendario cambia de color en vivo (SSE). |
| 10 | **Consola** | Mostrar el historial | Todas las peticiones con estado y latencia. |

## Preguntas probables

- **¿Es concurrencia real?** Node usa un solo hilo: las peticiones se
  intercalan y PostgreSQL arbitra. El paralelismo real se obtiene con varias
  réplicas del contenedor, seguras porque la garantía está en la BD.
- **¿Cómo se prueba?** 99 pruebas unitarias (≈5 s), 7 de API, 7 de integración
  contra PostgreSQL real con `Promise.all`, y 53 escenarios BDD (Cucumber).
- **¿Qué es XP aquí?** Historias de usuario en Gherkin, TDD rojo/verde/refactor,
  CI en cada push, integración continua, diseño simple, ramas cortas.

## Comandos de respaldo (si falla la interfaz)

```bash
B=localhost:3077/api; H='Content-Type: application/json'
curl -s -H "$H" -d '{"operations":300,"concurrency":50,"seed":1}' $B/sim/run | python3 -m json.tool
seq 1 100 | xargs -P 50 -I{} curl -s -o /dev/null -w "%{http_code}\n" $B/sim/rate-test | sort | uniq -c
curl -N localhost:3077/api/events      # eventos en vivo (otra terminal)
```
