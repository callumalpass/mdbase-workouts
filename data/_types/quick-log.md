---
kind: mdbase.type
name: quick-log
version: 1
description: A quick single-exercise log entry
match:
  path_glob: quick-logs/**
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: quick-log
      exercise:
        type: string
        description: Link to the exercise definition in data/exercises/.
      reps:
        type: number
        description: Number of reps performed (for weight_reps or reps_only exercises).
      weight:
        type: number
        description: Weight used in kg (for weight_reps exercises).
      duration_seconds:
        type: number
        description: Duration in seconds (for timed exercises).
      distance:
        type: number
        description: Distance covered (for distance exercises).
      logged_at:
        type: string
        description: >-
          ISO 8601 timestamp of when this was logged (e.g. "2026-02-06T10:48:15"). This is the
          moment the exercise was performed/recorded.
      notes:
        type: string
        description: Optional notes about this log entry.
    required:
      - exercise
collection:
  links:
    exercise:
      target_type: any
      validate_exists: false
implements:
  - contract: mdbase.workouts.quick-log
    version: 1.0.0
    fields:
      exercise: exercise
      reps: reps
      weight: weight
      duration_seconds: duration_seconds
      distance: distance
      logged_at: logged_at
      notes: notes
---


## Quick Log

A quick log is a lightweight way to record a **single exercise** without creating a full session. Useful for tracking one-off sets (e.g. "just did 20 push-ups") outside of a structured workout.

Only fill in the fields relevant to the exercise's `tracking` type — e.g. don't set `weight` for a bodyweight-only exercise.

The filename should use the format `YYYYMMDDTHHmmss.md` based on when the exercise was logged.
