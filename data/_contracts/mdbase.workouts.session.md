---
kind: mdbase.contract
contract_type: record
id: mdbase.workouts.session
version: 1.0.0
name: Workout session
description: A completed workout and its performed sets.
record_schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    properties:
      date:
        type: string
        description: Date on which the workout was performed.
      exercises:
        type: array
        items:
          type: object
          additionalProperties: false
          properties:
            exercise:
              type: string
              description: Link to the performed exercise.
            sets:
              type: array
              items:
                type: object
                additionalProperties: false
                properties:
                  reps:
                    type: number
                    description: Repetitions completed in this set.
                  weight:
                    type: number
                    description: Weight used in kilograms.
                  duration_seconds:
                    type: number
                    description: Duration in seconds.
                  distance:
                    type: number
                    description: Distance covered.
                  notes:
                    type: string
                    description: Notes for this set.
              description: Sets performed for the exercise.
        description: Exercises and sets performed in the workout.
      duration_minutes:
        type: number
        description: Total duration of the session in minutes.
      plan:
        type: string
        description: Link to the originating plan, when present.
      rating:
        type: number
        minimum: 1
        maximum: 5
        description: Subjective session rating from one to five.
      notes:
        type: string
        description: General notes about the session.
    required:
      - date
---

# Workout session

This contract is the portable view of a completed workout.
