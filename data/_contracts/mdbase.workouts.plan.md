---
kind: mdbase.contract
contract_type: record
id: mdbase.workouts.plan
version: 1.0.0
name: Workout plan
description: A scheduled workout and its intended exercises.
record_schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    properties:
      date:
        type: string
        description: Intended workout date in YYYY-MM-DD form.
      title:
        type: string
        description: Short descriptive title for the workout.
      exercises:
        type: array
        items:
          type: object
          additionalProperties: false
          properties:
            exercise:
              type: string
              description: Link to an exercise definition.
            target_sets:
              type: number
              description: Number of sets to aim for.
            target_reps:
              oneOf:
                - type: string
                - type: number
              description: Target repetitions, range, or descriptor.
            target_weight:
              type: number
              description: Target weight in kilograms.
            notes:
              type: string
              description: Per-exercise notes.
        description: Ordered exercises planned for the workout.
      status:
        enum:
          - scheduled
          - completed
          - skipped
        default: scheduled
        description: Current state of the plan.
      session:
        type: string
        description: Link to the resulting workout session, when available.
      notes:
        type: string
        description: General notes about the plan.
    required:
      - date
      - title
---

# Workout plan

This contract is the portable view of a scheduled workout.
