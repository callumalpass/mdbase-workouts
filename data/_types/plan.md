---
name: plan
description: A scheduled workout plan

match:
  folder: plans

fields:
  date:
    type: string
    required: true
    description: The intended date for this workout (YYYY-MM-DD). This is NOT the creation date — it is the date the workout is scheduled/planned for.

  title:
    type: string
    required: true
    description: Short descriptive title for the workout (e.g. "Full Body", "Push Day").

  exercises:
    type: list
    description: Ordered list of exercises planned for this workout, with optional targets.
    items:
      type: object
      fields:
        exercise:
          type: link
          description: Link to an exercise definition in data/exercises/.
        target_sets:
          type: number
          description: Number of sets to aim for.
        target_reps:
          type: number
          description: Number of reps per set to aim for.
        target_weight:
          type: number
          description: Target weight in kg.
        notes:
          type: string
          description: Per-exercise notes (e.g. "go slow on eccentric").

  status:
    type: enum
    values:
      - scheduled
      - completed
      - skipped
    default: scheduled
    description: Current status of this plan. Starts as "scheduled", set to "completed" once a session is recorded or "skipped" if the workout was missed.

  session:
    type: link
    description: Link to the session record created when this plan was executed. Empty until the workout is done.

  notes:
    type: string
    description: General notes about the plan (e.g. goals, how you're feeling, modifications).
---

## Plan

A plan represents a **scheduled workout** for a specific future (or today's) date. The `date` field is the date the workout is intended for, not when the plan file was created.

When a plan is executed, a corresponding **session** record should be created and linked back via the `session` field, and the plan's `status` should be set to `completed`.
