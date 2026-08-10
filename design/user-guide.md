# User Guide

## 1. Getting Started

### 1.1 Prerequisites

- A Supabase account (free tier is sufficient)
- A Vercel account (free tier is sufficient)
- A GitHub account (for CI/cron)
- A Telegram account + a bot created via @BotFather
- An OpenRouter account with API key

### 1.2 First-Time Setup

1. **Deploy the app** — follow `docs/deployment.md` for the full step-by-step guide
2. **Log in** — open the app URL and sign in with your Supabase Auth credentials
3. **Upload your resume** — go to `/resume` and upload your PDF or DOCX
4. **Set your target role** — go to `/roles` and enter your primary role
5. **Add company board tokens** — go to `/settings` and add Greenhouse/Lever/Ashby companies you want to monitor
6. **Trigger a scrape** — run the GitHub Actions workflow manually via `workflow_dispatch`

After the first scrape+score+notify run, your dashboard will show scored jobs and you may receive Telegram alerts.

### 1.3 Light and Dark Mode

The app follows your operating system's appearance setting on first load — no setup needed. To
override it, use the sun/moon button: in the **sidebar footer above Logout** on desktop, in the
**top-right of the header** on mobile.

Once you click it, your choice is remembered on that browser and the OS setting is ignored from then
on. It is stored per-browser, not in your account, so a different device starts by following that
device's OS again. To go back to following the OS, clear the site's stored data for this app.

There is no third "System" option in the button and no theme setting elsewhere in the app — the OS
*is* the default.

---

## 2. Resume

**Location:** `/resume`

### Upload a Resume
1. Drag a PDF or DOCX resume onto the dropzone, or click "Browse files" to pick one. The chosen file is
   listed below the dropzone — click the ✕ beside it to swap for a different one. Then click "Upload"
2. The platform extracts text (including table content in DOCX resumes) and matches skills against the built-in skills dictionary. Re-uploading a file you've already uploaded before reuses the cached extracted text instead of re-parsing it
3. The extracted skills list is displayed for review

> A scanned/image-only PDF (no real text layer) has no extractable text and is rejected with an error — export or re-save it as a text-based PDF, or upload a DOCX instead.

### Edit Skills
- Click the edit icon next to any skill to remove it
- Type in the "Add skill" box to add a skill not detected automatically
- Click "Save" to update your active resume's skill list

> Skills are used directly in keyword scoring. Keep the list accurate and complete for best results.

### Get AI Suggestions
1. In the "AI suggestions" card, optionally enter a target role for context, then click "Get suggestions"
2. Review the proposed improvements (each labeled Impact/Skills/Keywords/Clarity/Formatting) and check the ones you want
3. Click "Apply selected (N)" — this creates a brand new resume version with just the chosen suggestions applied; your current version is untouched and stays in the version history
4. Click "Discard" instead if you don't want any of them — nothing is changed

> Suggestions never invent experience, skills, or metrics — they only rephrase, restructure, or highlight what's already in your resume.

### Restore an Earlier Version
- The "Version history" card (shown once you have more than one version) lists every past resume version with its upload date and origin ("Uploaded" for a file you uploaded, "AI-applied" for a version created by applying resume suggestions)
- Click "Restore" on any inactive version to make it active again
- Restoring never deletes or overwrites history — it creates a brand new version with that old version's exact text and skills, the same way a fresh upload would

### Notes
- Only one resume can be active at a time
- Uploading a new resume deactivates the previous one
- Skills on the previous resume do not carry over — review after each upload
- Score history is not invalidated when you upload a new resume; new scores use the new skills
- Old versions are never deleted — restore any of them from the version history card

---

## 3. Target Role

**Location:** `/roles`

### Set a Role
1. Type your primary target role (e.g., "Backend Engineer", "Data Scientist")
2. Press **Enter**, or click "Expand" — either one starts the expansion
3. The platform looks up related roles (e.g., "Software Engineer", "API Developer", "Node.js Developer")
4. If your role is already in the cache: result is instant
5. If not: an AI call expands the role (takes 5–15 seconds) and caches the result
6. Click "Set as Active Role" to activate the selection

> The expanded roles list is used to filter scraped jobs and to scope scoring. Jobs not matching any expanded role keyword are excluded from scoring.

### Notes
- Only one role selection is active at a time
- You can create multiple role selections over time; only the most recent active one affects scraping and scoring
- Role expansions generated by AI are cached permanently in `role_expansion_map`

---

## 4. Dashboard

