# HU-03 - Reserva de Salas

Feature: Reserva de salas de reuniones
  Como usuario registrado
  Quiero reservar salas de reuniones disponibles
  Para tener un espacio privado de trabajo

  Scenario: Reserva exitosa de una sala disponible
    Given que la sala "Sala A" está disponible el "2026-10-20"
    And que el usuario "Juan" tiene saldo suficiente
    When "Juan" reserva la "Sala A" de "09:00" a "11:00" el "2026-10-20"
    Then la reserva debe confirmarse correctamente
    And el estado de la reserva debe ser "CONFIRMED"
    And la sala "Sala A" no debe estar disponible en esa franja

  Scenario: La reserva falla cuando la sala ya está ocupada
    Given que la sala "Sala B" está reservada el "2026-10-20" de "09:00" a "11:00"
    When "María" intenta reservar la "Sala B" de "09:30" a "10:30" el "2026-10-20"
    Then la reserva debe fallar
    And el mensaje de error debe ser "Room not available for selected time"

  Scenario: La reserva falla cuando el saldo es insuficiente
    Given que la sala "Sala C" está disponible el "2026-10-20"
    And que el usuario "Pedro" tiene un balance de 0
    And que la sala "Sala C" cuesta 100 por hora
    When "Pedro" intenta reservar la "Sala C" de "09:00" a "11:00" el "2026-10-20"
    Then la reserva debe fallar
    And el mensaje de error debe ser "Insufficient balance"

  Scenario: Se permite reservar una franja contigua a otra ya ocupada
    Given que la sala "Sala E" está reservada el "2026-10-22" de "09:00" a "11:00"
    And que el usuario "Elena" tiene saldo suficiente
    When "Elena" reserva la "Sala E" de "11:00" a "13:00" el "2026-10-22"
    Then la reserva debe confirmarse correctamente
