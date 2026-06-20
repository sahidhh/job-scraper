# RemoteOK Evaluation

## Verdict: Deprecated (Low Yield)

RemoteOK consistently produces 0 usable jobs due to location mismatch.

## Evidence

- RemoteOK is a global feed with no geographic filter
- Our location filter accepts: India, Singapore, UAE, Remote
- RemoteOK jobs are predominantly US-based with location strings like "Worldwide", "USA", etc.
- Historical yield: ~2 jobs found per run, 0 kept (0% keep rate)
- API rate-limiting adds latency with zero return

## Configuration

Set `REMOTEOK_DISABLED=true` in your environment to skip this source entirely.

## If You Want to Keep It

If your target market changes to include US/global remote jobs:
1. Remove `REMOTEOK_DISABLED=true`
2. Update location filter rules in `src/shared/config/location-keywords.ts` to include "worldwide", "global", etc.
3. Consider that RemoteOK also rate-limits heavily and may block scrapers
