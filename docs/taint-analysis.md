# Static Secret Taint Analysis for Server Components

In the Next.js App Router, the boundary between server and client code is fluid. Server Components execute exclusively on the server, while Client Components (`"use client"`) execute on both the server (during initial SSR) and the client (during hydration and interaction).

Because Server Components have direct access to server-side secrets and environment variables, private credentials can easily be forwarded into Client Component props or rendered markup by accident.

SIS provides an **interprocedural static taint analysis engine** designed to detect and trace sensitive credential flows before code is shipped to production.

---

## The Secret Leakage Problem

Consider a common Next.js pattern:

```tsx
// app/profile/page.tsx (Server Component)
import { getUserSession } from "@/lib/auth";
import { UserProfileCard } from "./UserProfileCard"; // "use client"

export default async function ProfilePage() {
  const session = await getUserSession();

  // Inadvertently forwarding the entire session object!
  return <UserProfileCard session={session} />;
}
```

If `getUserSession()` retrieves private tokens or signing keys (`process.env.AUTH_SECRET`) and includes them in the `session` object, those secrets cross the wire as client props. The private token is now exposed in the client HTML payload and JavaScript bundle.

---

## Taint Sources & Sinks

### Taint Sources
SIS monitors environment variable reads and classifies them:

- **Sensitive Sources**: Any environment access matching:
  - `*_SECRET` (e.g. `AUTH_SECRET`, `JWT_SECRET`)
  - `*_KEY` (e.g. `STRIPE_API_KEY`, `PRIVATE_KEY`)
  - `*_TOKEN` (e.g. `GITHUB_TOKEN`, `SLACK_BOT_TOKEN`)
  - `*_PASSWORD` or `*_PASS`
  - `PRIVATE_*`
  - `SECRET_*`
- **Safe Variables**: Environment variables starting with `NEXT_PUBLIC_*` are explicitly designed for client exposure by Next.js conventions and are excluded from taint warnings.

### Taint Sinks
A taint violation occurs when a sensitive value reaches:
1. **Client Component Props**: `<ClientComponent secretProp={tainted} />`
2. **Client JSX Expressions**: `<div>{taintedValue}</div>` inside a module marked with `"use client"`.
3. **Server Action Returns**: Direct return of private environment credentials to client callers.

---

## Interprocedural Call-Graph Propagation

Real-world applications rarely pass `process.env.SECRET` directly to a JSX prop in the same function. Taint flows across multi-hop helper chains:

```text
process.env.AUTH_SECRET
        ↓
getDatabaseKey()
        ↓
createSessionContext()
        ↓
UserProfilePage()
        ↓
<ClientCard apiKey={...} />  ──>  ✖ SIS001: taint-violation
```

### Module Call Graph
SIS builds a local module graph connecting exported functions, helper utilities, and variable bindings:
- **Variable Assignments**: Tracks `const key = process.env.SECRET;`.
- **Object Literal Packing**: Tracks `{ auth: { token: key } }`.
- **Destructuring Unpacking**: Tracks `const { token } = config;`.
- **Template Literals**: Tracks `Bearer ${token}`.
- **Function Returns**: Tracks return expressions across local calls.

### Depth Bounding
To avoid infinite loops caused by recursive calls or circular imports, SIS enforces a cycle-safe maximum analysis depth (configured via `--max-analysis-depth`, default: 8 hops).

---

## SIS Rule: `SIS001` Taint Violation

When a tainted flow reaches a client boundary, SIS reports `SIS001: taint-violation`:

```text
◆ STATIC TAINT ANALYSIS
  ✖ 1 secret taint violation detected (SIS001)

  Source:
    process.env.AUTH_SECRET
    lib/auth.ts:12:21

  Flow Trace:
    lib/auth.ts:12:21        ──> const secret = process.env.AUTH_SECRET
    lib/auth.ts:18:5         ──> return { secret, user }
    app/profile/page.tsx:8:3 ──> <UserProfile secret={session.secret} />

  Sink:
    <UserProfile secret={...} /> (Client Component boundary)
    app/profile/page.tsx:8:3
```

---

## Remediation Patterns

### 1. Use the Next.js `server-only` Package
Ensure helper modules accessing private environment variables cannot be imported by client components:
```bash
npm install server-only
```
```typescript
// lib/auth.ts
import "server-only";

export function getAuthSecret() {
  return process.env.AUTH_SECRET;
}
```

### 2. Project Only Public Fields (DTOs)
Never pass raw database models or session objects across the boundary. Construct an explicit, minimal Data Transfer Object:
```typescript
// Safe projection
const publicProfile = {
  id: session.user.id,
  name: session.user.name,
  email: session.user.email,
  // Omit tokens, hashes, and internal keys
};

return <UserProfileCard user={publicProfile} />;
```

---

## Related Guides

- [Testing Next.js Server Actions](./server-actions-testing.md)
- [React Flight Serialization Boundaries](./serialization-boundaries.md)
- [Adversarial Testing & Speculative Fuzzing](./adversarial-testing.md)
- [Architecture Specification](./architecture.md)
- [Frequently Asked Questions](./faq.md)
