# HU-05 - Gestión de Salas (Administrador)

Feature: Gestión de las salas del coworking
  Como administrador del sistema
  Quiero crear y gestionar las salas disponibles
  Para controlar el espacio del coworking

  Scenario: Creación exitosa de una nueva sala
    Given que no existe ninguna sala con el nombre "Sala Premium"
    When el administrador crea una sala con:
      | campo       | valor              |
      | nombre      | Sala Premium       |
      | capacidad   | 8                  |
      | tarifa      | 150                |
      | descripción | Espacio premium    |
    Then la sala debe crearse correctamente
    And la sala "Sala Premium" debe estar disponible

  Scenario: No se puede crear una sala con un nombre duplicado
    Given que la sala "Sala A" ya existe
    When el administrador intenta crear una sala con el nombre "Sala A"
    Then la operación debe fallar
    And el mensaje de error debe ser "Room name already exists"

  Scenario: Listado de todas las salas existentes
    Given que hay 3 salas disponibles
    When el administrador solicita el listado de todas las salas
    Then la respuesta debe contener 3 salas
    And cada sala debe incluir id, nombre, capacidad y tarifa por hora

  Scenario: No se puede crear una sala con capacidad no positiva
    Given que no existe ninguna sala con el nombre "Sala Vacía"
    When el administrador intenta crear la sala "Sala Vacía" con capacidad 0
    Then la operación debe fallar
    And el mensaje de error debe ser "Capacity must be a positive integer"
