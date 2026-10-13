# CSV Review Desk

A free, static CSV review workspace for checking a target contract, resolving problem rows, and exporting a reviewed copy. All file processing runs in the browser. No account, upload endpoint, analytics, remote fonts, or AI calls.

## Use

1. Open a UTF-8 CSV or try the problem sample. Auto detection handles comma, semicolon and tab; choose the file delimiter explicitly when necessary. The load message confirms the delimiter used.
2. Review target mappings and rules. Loading target CSV headers creates text fields only; configure required, unique, email, ISO date, or enum checks yourself.
3. Resolve the shown problem fields. For short records, verify column alignment and supply every missing cell up to the last added value. Use **Confirm empty … cell** only when that empty value is intentional. Noncontiguous additions are rejected without changing saved data. **Save and next issue** saves the row, rechecks all active records, and advances only if that row is resolved. Ctrl/Cmd+Enter performs the same action while editing.
4. Show all fields when you need to inspect healthy values. Drafts survive row navigation. Undo restores an entire saved operation.
5. Review each whitespace batch before applying it. Exclude unresolved rows only with an explicit reason; the audit retains their original and current values.
6. Confirm omitted source columns, then export the reviewed CSV and audit. Changing data invalidates generated file links. A visible text fallback supports browsers that block downloads.
7. Save a `.csvreview` project to resume originals, edits, rules, mappings, exclusions, history and drafts. Projects contain your data; store them securely. Nothing is automatically persisted.

## Limits

- CSV: 2 MB, 5,000 records, 50 target/source header columns; project JSON: 16 MB.
- UTF-8 CSV/TSV only. No XLSX, encoding conversion, database connections, cross-file joins or destination-specific import guarantees.
- Dates must be real YYYY-MM-DD dates. Ambiguous dates require an informed decision; missing facts are never invented.
- Unique checks compare exact text. Email checks validate a conservative format, not mailbox existence.
- Source strings and original records are preserved. Already-corrupted source data cannot be reconstructed.
- Default CSV export preserves text. Optional spreadsheet protection prefixes formula-risk values, including some phone numbers; use unprotected output for destination imports.
- Reloading clears memory. Save a project before leaving. Browser unload warnings are best-effort; mobile browsers may not show them.
- The small-file limit remains intentional. Background validation, large-file streaming and broad schema standards are not implemented.

## Run and test

No dependency installation is needed; Papa Parse 5.7.0 is vendored.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
node core.test.mjs
node project.test.mjs
python3 scripts/build_site.py
```

Open `http://127.0.0.1:8765/`. The build script allowlists only eleven static files into `dist/`, excluding test captures, working projects, research notes and Git metadata.

## GitHub Pages

The workflow tests the core and project-resume logic, builds the static site, then deploys `dist/` using official Pages actions. Pages serves static assets; it cannot execute server validation or access a database. This product does not need those capabilities.

## Evidence and competition

See [COMPETITORS.md](COMPETITORS.md) for five-product research and [IMPROVEMENTS.md](IMPROVEMENTS.md) for priorities, acceptance checks and measured before/after tasks. Existing free products cover many of these features. Task tests do not prove adoption, retention, willingness to pay or overall superiority.

## Dependency license

Papa Parse 5.7.0 is MIT licensed; see `vendor/LICENSE`.

## External validation (2026-10-13)

A frozen 29-file suite used real Palmer Penguins and OurAirports datasets, external CSV Spectrum/Frictionless fixtures, and separately labelled derived and synthetic edge cases. Initial testing found that undo after filling a missing column failed to restore the original row width and could incorrectly enable export. Shape-aware undo now survives project resume. The initial evidence is retained separately from regression results. Post-fix: 27 assessable cases passed; two publisher reference conflicts remain inconclusive. This is a scoped engineering result, not general accuracy, adoption, RFC email validation, or spreadsheet-injection certification. External validation files and captures are kept outside the deployment allowlist.

A second frozen external-data round added 23 cases from Apache Commons CSV regressions, public currency codes and World Bank-derived population data, with labelled derived/synthetic supplements. Initial results found six failing cases: sparse delimiter guessing, noncontiguous/explicit-empty additions, and an overwide data record. After fixes: 20 assessable cases pass; three unsupported Apache dialect configurations are retained as skips. The previous 29-case suite also remains at 27 passes and two reference conflicts. These are bounded task results, not general accuracy estimates.

## Visual design

The review workspace uses a locally hosted Atkinson Hyperlegible Next variable font (OFL-1.1; assets/OFL.txt), a cobalt action accent and coral exception cues. The initial labelled example opens the existing working demo. Save actions appear before fields in the repair panel and remain sticky while reviewing a row. Responsive tables scroll within their own containers. No competitor artwork, remote fonts or decorative animations are used.

## Direct interaction

Click a highlighted cell in the initial example to open its working editor. Mapped, active source cells edit directly in the table; **Save row** or Ctrl/Cmd+Enter commits the current row and rechecks it. Enter alone preserves multiline input. **Cancel cell edit** or Esc discards only that cell draft. The inspector and inline editor share drafts. Use the record counters or filter buttons to switch views; filters retain original source row numbers and never change export eligibility or scope. Open/Review/Export controls navigate to their actual sections. Unmapped and excluded cells remain read-only.
