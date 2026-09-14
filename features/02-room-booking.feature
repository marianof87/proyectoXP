Feature: Room Booking and Reservation
  As a registered user
  I want to book meeting rooms
  So that I have a private workspace

  Scenario: Successful booking of an available room
    Given room "Sala A" is available on "2026-10-20"
    And user "Juan" has sufficient balance
    When "Juan" books "Sala A" from "09:00" to "11:00" on "2026-10-20"
    Then the reservation should be confirmed
    And the reservation status should be "CONFIRMED"
    And room "Sala A" should not be available at that time

  Scenario: Booking fails when room is unavailable
    Given room "Sala B" is booked on "2026-10-20" from "09:00" to "11:00"
    When "Maria" tries to book "Sala B" from "09:30" to "10:30" on "2026-10-20"
    Then the booking should fail
    And the error message should be "Room not available for selected time"

  Scenario: Booking fails with insufficient balance
    Given room "Sala C" is available on "2026-10-20"
    And user "Pedro" has balance 0
    And "Sala C" costs 100 per hour
    When "Pedro" tries to book "Sala C" from "09:00" to "11:00" on "2026-10-20"
    Then the booking should fail
    And the error message should be "Insufficient balance"
