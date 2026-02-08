---
name: plan-template
description: A reusable workout template for quick-starting sessions

match:
  folder: plan-templates

fields:
  title:
    type: string
    required: true
    description: Short descriptive title for this template (e.g. "Minimum Session", "Bench Day").

  exercises:
    type: list
    description: Ordered list of exercises in this template, with optional targets.
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
          type: string
          description: Target reps per set. Can be a number ("8"), range ("10-12"), or descriptor ("AMRAP").
        target_weight:
          type: number
          description: Target weight in kg. When absent, the session logger pre-fills from last-used weight.
        notes:
          type: string
          description: Per-exercise notes (e.g. "go slow on eccentric").

  notes:
    type: string
    description: General notes about this template.
---

## Plan Template

A plan template is a **reusable workout blueprint** that appears on the Today tab as a quick-start button. Tapping "Start" opens the session logger directly — no date scheduling or intermediate plan creation.

Sessions logged from templates are standalone (no plan link). Weight pre-fill uses the `lastUsed` localStorage mechanism when `target_weight` is omitted.
