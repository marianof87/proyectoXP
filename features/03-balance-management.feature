Feature: User Balance Management
  As a registered user
  I want to manage my account balance
  So that I can pay for room reservations

  Scenario: Successfully add balance to account
    Given user "Ana" has balance 0
    When "Ana" adds 500 to her balance
    Then her new balance should be 500
    And the transaction should be recorded

  Scenario: Deduct balance after successful booking
    Given user "Luis" has balance 1000
    And room "Sala D" costs 200 per hour
    When "Luis" books "Sala D" from "10:00" to "12:00" on "2026-10-21"
    Then his balance should be reduced by 400
    And his new balance should be 600

  Scenario: Cannot add negative balance
    Given user "Sofia" has balance 100
    When "Sofia" tries to add -50 to her balance
    Then the operation should fail
    And the error message should be "Amount must be positive"
