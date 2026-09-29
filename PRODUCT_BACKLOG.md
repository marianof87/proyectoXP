# Backlog del Producto - Plataforma de Reserva de Espacios de Coworking

## Historias de Usuario Funcionales

### 1. Registro e Identificación de Usuarios
**Como** usuario nuevo  
**Quiero** registrarme en la plataforma  
**Para** poder reservar espacios de coworking

**Criterios de Aceptación:**
- Los usuarios pueden registrarse con email, nombre y contraseña
- Las contraseñas se almacenan de forma segura usando bcrypt
- No se permite registrar dos cuentas con el mismo email
- Un usuario registrado recibe un rol de "USER" por defecto

### 2. Gestión de Balance de Cuenta
**Como** usuario registrado  
**Quiero** gestionar mi balance de cuenta  
**Para** pagar por las reservas de salas

**Criterios de Aceptación:**
- Los usuarios pueden agregar balance a su cuenta
- El balance no puede ser negativo
- Se pueden deducir fondos cuando se realiza una reserva exitosa
- Se pueden reembolsar fondos cuando se cancela una reserva

### 3. Reserva de Salas
**Como** usuario registrado  
**Quiero** reservar salas de reuniones disponibles  
**Para** tener un espacio privado de trabajo

**Criterios de Aceptación:**
- Los usuarios pueden ver las salas disponibles
- Los usuarios pueden reservar una sala para una fecha y rango horario específico
- No se pueden hacer reservas conflictivas para la misma sala
- Se valida que el usuario tenga suficiente balance
- Una reserva exitosa deduce el costo del balance del usuario

### 4. Visualización de Reservas
**Como** usuario registrado  
**Quiero** ver el historial de mis reservas  
**Para** saber qué salas he reservado

**Criterios de Aceptación:**
- Se pueden ver todas las reservas del usuario
- Se muestra el estado de cada reserva (CONFIRMADA, CANCELADA, COMPLETADA)
- Se muestran los detalles: fecha, hora, costo, nombre de la sala

### 5. Gestión de Salas (Administrador)
**Como** administrador del sistema  
**Quiero** crear y gestionar las salas disponibles  
**Para** controlar el espacio del coworking

**Criterios de Aceptación:**
- Se pueden crear nuevas salas con nombre, capacidad y tarifa por hora
- No se permiten nombres de salas duplicados
- Se puede obtener el listado de todas las salas
- Se puede consultar la disponibilidad de una sala

### 6. Cancelación de Reservas
**Como** usuario registrado  
**Quiero** cancelar una reserva si cambian mis planes  
**Para** recuperar mi dinero

**Criterios de Aceptación:**
- Se pueden cancelar reservas confirmadas
- El dinero se reembolsa al usuario
- Solo se pueden cancelar reservas que no hayan iniciado
- El estado de la reserva cambia a "CANCELADA"

---

## Historias de Usuario Técnicas (No Funcionales)

### 7. Rendimiento de API
**Como** administrador del sistema  
**Quiero** que los endpoints de la API respondan en menos de 200ms  
**Para** garantizar una experiencia fluida bajo concurrencia

**Criterios de Aceptación:**
- Todos los endpoints responden en menos de 200ms en condiciones normales
- La base de datos tiene índices apropiados
- Las consultas están optimizadas
- El sistema puede manejar al menos 100 solicitudes concurrentes

### 8. Seguridad de Datos
**Como** auditor de seguridad  
**Quiero** que todas las contraseñas se almacenen con hash bcrypt  
**Para** proteger los datos en caso de una brecha

**Criterios de Aceptación:**
- Las contraseñas se hashean con bcrypt y salt
- Las contraseñas nunca se almacenan en texto plano
- Los intentos fallidos de login se registran
- Se validan todos los inputs de usuario para prevenir inyecciones

### 9. Autenticación y Autorización con JWT
**Como** sistema de reservas de coworking  
**Quiero** emitir un token JWT al iniciar sesión y exigirlo en las rutas sensibles  
**Para** que solo usuarios autenticados y autorizados accedan a esas operaciones

**Criterios de Aceptación:**
- El login exitoso devuelve, además del usuario, un token JWT firmado con expiración
- Las rutas protegidas exigen un token válido (`Authorization: Bearer <token>`) y devuelven 401 si falta, es inválido o expiró
- La creación de salas exige rol ADMIN y devuelve 403 si el usuario autenticado no lo tiene
- Consultar o modificar el balance/las reservas de otro usuario exige rol ADMIN; el propio dueño del recurso siempre puede acceder

