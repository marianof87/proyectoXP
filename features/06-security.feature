Feature: Security and Data Protection
  As a security auditor
  I want passwords to be securely stored
  So that user data is protected in case of a breach

  Scenario: Passwords are hashed with bcrypt
    Given a new user registers with password "SecurePass123!"
    When the password is stored in the database
    Then the password should be hashed using bcrypt
    And the stored value should not be the plaintext password
    And the hash should be verifiable against the original password

  Scenario: Failed login attempts are logged
    Given user "John" exists with password "CorrectPassword123"
    When "John" attempts to login with wrong password "WrongPassword"
    Then the login should fail
    And the error should be "Invalid credentials"
    And the failed attempt should be logged in the system
