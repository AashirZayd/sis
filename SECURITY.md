# Security Policy

## Supported Versions

We release security updates and bug fixes for the current active release line:

| Version | Supported          |
| :--- | :---: |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

---

## Reporting a Vulnerability

If you discover a security vulnerability or potential sandbox escape in SIS, please do **not** open a public issue.

Instead, please report the vulnerability privately:
- **Email**: [aashirzayd@gmail.com](mailto:aashirzayd@gmail.com)
- **GitHub Security Advisory**: Use the "Report a vulnerability" button on the GitHub repository.

Please include:
1. Description of the vulnerability.
2. Minimal reproducible code snippet or fixture.
3. Impact assessment (e.g. host isolation escape, denial of service, memory exhaustion).

We will acknowledge receipt within 48 hours and work with you on a coordinated disclosure timeline.

---

## Threat Model & Sandbox Security

SIS executes candidate Server Action JavaScript inside `isolated-vm` V8 isolates. The sandbox is designed with the following security boundaries:
- **Zero Host Privileges**: Isolate contexts have no access to `process`, `require`, `fs`, `net`, `fetch`, or host environment variables.
- **Execution Budgeting**: Each candidate execution is bound to a strict deadline (default: 20ms) enforced by the V8 isolate.
- **Resource Limits**: Memory allocation per isolate is bounded.
- **Framework Bypassing**: Functions referencing external infrastructure (database ORMs, Next.js `cookies()`, `headers()`) are conservatively classified as `static-only` and are **never** executed inside the isolate.
