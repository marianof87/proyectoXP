# HU-01 - Registro e Identificación de Usuarios
# Los mensajes de error se mantienen en inglés porque forman parte del
# contrato de la API REST, no del texto de la historia.

Feature: Registro e identificación de usuarios
  Como usuario nuevo
  Quiero registrarme en la plataforma
  Para poder reservar espacios de coworking

  Scenario: Registro exitoso de un nuevo usuario
    Given que no existe ningún usuario con el email "juan@example.com"
    When un usuario se registra con:
      | campo      | valor            |
      | email      | juan@example.com |
      | nombre     | Juan García      |
      | contraseña | SecurePass123!   |
    Then el usuario debe crearse correctamente
    And el usuario debe tener el rol "USER"
    And el usuario debe tener un balance de 0

  Scenario: El registro falla cuando el email ya está registrado
    Given que existe un usuario con el email "maria@example.com"
    When un usuario intenta registrarse con el email "maria@example.com" y la contraseña "Password123!"
    Then el registro debe fallar
    And el mensaje de error debe ser "Email already registered"

  Scenario: El registro falla con una contraseña demasiado corta
    Given que no existe ningún usuario con el email "pedro@example.com"
    When un usuario intenta registrarse con el email "pedro@example.com" y la contraseña "corta"
    Then el registro debe fallar
    And el mensaje de error debe ser "Password must be at least 8 characters"
