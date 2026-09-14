# HU-07 - Rendimiento de la API (historia técnica)

Feature: Rendimiento del sistema
  Como administrador del sistema
  Quiero que los endpoints de la API respondan en menos de 200ms
  Para garantizar una experiencia fluida bajo concurrencia

  Scenario: Los endpoints responden dentro del tiempo aceptable
    Given que el sistema está atendiendo peticiones concurrentes
    When un usuario lanza una petición para reservar una sala
    Then la respuesta debe recibirse en menos de 200ms
    And la respuesta debe tener un estado válido, no un error del servidor

  Scenario: El listado de salas responde de forma eficiente
    Given que hay 100 salas en el sistema
    When el administrador solicita el listado de todas las salas
    Then la respuesta debe recibirse en menos de 200ms
    And deben devolverse todas las salas
