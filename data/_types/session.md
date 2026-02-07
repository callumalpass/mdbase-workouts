---
name: session
description: A completed workout session

match:
  folder: sessions

fields:
  date:
    type: string
    required: true
    description: The date this workout was performed (YYYY-MM-DD). This is the actual date the session took place, not the creation timestamp of the file.

  exercises:
    type: list
    description: List of exercises performed with their actual sets/reps/weights.
    items:
      type: object
      fields:
        exercise:
          type: link
          description: Link to an exercise definition in data/exercises/.
        sets:
          type: list
          description: Each set performed for this exercise, in order.
          items:
            type: object
            fields:
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

  duration_minutes:
    type: number
    description: Total duration of the session in minutes, from warm-up to finish.

  plan:
    type: link
    description: Link to the plan that this session was based on, if any. Leave empty for unplanned/ad-hoc sessions.

  rating:
    type: number
    min: 1
    max: 5
    description: Subjective session rating from 1 (terrible) to 5 (great).

  notes:
    type: string
    description: General notes about how the session went (e.g. energy level, injuries, PRs).
---

## Session

A session records a **completed workout** — what was actually performed. The `date` field is the date the workout happened (YYYY-MM-DD), not a file creation timestamp.

Sessions may be linked to a **plan** (if the workout was pre-planned) or standalone (for ad-hoc workouts). Each exercise entry contains the actual sets performed with real weights/reps/durations.

The filename should use the format `YYYYMMDDTHHmmss.md` based on when the session started.
