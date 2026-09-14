# Plataforma Backend de Reserva de Espacios de Coworking

Implementación de un backend completamente funcional siguiendo prácticas de **Extreme Programming (XP)** y **Behavior-Driven Development (BDD)** con Cucumber.

## 🎯 Objetivo

Diseñar e implementar un sistema de gestión de reservas de espacios de coworking en TypeScript, aplicando rigurosamente:

- ✅ **Desarrollo Guiado por Pruebas (TDD/BDD)** - Pruebas de Cucumber + Jest
- ✅ **Diseño Simple** - Arquitectura limpia sin sobreingeniería
- ✅ **Refactorización Continua** - Mejora incremental del código
- ✅ **Integración Continua** - Pipeline automática en GitHub Actions

---

## 📦 Tech Stack

| Componente | Tecnología |
|-----------|-----------|
| **Lenguaje** | TypeScript (Strict Mode) |
| **Framework Web** | Express.js |
| **Testing Unitario** | Jest |
| **Testing BDD** | Cucumber.js |
| **Base de Datos** | PostgreSQL + Prisma ORM |
| **Seguridad** | bcrypt + CORS |
| **Linting** | ESLint + TypeScript |
| **CI/CD** | GitHub Actions |

---

## 🏗️ Arquitectura

```
src/
├── index.ts                 # Punto de entrada
├── routes/                  # Definición de rutas
│   └── index.ts
├── controllers/             # Capa de presentación
│   ├── UserController.ts
│   ├── RoomController.ts
│   └── ReservationController.ts
└── services/               # Lógica de negocio
    ├── UserService.ts
    ├── RoomService.ts
    └── ReservationService.ts

prisma/
└── schema.prisma           # Esquema de base de datos

features/                   # Especificaciones Gherkin
├── 01-user-authentication.feature
├── 02-room-booking.feature
├── 03-balance-management.feature
├── 04-room-management.feature
├── 05-system-performance.feature
└── 06-security.feature

tests/
└── step_definitions/       # Implementación de pasos
    ├── user.steps.ts
    ├── room.steps.ts
    ├── reservation.steps.ts
    └── balance.steps.ts
```

### Patrones de Diseño

1. **Separación de Capas**
   - Controllers → Services → Prisma ORM
   
2. **Inyección de Dependencias** (Simplificada)
   - Services se instancian en controladores
   
3. **Manejo de Errores**
   - Errores específicos con mensajes descriptivos
   - Middleware centralizado de gestión de errores

---

## 🚀 Instalación y Configuración

### 1. Requisitos Previos

- Node.js >= 18
- PostgreSQL >= 12
- npm o yarn

### 2. Clonar y Configurar

```bash
# Clonar repositorio
cd proyectoxp

# Instalar dependencias
npm install

# Copiar archivo de configuración
cp .env.example .env
```

### 3. Configurar Base de Datos

Editar `.env` con tus credenciales:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/coworking_db
PORT=3000
JWT_SECRET=your-secret-key
BCRYPT_ROUNDS=10
```

### 4. Inicializar Base de Datos

```bash
# Ejecutar migraciones
npm run prisma:migrate

# Generar cliente Prisma
npm run prisma:generate
```

---

## 📝 Ejecución

### Desarrollo

```bash
# Compilar TypeScript
npm run build

# Ejecutar servidor en modo desarrollo (auto-reload)
npm run dev

# El servidor estará disponible en http://localhost:3000
```

### Pruebas

```bash
# Ejecutar pruebas unitarias (Jest)
npm test

# Ejecutar pruebas unitarias en modo watch
npm test:watch

# Ver cobertura de pruebas
npm test:coverage

# Ejecutar suite de BDD (Cucumber)
npm run test:e2e

# Ejecutar Cucumber en modo watch
npm run test:e2e:watch
```

### Linting y Compilación

```bash
# Verificar errores de linting
npm run lint

