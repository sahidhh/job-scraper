# API Reference

## 1. Server Actions

All server actions are defined with `"use server"` and return `ActionResult<T>`:

```typescript
type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string }
```

Actions **never throw** to the client. On success they call `revalidatePath()` to refresh RSC cache.

---

### Jobs & Status

#### `setJobStatusAction(jobId, statusId)`
**File:** `src/features/jobs/actions.ts`  
**Description:** Assigns a workflow status to a single job. Upserts `job_state` row.

| Param | Type | Description |
|---|---|---|
| jobId | string (UUID) | Target job ID |
| statusId | string (UUID) | Target status ID |

**Returns:** `ActionResult<undefined>`

---

#### `setJobStatusBulkAction(jobIds, statusId)`
**File:** `src/features/jobs/actions.ts`  
**Description:** Assigns the same workflow status to multiple jobs in one operation.

| Param | Type | Description |
|---|---|---|
| jobIds | string[] | Array of job UUIDs |
| statusId | string (UUID) | Target status ID |

**Returns:** `ActionResult<undefined>`

---

#### `createStatusAction(label, color)`
**File:** `src/features/jobs/actions.ts`  
**Description:** Creates a new workflow status.

| Param | Type | Description |
|---|---|---|
| label | string | Display label |
| color | string | CSS color string (e.g. `#22c55e`) |

**Returns:** `ActionResult<JobStatus>`

---

#### `updateStatusAction(id, label, color)`
**File:** `src/features/jobs/actions.ts`  
**Description:** Updates an existing workflow status label and/or color.

| Param | Type | Description |
|---|---|---|
| id | string (UUID) | Status to update |
| label | string | New label |
| color | string | New color |

**Returns:** `ActionResult<JobStatus>`

---

#### `deleteStatusAction(id)`
**File:** `src/features/jobs/actions.ts`  
**Description:** Deletes a workflow status. Fails if any job_state rows reference it.

| Param | Type | Description |
|---|---|---|
| id | string (UUID) | Status to delete |

**Returns:** `ActionResult<undefined>`

---

### Resume

#### `uploadResumeAction(formData)`
**File:** `src/features/resume/actions.ts`  
**Description:** Uploads a PDF resume, extracts text and skills, and sets it as the active resume via `set_active_resume` RPC.

| Param | Type | Description |
|---|---|---|
| formData | FormData | Must contain `file` key with PDF blob |

**Returns:** `ActionResult<Resume>`

---

#### `updateSkillsAction(skills)`
**File:** `src/features/resume/actions.ts`  
**Description:** Overrides the skills list on the currently active resume.

| Param | Type | Description |
|---|---|---|
| skills | string[] | Full replacement skill list |

**Returns:** `ActionResult<Resume>`

---

### Roles

#### `expandRoleAction(primaryRole)`
**File:** `src/features/roles/actions.ts`  
**Description:** Looks up or generates expanded roles for the given primary role. Cache-first: checks `role_expansion_map`; on miss, calls OpenRouter and caches the result.

| Param | Type | Description |
|---|---|---|
| primaryRole | string | User's primary target role |

**Returns:** `ActionResult<{ primaryRole: string; expandedRoles: string[] }>`

---

#### `setActiveRoleSelectionAction(primaryRole, expandedRoles)`
**File:** `src/features/roles/actions.ts`  
**Description:** Atomically creates a new role_selection and deactivates the previous one via `set_active_role_selection` RPC.

| Param | Type | Description |
|---|---|---|
| primaryRole | string | Primary role label |
| expandedRoles | string[] | Related roles to include in matching |

**Returns:** `ActionResult<RoleSelection>`

---

#### `getRolePacksAction()`
**File:** `src/features/roles/actions.ts`  
**Description:** Returns all seeded role packs with their ordered role lists.

**Returns:** `ActionResult<RolePack[]>`

---

#### `activateRolePackAction(packId)`
**File:** `src/features/roles/actions.ts`  
**Description:** Loads the pack's roles from `role_pack_roles` and calls `set_active_role_selection` with the pack name as `primary_role`. Revalidates `/dashboard` and `/roles`.

| Param | Type | Description |
|---|---|---|
| packId | string (UUID) | ID of the role pack to activate |

**Returns:** `ActionResult<RoleSelection>`

---

### Companies

#### `setCompanyAction(name, source, boardToken)`
**File:** `src/features/companies/actions.ts`  
**Description:** Creates or updates a company board-token configuration.

| Param | Type | Description |
|---|---|---|
| name | string | Company display name |
| source | `"greenhouse" \| "lever" \| "ashby"` | ATS type |
| boardToken | string | ATS board token |

**Returns:** `ActionResult<Company>`

---

