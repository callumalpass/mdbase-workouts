---
kind: mdbase.type
name: plan
version: 1
description: A scheduled workout plan
match:
  path_glob: plans/**
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: plan
      date:
        type: string
        description: >-
          The intended date for this workout (YYYY-MM-DD). This is NOT the creation date — it is the
          date the workout is scheduled/planned for.
      title:
        type: string
        description: Short descriptive title for the workout (e.g. "Full Body", "Push Day").
      exercises:
        type: array
        items:
          type: object
          additionalProperties: false
          properties:
            exercise:
              type: string
              description: Link to an exercise definition in data/exercises/.
            target_sets:
              type: number
              description: Number of sets to aim for.
            target_reps:
              oneOf:
                - type: string
                - type: number
              description: >-
                Target reps per set. Can be a number-like string ("8"), range ("10-12"), or
                descriptor ("AMRAP").
            target_weight:
              type: number
              description: Target weight in kg.
            notes:
              type: string
              description: Per-exercise notes (e.g. "go slow on eccentric").
        description: Ordered list of exercises planned for this workout, with optional targets.
      status:
        enum:
          - scheduled
          - completed
          - skipped
        description: >-
          Current status of this plan. Starts as "scheduled", set to "completed" once a session is
          recorded or "skipped" if the workout was missed.
        default: scheduled
      session:
        type: string
        description: >-
          Link to the session record created when this plan was executed. Empty until the workout is
          done.
      notes:
        type: string
        description: General notes about the plan (e.g. goals, how you're feeling, modifications).
    required:
      - date
      - title
collection:
  display:
    name_field: title
  read_defaults:
    status: scheduled
  links:
    exercises[].exercise:
      target_type: any
      validate_exists: false
    session:
      target_type: any
      validate_exists: false
---


## Plan

A plan represents a **scheduled workout** for a specific future (or today's) date. The `date` field is the date the workout is intended for, not when the plan file was created.

When a plan is executed, a corresponding **session** record should be created and linked back via the `session` field, and the plan's `status` should be set to `completed`.
