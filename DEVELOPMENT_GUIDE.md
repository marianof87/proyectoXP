# Guía de Desarrollo - Prácticas XP

Este documento explica cómo contribuir al proyecto siguiendo las prácticas de **Extreme Programming (XP)** y **Behavior-Driven Development (BDD)**.

---

## 🔄 Ciclo de Desarrollo

```
┌─────────────────────────────────────────┐
│  1. Escribir Feature (Gherkin)          │
│     - Definir comportamiento esperado   │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  2. Escribir Step Definitions           │
│     - Conectar feature con código       │
│     - Pruebas deben FALLAR (RED)        │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  3. Implementar Servicio (GREEN)        │
│     - Hacer pasar las pruebas           │
│     - Diseño simple                     │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  4. Refactorizar                        │
│     - Mejorar código sin cambiar        │
│     - comportamiento                    │
└─────────────┬───────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  5. Validar                             │
│     - Linter ✓                          │
│     - TypeScript ✓                      │
│     - Tests ✓                           │
│     - Cobertura >= 80% ✓                │
└─────────────────────────────────────────┘
```

---

## 📋 Paso 1: Escribir Feature (Especificación)

### Ubicación
`features/` - Un archivo `.feature` por historia de usuario

### Estructura Gherkin
```gherkin
Feature: Descripción de la funcionalidad
  Como <rol>
  Quiero <acción>
  Para <beneficio>

  Scenario: Caso de uso positivo (Happy Path)
    Given <precondición 1>
    And <precondición 2>
    When <acción principal>
    Then <resultado esperado 1>
    And <resultado esperado 2>

  Scenario: Caso de error o límite
    Given <precondición>
    When <acción que falla>
    Then <error esperado>
```

### Ejemplo
```gherkin
Feature: User Registration
  As a new user
  I want to register in the platform
  So that I can book coworking spaces

  Scenario: Successful registration
    Given there are no users with email "new@example.com"
    When a user registers with:
      | field    | value          |
      | email    | new@example.com|
      | name     | Juan           |
      | password | Pass123!       |
    Then the user should be created successfully
    And the user should have role "USER"

  Scenario: Email already registered
    Given a user exists with email "existing@example.com"
    When a user tries to register with email "existing@example.com"
    Then the registration should fail
    And the error message should be "Email already registered"
```

---

## 🧪 Paso 2: Escribir Step Definitions

### Ubicación
`tests/step_definitions/*.steps.ts`

### Estructura
```typescript
import { Given, When, Then, Before, After } from '@cucumber/cucumber';

// Contexto compartido entre pasos
interface TestContext {
  // Variables compartidas
  lastResult?: any;
  lastError?: Error;
  users: Map<string, any>;
}

let context: TestContext = {
  users: new Map(),
};

// Reset antes de cada scenario
Before(async function () {
  context = { users: new Map() };
});

// Limpiar después de cada scenario
After(async function () {
  // Limpiar datos de prueba
});

// Implementar pasos
Given('precondición', async (data) => {
  // Preparar estado
});

When('acción', async (data) => {
  // Ejecutar acción
  try {
    context.lastResult = await service.doSomething();
  } catch (error) {
    context.lastError = error;
  }
});

Then('resultado esperado', async () => {
  // Verificar resultado
  if (!context.lastResult) {
    throw new Error('Expected result but got nothing');
  }
});
```

### Ejemplo Completo
```typescript
import { Given, When, Then, DataTable } from '@cucumber/cucumber';
import { UserService } from '../../src/services/UserService';

const userService = new UserService();

interface TestContext {
  lastUser?: any;
  lastError?: Error;
  users: Map<string, any>;
}

let context: TestContext = { users: new Map() };

Given('a user exists with email {string}', async (email: string) => {
  // Crear usuario en BD
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Test User',
      password: await bcrypt.hash('Pass123!', 10),
      role: 'USER',
      balance: 0,
    },
  });
  context.users.set(email, user);
});

When('a user registers with:', async (dataTable: DataTable) => {
  const data = dataTable.rowsHashAsObject() as any;
  
  try {
    const user = await userService.registerUser({
      email: data.email,
      name: data.name,
      password: data.password,
    });
    context.lastUser = user;
  } catch (error) {
    context.lastError = error as Error;
  }
});

Then('the user should be created successfully', () => {
  if (context.lastError) throw context.lastError;
  if (!context.lastUser) {
    throw new Error('User was not created');
  }
});

Then('the error message should be {string}', (message: string) => {
  if (context.lastError?.message !== message) {
    throw new Error(
      `Expected "${message}" but got "${context.lastError?.message}"`
    );
  }
});
```

### Ejecutar y Ver FALLAR (RED)
```bash
npm run test:e2e
# Output: 
# ❌ Step definitions are pending / failing
```

---

## 💻 Paso 3: Implementar Lógica (GREEN)

### Ubicación
`src/services/` - Implementar servicio que hace pasar las pruebas

