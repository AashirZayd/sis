# SIS Benchmark Corpus Candidates

## 1. Overview & Selection Methodology

This catalog documents the candidate repositories for the expanded SIS benchmark corpus. The objective is to evaluate whether SIS's detection capabilities, prefix execution model, and 100% emitted precision generalize across diverse real-world Next.js App Router codebases.

### Selection Criteria:
1. **Independent Provenance**: Open-source, independently maintained public repositories representing real production applications or reference architectures rather than toy tutorials.
2. **Next.js App Router Architecture**: Uses modern Next.js (`>= 13.4`, `14.x`, or `15.x`) with the App Router (`app/` directory), React Server Components (RSC), and Server Actions (`"use server"`).
3. **Technological & Domain Diversity**: Wide distribution across database ORMs (Prisma, Drizzle, Supabase, Postgres), cloud SDKs (Stripe, Upstash, Resend, AI SDKs), form architectures (`FormData`, Zod, React Hook Form), and application archetypes (E-commerce, SaaS, Developer Tools, Financial Tools, Healthcare/Surveys).
4. **Anti-Bias Guarantee**: Repositories were **NOT** chosen based on known SIS findings, nor were GitHub vulnerability search terms used to find targets. Selection was driven purely by architectural diversity and real-world prominence.
5. **Deterministic Pinning**: Every repository must resolve to an immutable Git commit SHA. No moving branches (`main`, `master`) are ever benchmarked.

---

## 2. Repository Catalog (20 Candidates)

### Category A: Existing Baseline (CORE — 5 Repositories)

#### 1. shadcn-ui/taxonomy
- **Repository**: `shadcn-ui/taxonomy`
- **URL**: `https://github.com/shadcn-ui/taxonomy.git`
- **Pinned Commit**: `298a8857c7128a0d121e7f699dfd729f23b3966d`
- **Category**: `existing-baseline` | `CORE`
- **Size Class**: Medium (~248 files scanned, 127 analyzed)
- **Framework**: Next.js `13.4.0` | Prisma | NextAuth
- **Why Selected**: Seminal open-source Next.js App Router reference application demonstrating post/user mutations, route handlers, and contentlayer markdown pipelines.
- **Expected Coverage**: Server boundary classification, route handler filtering, Prisma ORM boundaries (`STATIC_ONLY`).
- **Interesting Patterns**: Early App Router patterns, mixed RSC and Client Component trees.
- **Potential Concerns**: Older App Router conventions; does not exercise Next.js 15 async Request APIs.

#### 2. leerob/site
- **Repository**: `leerob/site`
- **URL**: `https://github.com/leerob/site.git`
- **Pinned Commit**: `fd03371e3c90481a8447904e1b548e4c0327b7db`
- **Category**: `existing-baseline` | `CORE`
- **Size Class**: Small (~21 files scanned, 4 analyzed)
- **Framework**: Next.js `15.0.0` | Postgres | Server Actions
- **Why Selected**: Personal production site maintained by Vercel VP of DevRel, exhibiting bleeding-edge Next.js 15 Server Actions and direct database queries.
- **Expected Coverage**: Clean App Router server actions, zero-config Postgres queries, modern RSC idioms.
- **Interesting Patterns**: Server action guestbook mutations with optimistic UI updates.
- **Potential Concerns**: Compact file count; limited complex form interactions.

#### 3. vercel/commerce
- **Repository**: `vercel/commerce`
- **URL**: `https://github.com/vercel/commerce.git`
- **Pinned Commit**: `3761e52e60df9c6a316e067dbfd7032e494d3634`
- **Category**: `existing-baseline` | `CORE`
- **Size Class**: Medium (~101 files scanned, 65 analyzed)
- **Framework**: Next.js `15.0.0` | Shopify Storefront API | Cookies
- **Why Selected**: Official Vercel commerce template exercising shopping cart Server Actions, dynamic RSC revalidation, and cookie session management.
- **Expected Coverage**: Server action validation prefixes, cookie preludes, Shopify cloud boundaries, and the 9 confirmed TRUE_POSITIVE findings (`updateItemQuantity`).
- **Interesting Patterns**: Cart mutations taking typed arguments, cookie manipulation via `cookies()`.
- **Potential Concerns**: Third-party Shopify API boundaries dominate mutation handlers.

