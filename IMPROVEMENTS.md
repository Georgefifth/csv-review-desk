# Product review, priorities and acceptance results

Reviewed 2026-10-13. Baseline commit: `541c1d5`. Preserve the static architecture and existing validation, original-string preservation, row accounting, exclusions, audit and undo.

## Workflow and priorities

| Priority | Observed defect / gap | Value and implementation | Cost / risk | Acceptance result |
|---|---|---|---|---|
| P0 | Generated download remained accessible after editing; reverting a draft left CSV export disabled | Invalidate generated URLs/content on mutations; recompute availability on every draft input | Small; do not invalidate merely closing a preview | Browser: stale output visible before=true, after=false. Revert enabled export before=false, after=true |
| P0 | Replacing a file/sample discarded work; tab closure lost all working state | Validate new input before replacing; offer keep/replace dialog; explicit portable save/resume, best-effort unload warning | Medium; project JSON contains data and must be validated, never automatically persisted | Browser: cancel replacement retained 4 passing records; restored edits/draft/undo from generated project. Eight project/batch tests passed |
| P1 | All six fields appeared even when only one needed attention; save required a separate next-row action | Problem fields first, optional all-fields toggle, save-and-next that advances only after resolution; Ctrl/Cmd+Enter | Small; hidden healthy fields must remain editable and unchanged | Same-task browser comparison: six fields→one on next error; five value entries + two clicks→five entries + one click |
| P1 | More than 100 whitespace changes disabled the whole batch action | Preview and apply the first 100; repeat for remaining cells; atomic stale/duplicate preview checks and undo | Small; no invisible bulk confirmation | 150-cell test changed first 100 only, left 50 intact, undo restored all. Public UI checked separately |
| P1 | Interface was Chinese; mappings rebuilt unnecessarily during row operations; weak rules could look comprehensive | English UI/errors/audit labels; cache mapping render; visible text-only-rule warning | Small; preserve data strings and all constraints | Source scan found no CJK UI strings. Browser headings, controls and generated output reviewed. No human comprehension study |
| Deferred | Larger files, XLSX, encoding selection, numeric/range rules, platform rule packs, background workers | Competitors handle these better; add only after task demand and explicit parser/validation tests | Medium/high; increasing caps without workers could block UI | Not implemented or claimed |

## Measured task protocol

A synthetic four-record CSV has five problems on row 2 and an invalid date on row 3. Known corrections: ID 005, name Maya, confirmed email, confirmed ISO date, lowercase allowed status; then correct row 3's impossible date. Both versions used the same corrections. The unchanged sample name differs only in demo localization and is irrelevant to the tested corrections.

Starting at row 2, entering five values and reaching row 3:

- Before: 5 value entries + Save row + Review row 3 = **7 actions**.
- After: 5 value entries + Save and next issue = **6 actions**.
- Both reached the correct next record. Its editor displayed **6 fields before, 1 after**.
- Final generated CSV retained all four records, leading-zero IDs/phones, a quoted comma name and untouched strings.

Counts exclude initial file loading and unchanged setup; this is one bounded subtask, not a claim about total-session efficiency. Synthetic browser tasks are not population success rates or human completion-time benchmarks. We do not infer that a 14% action reduction means a 14% speed increase.

## Stability and recovery checks

- Core suite: 20 tests covering parsing, date/calendar validation, row accounting, safe/fidelity export, atomic edits, undo and a 5,000-record duplicate group.
- Project/batch suite: 8 tests covering exact resume state, immutable originals, foreign/truncated/oversized/tampered files, bad indices, duplicate state keys, mapping reuse across column reorders and batched repairs.
- Browser: generated a project with one unsaved phone draft, resumed it in a fresh tab, verified export was blocked, saved the draft, then undid it back to `00112233`.
- Browser: replacement cancellation retained all four passing records.
- Original and improved versions were actually run side by side to reproduce stale-export and draft-revert defects.
- Native browser download completion remains unconfirmed by the automation API. Generated file content and project resume were tested through the visible fallback; we do not equate that with download landing on disk.

## Release boundaries

28 automated tests and the specific browser tasks support technical correctness within stated limits. No real-user preference, retention, payment, accessibility assistive-technology study, cross-browser matrix or comparative competitor latency test has been completed.

GitHub Pages can serve this browser-only product. It cannot add trusted server validation or database access. The build uses an allowlist; work/project files and research captures are excluded. Public deployment must be verified separately after the workflow finishes.

## Public release verification

[GitHub repository](https://github.com/Georgefifth/csv-review-desk) · [GitHub Pages](https://georgefifth.github.io/csv-review-desk/)

The actual HTTPS Pages release was opened and tested after deployment. The four-record repair task completed, saved-and-next showed one relevant field, all four records passed configured rules, and the generated CSV preserved untouched IDs/phones and quoted text. A project generated on the public site was resumed in a fresh public-site tab; four passing records and export availability were restored. At mobile size, the client/document widths were both 375px; the table scrolls within its own container. A 150-cell whitespace task applied the first 100 and retained 50 pending cells, as intended.

A local Node 26 engine-only benchmark used 5,000 valid six-field records, 10 warm-up iterations and 30 measured iterations. Baseline median/p95: **2.92/5.53 ms**. Current median/p95: **3.06/4.66 ms**. This does **not** demonstrate a processing-speed improvement or predict browser/human task time; the validated improvement is interaction/recovery behavior.
