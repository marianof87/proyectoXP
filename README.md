# proyectoXP — Plataforma de Reserva de Espacios de Coworking

Backend REST construido aplicando **Extreme Programming (XP)** y
**Behavior-Driven Development (BDD)**, según los lineamientos de `progXP.pdf`.

- **Entorno:** Node.js 22 · **Lenguaje:** TypeScript (`strict: true`)
- **Framework web:** Express 5
- **Pruebas BDD:** `@cucumber/cucumber` + `ts-node` · **Unitarias:** Jest
- **Persistencia:** Prisma / PostgreSQL en producción, repositorios en memoria en las pruebas
- **CI/CD:** GitHub Actions

---

## Puesta en marcha

```bash
npm install
cp .env.example .env          # ajusta DATABASE_URL si vas a usar PostgreSQL
npm run prisma:generate       # genera el cliente tipado (no necesita BD)
```

`prisma:generate` es obligatorio antes de compilar: `src/db.ts` importa los
tipos generados por Prisma.

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la API en modo desarrollo (necesita PostgreSQL) |
| `npm run build` | Compila `src/` a `dist/` |
| `npm start` | Ejecuta la build (`dist/index.js`) |
| `npm run typecheck` | `tsc --noEmit` sobre `src/` y `tests/` |
| `npm run lint` | ESLint (configuración *flat*, `eslint.config.js`) |
| `npm test` | Pruebas unitarias (Jest) |
| `npm run test:coverage` | Unitarias + cobertura (umbral 80 %) |
| **`npm run test:e2e`** | **Pruebas BDD (Cucumber) — no necesita base de datos** |

`npm run test:e2e` corre contra repositorios en memoria, así que se ejecuta en
segundos y sin levantar PostgreSQL ni aplicar migraciones.

### Base de datos (solo para `npm run dev`)

```bash
npm run prisma:migrate        # aplica las migraciones
```

---

## Estructura del repositorio

```
.github/workflows/main.yml    # Pipeline de CI
features/                     # Historias en Gherkin (una por HU)
tests/
  support/world.ts            # World compartido de Cucumber (MundoCoworking)
  step_definitions/           # Implementación de los pasos
  unit/                       # Pruebas unitarias con Jest
src/
  controllers/                # HTTP: parámetros y serialización
  services/                   # Lógica de negocio (sin Express ni Prisma)
  repositories/               # Acceso a datos: interfaces + Prisma + en memoria
  models/                     # Tipos de dominio y errores
  middleware/                 # Manejo de errores
  routes/                     # Definición de endpoints
  container.ts                # Raíz de composición (inyección de dependencias)
  app.ts                      # Construcción de la app Express
  index.ts                    # Punto de entrada
prisma/schema.prisma          # Esquema de datos
```

---

## API

| Método | Ruta | Descripción | Acceso |
|---|---|---|---|
| `GET` | `/health` | Estado del servicio | Público |
| `POST` | `/api/users/register` | Registro de usuario | Público |
| `POST` | `/api/users/login` | Autenticación, devuelve `{ user, token }` | Público |
| `GET` | `/api/users/me` | Perfil del usuario autenticado | Autenticado |
| `GET` | `/api/users/:id` | Consultar usuario | Público |
| `POST` | `/api/users/:id/balance` | Añadir saldo | Dueño o ADMIN |
| `POST` | `/api/rooms` | Crear sala | ADMIN |
| `GET` | `/api/rooms` | Listar salas | Público |
| `GET` | `/api/rooms/:id` | Consultar sala | Público |
| `POST` | `/api/rooms/:id/check-availability` | Comprobar disponibilidad | Público |
| `POST` | `/api/reservations` | Crear reserva (acepta `X-Idempotency-Key`) | Autenticado |
| `GET` | `/api/users/:userId/reservations` | Reservas de un usuario | Dueño o ADMIN |
| `PATCH` | `/api/reservations/:id/status` | Avanzar estado (`IN_PROGRESS`/`COMPLETED`) | ADMIN |
| `DELETE` | `/api/reservations/:id` | Cancelar reserva | Autenticado |
| `POST` | `/api/users/logout` | Revocar el token actual | Autenticado |

