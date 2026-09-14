# HU-06 - Cancelación de Reservas
# Feature nueva: la regla "solo se pueden cancelar reservas que no hayan
# iniciado" se implementó en esta iteración y aquí queda especificada.

Feature: Cancelación de reservas
  Como usuario registrado
  Quiero cancelar una reserva si cambian mis planes
  Para recuperar mi dinero

  Scenario: Cancelación exitosa de una reserva confirmada
    Given que el usuario "Marta" tiene un balance de 1000
    And que la sala "Sala H" cuesta 100 por hora
    When "Marta" reserva la "Sala H" de "09:00" a "11:00" el "2026-12-01"
    And "Marta" cancela su última reserva
    Then el estado de la reserva debe ser "CANCELLED"
    And su nuevo balance debe ser 1000
    And la sala "Sala H" debe volver a estar disponible en esa franja

  Scenario: No se puede cancelar dos veces la misma reserva
    Given que el usuario "Raúl" tiene un balance de 1000
    And que la sala "Sala I" cuesta 100 por hora
    When "Raúl" reserva la "Sala I" de "09:00" a "11:00" el "2026-12-02"
    And "Raúl" cancela su última reserva
    And "Raúl" intenta cancelar de nuevo su última reserva
    Then la operación debe fallar
    And el mensaje de error debe ser "Only confirmed reservations can be cancelled"

  Scenario: No se puede cancelar una reserva que ya ha comenzado
    Given que el usuario "Nuria" tiene un balance de 1000
    And que la sala "Sala J" cuesta 100 por hora
    When "Nuria" reserva la "Sala J" de "09:00" a "11:00" el "2020-01-15"
    And "Nuria" intenta cancelar su última reserva
    Then la operación debe fallar
    And el mensaje de error debe ser "Cannot cancel a reservation already started"