#### 4. dubinc/dub
- **Repository**: `dubinc/dub`
- **URL**: `https://github.com/dubinc/dub.git`
- **Pinned Commit**: `b8866f413cec065438d6e5faabbd9dac7d1ceea5`
- **Category**: `existing-baseline` | `CORE`
- **Size Class**: Large Monorepo (~4,670 files scanned, 3,421 analyzed)
- **Framework**: Next.js `14.2.0` | Prisma | Upstash Redis | Tinybird | NextAuth
- **Why Selected**: Production-grade link management platform featuring multi-tenant workspace routing, intensive Zod schema validation, and rate-limiting infrastructure.
- **Expected Coverage**: Stress-tests SWC AST traversal at enterprise scale, Upstash singleton isolation, and route handler vs action discrimination.
- **Interesting Patterns**: Route handlers returning dynamic OG images (`ImageResponse`), complex nested Zod schemas.
- **Potential Concerns**: Monorepo structure requires targeting `apps/web` to avoid scanning unrelated packages.

#### 5. mickasmt/next-saas-stripe-starter
- **Repository**: `mickasmt/next-saas-stripe-starter`
- **URL**: `https://github.com/mickasmt/next-saas-stripe-starter.git`
- **Pinned Commit**: `a78d130af7e04d0250d65c67f217976f7eb3adc2`
- **Category**: `existing-baseline` | `CORE`
- **Size Class**: Medium (~322 files scanned, 187 analyzed)
- **Framework**: Next.js `14.0.0` | Stripe | Prisma | Resend
- **Why Selected**: Popular open-source SaaS boilerplate demonstrating subscription billing, webhook handlers, user role authorization, and email dispatch.
- **Expected Coverage**: Stripe SDK isolation (`STATIC_ONLY`), subscription mutation server actions, webhook flight boundary exclusion.
- **Interesting Patterns**: Webhook signatures in route handlers; role-based access checks.
- **Potential Concerns**: Significant boilerplate code that may mirror standard tutorials.

---

### Category B: New Candidates (EXTENDED — 12 Repositories)

