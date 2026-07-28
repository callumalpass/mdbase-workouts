---
kind: mdbase.contract
id: mdbase.workouts.exercise
version: 1.0.0
name: Workout exercise
description: A portable exercise definition and its tracking mode.
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    properties:
      name:
        type: string
        description: Display name of the exercise.
      muscle_groups:
        type: array
        items:
          type: string
        description: Primary muscle groups targeted by the exercise.
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
        description: Equipment required for the exercise.
      tracking:
        enum:
          - weight_reps
          - reps_only
          - timed
          - distance
        default: weight_reps
        description: Measurement mode used when logging the exercise.
    required:
      - name
---

# Workout exercise

Applications use this contract to share exercise definitions without depending
on a collection's type name or frontmatter field names.
