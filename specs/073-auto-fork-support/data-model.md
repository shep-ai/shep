# Data Model: auto-fork-support

> Entity definitions for 073-auto-fork-support

## Status

- **Phase:** Planning
- **Updated:** 2026-03-20

## Overview

{{DATA_MODEL_OVERVIEW}}

## New Entities

### {{ENTITY_NAME}}

**Location:** `tsp/domain/entities/{{entity-name}}.tsp`

| Property      | Type          | Required     | Description   |
| ------------- | ------------- | ------------ | ------------- |
| {{PROP_NAME}} | {{PROP_TYPE}} | {{REQUIRED}} | {{PROP_DESC}} |

**Relationships:**

- {{RELATIONSHIP_1}}

## Modified Entities

### {{EXISTING_ENTITY}}

**Changes:**

- Add: {{NEW_PROPERTY}}
- Modify: {{MODIFIED_PROPERTY}}

## Value Objects

### {{VALUE_OBJECT_NAME}}

**Location:** `tsp/domain/value-objects/{{value-object}}.tsp`

| Property    | Type        | Description |
| ----------- | ----------- | ----------- |
| {{VO_PROP}} | {{VO_TYPE}} | {{VO_DESC}} |

## Enums

### {{ENUM_NAME}}

**Location:** `tsp/common/enums/{{enum-name}}.tsp`

| Value          | Description   |
| -------------- | ------------- |
| {{ENUM_VALUE}} | {{ENUM_DESC}} |

<!-- If no data model changes, replace all with:
## Overview
No domain model changes required for this feature.
-->

---

_Data model changes for TypeSpec compilation_
