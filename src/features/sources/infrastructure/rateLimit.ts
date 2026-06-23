// Fixed delay between per-company requests for greenhouse/lever/ashby
// adapters (scrapers.md §4) -- avoids hammering each ATS's API.
export const PER_COMPANY_DELAY_MS = 250;

export { delay } from "@/shared/infrastructure/http";
