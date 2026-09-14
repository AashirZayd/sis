# Phase 28 — Benchmark Acquisition Hardening & Corpus Validation Report

## 1. Executive Summary

Phase 28 hardened the SIS real-world benchmark acquisition pipeline and validated metadata across the expanded 20-repository corpus. 

During early Phase 28 execution, repeated timeouts occurred on candidate repositories because unresolvable or non-advertised Git commit SHAs caused the fetcher to fall back to an unbounded full `git clone <url> <destDir>`. For monorepos with extensive Git histories (such as `cal.com` with >40,000 commits), full clones resulted in subprocess timeouts and credential hangs.

Phase 28 completely eliminated this vulnerability:
1. **Unbounded Full-Clone Fallback Eliminated**: Replaced with strict fail-fast error classification (`GitAcquisitionError`).
2. **Strict Non-Interactive Environment**: All Git child processes run with `GIT_TERMINAL_PROMPT=0` to guarantee zero subprocess hangs on stdin.
3. **Peeled Commit Pinning**: Pinned commits for annotated release tags were resolved to their immutable peeled commit SHAs (`^{commit}`), enabling rapid shallow fetching.
4. **Post-Checkout Verification**: Every shallow checkout strictly verifies that `git rev-parse HEAD` matches the expected 40-character commit pin.
5. **Tiered Corpus Selection**: Implemented `--core`, `--extended`, `--adversarial`, and `--all` filtering.
6. **Transparent Failure Isolation**: Invalid or un-acquirable candidates are explicitly classified and isolated without crashing the evaluation runner.

> **CRITICAL**: Expanded SIS analysis fuzzing was **intentionally NOT run** across the new candidates in this phase. Phase 28 is strictly an infrastructure acquisition validation phase.

---

## 2. Acquisition Architecture & Invariants

```
┌────────────────────────────────────────────────────────┐
│               Corpus Candidate Request                 │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────▼─────────────┐
             │  Is Candidate Excluded?   │
             └──────┬─────────────┬──────┘
                Yes │             │ No
                    │             ▼
    ┌───────────────┴────┐   ┌───────────────────────────────────┐
    │  Return EXCLUDED   │   │  git init & git remote add origin │
    │  (Zero Git Invocation) │  (GIT_TERMINAL_PROMPT=0)          │
    └────────────────────┘   └─────────────────┬─────────────────┘
                                               │
                             ┌─────────────────▼─────────────────┐
                             │ git fetch --depth 1 origin <SHA>  │
                             │ (Bounded Timeout: 90s)            │
                             └─────────┬───────────────┬─────────┘
                               Success │               │ Failure
                                       │               │
                                       │    ┌──────────▼───────────────┐
                                       │    │ Classify & Throw Error   │
                                       │    │ (Fail-Fast, NO Full Clone│
                                       │    │  Fallback Attempted)     │
                                       │    └──────────────────────────┘
                                       │
                             ┌─────────▼──────────────┐
                             │ git checkout FETCH_HEAD│
                             └─────────┬──────────────┘
                                       │
                             ┌─────────▼──────────────┐
                             │ git rev-parse HEAD     │
                             │ Verify HEAD === SHA    │
                             └─────────┬──────────────┘
                                       │
                             ┌─────────▼──────────────┐
                             │ Verify targetDir & App │
                             │ Router Structure       │
                             └─────────┬──────────────┘
                                       │
                             ┌─────────▼──────────────┐
                             │ Clean Ephemeral Tmpdir │
                             │ Return PASS Result     │
                             └────────────────────────┘
```

### Safety & Soundness Invariants:
- **`GIT_TERMINAL_PROMPT=0`**: Enforced on all Git subprocess invocations.
- **Fail-Fast**: If `git fetch --depth 1 origin <commit>` fails, the process immediately raises a typed `GitAcquisitionError`. It NEVER falls back to `git clone <url>`.
- **Exact Commit Match**: The checked-out HEAD must match the pinned SHA or validation fails with `checkout-failed`.
- **Ephemeral Cleanup**: Temporary directories are strictly purged in `finally` blocks, preserving disk hygiene.

---

## 3. Tiered Corpus Validation Results

Corpus validation was executed across each tier independently using `npm run benchmark -- --validate-corpus`:

### Tier Breakdown Table

