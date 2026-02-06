---
name: exercise
description: An exercise definition with tracking configuration

match:
  folder: exercises

fields:
  name:
    type: string
    required: true
    min_length: 1

  muscle_groups:
    type: list
    items:
      type: string

  equipment:
    type: enum
    values:
      - barbell
      - dumbbell
      - bodyweight
      - cable
      - machine
      - kettlebell
      - band
      - none

  tracking:
    type: enum
    values:
      - weight_reps
      - reps_only
      - timed
      - distance
    default: weight_reps
---
