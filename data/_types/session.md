---
kind: mdbase.type
name: session
version: 1
description: A completed workout session
match:
  path_glob: sessions/**
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: session
      date:
        type: string
        description: >-
          The date this workout was performed (YYYY-MM-DD). This is the actual date the session took
          place, not the creation timestamp of the file.
      exercises:
        type: array
        items:
          type: object
          additionalProperties: false
          properties:
            exercise:
              type: string
              description: Link to an exercise definition in data/exercises/.
            sets:
              type: array
              items:
                type: object
                additionalProperties: false
                properties:
                  reps:
                    type: number
                    description: Number of reps completed in this set.
                  weight:
                    type: number
                    description: Weight used in kg.
                  duration_seconds:
                    type: number
                    description: Duration in seconds (for timed exercises like planks).
                  distance:
                    type: number
                    description: Distance covered (for distance exercises like running).
                  notes:
                    type: string
                    description: Notes for this specific set (e.g. "failed on last rep").
              description: Each set performed for this exercise, in order.
        description: List of exercises performed with their actual sets/reps/weights.
      duration_minutes:
        type: number
        description: Total duration of the session in minutes, from warm-up to finish.
      plan:
        type: string
        description: >-
          Link to the plan that this session was based on, if any. Leave empty for unplanned/ad-hoc
          sessions.
      rating:
        type: number
        description: Subjective session rating from 1 (terrible) to 5 (great).
        minimum: 1
        maximum: 5
      notes:
        type: string
        description: General notes about how the session went (e.g. energy level, injuries, PRs).
    required:
      - date
collection:
  links:
    exercises[].exercise:
      target_type: any
      validate_exists: false
    plan:
      target_type: any
      validate_exists: false
---


## Session

A session records a **completed workout** — what was actually performed. The `date` field is the date the workout happened (YYYY-MM-DD), not a file creation timestamp.

Sessions may be linked to a **plan** (if the workout was pre-planned) or standalone (for ad-hoc workouts). Each exercise entry contains the actual sets performed with real weights/reps/durations.

The filename should use the format `YYYYMMDDTHHmmss.md` based on when the session started.
