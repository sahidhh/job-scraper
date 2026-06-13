-- Enums used across jobs, scoring, role expansion, and scrape observability.

create type job_source as enum ('greenhouse', 'lever', 'ashby', 'wellfound', 'remoteok');

create type location_tag as enum ('india', 'singapore', 'uae', 'remote');

create type role_map_source as enum ('seed', 'ai');

create type scrape_run_status as enum ('success', 'partial', 'failed');
