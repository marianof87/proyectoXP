# HU-02 - Gestión de Balance de Cuenta

Feature: Gestión del balance de la cuenta
  Como usuario registrado
  Quiero gestionar el saldo de mi cuenta
  Para poder pagar las reservas de salas

  Scenario: Recarga exitosa de saldo
    Given que el usuario "Ana" tiene un balance de 0
    When "Ana" añade 500 a su balance
    Then su nuevo balance debe ser 500
    And la operación debe quedar registrada

  Scenario: El saldo se descuenta tras una reserva exitosa
    Given que el usuario "Luis" tiene un balance de 1000
    And que la sala "Sala D" cuesta 200 por hora
    When "Luis" reserva la "Sala D" de "10:00" a "12:00" el "2026-10-21"
    Then su balance debe reducirse en 400
    And su nuevo balance debe ser 600

  Scenario: No se puede añadir un importe negativo
    Given que el usuario "Sofía" tiene un balance de 100
    When "Sofía" intenta añadir -50 a su balance
    Then la operación debe fallar
    And el mensaje de error debe ser "Amount must be positive"