### Autenticación y autorización (HU-09)

El login devuelve un JWT (`Authorization: Bearer <token>`, expira en 1h) que
las rutas protegidas exigen. Hay dos niveles de autorización, además de la
autenticación simple:

- **Por rol** (RBAC): `POST /api/rooms` exige rol `ADMIN` → 403 si no lo tiene.
- **Por propiedad del recurso**: `POST /api/users/:id/balance` y
  `GET /api/users/:userId/reservations` exigen ser el dueño del recurso o
  `ADMIN` → 403 si un usuario intenta acceder a datos de otro.

Sin token, o con uno inválido/expirado, cualquier ruta protegida responde 401.

```bash
# 1. Registro e inicio de sesión
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"carla@example.com","name":"Carla","password":"SecurePass123!"}'

TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carla@example.com","password":"SecurePass123!"}' | jq -r .token)

# 2. Ruta protegida por autenticación
curl http://localhost:3000/api/users/me -H "Authorization: Bearer $TOKEN"

# 3. Ruta protegida por rol (falla con 403 si no es ADMIN)
curl -X POST http://localhost:3000/api/rooms \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Sala Premium","capacity":8,"hourlyRate":150}'

# 4. Ruta protegida por propiedad del recurso (falla con 403 sobre otro id)
curl http://localhost:3000/api/users/999/reservations -H "Authorization: Bearer $TOKEN"
```

Como el registro público siempre asigna rol `USER`, un usuario `ADMIN` de
prueba se crea directamente en la base de datos (o en el repositorio en
memoria, como hace `MundoCoworking.asegurarAdministrador()` en las pruebas
BDD): no hay endpoint para autopromoverse.

### Estados, idempotencia y logout (HU-11, Unidad 5)

Una reserva nace `CONFIRMED` (se paga al reservar) y solo puede avanzar en
un sentido: `CONFIRMED` → `IN_PROGRESS` → `COMPLETED`. Cualquier otra
transición (saltarse un paso, retroceder, avanzar una ya cancelada) se
rechaza con 409. Cancelar sigue siendo el camino de HU-06, sin cambios.

```bash
# Salta un paso -> 409
curl -X PATCH http://localhost:3000/api/reservations/1/status \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN_ADMIN" \
  -d '{"status":"COMPLETED"}'
```

`POST /api/reservations` acepta una cabecera `X-Idempotency-Key` opcional:
repetir la misma clave devuelve la reserva creada la primera vez (mismo id,
sin cobrar ni reservar de nuevo), en vez de procesar la petición otra vez.

```bash
curl -X POST http://localhost:3000/api/reservations \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" \
  -H "X-Idempotency-Key: reserva-del-cliente-123" \
  -d '{"userId":1,"roomId":1,"startDate":"...","endDate":"..."}'
# Repetir la misma petición con la misma clave -> mismo id, un solo cobro
```

`POST /api/users/logout` revoca el token actual: un JWT firmado no se puede
"borrar", así que se guarda su `jti` en una lista negra
(`RevokedToken`/`revoked_tokens`) hasta su expiración natural; `authenticate`
la consulta en cada petición. Tras el logout, ese mismo token responde 401
aunque su firma siga siendo válida.

---

## Justificación de las decisiones XP

### Ciclo TDD/BDD (Rojo → Verde → Refactor)

Los criterios de aceptación del backlog se escribieron primero como escenarios
Gherkin en `features/`. Cada escenario falló antes de existir la lógica
correspondiente, y el código de producción se añadió únicamente para hacerlos
pasar. Las reglas que no tenían prueba —cancelar una reserva ya iniciada,
validación de entradas, registro de intentos fallidos— se cubrieron con un
escenario o un test unitario **antes** de implementarlas.

### Diseño simple (KISS / YAGNI)

- La bitácora de intentos fallidos es una lista en memoria, no una tabla de
  auditoría: cumple el criterio de aceptación sin inventar requisitos.
- El `UnitOfWork` existe porque reservar toca dos entidades a la vez, no como
  abstracción preventiva.
- JWT (HU-09) se añadió cuando la historia lo pidió, no antes: `TokenService`
  solo firma/verifica el payload que le pasan, sin sesiones ni refresh tokens
  que nadie ha pedido todavía.