### 10. Saneamiento, Validación de Entradas y Logs Seguros
**Como** sistema de reservas de coworking  
**Quiero** validar y sanear el cuerpo de cada petición, y censurar los datos sensibles en los logs  
**Para** rechazar entradas mal formadas antes de la lógica de negocio y no filtrar contraseñas ni tokens

**Criterios de Aceptación:**
- Cada endpoint que escribe datos valida su body contra un esquema estricto: rechaza campos no declarados y tipos incorrectos con 400
- Los campos de texto se sanean (trim) antes de guardarse
- Un error inesperado (500) se registra con el request completo, pero contraseñas, tokens y cabeceras de autorización aparecen censurados en el log, nunca en texto plano
- La inyección SQL/NoSQL no aplica: todo el acceso a datos pasa por Prisma, que parametriza las consultas

### 11. Gestión de Sesiones y Estados
**Como** sistema de reservas de coworking  
**Quiero** una máquina de estados explícita sobre las reservas, idempotencia al crearlas y poder revocar una sesión  
**Para** que el avance de una operación comercial sea predecible, no se duplique por reintentos y el logout sea real

**Criterios de Aceptación:**
- Una reserva solo puede avanzar CONFIRMED → IN_PROGRESS → COMPLETED; cualquier otra transición se rechaza con un error de negocio (409)
- Avanzar el estado de una reserva es una operación de ADMIN
- Repetir `POST /api/reservations` con la misma cabecera `X-Idempotency-Key` devuelve la reserva creada la primera vez, sin cobrar ni reservar dos veces
- `POST /api/users/logout` revoca el token actual; una petición posterior con ese mismo token es rechazada con 401 aunque la firma siga siendo válida

---

## Definiciones de Hecho (Definition of Done)

Una historia se considera completada cuando:

1. ✅ El código ha sido escrito en TypeScript con strict mode
2. ✅ Las pruebas de Cucumber están escritas y pasan (happy path + edge case)
3. ✅ Se han escrito pruebas unitarias con Jest (cobertura >= 80%)
4. ✅ El código ha sido revisado por pares
5. ✅ La documentación está actualizada
6. ✅ El linter (ESLint) no reporta errores
7. ✅ La compilación de TypeScript (tsc) no reporta errores
8. ✅ El código está integrado en la rama principal
9. ✅ Los tests pasan en la pipeline de CI/CD

---

## Estimación y Priorización

| Prioridad | Historia | Esfuerzo |
|-----------|----------|----------|
| 🔴 Alta | Registro de Usuarios | 8 puntos |
| 🔴 Alta | Gestión de Balance | 5 puntos |
| 🔴 Alta | Reserva de Salas | 13 puntos |
| 🟡 Media | Visualización de Reservas | 5 puntos |
| 🟡 Media | Gestión de Salas | 8 puntos |
| 🟡 Media | Cancelación de Reservas | 5 puntos |
| 🔴 Alta | Rendimiento de API | 8 puntos |
| 🔴 Alta | Seguridad de Datos | 8 puntos |
| 🔴 Alta | Autenticación y Autorización con JWT | 8 puntos |
| 🟡 Media | Saneamiento, Validación de Entradas y Logs Seguros | 5 puntos |
| 🟡 Media | Gestión de Sesiones y Estados | 8 puntos |

---

## Mapa de Funcionalidades

```
Usuarios
├── Registro y Autenticación
├── Gestión de Balance
└── Ver Perfil

Reservas
├── Crear Reserva (idempotente vía X-Idempotency-Key)
├── Ver Mis Reservas
├── Avanzar Estado (CONFIRMED → IN_PROGRESS → COMPLETED)
└── Cancelar Reserva

Administración
├── Gestionar Salas
├── Ver Disponibilidad
└── Reportes

Seguridad
├── Hashing de Contraseñas
├── Validación y Saneamiento de Inputs (Zod)
├── Logging de Eventos y Errores (con redacción de datos sensibles)
├── Autenticación con JWT
├── Autorización (por rol y por propiedad del recurso)
└── Revocación de Sesión (logout)
```
