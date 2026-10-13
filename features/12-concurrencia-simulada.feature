# HU-12 - Concurrencia simulada, limitación de tasa y calendario en vivo

Feature: Concurrencia simulada y limitación de tasa
  Como responsable del sistema
  Quiero simular muchas reservas simultáneas y limitar el ritmo de peticiones
  Para demostrar que el sistema se mantiene consistente bajo carga

  Scenario: Una simulación concurrente no rompe los invariantes
    Given que el simulador está habilitado
    When se lanza una simulación de 200 operaciones con concurrencia 20
    Then no debe haber reservas solapadas en ninguna sala
    And ningún saldo debe quedar negativo
    And ninguna operación debe terminar con un error inesperado

  Scenario: El simulador está apagado por defecto
    Given que el simulador no está habilitado
    When se lanza una simulación de 10 operaciones con concurrencia 2
    Then la respuesta debe tener el estado 404

  Scenario: Superado el límite de peticiones se responde 429
    Given que la API limita a 5 peticiones por ventana
    When un cliente envía 8 peticiones de listado de salas
    Then 5 respuestas deben ser exitosas
    And 3 respuestas deben tener el estado 429

  Scenario: El calendario público no expone datos sensibles
    Given que existe una reserva confirmada de "Marta" en "Sala Calendario"
    When se consulta el calendario público de ese día
    Then cada entrada debe incluir solo sala, franja y estado