- Sin cookies de sesión (HttpOnly/Secure/SameSite): el sistema ya es
  stateless con JWT en el header `Authorization`, así que añadirlas
  duplicaría un mecanismo que nadie usa.
- Sin bloqueo optimista con número de versión (HU-11): el solapamiento de
  reservas ya se comprueba dentro de una transacción (`findOverlapping` +
  `create` en el mismo `$transaction`), que es la garantía que pide la
  historia; una columna de versión no aporta nada que eso no cubra ya.
- La idempotencia (HU-11) es "consultar, y si no existe, crear y guardar la
  clave" (sin manejo de conflicto de escritura concurrente): ninguna
  historia pide todavía servir dos peticiones simultáneas con la misma
  clave, y la restricción `@id` en `idempotency_keys` ya deja la puerta
  abierta a añadirlo el día que haga falta.

### Refactorización continua

Sobre la primera versión funcional se aplicaron estas mejoras sin cambiar el
comportamiento observable:

- **Capa de repositorios.** Los servicios llamaban a Prisma directamente. Ahora
  dependen de interfaces (`IUserRepository`, …), con dos implementaciones: una
  sobre Prisma y otra en memoria. La suite BDD dejó de necesitar PostgreSQL.
- **Inyección de dependencias.** Los servicios se instanciaban como singletons
  dentro de cada módulo. Ahora se construyen en `container.ts`, lo que permite
  que las pruebas inyecten el almacén en memoria.
- **Errores tipados.** El middleware deducía el código HTTP con
  `err.message.includes('not found')`. Ahora cada error de dominio
  (`NotFoundError`, `ConflictError`, …) lleva su propio `statusCode`, así que
  cambiar la redacción de un mensaje ya no altera la respuesta.
- **Tipado estricto real.** `tsconfig.json` tenía `strict: false` y `src/db.ts`
  exportaba el cliente como `any`, de modo que los tipos no fluían. Con
  `strict: true` y el cliente Prisma tipado, el compilador detectó varios
  errores latentes en los controladores.
- **World único en Cucumber.** Cada fichero de pasos mantenía su propio estado
  a nivel de módulo, compartido entre escenarios, y tres pasos estaban
  duplicados en varios ficheros (Cucumber aborta la suite en ese caso). Ahora
  hay un `World` por escenario y los pasos comunes viven en `common.steps.ts`.

### Integración continua

`.github/workflows/main.yml` ejecuta en cada *push* y *pull request*: linter →
compilación estricta → pruebas unitarias con umbral de cobertura → pruebas BDD
→ build. Cualquier fallo bloquea la integración.

---

## Estado de las pruebas

```
Cucumber:  42 escenarios · 246 pasos · 42 passed
Jest:      7 suites ·  76 tests  ·  76 passed · 91,8 % statements
```

Hay **una feature por cada historia del backlog** (6 funcionales + 4 técnicas),
cada una con su camino feliz y al menos un caso de error o límite:

| Feature | Historia |
|---|---|
| `01-registro-usuarios.feature` | HU-01 Registro e identificación |
| `02-gestion-balance.feature` | HU-02 Gestión de balance |
| `03-reserva-salas.feature` | HU-03 Reserva de salas |
| `04-visualizacion-reservas.feature` | HU-04 Visualización de reservas |
| `05-gestion-salas.feature` | HU-05 Gestión de salas |
| `06-cancelacion-reservas.feature` | HU-06 Cancelación de reservas |
| `07-rendimiento-api.feature` | HU-07 Rendimiento (técnica) |
| `08-seguridad-datos.feature` | HU-08 Seguridad (técnica) |
| `09-autenticacion-jwt.feature` | HU-09 Autenticación y autorización JWT (técnica) |
| `11-sesiones-estados.feature` | HU-10 Gestión de sesiones y estados (técnica) |

Los escenarios están redactados en español, siguiendo el ejemplo del propio
`progXP.pdf` (palabras clave Gherkin en inglés, texto de la historia en
español). Los mensajes de error se comparan en inglés porque forman parte del
contrato de la API REST.