# Compilar TypeScript
npm run build
```

---

## 📊 Historias de Usuario

### Fase 1: Autenticación (Sprint 1)

**Historia 1: Registro de Usuarios**
```
Como usuario nuevo
Quiero registrarme en la plataforma
Para poder reservar espacios de coworking
```

**Criterios de Aceptación:**
- ✅ Registro con email, nombre y contraseña
- ✅ Validación de email duplicado
- ✅ Contraseña hasheada con bcrypt
- ✅ Usuario obtiene rol "USER" por defecto

**Feature File:** `features/01-user-authentication.feature`

---

### Fase 2: Gestión de Balance (Sprint 1)

**Historia 2: Gestión de Balance**
```
Como usuario registrado
Quiero gestionar mi balance de cuenta
Para pagar por las reservas
```

**Criterios de Aceptación:**
- ✅ Agregar balance a cuenta
- ✅ Balance no puede ser negativo
- ✅ Deducción automática en reservas
- ✅ Reembolso en cancelaciones

**Feature File:** `features/03-balance-management.feature`

---

### Fase 3: Reservas (Sprint 2)

**Historia 3: Reserva de Salas**
```
Como usuario registrado
Quiero reservar salas de reuniones
Para tener un espacio privado de trabajo
```

**Criterios de Aceptación:**
- ✅ Ver salas disponibles
- ✅ Reservar sala para fecha/hora específica
- ✅ Validar disponibilidad (sin conflictos)
- ✅ Validar balance suficiente
- ✅ Deducir costo automáticamente

**Feature File:** `features/02-room-booking.feature`

---

### Fase 4: Gestión de Salas (Sprint 2)

**Historia 4: Administración de Salas**
```
Como administrador
Quiero crear y gestionar salas
Para controlar el espacio disponible
```

**Criterios de Aceptación:**
- ✅ Crear salas con nombre, capacidad, tarifa
- ✅ Nombres de salas únicos
- ✅ Listar todas las salas
- ✅ Consultar disponibilidad

**Feature File:** `features/04-room-management.feature`

---

### Requerimientos No Funcionales

**Historia 5: Rendimiento**
```
Como administrador del sistema
Quiero que los endpoints respondan en < 200ms
Para garantizar experiencia fluida
```

**Feature File:** `features/05-system-performance.feature`

---

**Historia 6: Seguridad**
```
Como auditor de seguridad
Quiero que las contraseñas se almacenen con bcrypt
Para proteger los datos en caso de brecha
```

**Feature File:** `features/06-security.feature`

---

## 🔄 Ciclo de Desarrollo XP

```mermaid
graph LR
    A["1. Escribir<br/>Feature"] --> B["2. Escribir<br/>Step Defs"]
    B --> C["3. RED<br/>(Tests fallan)"]
    C --> D["4. GREEN<br/>(Implementar)"]
    D --> E["5. REFACTOR<br/>(Mejorar)"]
    E --> F["6. Review<br/>& CI/CD"]
    F --> A
```

### Ejemplo: Implementar Nueva Feature

1. **Crear archivo `.feature`**
   ```gherkin
   Feature: Nueva funcionalidad
   Scenario: Caso de uso específico
     Given precondición
     When acción
     Then resultado esperado
   ```

2. **Implementar Step Definitions**
   ```typescript
   Given('precondición', async () => { ... });
   When('acción', async () => { ... });
   Then('resultado esperado', () => { ... });
   ```

3. **Verificar que fallen** (RED)
   ```bash
   npm run test:e2e
   # → FAIL: Step implementations missing
   ```

4. **Implementar lógica en Service**
   ```typescript
   // src/services/MyService.ts
   async myMethod() { ... }
   ```

5. **Verificar que pasen** (GREEN)
   ```bash
   npm run test:e2e
   # → PASS ✓
   ```

6. **Refactorizar si es necesario** (REFACTOR)
   - Extraer métodos comunes
   - Mejorar nombres
   - Reducir duplicación

7. **Linting y compilación**
   ```bash
   npm run lint && npm run build
   ```

---

## 🧪 Ejemplos de Pruebas

### Prueba BDD: Reserva de Sala

```gherkin
Feature: Room Booking
  Scenario: Successful booking of an available room
    Given room "Sala A" is available on "2026-10-20"
    And user "Juan" has sufficient balance
    When "Juan" books "Sala A" from "09:00" to "11:00" on "2026-10-20"
    Then the reservation should be confirmed
    And the reservation status should be "CONFIRMED"
