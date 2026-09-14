Feature: User Registration and Authentication
  As a new user
  I want to register in the platform
  So that I can book coworking spaces

  Scenario: Successful user registration
    Given there are no users with email "juan@example.com"
    When a user registers with:
      | field    | value              |
      | email    | juan@example.com   |
      | name     | Juan García        |
      | password | SecurePass123!     |
    Then the user should be created successfully
    And the user should have role "USER"
    And the user should have balance 0

  Scenario: Registration fails with existing email
    Given a user exists with email "maria@example.com"
    When a user tries to register with email "maria@example.com" and password "Password123!"
    Then the registration should fail
    And the error message should be "Email already registered"
