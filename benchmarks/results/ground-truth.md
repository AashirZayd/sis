# SIS Benchmark Ground-Truth Evaluation Report

Last Updated: 2026-09-11T18:52:53.626Z  
Review Schema Version: `1.0.0`  
Findings Evaluated: **43** | Reviewed: **43** | Pending Review: **0**

---

## 1. Ground-Truth Summary & Precision

| Metric | Count / Value | Description |
| :--- | :---: | :--- |
| **Total Findings** | **43** | All invariant violations verified in benchmark run |
| **Reviewed Findings** | **43** | Evaluated by human code review |
| **Pending Review** | **0** | Awaiting manual classification |
| **True Positives (TP)** | **9** | Valid boundary defects / missing validations |
| **False Positives (FP)** | **9** | False alarms or harmless boundary patterns |
| **Expected Behavior** | **0** | Intentional error throws or defensive aborts |
| **Unreachable** | **1** | Private or client-inaccessible endpoints |
| **Framework Artifacts** | **24** | Boundary anomalies caused by missing framework server runtime |
| **Empirical Precision** | **50.0%** | Calculated as $TP / (TP + FP)$ over binary classifications |

> [!IMPORTANT]
> **Precision Subset Disclaimer**:
> Precision is based only on the manually reviewed subset and should not be generalized to the entire corpus.
>
> **No Recall Calculation**:
> Recall ($TP / (TP + FN)$) is intentionally **not calculated** because the complete ground-truth set of true invariants, boundary hazards, and secret flows across real-world third-party codebases is unknown.
>
> **Findings ≠ CVEs / Vulnerabilities**:
> SIS findings represent boundary invariant violations (e.g. unhandled `TypeError` under empty input, React Flight serialization violations, or static secret flows). They must not be conflated with confirmed, exploitable production vulnerabilities or CVEs.

---

## 2. Evaluation by Repository

