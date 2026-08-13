# Browser live Soccer score-relative patch

Isolated review artifact only. It has **not** been copied to the live parser
tree and no service has been restarted.

Apply from `/srv/ps38-aggregator/current` only after review:

```bash
patch -p1 < browser_live_soccer_score_relative.patch
```

The patch makes browser live Soccer spreads score-relative without consulting
an API-origin flag. The extra raw-sign option is deliberate: browser Soccer
uses mirrored raw handicap signs, while the pre-existing score-relative helper
expects a home-signed raw line. Its default preserves every existing caller.

Regression coverage:

- live score `1:0`, raw `H0` becomes `H1 -1` / `H2 +1`;
- live `0:0`, raw `H0` stays `H0`;
- live raw non-zero handicap keeps its existing home/away sign;
- prematch remains unshifted even if an upstream row contains a score.

On `secret`, the project venv does not include `pytest`. All five plain-assert
tests in the patched test module were therefore loaded and executed directly
against a temporary `PYTHONPATH` overlay; all five passed. The temporary copy
was removed after the run.

Verification completed before review:

- `patch --dry-run -p1`: clean for all three files;
- `/srv/pin888/bin/check-no-pinnacle-api`: `no_api_runtime_guard=ok`;
- `/srv/big_value/scripts/check_no_pinnacle_api.sh`: passed;
- added diff lines contain no forbidden API path.
