---
name: plan
description: A scheduled workout plan

match:
  folder: plans

fields:
  date:
    type: string
    required: true

  title:
    type: string
    required: true

  exercises:
    type: list
    items:
      type: object
      fields:
        exercise:
          type: link
        target_sets:
          type: number
        target_reps:
          type: number
        target_weight:
          type: number
        notes:
          type: string

  status:
    type: enum
    values:
      - scheduled
      - completed
      - skipped
    default: scheduled

  session:
    type: link

  notes:
    type: string
---