| Repository | Total | Reviewed | Pending | TP | FP | Expected | Unreachable | Framework | Precision |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| [**dubinc/dub**](https://github.com/dubinc/dub) | 32 | 32 | 0 | 0 | 7 | 0 | 1 | 24 | 0.0% |
| [**mickasmt/next-saas-stripe-starter**](https://github.com/mickasmt/next-saas-stripe-starter) | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0.0% |
| [**shadcn-ui/taxonomy**](https://github.com/shadcn-ui/taxonomy) | 1 | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0.0% |
| [**vercel/commerce**](https://github.com/vercel/commerce) | 9 | 9 | 0 | 9 | 0 | 0 | 0 | 0 | 100.0% |

---

## 3. Evaluation by Rule ID

| Rule | Total | Reviewed | Pending | TP | FP | Expected | Unreachable | Framework | Precision |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `SIS002` | 10 | 10 | 0 | 0 | 9 | 0 | 1 | 0 | 0.0% |
| `SIS003` | 33 | 33 | 0 | 9 | 0 | 0 | 0 | 24 | 100.0% |

---

## 4. Confidence Distribution

| Confidence Level | Count | Share |
| :--- | :---: | :--- |
| **High** | 43 | 100.0% |
| **Medium** | 0 | 0.0% |
| **Low** | 0 | 0.0% |

---

## 5. Reviewer Classification Guide

When manually reviewing findings in `benchmarks/reviews/ground-truth.json`, classify each record into one of the following:

| Classification | Meaning | Criteria |
| :--- | :--- | :--- |
| `TRUE_POSITIVE` | Genuine Boundary Defect | Missing defensive validation at a public network boundary leading to uncaught runtime failure, or genuine secret leak. |
| `FALSE_POSITIVE` | Incorrect Detection | Imprecise static analysis or safe usage incorrectly flagged by SIS. |
| `EXPECTED_BEHAVIOR` | Intentional Design | Action intentionally throws an error (e.g. `throw new Error("unauthorized")`) to signal failure to client UI. |
| `UNREACHABLE` | Private / Dead Code | Endpoint cannot be invoked from client-side network requests in practice. |
| `FRAMEWORK_ARTIFACT` | Runtime Emulation Limit | Failure caused by `isolated-vm` lacking Next.js server context rather than an application defect. |
| `NEEDS_REVIEW` | Unreviewed (Default) | Default initial state awaiting human analysis. |

### How to Submit a Review:
1. Open `benchmarks/reviews/ground-truth.json`.
2. Locate the finding record by its `fingerprint` (or run `npm run benchmark -- --reproduce <fingerprint>`).
3. Set `classification` to one of the above values.
4. Set `confidence` to `"HIGH"`, `"MEDIUM"`, or `"LOW"`.
5. Set `reviewer` to your GitHub username, add `reviewNotes`, and record the current ISO `reviewedAt`.
6. Run `npm run benchmark -- --review` to recompute statistics and update this report.

---

## 6. Catalog: Pending Findings Awaiting Review (0)

*No pending findings awaiting review.*

---

## 7. Catalog: Reviewed Findings (43)

### `29e87e4da896d3bd` — [dubinc/dub] SIS002: app/api/og/analytics/route.tsx#L121

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `app/api/og/analytics/route.tsx:121:10`
- **Action**: `GET`
- **Message**: Server Action "GET" returns non-serializable value: Class instance "new ImageResponse()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Next.js App Router Open Graph image Route Handler returning ImageResponse (image/png HTTP stream). Misclassified as React Flight Server Action.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 29e87e4da896d3bd
  ```

---

### `b73f6de8c1a5b106` — [dubinc/dub] SIS002: app/api/og/avatar/[[...seed]]/route.tsx#L27

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `app/api/og/avatar/[[...seed]]/route.tsx:27:10`
- **Action**: `GET`
- **Message**: Server Action "GET" returns non-serializable value: Class instance "new ImageResponse()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Next.js App Router Open Graph image Route Handler returning ImageResponse (Web API HTTP stream). Misclassified as React Flight Server Action in Phase 20/22; suppressed by Phase 23 Route Handler boundary classifier.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce b73f6de8c1a5b106
  ```

---

### `d20d51f0b62aa1ab` — [dubinc/dub] SIS002: app/api/og/program/categories/route.tsx#L36

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `app/api/og/program/categories/route.tsx:36:10`
- **Action**: `GET`
- **Message**: Server Action "GET" returns non-serializable value: Class instance "new ImageResponse()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Next.js App Router Open Graph image Route Handler returning ImageResponse (Web API HTTP stream). Misclassified as React Flight Server Action in Phase 20/22; suppressed by Phase 23 Route Handler boundary classifier.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce d20d51f0b62aa1ab
  ```

---

### `20da1af9bd2b796c` — [dubinc/dub] SIS002: app/api/og/program/route.tsx#L72

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `app/api/og/program/route.tsx:72:10`
- **Action**: `GET`
- **Message**: Server Action "GET" returns non-serializable value: Class instance "new ImageResponse()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Next.js App Router Open Graph image Route Handler returning ImageResponse (Web API HTTP stream). Misclassified as React Flight Server Action in Phase 20/22; suppressed by Phase 23 Route Handler boundary classifier.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 20da1af9bd2b796c
  ```

---

### `4f58291a683dc090` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"prototype-sensitive","parameter":"partner","shrinkAttempts":1,"shrinkReduction":"93.9%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 4f58291a683dc090
  ```

---

### `0498adc078cfc131` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"structural-deletion","parameter":"partner","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 0498adc078cfc131
  ```

---

### `041dc01e271a362b` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-edge","parameter":"partner","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 041dc01e271a362b
  ```

---

### `9dfd8199ba270441` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"prototype-sensitive","parameter":"partner","shrinkAttempts":1,"shrinkReduction":"96%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 9dfd8199ba270441
  ```

---

### `ba9ad4d3f2e2fcec` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `""`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"string-hazard","parameter":"partner","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: External Upstash Redis client import (@/lib/upstash) is not resolved inside isolated-vm isolate, causing an artificial ReferenceError when invoking redis.set.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce ba9ad4d3f2e2fcec
  ```

---

### `98cf7b44aa871465` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw ReferenceError: redis is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `forceWithdrawal|failed|ReferenceError|redis is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"partner","shrinkAttempts":1,"shrinkReduction":"87.5%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 98cf7b44aa871465
  ```

---

### `69467cae947cf138` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw TypeError: Cannot read properties of undefined (reading 'id')
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: `forceWithdrawal|failed|TypeError|cannot read properties of undefined (reading 'id')`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"partner","shrinkAttempts":1,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Exported in use server file. When invoked with {}, partner.id is undefined, and execution reaches await redis.set(...). Because @/lib/upstash Redis client is not mocked inside isolated-vm, execution throws ReferenceError: redis is not defined.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 69467cae947cf138
  ```

---

### `ea694390957092a6` — [dubinc/dub] SIS003: lib/actions/partners/force-withdrawal.ts#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/actions/partners/force-withdrawal.ts:41:14`
- **Action**: `forceWithdrawal`
- **Message**: forceWithdrawal threw TypeError: Cannot read properties of null (reading 'id')
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `forceWithdrawal|failed|TypeError|cannot read properties of null (reading 'id')`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"partner","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action depends on external Upstash Redis client (@/lib/upstash). In isolated-vm isolate without Upstash runtime connection, redis is undefined or partner object cannot be evaluated. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce ea694390957092a6
  ```

---

### `b03911739869bf77` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"primitive-mismatch","parameter":"fieldColumns","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: External import createStreamableValue from @ai-sdk/rsc (Vercel AI SDK) is not resolved inside isolated-vm sandbox, causing artificial ReferenceError: createStreamableValue is not defined. The action is a legitimate streaming action; failure is an isolate emulation artifact.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce b03911739869bf77
  ```

---

### `ca2554f3a851ae43` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-edge","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce ca2554f3a851ae43
  ```

---

### `16a5f4e3985dd6db` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"87.5%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 16a5f4e3985dd6db
  ```

---

### `bcf7912c6e26654a` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `[]`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"66.7%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce bcf7912c6e26654a
  ```

---

### `95075c22ed62edf9` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `""`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"primitive-mismatch","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"75%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 95075c22ed62edf9
  ```

---

### `afa309c009e3bc9d` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `[]`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"81.8%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce afa309c009e3bc9d
  ```

---

### `8ab9c40648516a9c` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 8ab9c40648516a9c
  ```

---

### `f10552c3f1e153be` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"fieldColumns","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce f10552c3f1e153be
  ```

---

### `4489a1f17b56a0f4` — [dubinc/dub] SIS003: lib/ai/generate-csv-mapping.ts#L8

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-csv-mapping.ts:8:23`
- **Action**: `generateCsvMapping`
- **Message**: generateCsvMapping threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateCsvMapping|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"fieldColumns","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 4489a1f17b56a0f4
  ```

---

### `4eddf10b415658f7` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"prompt","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 4eddf10b415658f7
  ```

---

### `b9605c70201af887` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `false`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"primitive-mismatch","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce b9605c70201af887
  ```

---

### `d4efad50d4184b49` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-edge","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce d4efad50d4184b49
  ```

---

### `e89b5143f6e2194d` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `""`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"string-hazard","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"33.3%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce e89b5143f6e2194d
  ```

---

### `f8d5fc2a1d474f95` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce f8d5fc2a1d474f95
  ```

---

### `88e7171585915289` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `""`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"string-hazard","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"100%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 88e7171585915289
  ```

---

### `bf339bdda47bd579` — [dubinc/dub] SIS003: lib/ai/generate-filters.ts#L40

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS003`
- **Location**: `lib/ai/generate-filters.ts:40:23`
- **Action**: `generateFilters`
- **Message**: generateFilters threw ReferenceError: createStreamableValue is not defined
- **Generated / Minimized Input**: `""`
- **Failure Signature**: `generateFilters|failed|ReferenceError|createstreamablevalue is not defined`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"ReferenceError","fuzzTarget":"server-action-argument","strategy":"string-hazard","parameter":"prompt","shrinkAttempts":1,"shrinkReduction":"33.3%","minimalReproducerVerified":true}`
- **Current Classification**: `FRAMEWORK_ARTIFACT` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Action imports @ai-sdk/rsc createStreamableValue. AI streaming SDK cannot be bound inside isolated-vm isolate, producing artificial ReferenceError. Classified as static-only by Phase 23 Compatibility Gate.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce bf339bdda47bd579
  ```

---

### `3d7a805fc6c00f5c` — [dubinc/dub] SIS002: playwright/api/fixtures.ts#L78

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `playwright/api/fixtures.ts:78:10`
- **Action**: `createBearerApiClient`
- **Message**: Server Action "createBearerApiClient" returns non-serializable value: Functions cannot be passed directly to Client Components unless explicitly exposed with 'use server'
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `UNREACHABLE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Playwright end-to-end test fixture utility (playwright/api/fixtures.ts). Not a Server Action and completely unreachable from client network requests in production.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 3d7a805fc6c00f5c
  ```

---

### `a3d2599493cc79a3` — [dubinc/dub] SIS002: ui/modals/add-workspace-modal.tsx#L57

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `ui/modals/add-workspace-modal.tsx:57:9`
- **Action**: *(module scope)*
- **Message**: Non-serializable value passed as prop "onSuccess" to Client Component <CreateWorkspaceForm />: Functions cannot be passed directly to Client Components unless explicitly exposed with 'use server'
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-to-client-props","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Client Component passing callback prop onSuccess to child Client Component <CreateWorkspaceForm />. File uses React client hooks (useState, useRouter) but lacked top-level use client directive, causing SIS to misclassify it as a Server Component.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce a3d2599493cc79a3
  ```

---

### `65d34db6b2bda7b0` — [dubinc/dub] SIS002: ui/modals/invite-workspace-user-modal.tsx#L41

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `ui/modals/invite-workspace-user-modal.tsx:41:9`
- **Action**: *(module scope)*
- **Message**: Non-serializable value passed as prop "onSuccess" to Client Component <InviteTeammatesForm />: Functions cannot be passed directly to Client Components unless explicitly exposed with 'use server'
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-to-client-props","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Client Component modal utilizing React client hooks (useState, useRouter) passing callback props to another Client Component. Suppressed by Phase 23 AST client hook inference.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 65d34db6b2bda7b0
  ```

---

### `81c82997df3671ef` — [dubinc/dub] SIS002: ui/modals/link-builder/utm-modal.tsx#L235

- **Repository**: [dubinc/dub](https://github.com/dubinc/dub) (Commit: `b8866f4`)
- **Rule**: `SIS002`
- **Location**: `ui/modals/link-builder/utm-modal.tsx:235:15`
- **Action**: *(module scope)*
- **Message**: Non-serializable value passed as prop "onLoad" to Client Component <UTMTemplatesCombo />: Functions cannot be passed directly to Client Components unless explicitly exposed with 'use server'
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-to-client-props","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Client Component modal utilizing React client hooks (useState, useRouter) passing callback props to another Client Component. Suppressed by Phase 23 AST client hook inference.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 81c82997df3671ef
  ```

---

### `0f4dc5c476d30776` — [mickasmt/next-saas-stripe-starter] SIS002: app/api/webhooks/stripe/route.ts#L76

- **Repository**: [mickasmt/next-saas-stripe-starter](https://github.com/mickasmt/next-saas-stripe-starter) (Commit: `a78d130`)
- **Rule**: `SIS002`
- **Location**: `app/api/webhooks/stripe/route.ts:76:10`
- **Action**: `POST`
- **Message**: Server Action "POST" returns non-serializable value: Class instance "new Response()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Next.js App Router HTTP Route Handler for Stripe webhooks returning Web API Response(null, { status: 200 }). Erroneously evaluated under React Flight Server Action return serialization rules.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 0f4dc5c476d30776
  ```

---

### `c39ca66764d41da4` — [shadcn-ui/taxonomy] SIS002: app/api/webhooks/stripe/route.ts#L70

- **Repository**: [shadcn-ui/taxonomy](https://github.com/shadcn-ui/taxonomy) (Commit: `298a885`)
- **Rule**: `SIS002`
- **Location**: `app/api/webhooks/stripe/route.ts:70:10`
- **Action**: `POST`
- **Message**: Server Action "POST" returns non-serializable value: Class instance "new Response()" cannot be passed to a Client Component
- **Generated / Minimized Input**: `*(none)*`
- **Failure Signature**: *(none)*
- **Static Evidence**: `{"boundaryKind":"server-action","direction":"server-to-client"}`
- **Runtime Evidence**: `—`
- **Current Classification**: `FALSE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Next.js App Router HTTP Route Handler (app/api/webhooks/stripe/route.ts) returning Web API Response. Route Handlers communicate via standard HTTP and do not cross a React Flight RPC serialization boundary.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce c39ca66764d41da4
  ```

---

### `b6bbfce3dbe171b5` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"prototype-sensitive","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"93.9%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Authentic Server Action with top-level use server. The function unconditionally destructures payload outside try/catch (const { merchandiseId, quantity } = payload;). Invoking without arguments or with undefined payload triggers an uncaught TypeError at the server network boundary.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce b6bbfce3dbe171b5
  ```

---

### `0300c0d145de1a6b` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"serialization-edge","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 0300c0d145de1a6b
  ```

---

### `84e693a7f37f6a9b` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"prevState","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-pilot (2026-09-11T11:15:00.000Z)
- **Notes**: Authentic Server Action with top-level use server. Passing nullish second parameter throws uncaught TypeError outside try/catch due to un-guarded object destructuring.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 84e693a7f37f6a9b
  ```

---

### `78387966d81c3cd4` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"structural-deletion","parameter":"prevState","shrinkAttempts":0,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 78387966d81c3cd4
  ```

---

### `caac0d7e2642c4fa` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"prototype-sensitive","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"93.9%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce caac0d7e2642c4fa
  ```

---

### `0cc2c4b41331b1de` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"95.6%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 0cc2c4b41331b1de
  ```

---

### `a93666a2ceea9d6e` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"prototype-sensitive","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"96%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce a93666a2ceea9d6e
  ```

---

### `e37b49b0bbe4aef3` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `null`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"nullability","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"0%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce e37b49b0bbe4aef3
  ```

---

### `2129b19876f7f31a` — [vercel/commerce] SIS003: components/cart/actions.ts#L54

- **Repository**: [vercel/commerce](https://github.com/vercel/commerce) (Commit: `3761e52`)
- **Rule**: `SIS003`
- **Location**: `components/cart/actions.ts:54:23`
- **Action**: `updateItemQuantity`
- **Message**: updateItemQuantity threw TypeError: Cannot destructure property 'merchandiseId' of 'payload' as it is undefined.
- **Generated / Minimized Input**: `{}`
- **Failure Signature**: `updateItemQuantity|failed|TypeError|cannot destructure property 'merchandiseid' of 'payload' as it is undefined.`
- **Static Evidence**: `{"invariant":"runtime-safety"}`
- **Runtime Evidence**: `{"errorName":"TypeError","fuzzTarget":"server-action-argument","strategy":"serialization-unsupported","parameter":"prevState","shrinkAttempts":1,"shrinkReduction":"87.5%","minimalReproducerVerified":true}`
- **Current Classification**: `TRUE_POSITIVE` (Confidence: `HIGH`)
- **Reviewer**: ground-truth-phase-24 (2026-09-11T15:00:00.000Z)
- **Notes**: Missing defensive validation on public Server Action boundary. Unconditionally destructuring payload ({ merchandiseId, quantity }) without nullish/type guards causes uncaught TypeError when called with empty/nullish arguments.
- **Reproduction**:
  ```bash
  npm run benchmark -- --reproduce 2129b19876f7f31a
  ```