**Location:** `/dashboard`

### Overview
The dashboard shows all jobs scraped for your active role, ranked by overall score (highest first) —
your AI relevance score plus any ranking bonuses you've configured (see "Ranking Preferences" below). Each row shows:
- **Title** and **Company**
- **Location** tags (India / Singapore / UAE / Remote)
- **Source** (Greenhouse, Lever, Ashby, Wellfound, RemoteOK, MyCareersFuture)
- **Posted** date
- **Keyword Score** (0–100%) — cheap keyword overlap score
- **AI Score** (0–100%) — AI-assessed relevance (may be null if below keyword threshold or pending)
- **Ranking bonus** — shown next to the AI score when a bonus applied (e.g. "+ preferred company, remote")
- **Status** — your workflow status for this job (a dropdown by default, or a read-only badge if the
  status dropdown toggle in `/settings/workflow` is off — see "Status dropdown toggle" below)
- **Actions** — quick-action buttons (Not Interested / Mark Viewed / Mark Applied / Archive), open job
  URL in new tab, or draft an application (mail icon — see "Draft an Application" below)

Click a row's title to expand it and read the AI's reasoning for the score.

### Keyboard shortcuts (desktop table)
Press **Tab** until the job table takes focus — it's a single stop, so you land on one row rather than
tabbing through all fifty. The focused row is marked with a coloured rail down its left edge and a
tinted background. The same shortcuts are printed above the table, so you never have to remember them.

| Key | Does |
|---|---|
| `↑` `↓` | Move between rows |
| `R` | Mark the focused job Not Interested |
| `A` | Archive the focused job |
| `D` | Expand or collapse the focused row's details (AI reasoning, company history) |

The shortcuts only ever act on the **one focused row** — never on the whole list. They deliberately do
nothing while you're typing in the search box or any other field, while a status dropdown or dialog is
open, or when you hold Ctrl/Cmd/Alt, so `Ctrl+R` still reloads the page and typing the word "remote"
into search doesn't archive anything.

`R` and `A` do exactly what the row's Not Interested and Archive buttons do, so an accidental one is
undone the same way — set the status back from the row's dropdown (or its read-only badge's row/card
quick-action buttons, if the dropdown is turned off — see "Status dropdown toggle" below).

> Shortcuts are desktop-only. On mobile there's no focused row to act on; use the card's buttons and
> status sheet instead.

### Reading the score badge
| Badge | Means |
|---|---|
| Green, e.g. `82%` | AI score ≥ 75% — this job cleared the notification threshold, so it's one you'd have been pinged about |
| Amber, e.g. `58%` | AI score 40–74% — worth a look, not a strong match |
| Grey outline, e.g. `31%` | AI score below 40% — scored, and scored low |
| Grey outline, `Pending · 34%` | **Not scored yet.** The number shown is the cheap keyword score, standing in until the AI stage runs |

The green cut-off is `NOTIFY_THRESHOLD` (0.75), the same number the Telegram notifier uses — a green
badge and "this would have notified me" mean the same thing by design. `Pending` is a different state
from a low score: pending means no AI verdict exists yet, not that the verdict was bad.

### On mobile
The dashboard reflows rather than shrinking:
- The job table becomes a list of **cards** — title and score badge on the top row, company beneath,
  location and source chips, then a footer strip with the status dropdown (or badge) and the same
  quick-action buttons as the desktop row.
- The filter toolbar collapses to a single **Filters** pill showing a count of how many filters are
  active. Tapping it opens a bottom sheet with the full set of controls, plus **Clear all** and
  **Done**.
- Two filters are labelled for the action rather than the field: **Can apply** reads "Hide jobs I
  can't apply to", **Good match** reads "Hide low keyword matches".
- Primary navigation moves from the sidebar to a **bottom tab bar**.

On desktop the table is sized to fit the window — long titles, company names, and sources truncate
with an ellipsis (hover for the full value) instead of forcing a horizontal scrollbar.

