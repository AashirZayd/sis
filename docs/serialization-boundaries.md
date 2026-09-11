# React Flight Serialization Boundaries in Next.js

In React Server Components (RSC) and the Next.js App Router, data that crosses the server-to-client boundary is encoded and transported using the **React Flight protocol**.

Understanding how React Flight serializes values is essential to preventing unexpected runtime crashes and security leaks.

---

## JSON.stringify Semantics vs React Flight Semantics

Many developers assume that Server Component props behave like `JSON.stringify()`. This is incorrect:

```text
JSON.stringify semantics  ≠  React Flight semantics
```

While standard JSON only supports strings, numbers, booleans, arrays, plain objects, and `null`, the React Flight wire specification supports a richer set of JavaScript built-ins, but imposes strict constraints on functions, symbols, and class instances.

### Supported (Transferable) Types
- **Primitives**: `string`, `number`, `boolean`, `null`, `undefined`, `bigint`.
- **Containers**: Plain objects (`{}`), arrays (`[]`).
- **Standard Built-ins**: `Date`, `Map`, `Set`, `ArrayBuffer`, typed arrays (`Uint8Array`, `Float32Array`, etc.), `RegExp`.
- **Promises**: React can stream Promises from server to client components using Suspense.
- **Server Actions**: Async functions marked with `"use server"` (React serializes these as remote procedure call references).

### Unsupported (Non-Transferable) Hazards
- **Ordinary Functions & Closures**: Event handlers or callbacks without `"use server"`.
- **Class Instances**: Custom class instances (e.g. `new DatabaseRecord()`, `new UserSession()`). React Flight does not serialize prototype methods or private state across the wire.
- **Unregistered Symbols**: Local `Symbol()` identifiers. Only well-known or registered symbols (`Symbol.for()`) can be referenced.
- **Circular Data Structures**: Objects referencing themselves trigger infinite traversal or serialization failure.

---

## Where Boundary Violations Occur

There are two primary locations in Next.js applications where React Flight serialization is enforced:

### 1. Server Component Props to Client Components
When a Server Component renders a Client Component (`"use client"`), any prop passed into the client component must be serializable:

```tsx
// ServerComponent.tsx (Server Component)
import { ClientButton } from "./ClientButton"; // marked with "use client"

export default function ServerComponent() {
  const handleClick = () => {
    console.log("Clicked on server");
  };

  // ✖ VIOLATION: Cannot pass an ordinary function to a Client Component!
  return <ClientButton onClick={handleClick} />;
}
```

This triggers `SIS002: serialization-violation`. At runtime in Next.js, this crashes the React Flight stream with:
```text
Error: Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server".
```

### 2. Server Action Return Values
When a client invokes a Server Action, the value returned by the Server Action travels back across the network wire to the client via React Flight:

```typescript
"use server";

class SessionToken {
  constructor(public token: string) {}
  getMasked() { return this.token.slice(0, 4) + "****"; }
}

export async function createSession() {
  // ✖ VIOLATION: Custom class instances cannot cross React Flight boundaries
  return new SessionToken("secret-12345");
}
```

---

## How SIS Detects Serialization Violations

SIS inspects the AST of Server Components and Server Actions:

1. **Boundary Visitor**: Locates JSX elements where the component tag resolves to a module marked with `"use client"`.
2. **Prop Expression Analysis**: Analyzes the AST node of each prop expression passed to the Client Component:
   - Identifies inline arrow functions, function expressions, and references to non-server functions.
   - Identifies `new` expressions instantiating custom classes.
   - Identifies local `Symbol()` calls.
3. **Flight Classification**: Emits an actionable `SIS002: serialization-violation` diagnostic with exact file, line, and column coordinates.

---

## Remediation Patterns

### 1. Expose Server Actions Explicitly
If a Server Component needs to pass a callable function to a Client Component, add the `"use server"` directive inside the function or define it in a `"use server"` module:

```tsx
// ServerComponent.tsx
import { ClientButton } from "./ClientButton";

export default function ServerComponent() {
  async function handleServerAction() {
    "use server";
    await performDatabaseMutation();
  }

  return <ClientButton onAction={handleServerAction} />;
}
```

### 2. Flatten Class Instances to Plain DTOs
Convert database entities and domain classes to plain JavaScript objects before returning them to client components or actions:

```typescript
export async function getProfile(userId: string) {
  const user = await db.users.findUnique({ where: { id: userId } });
  // Return a plain Data Transfer Object (DTO)
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}
```

---

## Related Guides

- [Testing Next.js Server Actions](./server-actions-testing.md)
- [Static Secret Taint Analysis](./taint-analysis.md)
- [Adversarial Testing & Speculative Fuzzing](./adversarial-testing.md)
- [Architecture Specification](./architecture.md)
- [Frequently Asked Questions](./faq.md)
