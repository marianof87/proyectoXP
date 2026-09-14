Feature: System Performance
  As an administrator
  I want the API endpoints to respond quickly
  So that users have a smooth experience under concurrent load

  Scenario: API endpoints respond within acceptable time
    Given the system is handling concurrent requests
    When a user makes a request to book a room
    Then the response should be received within 200ms
    And the response status should be 200 or 400 (valid response)

  Scenario: List rooms endpoint performs efficiently
    Given there are 100 rooms in the system
    When admin requests the list of all rooms
    Then the response should be received within 200ms
    And all rooms should be returned
