# HU-11 - Gestión de sesiones y estados (Unidad 5, historia técnica)
#
# Adapta 05.Unidad_5_Gestion_de_sesiones_y_estados.docx a este sistema:
#
#   Actividad A: máquina de estados sobre Reservation (el "Pedido" de este
#     dominio). El flujo pendiente->confirmado->en_proceso->completado del
#     material se adapta a lo que el sistema realmente hace: aquí una
#     reserva nace CONFIRMED (se paga al reservar, no hay paso "pendiente"
#     real todavía), así que la máquina de estados formaliza el tramo
#     CONFIRMED -> IN_PROGRESS -> COMPLETED. Cancelar sigue siendo el camino
#     ya probado por HU-06: no se toca.
#   Actividad B: X-Idempotency-Key en POST /reservations.
#   Actividad C: logout revoca el token actual (jti en lista negra).
#
# Cookies HttpOnly/Secure/SameSite y bloqueo optimista con número de versión
# no aplican: el sistema ya es 100% stateless (JWT, sin cookies de sesión) y
# el solapamiento de reservas ya se comprueba dentro de una transacción.

Feature: Gestión de sesiones y estados
  Como sistema de reservas de coworking
  Quiero una máquina de estados explícita, idempotencia al reservar y poder revocar sesiones
  Para que las operaciones de negocio sean seguras, predecibles y no se dupliquen

  # --- Actividad A: máquina de estados -------------------------------------

  Scenario: El administrador avanza una reserva confirmada a en curso
    Given que el usuario "Vera" tiene saldo suficiente
    And que la sala "Sala Estados 1" ya existe
    And "Vera" reserva la "Sala Estados 1" de "09:00" a "11:00" el "2027-03-01"
    And que el administrador "Vicente" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Vicente" inició sesión
    When "Vicente" avanza la última reserva a "IN_PROGRESS"
    Then la reserva debe quedar en el estado "IN_PROGRESS"

  Scenario: El administrador avanza una reserva en curso a completada
    Given que el usuario "Walter" tiene saldo suficiente
    And que la sala "Sala Estados 2" ya existe
    And "Walter" reserva la "Sala Estados 2" de "09:00" a "11:00" el "2027-03-01"
    And que el administrador "Ximena" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Ximena" inició sesión
    And "Ximena" avanza la última reserva a "IN_PROGRESS"
    When "Ximena" avanza la última reserva a "COMPLETED"
    Then la reserva debe quedar en el estado "COMPLETED"

  Scenario: No se puede completar una reserva confirmada sin pasar por "en curso"
    Given que el usuario "Yolanda" tiene saldo suficiente
    And que la sala "Sala Estados 3" ya existe
    And "Yolanda" reserva la "Sala Estados 3" de "09:00" a "11:00" el "2027-03-01"
    And que el administrador "Zacarias" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Zacarias" inició sesión
    When "Zacarias" intenta avanzar la última reserva a "COMPLETED"
    Then el código de estado HTTP debe ser 409

  Scenario: No se puede avanzar el estado de una reserva ya completada
    Given que el usuario "Andres" tiene saldo suficiente
    And que la sala "Sala Estados 4" ya existe
    And "Andres" reserva la "Sala Estados 4" de "09:00" a "11:00" el "2027-03-01"
    And que el administrador "Beatriz" puede iniciar sesión con la contraseña "AdminPass123!"
    And "Beatriz" inició sesión
    And "Beatriz" avanza la última reserva a "IN_PROGRESS"
    And "Beatriz" avanza la última reserva a "COMPLETED"
    When "Beatriz" intenta avanzar la última reserva a "IN_PROGRESS"
    Then el código de estado HTTP debe ser 409

  Scenario: Un usuario sin rol ADMIN no puede avanzar el estado de una reserva
    Given que el usuario "Carlos" tiene saldo suficiente
    And que la sala "Sala Estados 5" ya existe
    And "Carlos" reserva la "Sala Estados 5" de "09:00" a "11:00" el "2027-03-01"
    And "Carlos" inició sesión
    When "Carlos" intenta avanzar la última reserva a "IN_PROGRESS"
    Then el código de estado HTTP debe ser 403

  # --- Actividad B: idempotencia --------------------------------------------

  Scenario: Repetir la misma clave de idempotencia no crea una segunda reserva
    Given que el usuario "Diana" tiene saldo suficiente
    And que la sala "Sala Idempotente" ya existe
    And "Diana" inició sesión
    When "Diana" reserva la sala "Sala Idempotente" con la clave de idempotencia "clave-abc"
    And "Diana" vuelve a reservar la sala "Sala Idempotente" con la misma clave de idempotencia "clave-abc"
    Then debe recibir la misma reserva que la primera vez
    When "Diana" consulta sus reservas
    Then debe recibir 1 reservas

  # --- Actividad C: cierre de sesión seguro ---------------------------------

  Scenario: Tras cerrar sesión, el token deja de servir para acceder a rutas protegidas
    Given que el usuario "Ernesto" puede iniciar sesión con la contraseña "SecurePass123!"
    And "Ernesto" inició sesión
    When "Ernesto" cierra sesión
    And "Ernesto" solicita su perfil
    Then el código de estado HTTP debe ser 401

  Scenario: Cerrar sesión sin token es rechazado
    When se solicita cerrar sesión sin proporcionar un token
    Then el código de estado HTTP debe ser 401