### Filtering
- **Search:** Filter by keyword in title or company name
- **Location:** Filter by India / Singapore / UAE / Remote (single-select)
- **Source:** Filter by ATS/board source
- **Status:** Filter by workflow status
- **Score range:** Set a min AI score
- **Max experience:** Hide jobs requiring more years than this (unknown requirement always shown)
- **Remote:** Show only jobs tagged `remote`
- **Can apply** (labelled "Hide jobs I can't apply to" on mobile): **on by default.** Hides postings you could never actually take — remote roles locked to a region you can't work from, and onsite roles that explicitly refuse visa sponsorship. India and remote-open jobs are never hidden by this: neither needs a visa. Untick it to see the excluded jobs, each badged with the reason.
- **Good match** ("Hide low keyword matches" on mobile): **on by default.** Hides jobs whose keyword overlap fell below `KEYWORD_THRESHOLD`. These were never sent to the AI and never will be, so they're noise in a list you scan for matches. The stats row still counts them as "N low match (hidden)" so you always know how many are behind the filter.
- **Show archived jobs:** Off by default
- Companies you've muted (Notification preferences, §9) never appear here either

> Replaced the old **Sponsoring** filter, which required a posting to literally say "visa sponsorship". Almost none do, so it matched a handful of jobs while also hiding every India job — which needs no sponsorship at all.

In the typed fields — **Search**, **Min AI score** and **Max experience** — press **Enter** to apply
what you've typed without leaving the field. Clicking or tabbing away still applies it too, and doing
both only reloads the list once.

Applying a filter re-runs the query on the server. While it's in flight the job
list dims and an "Updating…" indicator appears next to the filters, so a filter
change reads as "loading" rather than a frozen page. The list you were looking at
stays on screen while this happens — it dims rather than being replaced by a
skeleton, so the page never flashes empty between filter changes.

### The stats row
Above the filters: `X of Y jobs · N AI-scored · N low match · N queued`. Every number describes the
currently filtered set, so they always reconcile with the list below.

- **AI-scored** — the AI has rated this job against your resume.
- **low match** — keyword overlap fell below `KEYWORD_THRESHOLD`, so the AI stage was skipped to save budget. These will **not** be scored later; the keyword score is all you get unless you upload a new resume. Hidden by default (above).
- **queued** — cleared the keyword gate but the AI call hasn't succeeded yet. The next `npm run score` run retries these. **This is the only bucket that costs money** — every retry is a paid API call. Only these are described as "awaiting AI review".
- **gave up** — the AI call failed `MAX_AI_RETRIES` times (default 3), so scoring stopped paying for it. Still visible, still keyword-scored; it just won't be retried. Bump `MAX_AI_RETRIES` and re-run scoring if you think the failures were transient.

Only "queued" ever grows your bill. "low match", "gave up" and ineligible jobs are all terminal —
they sit in the database costing nothing.

### Sorting
Sorted by overall score descending, then posted date descending as a tiebreaker. There's no
column-header sort yet — adjust ranking bonuses (below) or filters above to change what surfaces first.

### Ranking Preferences
**Location:** `/settings` → Ranking

The dashboard's overall score is your AI score plus small bonuses:
- **Preferred companies:** list company names (comma-separated); a match adds the company bonus (default +5%)
- **Prefer remote:** when on, jobs tagged Remote add the remote bonus (default +3%)
- **Salary disclosed:** any job with a parsed salary automatically adds the salary bonus (default +2%) — no setting needed
- **Offers visa sponsorship:** any job that *explicitly* states it sponsors a visa automatically adds the sponsorship bonus (default +4%) — no setting needed. This floats confirmed-sponsoring roles toward the top, which matters most for onsite-abroad targets.
- Each bonus amount is editable; leave a bonus field blank to use its default

Freshness isn't a separate bonus — the dashboard already breaks ties by posting date, so it's covered
without double-counting. Leave everything blank (or click "Clear all") to rank by AI score alone.

### Changing Job Status
**Dropdown/sheet (default):**
1. Click the status badge on any job row
2. Select the new status from the dropdown
3. Change is saved instantly

The badge shows the new status the moment you pick it, before the save finishes. If the save fails,
the old status comes back — so what the badge says is always what's actually stored. On mobile the
same control is a bottom sheet, and it closes as soon as you pick.

**Quick-action buttons:** Every row (and card, on mobile) also carries four one-click buttons —
**Not Interested**, **Mark Viewed**, **Mark Applied**, **Archive** — that set the matching status
directly, without opening the dropdown/sheet. These work the same whether the status dropdown toggle
(below) is on or off, so they're the only way to change status once it's off.

Keyboard: `R` and `A` set Not Interested and Archived on the focused row without opening the dropdown
at all — see "Keyboard shortcuts" above.

### Status dropdown toggle
**Location:** `/settings/workflow`

Default: on — the interactive dropdown/sheet described above. Turn it off to replace it
with a read-only badge showing the current status; the quick-action buttons remain the only way to
change status. Useful if the dropdown's full status list gets in the way and you only ever use the
four quick actions.