#### 6. calcom/cal.com
- **Repository**: `calcom/cal.com`
- **URL**: `https://github.com/calcom/cal.com.git`
- **Pinned Commit**: `696c21e6be3f07a70514101e4ec9d929312b9c3e`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Very Large Monorepo (>10,000 files; target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | NextAuth | tRPC & Server Actions
- **Why Selected**: Enterprise scheduling platform with complex organizational logic, bookings, calendar synchronizations, and webhooks.
- **Expected Coverage**: High-density server boundaries, complex multi-step validation logic, permission checks.
- **Interesting Patterns**: Mixed tRPC endpoints and App Router server actions; complex date/timezone parsing.
- **Potential Concerns**: Repository scale requires memory-efficient traversal; analysis timeouts on huge files.

#### 7. formbricks/formbricks
- **Repository**: `formbricks/formbricks`
- **URL**: `https://github.com/formbricks/formbricks.git`
- **Pinned Commit**: `29e0a0d4c1b920dcfb681f2bb8b6f38dbda18d6e`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Large Monorepo (target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | Zod | Server Actions
- **Why Selected**: Open-source survey management and user experience toolkit with high-frequency form submissions and multi-tenant telemetry.
- **Expected Coverage**: Survey response submission actions, client-to-server prop boundaries with complex survey definitions.
- **Interesting Patterns**: Dynamic question logic, conditional display logic evaluated on server and client.
- **Potential Concerns**: Multi-package dependencies within monorepo workspaces.

#### 8. documenso/documenso
- **Repository**: `documenso/documenso`
- **URL**: `https://github.com/documenso/documenso.git`
- **Pinned Commit**: `7e2d7e48b8120ec08d4b3c7b2a95c89839eb7e04`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Large Monorepo (target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | Server Actions | PDF Manipulation
- **Why Selected**: Open-source electronic signature platform with strict security, document signing flows, signature verification, and audit trails.
- **Expected Coverage**: Input validation on cryptographic and document identifiers, envelope mutations, signature coordinates.
- **Interesting Patterns**: Heavy validation prefixes before invoking PDF generation and crypto libraries.
- **Potential Concerns**: Cryptographic native binary dependencies (handled statically by SWC parser).

#### 9. openstatusHQ/openstatus
- **Repository**: `openstatusHQ/openstatus`
- **URL**: `https://github.com/openstatusHQ/openstatus.git`
- **Pinned Commit**: `982f6e91da5a1b32607e3bcba89196b054238e55`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Medium (~450 files; target `apps/web`)
- **Framework**: Next.js `14.x` | Drizzle ORM | Turso | Server Actions
- **Why Selected**: Open-source status page and synthetic monitoring service exercising modern lightweight Drizzle ORM and Turso SQLite integration.
- **Expected Coverage**: Exercises Drizzle ORM detection, latency metrics parsing, incident report actions.
- **Interesting Patterns**: Clean Drizzle query patterns, lightweight server actions with schema validation.
- **Potential Concerns**: SQLite schema idioms distinct from traditional Prisma patterns.

#### 10. midday-ai/midday
- **Repository**: `midday-ai/midday`
- **URL**: `https://github.com/midday-ai/midday.git`
- **Pinned Commit**: `a38c2084c7e65129994c924bc01c0b31dd8752c0`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Large Monorepo (target `apps/dashboard`)
- **Framework**: Next.js `14.x` | Supabase | AI SDK | Server Actions
- **Why Selected**: Modern all-in-one financial dashboard for freelancers and businesses, handling invoice generation, transactions, and banking reconciliation.
- **Expected Coverage**: Financial calculation prefixes, Supabase Auth integration, AI-assisted categorization server actions.
- **Interesting Patterns**: Decimal currency arithmetic, invoice status mutations, bank sync triggers.
- **Potential Concerns**: Heavy Supabase client usage throughout server actions.

#### 11. vercel/platforms
- **Repository**: `vercel/platforms`
- **URL**: `https://github.com/vercel/platforms.git`
- **Pinned Commit**: `e680a6b4122d64f26b5ce53434ea32356c9d7be1`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Medium (~150 files)
- **Framework**: Next.js `14.x` | Prisma | NextAuth | Multi-tenant Middleware
- **Why Selected**: Vercel's flagship multi-tenant platform architecture template with wildcard subdomains and custom domain mapping.
- **Expected Coverage**: Post publishing, subdomain validation actions, site settings mutations.
- **Interesting Patterns**: Middleware rewrite header consumption inside RSC and Route Handlers.
- **Potential Concerns**: Overlap with taxonomy/commerce coding styles.

#### 12. steven-tey/precedent
- **Repository**: `steven-tey/precedent`
- **URL**: `https://github.com/steven-tey/precedent.git`
- **Pinned Commit**: `b6f5d886477e7776b6e4e89f81640a3f892c5719`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Small-Medium (~80 files)
- **Framework**: Next.js `14.x` | Prisma | Framer Motion | NextAuth
- **Why Selected**: Highly starred modern starter with polished UI hooks, modal workflows, and feedback/auth server actions.
- **Expected Coverage**: Lightweight mutation actions, user profile updates, modal state serialization.
- **Interesting Patterns**: Client components consuming server actions as form actions.
- **Potential Concerns**: Compact action surface area.

#### 13. infisical/infisical
- **Repository**: `infisical/infisical`
- **URL**: `https://github.com/infisical/infisical.git`
- **Pinned Commit**: `a53b2111cbb9eb5c48b29f04ca44d47f9f30e012`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Large (target `frontend`)
- **Framework**: Next.js `14.x` | Secrets Cryptography | RBAC
- **Why Selected**: Secrets management platform with security-critical frontend handling API keys, environment secret staging, and access control.
- **Expected Coverage**: Secret leakage prevention (`SIS001`), cryptographic parameter validation, RBAC boundaries.
- **Interesting Patterns**: High concentration of sensitive secret objects and token handling.
- **Potential Concerns**: Mixed Next.js Pages and App Router code in transition.

#### 14. charlie-tango/next-starter
- **Repository**: `charlie-tango/next-starter`
- **URL**: `https://github.com/charlie-tango/next-starter.git`
- **Pinned Commit**: `e8f49a781b0a88df88319ad08eb6758416035cb2`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Small-Medium (~110 files)
- **Framework**: Next.js `14.x` | Zod | Server Actions | TypeScript Strict
- **Why Selected**: Enterprise template with clean TypeScript architecture, strict Zod schema validation, and dedicated Server Action wrappers (`next-safe-action` pattern).
- **Expected Coverage**: Validates how SIS interacts with structured action middleware and Zod schema wrappers.
- **Interesting Patterns**: Explicit action input parsing before executing handler bodies.
- **Potential Concerns**: Abstraction layer around Server Actions may obscure raw directive syntax.

#### 15. shadcn-ui/ui
- **Repository**: `shadcn-ui/ui`
- **URL**: `https://github.com/shadcn-ui/ui.git`
- **Pinned Commit**: `d8521a64b971a8bc84ef937e19ec7a731efc1b71`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Medium (target `apps/www`)
- **Framework**: Next.js `14.x` | Contentlayer | RSC Component Registry
- **Why Selected**: Official site for shadcn/ui. Evaluates complex RSC serialization of component code blocks, component registry endpoints, and theme customizers.
- **Expected Coverage**: Flight prop serialization (`SIS002`), deep server-to-client component trees, dynamic theme prop boundaries.
- **Interesting Patterns**: Intensive use of RSC for server-side code highlighting and AST transformation.
- **Potential Concerns**: Very few Server Actions; predominantly static and server-rendered content.

#### 16. typebot/typebot
- **Repository**: `typebot/typebot`
- **URL**: `https://github.com/typebot/typebot.git`
- **Pinned Commit**: `1081b9cf3a5fa2b79e708c4e402eb06a928e08d5`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Large Monorepo (target `apps/viewer`)
- **Framework**: Next.js `14.x` | Prisma | Bot Form Runner
- **Why Selected**: Visual chatbot and conversational form builder. The viewer app executes interactive bot steps using Next.js App Router and server actions.
- **Expected Coverage**: Input parsing on dynamic conversation variables, rich form state dispatch, webhook triggers.
- **Interesting Patterns**: Conversational form submission via Server Actions.
- **Potential Concerns**: Monorepo packages cross-referenced via pnpm workspaces.

#### 17. payloadcms/payload
- **Repository**: `payloadcms/payload`
- **URL**: `https://github.com/payloadcms/payload.git`
- **Pinned Commit**: `c8734289bb68d3744be6503f192b153b82dfc74e`
- **Category**: `new-candidate` | `EXTENDED`
- **Size Class**: Medium-Large (target `templates/with-nextjs`)
- **Framework**: Next.js `15.x` | Payload CMS v3 | Server Components
- **Why Selected**: Payload v3 runs natively inside Next.js App Router without a separate server process, unifying CMS and frontend in a single tree.
- **Expected Coverage**: Deep server component prop passing, server-side content querying, live preview prop boundaries.
- **Interesting Patterns**: Headless CMS queries directly in React Server Components.
- **Potential Concerns**: Tight coupling to Payload core framework abstractions.

---

### Category C: Adversarial Stress Targets (ADVERSARIAL — 3 Repositories)

#### 18. t3-oss/create-t3-app
- **Repository**: `t3-oss/create-t3-app`
- **URL**: `https://github.com/t3-oss/create-t3-app.git`
- **Pinned Commit**: `5265e31efefdbb6c6b414f5298f657a82c4ee9ff`
- **Category**: `new-candidate` | `ADVERSARIAL`
- **Size Class**: Medium (target `cli/template/extras/src/app`)
- **Framework**: Next.js App Router | tRPC / Server Actions | NextAuth | Drizzle
- **Why Selected**: Benchmark template for the full T3 stack. Exercises interplay between tRPC procedures, Server Actions, and NextAuth session propagation.
- **Expected Coverage**: Discriminates between tRPC server boundaries and native React Flight Server Actions.
- **Interesting Patterns**: Template replacement variables; conditional imports.
- **Potential Concerns**: Template files may contain template placeholders (`<%= %>`) requiring exclusion of raw templates.

#### 19. clerk/javascript
- **Repository**: `clerk/javascript`
- **URL**: `https://github.com/clerk/javascript.git`
- **Pinned Commit**: `b6f5285e68ba9cf41d279cf3275210e7b1a20684`
- **Category**: `new-candidate` | `ADVERSARIAL`
- **Size Class**: Medium (target `apps/next-app` / `packages/nextjs`)
- **Framework**: Next.js `14.x`/`15.x` | Clerk Auth Headers | Server Actions
- **Why Selected**: Authentication provider showcasing auth middleware, cookie tokens, `auth()` / `currentUser()` server components, and protected action patterns.
- **Expected Coverage**: Stress-tests framework prelude boundaries for authentication headers and cookies.
- **Interesting Patterns**: Heavy usage of dynamic headers and redirect preludes on unauthorized actions.
- **Potential Concerns**: Complex package build dependencies.

#### 20. dubinc/dub (Adversarial Route Handlers & Webhook Slice)
- **Repository**: `dubinc/dub` (Sub-corpus focus: `app/api/**`)
- **URL**: `https://github.com/dubinc/dub.git`
- **Pinned Commit**: `b8866f413cec065438d6e5faabbd9dac7d1ceea5`
- **Category**: `existing-baseline` | `ADVERSARIAL`
- **Size Class**: Medium (~85 Route Handler files)
- **Framework**: Next.js Route Handlers | Stripe Webhooks | Tinybird Webhooks
- **Why Selected**: Previously generated Phase 22 false positives on `ImageResponse` and webhooks. Retained as an adversarial sanity slice to ensure route handler filters never regress.
- **Expected Coverage**: 0 false positives on HTTP streaming, raw webhooks, and image generators.
- **Interesting Patterns**: Route handlers returning raw PNG streams and JSON responses.
- **Potential Concerns**: Already tracked in CORE; acts as an explicit negative control.

---

### Category D: Documented Excluded Repositories (3 Repositories)

| Repository | Reason for Exclusion |
| :--- | :--- |
| `facebook/react` | **Non-App-Router**: React library repository, not a Next.js App Router application. Lacks `"use server"` Next.js invocation contexts. |
| `vercel/next.js` | **Framework Engine**: Contains framework compiler source, CLI, and thousands of artificial integration test suites; not a realistic end-user web application. |
| `nextauthjs/next-auth` | **Library Repository**: Auth library SDK with generic adapter code rather than application business logic and end-user Server Actions. |

---

## 3. Candidate Corpus Summary Statistics

- **Total Candidates**: 20 repositories
- **Distribution**:
  - `CORE` (Existing Baseline): 5 repositories (25%)
  - `EXTENDED` (New Applications): 12 repositories (60%)
  - `ADVERSARIAL` (Stress & Negative Controls): 3 repositories (15%)
- **Next.js Versions**: `13.4.x` (10%), `14.x` (75%), `15.x` (15%)
- **Primary ORMs / Databases**: Prisma (55%), Drizzle (15%), Supabase/Postgres (20%), Other/Shopify (10%)
- **Size Classes**:
  - Small (< 100 files): 3
  - Medium (100–500 files): 9
  - Large (500–5,000 files): 6
  - Very Large (> 5,000 files): 2
