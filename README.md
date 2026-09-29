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
  middleware/                 # Auth, validación de entrada, manejo de errores
  validation/                 # Esquemas Zod del body de cada ruta
  logger.ts                   # Logger (Pino) con redacción de datos sensibles
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
| `POST` | `/api/reservations` | Crear reserva | Autenticado |
| `GET` | `/api/users/:userId/reservations` | Reservas de un usuario | Dueño o ADMIN |
| `DELETE` | `/api/reservations/:id` | Cancelar reserva | Autenticado |

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

### Validación, saneamiento y logs seguros (HU-10)

Cada endpoint que escribe datos pasa por `validateRequest(schema)`
(`src/middleware/validateRequest.ts`) antes de llegar al controlador: un
esquema Zod (`src/validation/schemas.ts`) rechaza campos no declarados y
tipos incorrectos con 400, y sanea texto libre (`trim`). Las reglas de
negocio (formato de email, fuerza de contraseña, capacidad positiva...)
siguen viviendo en los servicios; Zod solo valida la forma del body en el
borde HTTP.

```bash
# Campo no declarado en el esquema -> 400
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"x@example.com","name":"X","password":"SecurePass123!","role":"ADMIN"}'

# El nombre se guarda sin los espacios extra
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"y@example.com","name":"   Marta   ","password":"SecurePass123!"}'
```

**Inyección SQL/NoSQL:** no aplica a este sistema. Todo el acceso a datos
pasa por Prisma (`src/repositories/PrismaRepositories.ts`), que parametriza
las consultas; no hay ni una sola concatenación de SQL en el código.

**Logs seguros:** un error inesperado (500) se registra con
`src/logger.ts` (Pino), que censura `authorization`, `password` y `token`
antes de escribir el log (`redact`). Antes de este cambio, `errorHandler`
volcaba `req.body`/`req.headers` con `console.error`, texto plano incluido.
Verificado en `tests/unit/logger.test.ts`.

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
Cucumber:  41 escenarios · 218 pasos · 41 passed
Jest:      7 suites ·  66 tests  ·  66 passed · 91,7 % statements
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
| `10-sanitizacion-validacion.feature` | HU-10 Saneamiento y validación de entradas (técnica) |

Los escenarios están redactados en español, siguiendo el ejemplo del propio
`progXP.pdf` (palabras clave Gherkin en inglés, texto de la historia en
español). Los mensajes de error se comparan en inglés porque forman parte del
contrato de la API REST.
