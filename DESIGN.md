---
name: MDBase Workouts
description: A simple, minimal, bookish workout ledger for local markdown training records.
colors:
  paper: "oklch(93.5% 0.018 78)"
  card: "oklch(97% 0.014 78)"
  ink: "oklch(24% 0.018 63)"
  faded: "oklch(59% 0.018 63)"
  rule: "oklch(84% 0.016 74)"
  blush: "oklch(62% 0.16 14)"
  ocean: "oklch(48% 0.17 265)"
  sage: "oklch(58% 0.095 145)"
  amber: "oklch(69% 0.14 78)"
typography:
  display:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "0"
  title:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "0"
  body:
    fontFamily: "Fraunces, Georgia, serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0"
  label:
    fontFamily: "IBM Plex Mono, Consolas, monospace"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "0.15em"
rounded:
  none: "0"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.blush}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1rem"
  card-ledger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "1rem"
  input-default:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1rem"
---

# Design System: MDBase Workouts

## 1. Overview

**Creative North Star: "The Training Ledger"**

MDBase Workouts should feel like a pocket training ledger, field notebook, or library index that happens to run in the browser. It is simple, minimal, and bookish, but not bland. The system gets its character from paper tone, ruled structure, serif type, mono annotations, compact density, and brief stamp-like success moments.

This is a product interface. The work is logging, planning, and reviewing training, so speed and trust matter more than spectacle. The interface should stay quiet during the workout and become richer when reviewing the long-term record.

Key characteristics:

- Warm paper surfaces with ink-like text.
- Full hairline borders and tiny ledger marks, not side stripes.
- Sparse semantic color for selection, state, and record categories.
- Dense but readable mobile-first layouts.
- Short, concrete copy with no pep-talk tone.

## 2. Colors

The palette is restrained: warm neutrals carry the app, while blush, ocean, sage, and amber appear as small record-keeping marks.

### Primary

- **Ledger Blush** (`oklch(62% 0.16 14)`): primary action, selected navigation, important active states, PR markers.

### Secondary

- **Archive Ocean** (`oklch(48% 0.17 265)`): templates, secondary categorization, remembered prior sets.
- **Steady Sage** (`oklch(58% 0.095 145)`): completed work, progress, durable positive state.

### Tertiary

- **Margin Amber** (`oklch(69% 0.14 78)`): caution, cheat-day annotations, small attention states.

### Neutral

- **Warm Paper** (`oklch(93.5% 0.018 78)`): app background and quiet inputs.
- **Lifted Page** (`oklch(97% 0.014 78)`): cards, sheets, and grouped entries.
- **Ink** (`oklch(24% 0.018 63)`): primary text.
- **Faded Ink** (`oklch(59% 0.018 63)`): metadata and secondary labels.
- **Rule Line** (`oklch(84% 0.016 74)`): borders, dividers, grids, and chart guides.

Named rules:

- **The 10 Percent Rule.** Color is an annotation, not a background mood. Any one screen should stay mostly paper and ink.
- **The No Side Stripe Rule.** Use full borders, background tints, or small ledger marks. Do not use colored left or right stripes on cards or sections.

## 3. Typography

**Display Font:** Fraunces with Georgia fallback.
**Body Font:** Fraunces with Georgia fallback.
**Label/Mono Font:** IBM Plex Mono with Consolas fallback.

Character: serif text gives the product its bookish tone, while mono annotations make dates, counts, targets, and statuses feel like catalog metadata. Keep the scale fixed and practical. Do not use viewport-scaled type in dense app surfaces.

### Hierarchy

- **Display** (700, `2.25rem`, 1.1): screen titles such as Today, Calendar, and History.
- **Title** (600, `1.125rem`, 1.25): sheet titles and card headings.
- **Body** (400, `1rem`, 1.5): prose, notes, and normal UI text.
- **Compact Body** (400 to 600, `0.875rem`, 1.4): rows, set data, and card contents.
- **Label** (400, `0.625rem` to `0.75rem`, wide tracking, uppercase when useful): dates, metadata, tags, operational labels.

Named rules:

- **Numbers Use Mono.** Counts, set values, dates, times, and targets should use the mono stack.
- **Bookish, Not Literary.** The UI can feel editorial, but labels must stay short and operational.

## 4. Elevation

The app is flat by design. Depth comes from tonal layering, borders, overlays, and sheet position rather than shadows. Cards are lifted pages, not floating panels.

Use:

- `paper` for the base page.
- `card` for grouped entries, sheet footers, and record surfaces.
- `rule` for separation and chart structure.
- Modal and sheet scrims with `ink` at low opacity.

Avoid decorative shadows, glass blur, and nested cards.

## 5. Components

- **Ledger Card:** full hairline border, `card` background, square corners, compact padding. Accent variants use full border color plus a 5 to 10 percent tint.
- **Section Title:** small italic serif label with a tiny diamond ledger mark. The mark carries section color; the text remains quiet.
- **Bottom Nav:** three tabs only. Active state uses blush text and a precise top rule.
- **Primary Button:** solid blush or ocean, paper text, square corners, short active transform.
- **Secondary Button:** paper or card background, rule border, faded text, active paper/card tint.
- **Input:** paper background, rule border, visible focus ring, labels outside the field.
- **Sheet:** bottom-aligned paper surface with top rule and drag handle. Use for quick, focused creation flows.
- **Full Logger:** full-screen workbook with persistent progress and exercise tabs.
- **Success Stamp:** brief tactile confirmation for saved/logged/created states. It should feel like a stamp, not a celebration system.

## 6. Do's and Don'ts

Do:

- Keep the app smaller after major passes.
- Use full borders, tints, and small marks for state.
- Keep labels short and concrete.
- Preserve touch targets on mobile.
- Respect reduced motion.
- Use empty states as quiet first-action prompts.

Don't:

- Add chat, social, coaching, badge, or feed energy.
- Use motivational copy, exclamation points, neon gym styling, or glossy fitness tropes.
- Use colored side stripes on cards or section labels.
- Use pure white or pure black for core UI surfaces.
- Add decorative motion that does not communicate state.
- Hide core logging actions behind cleverness.
