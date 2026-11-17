# Sequential Outreach Email Drafter Spec (v2)

Read ONLY this file and your assigned `reports/outreach/input-group-<G>.json`. Do not read other files in the repository.

Write `reports/outreach/drafts-group-<G>.json` matching:

```json
{
  "group": 1,
  "generatedAt": "<ISO timestamp>",
  "drafts": [
    {
      "draftId": "g1-01",
      "group": 1,
      "rank": 1,
      "companyName": "...",
      "title": "...",
      "recipientEmail": "...",
      "emailConfidence": "high|medium|low",
      "resumeVariant": "DotNet|FullStack|AI-Python",
      "attachmentPath": "reports/outreach/resumes/...",
      "subject": "...",
      "body": "...",
      "matchedSkills": ["..."],
      "portfolioLinkUsed": "https://sahidhh.github.io/portfolio/..."
    }
  ]
}
```

## Voice & Format Rules (enforced by `compile-and-lint-drafts.ts`)

1. **Voice:** Write like a busy engineer sending a direct peer note to a founder, CTO, or recruiter. Never write a cover letter or brochure.
2. **Length & structure:** `75–118` words total including greeting and sign-off (`70–130` hard limit). Three short plain-text paragraphs + greeting + sign-off:
   ```text
   Sahidhullah H
   sahidhullah@gmail.com | https://sahidhh.github.io/portfolio/
   ```
3. **Plain text only:** No markdown (`**`, `*`, bullets, `#`), no HTML, no emoji.
4. **Contractions required:** Use at least one natural contraction in every body (`I'm`, `I've`, `I'd`, `it's`, `don't`, `that's`, `here's`).
5. **No parenthetical date or title dumps:** Never write `(SDE L2, Aug 2024 to Sep 2026)`, `(Jun to Dec 2023)`, or `(promoted L2 Aug 2026)`. Work time naturally into plain sentences.
6. **No meta-resume labels:** Never write `tailored`, `PDF resume`, `Full-Stack PDF`, `FullStack PDF`, `DotNet PDF`, or `AI-Python PDF`. Write `I've attached my resume.` or `My resume is attached.`
7. **No company-splaining openers:** Never lecture the company on what their business/stack `depends on`, `centers on`, `rely on`, `relies on`, `requires tight`, or `takes clean`. Open directly on a concrete detail or question from `jdExcerpt`.
8. **Varied openings, proof & CTAs:** Vary openings and closing CTAs across all drafts in the group. Pick ONE concrete Propel result from `recommendedResumeHooks` (mention Mallow Technologies only if Laravel, AWS, Azure DevOps, or React/Redux fits the JD) and include ONE matching link from `recommendedPortfolioLinks` or `candidateFacts.portfolioCaseStudies`.
9. **Greeting & location honesty:** Use `Hi <FirstName>,` for named personal addresses; otherwise `Hi <Short Company> team,` or `Hi <Short Company> hiring team,`. For Singapore/overseas roles, note needing EP sponsorship cleanly. For India/remote roles, omit Singapore visa phrasing. Mention `additionalRoles` briefly when present. Never exaggerate YOE (>2+) or claim `missingSkills`.
10. **Strict mechanical limits:** Every non-URL sentence `<= 26` words, max 4 sentences/paragraph. Zero em-dashes (`—`), en-dashes (`–`), `--`, `!`, `"not just/only ... but"`, abstract noun triads, or AI cliché words (`delve`, `tapestry`, `streamline`, `game-changer`, `seamless`, `leverage`, `synergy`, `pain points`, `reaching out`, `reach out`, `touch base`, `circle back`, `fast-paced`, `passionate`, `thrilled`, `spearheaded`, `robust`, `pivotal`, `showcase`, `testament`, `hit the ground running`, `proven track record`, `dynamic team`, `cutting-edge`, `best-in-class`, `state-of-the-art`, `excited to`, `hope this finds you`, `i noticed`, `i'd love to`, `let me know if you have any questions`, `feel free to`).

## Self-Check Command

After writing `reports/outreach/drafts-group-<G>.json`, run:
```bash
npm run outreach:compile -- --group <G>
```
Fix any errors until it exits `0`.
