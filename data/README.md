# data/ — client data, never committed

Real client data lives here. **Everything in this directory except this file is
gitignored**, because `Shivamchaubey14/trasset` is a public repository and a
single careless `git add -A` would publish a client's asset register to the
internet.

## What is here

| File | Provided | Notes |
|------|----------|-------|
| `working.xlsx` | 2026-07-29 | The client's own working spreadsheet, ~19 MB. Parked for later use. |

## Rules

- **Never commit anything from here**, including extracts, samples, screenshots,
  fixtures, or a seed script with real rows pasted into it. Derived data is still
  client data.
- The ignore rule is `/data/*` with `!/data/README.md` in the root `.gitignore`.
  It is written that way on purpose: `/data/` alone would stop git descending
  into the directory, and the negation for this README would never apply.
- Before adding a file here, check it is ignored:
  `git check-ignore -v data/<file>` should print the rule. If it prints nothing,
  stop — the file is trackable.
- This is a working copy. The original arrived in the user's `Downloads`, which
  is volatile; if the data matters long term it needs a real backup, not this
  folder inside a working tree.

## Likely eventual use

The bulk import path already accepts CSV/XLSX with a dry run and per-row error
reporting — `backend/apps/assets/services/importing.py`, exposed at
`POST /api/v1/assets/import/` with `dry_run` and `partial` flags. Validating this
spreadsheet against the import template is the natural first step, and the dry
run means it can be done without writing a single row.
