---
name: meta
description: >
  Schema for type definition files. Each markdown file in the types folder
  defines a type with match rules, field definitions, and validation settings.

match:
  path_glob: "_types/**/*.md"

strict: false

fields:
  name:
    type: string
    required: true
    description: >
      Type name. Must be lowercase alphanumeric with hyphens/underscores,
      matching pattern ^[a-z][a-z0-9_-]{0,63}$. Cannot be "file", "formula",
      or "this". Should match the filename without extension.

  description:
    type: string
    description: Human-readable description of the type's purpose.

  version:
    type: integer
    description: Positive integer for schema versioning (informational only).

  extends:
    type: string
    description: >
      Parent type name for inheritance. Child inherits fields, strictness,
      display_name_key, path_pattern, and match rules from parent. Child
      properties fully override (no merging) when explicitly set.

  strict:
    type: enum
    values: ["true", "false", "warn"]
    description: >
      Validation strictness for unknown fields. "true" rejects unknown fields,
      "warn" allows but warns, "false" allows silently. Inherited from parent
      if not set, otherwise falls back to settings.default_strict.

  display_name_key:
    type: string
    description: >
      Field name to use as human-readable label for files of this type.
      Falls back to file.basename if missing or empty. Inherited from parent.

  match:
    type: object
    description: >
      Rules for automatically matching files to this type. All conditions
      are combined with AND logic. Only path_glob, fields_present, and where
      are valid — other properties are silently ignored.
    fields:
      path_glob:
        type: string
        description: >
          Glob pattern matched against file paths relative to collection root.
          Supports * (any chars except /), ** (any chars including /), and ?
          (single char). Example: "plans/**".
      fields_present:
        type: list
        description: >
          List of frontmatter field names that must all be present and non-null
          for a file to match this type.
      where:
        type: object
        description: >
          Field-value conditions that must all match. Keys are field names,
          values are either direct values (exact equality) or operator objects
          with keys like eq, neq, gt, gte, lt, lte, contains, containsAll,
          containsAny, startsWith, endsWith, matches, exists. Computed fields
          are not available for matching.

  path_pattern:
    type: string
    description: >
      Pattern for validating and generating file paths. Uses {fieldName}
      placeholders. Cannot reference computed fields or file.* generated
      fields.

  filename_pattern:
    type: string
    deprecated: true
    description: Deprecated alias for path_pattern. Use path_pattern instead.

  fields:
    type: any
    description: >
      Mapping of field names to field definitions. Each field definition is an
      object with: type (required — string, integer, number, boolean, date,
      datetime, time, enum, list, object, link, any), required (boolean),
      default (value), description (string), deprecated (boolean), unique
      (boolean), computed (expression string, mutually exclusive with required/
      default/generated), generated (strategy — "ulid", "uuid", "sequence",
      "now", "now_on_write", or object with random/sequence/from+transform).
      Type-specific constraints: string (min_length, max_length, pattern),
      integer/number (min, max), enum (values — required, non-empty string
      list), list (items — required field definition, min_items, max_items,
      unique), object (fields — required nested field mapping), link (target
      type name, validate_exists).
---