| Tier | Total Candidates | Valid (PASS) | Excluded | Failed | Wall Time | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **CORE** | 5 | 5 | 0 | 0 | ~17.8s | **100% Valid** |
| **EXTENDED** | 12 | 8 | 4 | 0 | ~142.1s | **100% Accounted** |
| **ADVERSARIAL** | 3 | 3 | 0 | 0 | ~17.7s | **100% Valid** |
| **ALL CORPUS** | **20** | **16** | **4** | **0** | **~177.6s** | **100% Resolved** |

---

## 4. Detailed Candidate Results

### A. CORE Tier (5 Repositories — Baseline Anchor)
1. `shadcn-ui/taxonomy` (`298a885`): **PASS** (App Router verified in `.`)
2. `leerob/site` (`fd03371`): **PASS** (App Router verified in `.`)
3. `vercel/commerce` (`3761e52`): **PASS** (App Router verified in `.`)
4. `dubinc/dub` (`b8866f4`): **PASS** (App Router verified in `apps/web`)
5. `mickasmt/next-saas-stripe-starter` (`a78d130`): **PASS** (App Router verified in `.`)

### B. EXTENDED Tier (12 Repositories — New Candidate Applications)
1. `calcom/cal.com` (`6a75ef8`): **PASS** (v4.0.0 release tag; App Router in `apps/web`)
2. `formbricks/formbricks` (`a1d83ac`): **PASS** (v2.5.0 release tag; App Router in `apps/web`)
3. `documenso/documenso` (`e95e130`): **PASS** (v1.9.1 release tag; App Router in `apps/web`)
4. `midday-ai/midday` (`e27b704`): **PASS** (midday-v0.5.0 release tag; App Router in `apps/dashboard`)
5. `vercel/platforms` (`ec12e65`): **PASS** (App Router verified in `.`)
6. `steven-tey/precedent` (`3be4020`): **PASS** (App Router verified in `.`)
7. `shadcn-ui/ui` (`460ad60`): **PASS** (shadcn@4.9.0 peeled commit; App Router in `apps/v4`)
8. `payloadcms/payload` (`6407e57`): **PASS** (v3.0.0 peeled commit; App Router in `templates/blank`)
9. `charlie-tango/next-starter` (`e8f49a7`): **EXCLUDED** (`repository-unreachable` — HTTP 404 upstream on GitHub)
10. `typebot/typebot` (`1081b9c`): **EXCLUDED** (`repository-unreachable` — HTTP 404 upstream on GitHub)
11. `infisical/infisical` (`e1b25f9`): **EXCLUDED** (`clone-timeout` — single commit snapshot exceeds 880MB)
12. `openstatusHQ/openstatus` (`3a6efd1`): **EXCLUDED** (`clone-timeout` — snapshot transfer exceeds acquisition budget)

### C. ADVERSARIAL Tier (3 Repositories — Boundary Negative Controls)
1. `clerk/javascript` (`d79852e`): **PASS** (@clerk/nextjs@7.5.8 peeled commit; verified in `packages/nextjs`)
2. `dubinc/dub-api` (`b8866f4`): **PASS** (Targeted route handler slice in `apps/web/app/api`)
3. `t3-oss/create-t3-app` (`22d01d2`): **PASS** (create-t3-app@7.36.0 peeled commit; verified in `cli/template/extras/src/app`)

---

## 5. Excluded Candidates Analysis

Transparent exclusion was chosen over unreliable or moving-target workarounds:
- **`charlie-tango/next-starter`**: Returned HTTP 404 on GitHub. The repository was deleted or made private by its maintainers.
- **`typebot/typebot`**: Returned HTTP 404 on GitHub under the candidate URL.
- **`infisical/infisical`**: Even a depth-1 shallow clone requires transferring ~883 MB of binary objects and toolchains stored in the Git history. This violates the lightweight, bounded execution constraint of the benchmark infrastructure.
- **`openstatusHQ/openstatus`**: An 80MB snapshot whose shallow fetch transfer exceeds bounded timeouts under constrained network conditions.

---

## 6. Conclusion & Current Baseline

Phase 28 establishes that:
- SIS benchmark acquisition is fail-fast, deterministic, and non-interactive.
- 16 diverse Next.js App Router repositories are verified and acquirable via shallow Git fetch.
- Unbounded Git fallbacks are permanently eradicated from the codebase.
- The 5 CORE benchmark repositories remain 100% verified and unaffected.
