Feature: Room Management
  As a room administrator
  I want to manage the available rooms
  So that I can control the coworking space

  Scenario: Successfully create a new room
    Given no room exists with name "Sala Premium"
    When admin creates a room with:
      | field       | value            |
      | name        | Sala Premium     |
      | capacity    | 8                |
      | hourlyRate  | 150              |
      | description | Premium workspace |
    Then the room should be created successfully
    And room "Sala Premium" should be available

  Scenario: Cannot create room with duplicate name
    Given room "Sala A" already exists
    When admin tries to create a room with name "Sala A"
    Then the operation should fail
    And the error message should be "Room name already exists"

  Scenario: Successfully list all available rooms
    Given there are 3 rooms available
    When admin requests the list of all rooms
    Then the response should contain 3 rooms
    And each room should have id, name, capacity, and hourlyRate
