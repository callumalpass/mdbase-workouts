---
kind: mdbase.type
name: plan-template
version: 1
description: A reusable workout template for quick-starting sessions
match:
  path_glob: plan-templates/**
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: plan-template
      title:
        type: string
        description: Short descriptive title for this template (e.g. "Minimum Session", "Bench Day").
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
                Target reps per set. Can be a number ("8"), range ("10-12"), or descriptor
                ("AMRAP").
            target_weight:
              type: number
              description: >-
                Target weight in kg. When absent, the session logger pre-fills from last-used
                weight.
            notes:
              type: string
              description: Per-exercise notes (e.g. "go slow on eccentric").
        description: Ordered list of exercises in this template, with optional targets.
      notes:
        type: string
        description: General notes about this template.
    required:
      - title
collection:
  display:
    name_field: title
  links:
    exercises[].exercise:
      target_type: any
      validate_exists: false
x-mdbase-workouts:
  contract: mdbase.workouts.plan-template
  version: 1
---


## Plan Template

A plan template is a **reusable workout blueprint** that appears on the Today tab as a quick-start button. Tapping "Start" opens the session logger directly — no date scheduling or intermediate plan creation.

Sessions logged from templates are standalone (no plan link). Weight pre-fill uses the `lastUsed` localStorage mechanism when `target_weight` is omitted.