### Bulk Status Change
1. Select multiple jobs using the checkboxes
2. Click "Change Status" in the bulk action bar
3. Select target status
4. All selected jobs are updated at once

### Pagination
The list starts at 50 jobs. **Load more** at the bottom adds another 50 to the same page — it grows
the list rather than paging to a separate screen, so there is no "page 2" and nothing you've already
scrolled past disappears. The count is carried in the URL, so a reloaded or shared link shows exactly
the same list you were looking at.

### Draft an Application
Click the mail icon on any job row/card to open the application dialog.
1. Choose **Email** or **Cover letter** using the toggle at the top of the dialog — each is drafted, reviewed, and sent independently for the same job
2. Click **Generate draft** — an AI-drafted email or cover letter (using only facts from your active resume, never invented) is created and pre-filled with the job's contact email if one was found on the posting
3. Review it. Edit the subject or body directly and click **Save changes** if you want to tweak wording
4. Click **Open in mail client** — this opens a `mailto:` link in your own mail app with the subject/body prefilled. Send it from there. **The dashboard never sends anything on its own** — this is always your own mail client, your own send
5. If you don't want to send it, click **Dismiss** instead — you can regenerate a fresh draft for the same job later

Once a draft is marked sent, it can't be edited or redrafted — it's a permanent record of what you actually sent.
Dismissed drafts can be redrafted at any time. See §9 for how pending (unreviewed) drafts show up in Telegram.

---

## 5. Status Workflow

**Location:** `/settings/workflow`

### Default Statuses
| Status | Color | Description |
|---|---|---|
| New | Blue | Freshly scraped, not yet reviewed |
| Viewed | Purple | You've looked at it |
| Interested | Green | Worth applying to |
| Applied | Yellow | Application submitted |
| Not Interested | Red | Not pursuing |
| Archived | Grey | No longer relevant |

`Not Interested`, `Viewed`, `Applied`, and `Archived` are also the four targets of the dashboard's
quick-action buttons (§4) — matched by label, so renaming or deleting one of these four disconnects
the matching button (it becomes a no-op) until you rename/recreate a status with that exact label.

### Customise Statuses
- **Add status:** Click "Add Status", enter label and choose color
- **Edit status:** Click the pencil icon on any status row
- **Delete status:** Click the trash icon (only allowed if no jobs use this status)
- **Reorder:** Drag status rows to change sort order (affects dashboard status dropdown order)

---

## 6. Company Configuration

**Location:** `/settings` → Company Config

### Add a Company
1. Enter the company name
2. Select the ATS type (Greenhouse, Lever, or Ashby)
3. Enter the board token (found in the company's job board URL)
4. Click "Add Company"

> **Board token format:**
> - Greenhouse: `https://boards.greenhouse.io/<token>/jobs`
> - Lever: `https://jobs.lever.co/<token>`
> - Ashby: `https://jobs.ashbyhq.com/<token>`

### Remove a Company
Click "Remove" on any company row. The company is soft-deleted (set inactive) and excluded from future scrapes. Its jobs remain in the database.

### Notes
- Wellfound, RemoteOK, and MyCareersFuture require no company configuration — they are always scraped (Wellfound requires `WELLFOUND_FEED_URL` environment variable)
- Only `active = true` companies are scraped on each cron run

### Visa Sponsorship
**Location:** `/settings` → Visa sponsorship

One checkbox: **"Skip UAE/Singapore onsite jobs that say they won't sponsor a visa."** Off by default.
When on, those postings are discarded during the scrape and never saved at all.

- Only postings that *explicitly* rule sponsorship out are dropped. The vast majority never mention
  sponsorship either way, and those are kept — UAE employers in particular sponsor by default and
  rarely say so, so a stricter rule would wipe out your UAE pipeline.
- India and remote jobs are never affected. Neither needs a visa.
- Applies to future scrape runs only. Jobs already saved stay put — the dashboard's "Can apply"
  filter is what hides them there.

---

## 7. Insights

**Location:** `/insights`

The page shows two cards, in this order.

### In demand
**First on the page** (and first when stacked on mobile). The most-requested skills across all matched
and scored jobs that you already have on your resume — what your current profile is genuinely strong
at, shown as a labelled percentage bar per skill.

### Skill Gaps ("Level up")
**Second.** Skills appearing frequently in matched job descriptions that are *not* present in your
active resume. These are the highest-leverage skills to learn or add.

> The order is deliberate: what you're already strong at leads, the gap analysis follows
> (`docs/decisions.md` AD-55).

> Insights are meaningful only after you have an active resume, an active role, and at least one scoring run completed.

---

## 8. Analytics

**Location:** `/analytics`, split into four tabs: Overview (pipeline + scoring queue + token stats), Scraping & Scoring, Job Breakdown, and Sources.

| Chart | Description |
|---|---|
| Jobs Over Time | Line chart of new jobs scraped per day |
| Jobs by Source | Bar chart comparing posting volume across the 6 sources |
| Score Distribution | Histogram of AI scores in 10% buckets |
| Status Breakdown | Pie chart of jobs by current workflow status |
| Jobs by Experience | Bar chart of jobs grouped by minimum years required |

### Source Health
Two tables cover source reliability from different signals (intentionally not merged — see
`design/limitations.md`). The scrape-run-derived table now also flags a source **stale** (orange
badge) when it hasn't run at all in `SOURCE_STALE_HOURS` (default 6h) — a distinct problem from a
source that's running but failing, and sorted to the top of the table.

### Claude Routine (Manual Matches)
`source='claude_routine'` is intentionally excluded from the source-health tables above and from
`/analytics`'s per-source probe table (AD-65 point 4 — it's not a polled source, has no `companies`
row). Its own visibility lives on the **Operational** tab instead (AD-66/67): total count of
claude-routine jobs, the most recent import timestamp, and a day-by-day breakdown of how many jobs
were added — and how many distinct import runs produced them, keyed off distinct `first_seen_at`
timestamps since there's no dedicated import-batch id — on each of the last 7 days that had any.

