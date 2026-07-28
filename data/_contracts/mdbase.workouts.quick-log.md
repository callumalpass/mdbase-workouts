---
kind: mdbase.contract
contract_type: record
id: mdbase.workouts.quick-log
version: 1.0.0
name: Workout quick log
description: A lightweight record of one performed exercise.
record_schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    properties:
      exercise:
        type: string
        description: Link to the performed exercise.
      reps:
        type: number
        description: Repetitions performed.
      weight:
        type: number
        description: Weight used in kilograms.
      duration_seconds:
        type: number
        description: Duration in seconds.
      distance:
        type: number
        description: Distance covered.
      logged_at:
        type: string
        description: ISO 8601 timestamp for the activity.
      notes:
        type: string
        description: Optional notes about the activity.
    required:
      - exercise
---

# Workout quick log

This contract represents a single exercise logged outside a full session.
