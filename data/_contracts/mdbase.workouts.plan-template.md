---
kind: mdbase.contract
contract_type: record
id: mdbase.workouts.plan-template
version: 1.0.0
name: Workout plan template
description: A reusable workout blueprint.
record_schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: false
    properties:
      title:
        type: string
        description: Short descriptive title for the template.
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
        description: Ordered exercises in the template.
      notes:
        type: string
        description: General notes about the template.
    required:
      - title
---

# Workout plan template

This contract lets workout applications share reusable session blueprints.
