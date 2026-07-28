---
kind: mdbase.type
name: exercise
version: 1
description: An exercise definition with tracking configuration
match:
  path_glob: exercises/**
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: exercise
      name:
        type: string
        description: Display name of the exercise (e.g. "Bench Press", "Pull-Up").
      muscle_groups:
        type: array
        items:
          type: string
        description: Primary muscle groups targeted (e.g. "chest", "quads", "lats").
      equipment:
        enum:
          - barbell
          - dumbbell
          - bodyweight
          - cable
          - machine
          - kettlebell
          - band
          - none
        description: The type of equipment required for this exercise.
      tracking:
        enum:
          - weight_reps
          - reps_only
          - timed
          - distance
        description: >-
          How this exercise is tracked. Determines which fields are relevant in session sets —
          "weight_reps" uses weight+reps, "reps_only" uses reps, "timed" uses duration_seconds,
          "distance" uses distance.
        default: weight_reps
    required:
      - name
collection:
  read_defaults:
    tracking: weight_reps
implements:
  - contract: mdbase.workouts.exercise
    version: 1.0.0
    fields:
      name: name
      muscle_groups: muscle_groups
      equipment: equipment
      tracking: tracking
x-legacy-v0.2:
  fields:
    fields.name.min_length: 1
---


## Exercise

An exercise definition describes **what** an exercise is and **how** it should be tracked. These are referenced by plans and sessions via links.

The `tracking` field controls which set fields are relevant when logging this exercise:
- **weight_reps**: log `weight` and `reps` per set (e.g. bench press, squat)
- **reps_only**: log `reps` only (e.g. push-ups, pull-ups)
- **timed**: log `duration_seconds` (e.g. plank, wall sit)
- **distance**: log `distance` (e.g. running, cycling)
