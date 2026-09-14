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

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Estado del servicio |
| `POST` | `/api/users/register` | Registro de usuario |
| `POST` | `/api/users/login` | Autenticación |
| `GET` | `/api/users/:id` | Consultar usuario |
| `POST` | `/api/users/:id/balance` | Añadir saldo |
| `POST` | `/api/rooms` | Crear sala |
| `GET` | `/api/rooms` | Listar salas |
| `GET` | `/api/rooms/:id` | Consultar sala |
| `POST` | `/api/rooms/:id/check-availability` | Comprobar disponibilidad |
| `POST` | `/api/reservations` | Crear reserva |
| `GET` | `/api/users/:userId/reservations` | Reservas de un usuario |
| `DELETE` | `/api/reservations/:id` | Cancelar reserva |

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
- No hay JWT ni sesiones: ninguna historia los pide todavía.
- El `UnitOfWork` existe porque reservar toca dos entidades a la vez, no como
  abstracción preventiva.

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
Cucumber:  25 escenarios · 144 pasos · 25 passed
Jest:      3 suites ·  55 tests  ·  55 passed · 91,6 % statements
```

Hay **una feature por cada historia del backlog** (6 funcionales + 2 técnicas),
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

Los escenarios están redactados en español, siguiendo el ejemplo del propio
`progXP.pdf` (palabras clave Gherkin en inglés, texto de la historia en
español). Los mensajes de error se comparan en inglés porque forman parte del
contrato de la API REST.
