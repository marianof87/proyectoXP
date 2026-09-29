# HU-09 - Autenticación y autorización con JWT (historia técnica)
#
# Adapta el material "Ejemplo de Autenticación con JWT" a este sistema:
# el login emite un token, las rutas protegidas lo exigen (Ejercicio 1),
# algunas exigen además un rol concreto (Ejercicio 2, RBAC), y otras exigen
# que el usuario autenticado sea el dueño del recurso o un ADMIN
# (Ejercicio 3, autorización por propiedad).

Feature: Autenticación y autorización con JWT
  Como sistema de reservas de coworking
  Quiero emitir un token al iniciar sesión y exigirlo en las rutas sensibles
  Para que solo usuarios autenticados y autorizados accedan a esas operaciones

  # --- Ejercicio 1: autenticación -----------------------------------------

  Scenario: El inicio de sesión exitoso devuelve un token JWT válido
    Given que el usuario "Carla" puede iniciar sesión con la contraseña "SecurePass123!"
    When "Carla" inicia sesión con su contraseña
    Then debe recibir un token JWT válido

  Scenario: El perfil no es accesible sin un token
    When se solicita el perfil sin proporcionar un token
    Then el código de estado HTTP debe ser 401

  Scenario: Un token inválido o alterado es rechazado
    When se solicita el perfil con un token inválido
    Then el código de estado HTTP debe ser 401

  Scenario: El perfil es accesible con un token válido
    Given que el usuario "Diego" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Diego" inició sesión
    When "Diego" solicita su perfil
    Then debe recibir su propio perfil

  # --- Ejercicio 2: autorización por rol (RBAC) ---------------------------

  Scenario: Un usuario sin rol ADMIN no puede crear salas
    Given que el usuario "Elena" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Elena" inició sesión
    When "Elena" intenta crear una sala autenticada
    Then el código de estado HTTP debe ser 403

  Scenario: Un administrador puede crear salas
    Given que el administrador "Franco" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Franco" inició sesión
    When "Franco" crea una sala autenticado
    Then la sala debe crearse correctamente

  # --- Ejercicio 3: autorización por propiedad del recurso ----------------

  Scenario: Un usuario no puede ver las reservas de otro usuario
    Given que el usuario "Gabriela" puede iniciar sesión con la contraseña "SecurePass123!"
    And que el usuario "Hugo" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Gabriela" inició sesión
    When "Gabriela" consulta las reservas de "Hugo" autenticada
    Then el código de estado HTTP debe ser 403

  Scenario: Un usuario puede ver sus propias reservas
    Given que el usuario "Irene" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Irene" inició sesión
    When "Irene" consulta sus propias reservas autenticada
    Then debe recibir la respuesta correctamente

  Scenario: Un administrador puede ver las reservas de cualquier usuario
    Given que el administrador "Julio" puede iniciar sesión con la contraseña "AdminPass123!"
    And que el usuario "Karen" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Julio" inició sesión
    When "Julio" consulta las reservas de "Karen" autenticado
    Then debe recibir la respuesta correctamente
