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
    description: Display name of the exercise (e.g. "Bench Press", "Pull-Up").

  muscle_groups:
    type: list
    description: Primary muscle groups targeted (e.g. "chest", "quads", "lats").
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
    description: The type of equipment required for this exercise.

  tracking:
    type: enum
    values:
      - weight_reps
      - reps_only
      - timed
      - distance
    default: weight_reps
    description: How this exercise is tracked. Determines which fields are relevant in session sets — "weight_reps" uses weight+reps, "reps_only" uses reps, "timed" uses duration_seconds, "distance" uses distance.
---

## Exercise

An exercise definition describes **what** an exercise is and **how** it should be tracked. These are referenced by plans and sessions via links.

The `tracking` field controls which set fields are relevant when logging this exercise:
- **weight_reps**: log `weight` and `reps` per set (e.g. bench press, squat)
- **reps_only**: log `reps` only (e.g. push-ups, pull-ups)
- **timed**: log `duration_seconds` (e.g. plank, wall sit)
- **distance**: log `distance` (e.g. running, cycling)
