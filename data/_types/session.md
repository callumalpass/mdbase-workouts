---
name: session
description: A completed workout session

match:
  folder: sessions

fields:
  date:
    type: string
    required: true

  exercises:
    type: list
    items:
      type: object
      fields:
        exercise:
          type: link
        sets:
          type: list
          items:
            type: object
            fields:
              reps:
                type: number
              weight:
                type: number
              duration_seconds:
                type: number
              distance:
                type: number
              notes:
                type: string

  duration_minutes:
    type: number

  plan:
    type: link

  rating:
    type: number
    min: 1
    max: 5

  notes:
    type: string
---