#### `deleteCompanyAction(id)`
**File:** `src/features/companies/actions.ts`  
**Description:** Soft-deletes a company (sets `active = false`). Company's jobs remain in the database.

| Param | Type | Description |
|---|---|---|
| id | string (UUID) | Company to deactivate |

**Returns:** `ActionResult<undefined>`

---

### Settings

#### `setDesiredExperienceAction(years)`
**File:** `src/features/settings/actions.ts`  
**Description:** Stores the user's desired experience range in `app_settings`.

| Param | Type | Description |
|---|---|---|
| years | `{ min: number; max: number }` | Target experience range |

**Returns:** `ActionResult<undefined>`

---

### Notification Preferences

#### `getNotificationPreferencesAction()`
**File:** `src/features/notifications/actions.ts`  
**Description:** Returns the current notification filter preferences, or `null` if none are set (notify-all behaviour).

**Returns:** `ActionResult<NotificationPreferences | null>`

---

#### `setNotificationPreferencesAction(prefs)`
**File:** `src/features/notifications/actions.ts`  
**Description:** Persists notification filter preferences. Pass `null` to clear preferences and revert to notify-all. Filters are include-only; each specified filter must pass (AND logic), with any single match within a filter sufficient (OR logic).

| Param | Type | Description |
|---|---|---|
| prefs | `NotificationPreferences \| null` | Preferences to save, or null to clear |

`NotificationPreferences`:

| Field | Type | Description |
|---|---|---|
| `roles` | `string[]` (optional) | Title must contain at least one (case-insensitive substring) |
| `skills` | `string[]` (optional) | Description must match at least one skill (canonical or alias from dictionary) |
| `locations` | `LocationTag[]` (optional) | `locationTags` must include at least one |
| `minExperience` | `number` (optional) | `min_years` must be ≥ this; null `min_years` always passes |
| `maxExperience` | `number` (optional) | `min_years` must be ≤ this; null `min_years` always passes |
| `sources` | `JobSource[]` (optional) | Source must be one of these |

**Returns:** `ActionResult<undefined>`

---

## 2. Next.js App Routes

| Route | Method | Auth | Description |
|---|---|---|---|
| `/login` | GET | Public | Login page |
| `/auth/callback` | GET | Public | Supabase OAuth callback |
| `/dashboard` | GET | Required | Job table page |
| `/roles` | GET | Required | Role selection page |
| `/resume` | GET | Required | Resume management page |
| `/settings` | GET | Required | Company config + status management |
| `/analytics` | GET | Required | Analytics charts |
| `/insights` | GET | Required | Skill gap + demand insights |

All routes except `/login` and `/auth/callback` are protected by `middleware.ts` which redirects unauthenticated requests to `/login`.

---

## 3. External APIs

### 3.1 OpenRouter Chat Completions

**Endpoint:** `POST https://openrouter.ai/api/v1/chat/completions`  
**Auth:** `Authorization: Bearer <OPENROUTER_API_KEY>`  
**Timeout:** 15 seconds  
**Retry:** 1 retry on 5xx / 429 / timeout, 2s delay

**Request (AI Scoring):**
```json
{
  "model": "<OPENROUTER_MODEL>",
  "messages": [
    { "role": "system", "content": "You are a job relevance scorer..." },
    { "role": "user", "content": "<job + resume context>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "job_score",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "score": { "type": "number" },
          "reasoning": { "type": "string" }
        },
        "required": ["score", "reasoning"]
      }
    }
  }
}
```

**Response:** JSON `{ score: number [0-1], reasoning: string }`

**Request (Role Expansion):**
```json
{
  "model": "<OPENROUTER_MODEL>",
  "messages": [
    { "role": "system", "content": "You expand job roles..." },
    { "role": "user", "content": "Expand: <primaryRole>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "role_expansion",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "relatedRoles": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["relatedRoles"]
      }
    }
  }
}
```

**Response:** JSON `{ relatedRoles: string[] }`

---

### 3.2 Telegram Bot API

**Endpoint:** `POST https://api.telegram.org/bot<token>/sendMessage`  
**Rate limit:** ~30 msg/s globally; 20 msg/min per chat; `retry_after` respected (capped 30s)

**Request — plain message:**
```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "<HTML-formatted message>",
  "parse_mode": "HTML"
}
```

**Request — message with inline keyboard (`sendMessageWithButtons`):**
```json
{
  "chat_id": "<TELEGRAM_CHAT_ID>",
  "text": "<HTML-formatted message>",
  "parse_mode": "HTML",
  "disable_web_page_preview": true,
  "reply_markup": {
    "inline_keyboard": [
      [{ "text": "Apply #1", "url": "https://..." }, { "text": "Apply #2", "url": "https://..." }],
      [{ "text": "\u2713 Worth Reviewing (4)", "url": "https://app.example.com/api/telegram/worth-reviewing?msg=...&token=..." }],
      [{ "text": "\ud83d\udcca Dashboard", "url": "https://app.example.com/dashboard?minScore=0.80" }]
    ]
  }
}
```

