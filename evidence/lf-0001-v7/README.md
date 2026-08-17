# LF-0001 V7 public evidence subset

This directory publishes the remotely inspectable subset of one LF-0001 V7
diagnostic episode. It is bound to the locally reviewed runner source at
`0a4d8eef9a0e17ac0661cc7a401e9f8ee0472f2b` and the full local evidence
manifest canonical SHA-256
`9d1c42ec4332e33230dbec10f584ddc2947e7eb9d5c5219c1efa8104ea02b413`.

## Claim boundary

The evidence supports this bounded statement:

> We implemented and validated a hash-frozen, no-post-hoc-feedback Adaptive
> SOP single-diagnostic pipeline that is independently reviewable from the
> retained evidence. This covers structural measurement validity only. The
> candidate task failed: both Oracle passes returned
> `[false,false,false,true]`. It does not establish SOP uplift, cost benefit,
> overall SOP calibration, or generalization.

The full local package was independently reviewed as
`APPROVE — P1=0 / P2=0 / P3=0` and contains 412 artifacts totaling
160,360,060 bytes. This public subset does **not** claim to be that complete
package.

## Why this is a subset

The full package retains isolated Codex state databases and WAL files, session
payloads, tool caches, Git internals, and a complete runtime snapshot containing
unpublished repository state. Those bytes are kept in local custody and are not
safe to publish wholesale. They remain committed by the original artifact index
included under `records/v7/`.

The public subset contains:

- the 75 LF-0001 runner, rubric, fixture, and test files selected from the
  reviewed runner source;
- the Review-boundary and Oracle calibration records;
- the V7 scope, plan, receipt, durable record, result, checkpoint, Judge, and
  two Oracle results;
- the original full-package manifest and artifact index;
- the four reconstructed final candidate files with their original hashes.

It excludes the complete runtime snapshot, Codex homes and databases, session
payloads, raw provider stdout, environment/model-catalog snapshots, caches, Git
internals, provider CA copies, and toolchain binaries.
Accordingly, a remote reviewer can verify the published records and source
subset, but cannot recompute the omitted 412-artifact completeness claim from
public bytes alone.

## Verify

Run from this directory:

```bash
node verify-public-evidence.mjs
```

The verifier checks every published file against `PUBLICATION-MANIFEST.json`,
then checks the reconstructed candidate files against the final-file hashes in
the original evidence manifest.

## Identity anchors

- Runner source identity: `0a4d8eef9a0e17ac0661cc7a401e9f8ee0472f2b`
- Review-boundary certificate: `add6b410e16aa07c459c737c42622e402070a894e44f019b33c39c3d10b3275b`
- V7 scope: `94601d4b86694f1fc364740757e7ea613734e0982ed62dc51375064fbfd92992`
- V7 plan: `76efcc45af96f725f48dc39483c41f71900bccc17a9f7b23142bbfef85bfb38c`
- Diagnostic receipt: `6a513e59ec198bd5fdfc77d682fde0c7edcc1d0f06e9e54cb0e79fd8ebeca7d3`
- Durable execution record: `7154b6ddd40c735b74795fcd444b30ad8f64876196ff591dc413af2d9c870f3e`
- Full local artifact index raw/canonical:
  `9aa191cc652ccf137ed7ccfc82ad66c8a70235326441f461d6199bc9c6082faf` /
  `80fb9e79dc8de18c3940b9d61350fa5c2d9beab802d8797a16955b9820acdae4`