---

## 9. Notifications

Telegram notifications are sent automatically by the cron pipeline after each scoring run.

### What Triggers a Notification?
- The job's `ai_score` must be ≥ `NOTIFY_THRESHOLD` (default: 75%)
- The job must not have been notified before (checked via `notifications_log`)

### Notification Modes

Set `NOTIFY_MODE` in your GitHub Actions secrets to select the delivery style.

#### `individual` (default)
One Telegram message per matched job. Each message includes job title, company, location, source, direct apply URL, and AI reasoning.

#### `digest` (MVP)
A single grouped Telegram message per cron run containing:
- **⭐ Strong Match count** — jobs with `ai_score ≥ 0.80`
- **✓ Worth Reviewing count** — jobs with `ai_score < 0.80` (above `NOTIFY_THRESHOLD`)
- **Top 5 strong match listings** with company, location, and experience
- **Inline keyboard buttons:**
  - One `Apply #N` button per listed strong match (up to 5), linking directly to the application URL
  - `✓ Worth Reviewing (N)` button — tapping it sends (or, on subsequent taps/page changes, edits in place) a paginated Telegram message listing the worth-reviewing jobs (5 per page, `←`/`→` buttons to page through), with a `📊 Dashboard` button appended
  - `📊 Dashboard` button — opens `APP_URL/dashboard?minScore=0.80`

The Worth Reviewing and Dashboard buttons require `APP_URL` and `TELEGRAM_CALLBACK_SECRET` to be set. When either is absent those buttons are omitted silently.

### Pending Draft Applications Reminder
After the job-match notification above, if you have any application drafts sitting in "draft" status (§4 "Draft an Application"), the cron run sends one more Telegram message listing them by job title and company, with a nudge to review and send from the dashboard. This reminder repeats every cron run for as long as a draft stays unreviewed — send it, dismiss it, or it'll keep showing up.

### Adjust the Threshold
Set `NOTIFY_THRESHOLD` in your GitHub Actions secrets (and Vercel env vars if you want the setting visible in the UI).

### Notification Filters

**Location:** `/settings/notifications`

Narrow which matched jobs actually trigger a Telegram alert, without changing `NOTIFY_THRESHOLD`. All fields are optional comma-separated lists (or a single number for experience); leaving a field blank means "no filter" for that dimension. Leaving every field blank clears preferences entirely (notify on every match above the threshold — the default).

