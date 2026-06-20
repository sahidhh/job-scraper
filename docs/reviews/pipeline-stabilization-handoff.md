# Job Scraper Stabilization Handoff

## Objective

Stabilize the scrape → score → notify pipeline and eliminate operational failures.

---

## Problems Addressed

### Scoring Loop

Issue:

Jobs below the keyword gate stored:

```
ai_score = null
```

and were repeatedly reprocessed every scoring run.

Fix:

Jobs are now considered completed when:

- `ai_score IS NOT NULL`  
  OR  
- `keyword_score < threshold`

Retry behavior remains intact for genuine AI failures.

---

### findUnscored Regression

Issue:

After the scoring-loop fix, the completed-job set grew significantly.

The previous implementation generated a large `NOT IN` UUID list that eventually caused score pipeline failures.

Fix:

`findUnscored` now:

1. Fetches completed IDs
2. Fetches candidate IDs
3. Computes set difference in memory
4. Fetches eligible jobs using chunked `IN` queries

Benefits:

- Bounded URL size
- Preserves retry behavior
- No schema changes
- Easy rollback

---

### Wellfound

Issue:

Unconfigured deployments produced noisy invalid configuration warnings.

Fix:

Three states:

- `disabled`
- `invalid_config`
- `active`

Unset `WELLFOUND_FEED_URL` is treated as disabled.

---

### Source Validation

Added:

- ATS validation framework
- Greenhouse validation
- Lever validation
- Ashby validation

Validation statuses:

- `healthy`
- `redirected`
- `not_found`
- `unauthorized`
- `rate_limited`
- `unknown`

---

### Source Health Tracking

Added:

- Source health reporting
- Validation workflow
- Source inventory visibility

Purpose:

Identify stale ATS board mappings and dead sources before they impact scraping.

---

### Auto-Disable Framework

Added automatic handling for unhealthy sources.

Purpose:

Prevent noisy failures from permanently broken ATS configurations.

---

### OpenRouter Scoring

Added:

```
job_scores.model
```

Purpose:

Track which model generated each score.

Supports:

- Analytics
- Debugging
- Model migration auditing

---

### Telegram Notifications

Issue:

Large notification volume caused Telegram rate limiting.

Fix:

Digest-based notifications.

Features:

- Strong Match grouping
- Worth Reviewing grouping
- Top-N presentation
- Inline apply buttons
- Dashboard link
- Reduced API call volume

---

## Current State

Pipeline:

```
scrape → score → notify
```

Status: **Stable.**

---

## Recommended Future Work

**Priority 1**

- Improve source coverage
- Remove stale ATS mappings
- Periodically review validation reports

**Priority 2**

- Dashboard deep-linking
- Notification pagination
- Notification personalization

**Priority 3**

- Scoring analytics
- Source performance analytics
- Historical trend reporting

---

## Verification

All stabilization workstreams audited and verified in:

`docs/reviews/project-completion-audit.md`
