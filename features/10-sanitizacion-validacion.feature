# HU-10 - Saneamiento, validación de entradas y logs seguros (historia técnica)
#
# Adapta 04.Sanitizacion_Validacion_Logs.docx a este sistema: Zod valida y
# sanea el body en el borde HTTP (src/middleware/validateRequest.ts), antes
# de que la petición llegue al controlador. Las reglas de negocio (formato
# de email, fuerza de contraseña, capacidad positiva...) siguen viviendo en
# los servicios, y ya las prueban las features 01, 05, 06 y 08: no se
# repiten aquí.
#
# La inyección SQL/NoSQL no aplica a este sistema: todo el acceso a datos
# pasa por Prisma, que parametriza las consultas (ver README). Los logs
# seguros (redacción con Pino) se prueban en tests/unit/logger.test.ts, no
# aquí, porque inspeccionar stdout no encaja en un escenario Gherkin.

Feature: Saneamiento y validación de entradas
  Como sistema de reservas de coworking
  Quiero validar y sanear el cuerpo de cada petición en el borde HTTP
  Para rechazar entradas mal formadas antes de que lleguen a la lógica de negocio

  Scenario: El registro rechaza campos no declarados en el esquema
    When se registra un usuario con un campo "role" no permitido
    Then el código de estado HTTP debe ser 400

  Scenario: El registro sanea los espacios alrededor del nombre
    When se registra un usuario con el nombre "  Marta  " con espacios extra
    Then el usuario almacenado debe tener el nombre sin espacios extra "Marta"

  Scenario: La creación de una sala rechaza una capacidad no numérica
    Given que el administrador "Nora" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Nora" inició sesión
    When "Nora" intenta crear una sala con una capacidad no numérica
    Then el código de estado HTTP debe ser 400

  Scenario: La creación de una sala rechaza una descripción demasiado larga
    Given que el administrador "Oscar" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Oscar" inició sesión
    When "Oscar" intenta crear una sala con una descripción demasiado larga
    Then el código de estado HTTP debe ser 400

  Scenario: La creación de una sala sanea los espacios de la descripción
    Given que el administrador "Paula" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Paula" inició sesión
    When "Paula" crea una sala con una descripción con espacios extra
    Then la descripción almacenada de la sala no debe tener espacios extra

  Scenario: Añadir balance rechaza un importe que no es numérico
    Given que el usuario "Quintín" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Quintín" inició sesión
    When "Quintín" intenta añadir un importe no numérico a su balance
    Then el código de estado HTTP debe ser 400

  Scenario: Reservar sin fecha de inicio es rechazado
    Given que el usuario "Rosa" puede iniciar sesión con la contraseña "SecurePass123!"
    And que la sala "Sala para Validación" ya existe
    And "Rosa" inició sesión
    When "Rosa" intenta reservar sin indicar la fecha de inicio
    Then el código de estado HTTP debe ser 400
