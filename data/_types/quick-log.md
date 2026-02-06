---
name: quick-log
description: A quick single-exercise log entry

match:
  folder: quick-logs

fields:
  exercise:
    type: link
    required: true

  reps:
    type: number

  weight:
    type: number

  duration_seconds:
    type: number

  distance:
    type: number

  logged_at:
    type: string

  notes:
    type: string
---
