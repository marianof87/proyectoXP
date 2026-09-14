# HU-04 - Visualización de Reservas
# Feature nueva: la historia estaba en el backlog y en el código, pero no
# tenía escenarios Gherkin que la cubrieran.

Feature: Visualización del historial de reservas
  Como usuario registrado
  Quiero consultar el historial de mis reservas
  Para saber qué salas he reservado

  Scenario: Un usuario consulta todas sus reservas
    Given que el usuario "Carlos" tiene saldo suficiente
    And que la sala "Sala F" está disponible el "2026-10-23"
    And "Carlos" reserva la "Sala F" de "09:00" a "11:00" el "2026-10-23"
    And "Carlos" reserva la "Sala F" de "12:00" a "14:00" el "2026-10-23"
    When "Carlos" consulta sus reservas
    Then debe recibir 2 reservas

  Scenario: Cada reserva muestra sus datos y su estado
    Given que el usuario "Diana" tiene saldo suficiente
    And que la sala "Sala G" está disponible el "2026-10-24"
    And "Diana" reserva la "Sala G" de "09:00" a "11:00" el "2026-10-24"
    When "Diana" consulta sus reservas
    Then cada reserva debe incluir sala, fechas, estado y coste
    And el estado de la primera reserva debe ser "CONFIRMED"

  Scenario: Un usuario sin reservas recibe una lista vacía
    Given que el usuario "Elsa" tiene un balance de 0
    When "Elsa" consulta sus reservas
    Then debe recibir 0 reservas