**Message format — individual mode (`NOTIFY_MODE=individual`, default):**
```
🎯 New match (92%)
Senior Backend Engineer @ Stripe
📍 Singapore
Strong match — candidate's Node.js, PostgreSQL, and distributed systems experience aligns well with the role requirements.
https://boards.greenhouse.io/stripe/jobs/...
```

**Message format — digest MVP mode (`NOTIFY_MODE=digest`):**
```
📌 Job Matches

⭐ Strong Match: 2   ✓ Worth Reviewing: 3

Showing Top 2 Strong Match(es):

1. Senior Backend Engineer @ Stripe
   📍 Singapore | 3+ yrs

2. Staff Engineer @ Shopify
   📍 Remote
```

Inline keyboard buttons are attached to this single message. No text splitting — the digest
always fits in one Telegram message (top-5 display limit).

**Message format — legacy digest mode (`NOTIFY_MODE=digest_legacy`):**
```
📋 Jobs Digest

High Match (≥85%)

🎯 92% — Senior Backend Engineer @ Stripe
📍 Singapore · https://boards.greenhouse.io/stripe/jobs/...

Medium Match

🎯 78% — Full Stack Developer @ Shopify
📍 Remote · https://example.com/shopify/jobs/789

Summary

2 jobs processed
1 high-value job
```

Legacy digest messages longer than 4 096 characters are split into multiple sequential sends.

---

### 3.3 Telegram Callback Route

**Endpoint:** `GET /api/telegram/worth-reviewing`  
**Auth:** `?token=<TELEGRAM_CALLBACK_SECRET>` query param  
**Runtime:** Node.js (`Buffer` required for base64url decode)

| Param | Description |
|---|---|
| `msg` | base64url-encoded pre-formatted Telegram HTML of worth-reviewing jobs |
| `token` | must equal `TELEGRAM_CALLBACK_SECRET` env var |

**Success (200):** HTML page — `✓ Worth Reviewing jobs sent to Telegram.`  
**Error (400):** Missing params or decode failure  
**Error (401):** Token mismatch  
**Error (502):** Telegram API call failed

---

### 3.3 ATS Board APIs

#### Greenhouse
**Endpoint:** `GET https://boards-api.greenhouse.io/v1/boards/<board_token>/jobs`  
**Auth:** None (public)  
**Returns:** `{ jobs: GreenhouseJob[] }`

#### Lever
**Endpoint:** `GET https://api.lever.co/v0/postings/<board_token>`  
**Auth:** None (public)  
**Returns:** `LeverPosting[]`

#### Ashby
**Endpoint:** `POST https://api.ashbyhq.com/posting-api/job-board/<board_token>`  
**Auth:** None (public)  
**Returns:** `{ jobPostings: AshbyPosting[] }`

#### Wellfound (Feed)
**Endpoint:** `GET <WELLFOUND_FEED_URL>`  
**Auth:** None (custom feed URL contains auth token)  
**Returns:** JSON feed of job listings

#### RemoteOK
**Endpoint:** `GET https://remoteok.com/api`  
**Auth:** None (public)  
**Returns:** `RemoteOkJob[]` (RSS-style JSON)

#### MyCareersFuture
**Endpoint:** `GET https://api.mycareersfuture.gov.sg/v2/jobs`  
**Auth:** None (public)  
**Query params:** `search`, `limit`, `page`

---

## 4. Supabase RPC Functions

### `set_active_resume`
```sql
SELECT * FROM set_active_resume(
  p_file_path   TEXT,
  p_parsed_text TEXT,
  p_skills      TEXT[]
) RETURNS resumes
```
Atomically deactivates all resumes and inserts a new active one.

### `set_active_role_selection`
```sql
SELECT * FROM set_active_role_selection(
  p_primary_role    TEXT,
  p_expanded_roles  TEXT[]
) RETURNS role_selections
```
Atomically deactivates all role_selections and inserts a new active one.

---

## 5. Shared HTTP Utility

**File:** `src/shared/infrastructure/http.ts`

```typescript
fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: {
    retries?: number      // default: 1
    retryDelay?: number   // default: 2000 ms
    retryOn429?: boolean  // default: true
  }
): Promise<Response>
```

Retries on: network errors, HTTP 5xx, HTTP 429 (unless `retryOn429: false`).  
Used by all scrapers and external API clients.
