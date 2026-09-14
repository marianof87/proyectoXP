# HU-08 - Seguridad de Datos (historia técnica)

Feature: Seguridad y protección de los datos
  Como auditor de seguridad
  Quiero que las contraseñas se almacenen de forma segura
  Para proteger los datos de los usuarios ante una brecha

  Scenario: Las contraseñas se almacenan hasheadas con bcrypt
    Given que un nuevo usuario se registra con la contraseña "SecurePass123!"
    When se consulta la contraseña almacenada
    Then la contraseña debe estar hasheada con bcrypt
    And el valor almacenado no debe ser la contraseña en texto plano
    And el hash debe poder verificarse contra la contraseña original

  Scenario: Los intentos de acceso fallidos quedan registrados
    Given que el usuario "John" existe con la contraseña "CorrectPassword123"
    When "John" intenta acceder con la contraseña incorrecta "WrongPassword"
    Then el acceso debe fallar
    And el mensaje de error debe ser "Invalid credentials"
    And el intento fallido debe quedar registrado en el sistema

  Scenario: El sistema no revela qué emails están registrados
    Given que el usuario "Laura" existe con la contraseña "CorrectPassword123"
    When se intenta acceder con un email que no existe
    Then el acceso debe fallar
    And el mensaje de error debe ser "Invalid credentials"