| Field | Effect |
|---|---|
| Roles | Only notify if the job title contains one of these (case-insensitive) |
| Skills | Only notify if the job mentions one of these skills |
| Locations | Only notify for these location tags (`india`, `singapore`, `uae`, `remote`) |
| Sources | Only notify from these sources (`greenhouse`, `lever`, `ashby`, `wellfound`, `remoteok`, `mycareersfuture`) |
| Min / Max experience | Only notify for jobs whose parsed `min_years` falls in this range (unknown experience always passes) |
| Blocked companies | Never notify if the company name contains one of these — use this to silence staffing agencies or specific recruiters. Also hides matching jobs from the dashboard job list entirely, not just the alert |
| Exclude employment types | Never notify for these employment types (`internship`, `contract`, `freelance`, `temporary`, `part_time`, `full_time`) — jobs whose type couldn't be determined are never excluded. Also hides matching jobs from the dashboard job list |
| Muted keywords | Never notify if the job title contains one of these (e.g. "intern", "staffing"). Also hides matching jobs from the dashboard job list |

All three mute/exclude filters above (blocked companies, exclude employment types, muted keywords) are enforced everywhere — the dashboard job list as well as Telegram alerts — so muting something is a genuine "never show me this," not just a quieter notification stream.

Click "Clear all" to remove every preference and revert to notify-all.

### "Why This Job" Highlights

Every Telegram message — individual mode, the digest's strong-match listing, and the paginated Worth Reviewing list reached via the button above — includes a short highlight line when applicable, derived from data already extracted at ingest — no extra AI calls:
- 🌍 Remote
- ⚡ Urgent hiring
- 💰 Salary range (e.g. `USD120,000–150,000/yr`), when a salary was parsed from the posting
- 📄 Employment type, only shown for non-full-time types (contract/freelance/internship/temporary/part-time)

### Stop Notifications for a Job
Mark the job as "Archived" or "Not Interested" in the dashboard. (Note: this does not directly suppress notifications — the threshold is score-based only. A job already notified will not be notified again regardless of status.) To stop notifications for an entire company or keyword going forward, use the notification filters above instead.

---

## 10. Running Pipelines Manually

All three cron scripts can be run manually:

### From GitHub Actions
1. Go to your repository → Actions → `Scrape, Score & Notify`
2. Click "Run workflow"
3. Select branch and click "Run workflow"

### From Command Line (local/dev)
```bash
# Set environment variables first
export SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...
export OPENROUTER_API_KEY=...
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...

# Run in sequence
npm run scrape
npm run score
npm run notify
```

### Diagnostic Commands (v1.2)

| Command | Purpose |
|---|---|
| `npm run doctor` | Checks required/optional env vars are set and does a live Supabase + Telegram connectivity check. Run this first if a cron run fails with a "Missing required environment variable" error |
| `npm run health` | Probes all configured ATS board tokens (alias of `validate-sources`) |
| `npm run diagnose` | Recent scrape-run/failure report + fetch→location-filter→ingest funnel, for debugging why a source is yielding few jobs |
| `npm run analytics` | 30-day per-source quality report (keep rate, low performers) |
| `npm run verify` | Full quality gate: typecheck → tests → production build |

### Production Verification Framework (v1.4)

| Command | Purpose |
|---|---|
| `npm run verify:production` | Runs all 24 infrastructure/application/external/data-quality checks; writes `verification-reports/latest.{md,json}` and prints a console summary with a Ready/Needs Attention/Not Ready verdict |
| `npm run diagnostics` | Same checks, console-only (no files written) — quick ad-hoc health check |

Exits `1` only when the verdict is `not_ready` (a critical-severity failure) — see
`docs/operations/production-verification.md` for the full check catalog and deployment checklist.

---

## 11. Troubleshooting

| Problem | Likely Cause | Fix |
|---|---|---|
| Dashboard shows no jobs | No scrape run completed | Trigger a manual run via GitHub Actions |
| All jobs show no AI score | No active resume or role set | Upload resume and set role first, then re-run score |
| Telegram not receiving alerts | Wrong `TELEGRAM_CHAT_ID` or bot not added to chat | Verify bot token and chat ID; ensure bot is started |
| Wellfound jobs missing | `WELLFOUND_FEED_URL` not set | Add env var in GitHub Actions secrets |
| Company jobs not appearing | Board token incorrect or company set inactive | Check `/settings` → Company Config |
| Resume skills look wrong | PDF/DOCX parsing missed skills | Manually add/remove skills on `/resume` |
| Skill insights empty | No scored jobs yet | Run a full scrape → score cycle |
| Cron script fails with "Missing required environment variable" | A required secret isn't set in this environment | Run `npm run doctor` locally to see exactly which vars are missing |
| Expected notification didn't arrive | A notification filter (blocked company, excluded employment type, etc.) silently excluded it | Check `/settings/notifications` — clear a field to test, or check `docs/reviews` for the exclude-filter semantics |