### Enfoque: Diseño Simple
- ✅ Implementar SOLO lo necesario para pasar las pruebas
- ❌ NO anticipar requisitos futuros
- ❌ NO sobre-ingenierizar
- Principio: **YAGNI** (You Aren't Gonna Need It)

### Ejemplo de Implementación Mínima

```typescript
// src/services/UserService.ts

export class UserService {
  async registerUser(input: RegisterUserInput): Promise<UserResponse> {
    // 1. Validar que no existe el email
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // 2. Hashear contraseña
    const hashedPassword = await bcrypt.hash(
      input.password,
      parseInt(process.env.BCRYPT_ROUNDS || '10')
    );

    // 3. Crear usuario
    const user = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        password: hashedPassword,
        role: 'USER',
        balance: 0,
      },
    });

    // 4. Retornar resultado sin incluir la contraseña
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      balance: user.balance,
    };
  }
}
```

### Ejecutar y Ver PASAR (GREEN)
```bash
npm run test:e2e
# Output:
# ✅ All scenarios passed
```

---

## 🔧 Paso 4: Refactorizar (REFACTOR)

Una vez que el test pase, mejorar el código sin cambiar su comportamiento.

### Oportunidades de Refactorización

#### 1. **Extraer Métodos**
```typescript
// ❌ Antes: Todo en un método
async registerUser(input: RegisterUserInput): Promise<UserResponse> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new Error('Email already registered');
  
  const hash = await bcrypt.hash(input.password, 10);
  
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, password: hash, role: 'USER', balance: 0 }
  });
  
  return { id: user.id, email: user.email, name: user.name, role: user.role, balance: user.balance };
}

// ✅ Después: Métodos más pequeños
async registerUser(input: RegisterUserInput): Promise<UserResponse> {
  await this.validateEmailNotExists(input.email);
  const hashedPassword = await this.hashPassword(input.password);
  const user = await this.createUserInDb(input, hashedPassword);
  return this.mapToUserResponse(user);
}

private async validateEmailNotExists(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error('Email already registered');
}

private async hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '10'));
}

private mapToUserResponse(user: any): UserResponse {
  return { id: user.id, email: user.email, name: user.name, role: user.role, balance: user.balance };
}
```

#### 2. **Mejorar Nombres**
```typescript
// ❌ Nombres confusos
const u = await getUserById(1);
const x = u.balance - cost;

// ✅ Nombres claros
const user = await getUserById(1);
const updatedBalance = user.balance - reservationCost;
```

#### 3. **Reducir Duplicación**
```typescript
// ❌ Código duplicado
async addBalance(userId: number, amount: number): Promise<UserResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const updated = await prisma.user.update({...});
  return { id: updated.id, email: updated.email, name: updated.name, role: updated.role, balance: updated.balance };
}

async subtractBalance(userId: number, amount: number): Promise<UserResponse> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const updated = await prisma.user.update({...});
  return { id: updated.id, email: updated.email, name: updated.name, role: updated.role, balance: updated.balance };
}

// ✅ Abstraer en método compartido
private mapToUserResponse(user: any): UserResponse {
  return { id: user.id, email: user.email, name: user.name, role: user.role, balance: user.balance };
}
```

### Validar Refactorización
```bash
# Ejecutar pruebas para asegurar que sigue funcionando
npm run test:e2e
npm test

# Linting
npm run lint

# Compilación TypeScript
npm run build
```

---

## ✅ Paso 5: Validar Calidad

### Checklist de Validación

```bash
# 1. Linting - Sin errores
npm run lint
# ✅ Debe pasar sin errores

# 2. Compilación TypeScript - Sin errores
npm run build
# ✅ dist/ debe generarse sin problemas

# 3. Pruebas BDD - Todos los escenarios pasan
npm run test:e2e
# ✅ Todos los scenarios deben estar en verde

# 4. Pruebas Unitarias - Todos pasan
npm test
# ✅ 100% de tests pasando

# 5. Cobertura - Mayor a 80%
npm run test:coverage
# ✅ coverage >= 80%
```

### Ejemplo de Salida Exitosa

```
✅ Linting: No issues found
✅ TypeScript: Compiled successfully
✅ BDD Tests: 15 scenarios, 0 failed
✅ Unit Tests: 42 tests, 0 failed
✅ Coverage: 85.3% (Statements: 85%, Branches: 82%, Functions: 87%, Lines: 85%)
✅ Ready to push!
```

---

## 📊 Guardar Cambios

### Git Workflow

```bash
# 1. Crear rama para la feature
git checkout -b feature/user-registration

# 2. Hacer cambios y commits pequeños
git add features/01-user-authentication.feature
git commit -m "feat: add user registration feature specs"

git add tests/step_definitions/user.steps.ts
git commit -m "test: implement user registration step definitions"

git add src/services/UserService.ts
git commit -m "feat: implement user registration service"

git add src/controllers/UserController.ts
git commit -m "feat: add user registration controller"

# 3. Validar que todo funciona
npm run lint && npm run build && npm test && npm run test:e2e

# 4. Push y crear Pull Request
git push origin feature/user-registration
# En GitHub: Create Pull Request

# 5. La pipeline CI/CD valida automáticamente
# - ✅ Linting
# - ✅ TypeScript compilation
# - ✅ Unit tests
# - ✅ BDD tests
# - ✅ Code coverage

# 6. Merge a main
git checkout main
git merge feature/user-registration
git push origin main
```

---

## 🎯 Checklist Completo para Nueva Historia

### Antes de Empezar
- [ ] Historia de usuario está clara en PRODUCT_BACKLOG.md
- [ ] Se ha especificado Criterios de Aceptación
- [ ] Se ha estimado (Planning Poker)

### Fase RED
- [ ] Crear archivo `.feature` con escenarios
- [ ] Escribir Step Definitions
- [ ] Verificar que fallan (`npm run test:e2e` → ❌)

### Fase GREEN
- [ ] Implementar servicio/logica mínima
- [ ] Verificar que pasan (`npm run test:e2e` → ✅)
- [ ] Verificar compilación (`npm run build` → ✅)

### Fase REFACTOR
- [ ] Refactorizar si es necesario
- [ ] Seguir verificando que los tests pasan
- [ ] Linting (`npm run lint` → ✅)

### Validación Final
- [ ] Escribir unit tests (Jest)
- [ ] Cobertura >= 80%
- [ ] Todos los tests pasan
- [ ] Compilación sin errores
- [ ] Código review interno

### Preparar Merge
- [ ] Commits bien estructurados y mensajes claros
- [ ] Pull Request con descripción de cambios
- [ ] Esperar a que CI/CD pase
- [ ] Fusionar con rama main

---

## 💡 Consejos y Buenas Prácticas

### DO (✅ Hacer)
```typescript
// ✅ Métodos pequeños y enfocados
async bookRoom(input: BookRoomInput): Promise<Reservation> {
  await this.validateRoom(input.roomId);
  await this.validateUserBalance(input.userId, cost);
  return this.createReservation(input);
}

// ✅ Nombres descriptivos
const isRoomAvailable = await checkAvailability(...);
const totalReservationCost = calculateCost(...);

// ✅ Manejo de errores específicos
throw new Error('Email already registered'); // Específico
throw new Error('Insufficient balance');     // Específico

// ✅ Validación temprana
if (!userId || !roomId) {
  throw new Error('Missing required fields');
}

// ✅ Transacciones para operaciones múltiples
const result = await prisma.$transaction(async (tx) => {
  const reservation = await tx.reservation.create(...);
  await tx.user.update(...);
  return reservation;
});

// ✅ Tests que documentan el comportamiento
it('should throw error when email is already registered', async () => {
  // Este nombre de test describe el comportamiento esperado
});
```

### DON'T (❌ NO Hacer)
```typescript
// ❌ Métodos grandes y complejos
async bookRoom(input) {
  // 50 líneas de código mezclado
}

// ❌ Nombres genéricos
const x = userId;
const temp = calculateSomething();
const result = doStuff();

// ❌ Errores genéricos
throw new Error('Error'); // Demasiado genérico
throw new Error('Failed');  // Sin información

// ❌ Validación tardía
const user = await getUser(userId);
// ... 20 líneas después
if (!user) throw new Error('User not found');

// ❌ Operaciones múltiples sin transacciones
await reservation.create(...);
await user.update(...);  // Si falla, BD inconsistente

// ❌ Tests que no documentan comportamiento
it('should work', async () => {
  // ¿Qué es lo que debería funcionar?
});
```

---

## 🔗 Recursos Adicionales

- [PRODUCT_BACKLOG.md](./PRODUCT_BACKLOG.md) - Historias de usuario
- [README.md](./README.md) - Documentación del proyecto
- [Feature files](./features/) - Especificaciones ejecutables
- [Cucumber docs](https://cucumber.io/docs/bdd/)
- [XP Explained - Kent Beck](https://en.wikipedia.org/wiki/Extreme_programming)

---

## ❓ FAQ

**P: ¿Qué pasa si el test falla?**
R: Es normal en fase RED. Implementa el código necesario. Si falla en fase GREEN, revisa tu implementación.

**P: ¿Puedo saltar refactorización?**
R: Tecnicamente sí, pero mejora la calidad. Siempre que hayas refactorizado correctamente, los tests siguen pasando.

**P: ¿Cuántos escenarios por historia?**
R: Mínimo 2: happy path + edge case/error. Idealmente 3-5.

**P: ¿Debo escribir unit tests además de BDD?**
R: Sí. BDD valida comportamiento de negocio. Unit tests validan lógica interna.

**P: ¿Qué cobertura de código necesito?**
R: Mínimo 80%. Idealmente 85%+.

---

¡Feliz desarrollo seguiendo XP! 🚀
