---
kind: mdbase.type
name: profile
version: 1
description: Narrative workout profile metadata.
match:
  path_glob: my-profile.md
schema:
  dialect: json-schema-2020-12
  value:
    $schema: https://json-schema.org/draft/2020-12/schema
    type: object
    additionalProperties: true
    properties:
      type:
        const: profile
      created:
        type: string
        format: date
      last_updated:
        type: string
        format: date
---


# Profile

Metadata for the narrative workout profile stored at the collection root.