```

### Implementación en Step Definitions

```typescript
When('{string} books {string} from {string} to {string}', 
  async (userName: string, roomName: string, start: string, end: string) => {
    const reservation = await reservationService.bookRoom({
      userId: user.id,
      roomId: room.id,
      startDate: new Date(start),
      endDate: new Date(end)
    });
    context.lastReservation = reservation;
  }
);

Then('the reservation should be confirmed', () => {
  if (!context.lastReservation) {
    throw new Error('Reservation not created');
  }
});
```

---

## 🔐 Seguridad

### Passwords

- Hasheadas con **bcrypt** (10 rounds por defecto)
- Nunca almacenadas en texto plano
- Validación en login

```typescript
// Registrar usuario
const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
await prisma.user.create({ ..., password: hashedPassword });

// Verificar password
const isValid = await bcrypt.compare(inputPassword, storedHash);
```

### Validación de Inputs

```typescript
// Controllers validan datos de entrada
if (!input.email || !input.password) {
  return res.status(400).json({ error: 'Missing fields' });
}
```

### CORS

```typescript
app.use(cors());
// Solo orígenes específicos en producción
```

---

## 📈 Endpoints de la API

### Usuarios

```http
POST   /api/users/register              # Registrar usuario
GET    /api/users/:id                   # Obtener datos usuario
POST   /api/users/:id/balance           # Agregar balance
```

### Salas

```http
POST   /api/rooms                       # Crear sala (admin)
GET    /api/rooms                       # Listar todas las salas
GET    /api/rooms/:id                   # Obtener detalles sala
POST   /api/rooms/:id/check-availability # Verificar disponibilidad
```

### Reservas

```http
POST   /api/reservations                # Crear reserva
GET    /api/users/:userId/reservations  # Listar mis reservas
DELETE /api/reservations/:id            # Cancelar reserva
```

---

## 🔄 Integración Continua

### GitHub Actions Pipeline

```yaml
# .github/workflows/main.yml
- Instalar dependencias
- Ejecutar linter (ESLint)
- Compilar TypeScript (tsc)
- Ejecutar pruebas unitarias (Jest)
- Ejecutar suite BDD (Cucumber)
- Generar reporte de cobertura
```

**Requisitos para pasar:**
- ✅ Lint: sin errores
- ✅ TypeScript: sin errores de compilación
- ✅ Jest: 100% de tests pasando
- ✅ Cucumber: todos los escenarios verificados
- ✅ Cobertura: >= 80%

---

## 📊 Cobertura de Código

Ver cobertura:
```bash
npm run test:coverage
```

Objetivo: **>= 80% de cobertura**

---

## 🎓 Aprendizajes Clave de XP

### 1. **Desarrollo Guiado por Pruebas**
- Escribir tests primero
- Desarrollo más confiable
- Refactorización segura

### 2. **Diseño Simple**
- No anticipar requisitos futuros
- YAGNI: "You Aren't Gonna Need It"
- Evitar sobreingeniería

### 3. **Feedback Continuo**
- Pruebas automatizadas = feedback inmediato
- Integración continua detecta problemas rápido
- Iteraciones cortas (sprints)

### 4. **Comunicación**
- Historias de usuario claramente definidas
- Feature files actúan como documentación
- Tests documentan comportamiento esperado

### 5. **Calidad**
- Refactorización regular
- Linting automático
- Revisiones de código en CI/CD

---

## 🐛 Troubleshooting

### Error: "Cannot find module 'prisma'"

```bash
npm run prisma:generate
```

### Error: "relation 'users' does not exist"

```bash
npm run prisma:migrate
```

### Error: "ERESOLVE peer dependency"

```bash
npm install --legacy-peer-deps
```

---

## 📚 Referencias

- [Extreme Programming Explained - Kent Beck](https://en.wikipedia.org/wiki/Extreme_programming)
- [BDD with Cucumber](https://cucumber.io/docs/bdd/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Jest Testing Framework](https://jestjs.io/)
- [Express.js Guide](https://expressjs.com/)

---

## 📝 Autores

Proyecto XP - Plataforma de Reserva de Coworking
Implementación siguiendo prácticas de Extreme Programming y BDD

---

## 📄 Licencia

ISC
