# Publication safety notes

The public subset was built after a filename, structured-record, and credential
pattern audit of the full local package.

The full package was not published because it contains artifact classes that
cannot be safely cleared by a text-only scan: SQLite state and WAL/SHM files,
session payloads (including encrypted fields), installation identifiers, tool
caches, embedded Git internals, and a complete runtime snapshot containing
unpublished repository state.

The published subset excludes those classes as well as raw provider stdout and
environment/model-catalog snapshots. Credential-pattern matches remaining in
the public subset are limited to synthetic negative-test strings in runner test
source and credential-related repository path names in the Judge visibility
manifest; no matching credential value is published.

This is a bounded safety review, not a claim that arbitrary future additions to
this directory are safe. Re-run the audit and regenerate
`PUBLICATION-MANIFEST.json` after any byte changes.
