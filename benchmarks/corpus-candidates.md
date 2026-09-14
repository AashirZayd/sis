# SIS Benchmark Corpus Candidates

## 1. Overview & Selection Methodology

This catalog documents the candidate repositories for the expanded SIS benchmark corpus. The objective is to evaluate whether SIS's detection capabilities, prefix execution model, and 100% emitted precision generalize across diverse real-world Next.js App Router codebases.

### Selection Criteria:
1. **Independent Provenance**: Open-source, independently maintained public repositories representing real production applications or reference architectures rather than toy tutorials.
2. **Next.js App Router Architecture**: Uses modern Next.js (`>= 13.4`, `14.x`, or `15.x`) with the App Router (`app/` directory), React Server Components (RSC), and Server Actions (`"use server"`).
3. **Technological & Domain Diversity**: Wide distribution across database ORMs (Prisma, Drizzle, Supabase, Postgres), cloud SDKs (Stripe, Upstash, Resend, AI SDKs), form architectures (`FormData`, Zod, React Hook Form), and application archetypes (E-commerce, SaaS, Developer Tools, Financial Tools, Healthcare/Surveys).
4. **Anti-Bias Guarantee**: Repositories were **NOT** chosen based on known SIS findings, nor were GitHub vulnerability search terms used to find targets. Selection was driven purely by architectural diversity and real-world prominence.
5. **Deterministic Pinning**: Every repository must resolve to an immutable Git commit SHA. No moving branches (`main`, `master`, `HEAD`) are ever benchmarked.

---

## 2. Repository Catalog (20 Candidates)

### Category A: Existing Baseline (CORE — 5 Repositories)

#### 1. shadcn-ui/taxonomy
- **Repository**: `shadcn-ui/taxonomy`
- **URL**: `https://github.com/shadcn-ui/taxonomy.git`
- **Pinned Commit**: `298a8857c7128a0d121e7f699dfd729f23b3966d`
- **Category**: `existing-baseline` | `CORE`
- **Status**: `active`
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
- **Status**: `active`
- **Size Class**: Small (~21 files scanned, 4 analyzed)
- **Framework**: Next.js `15.0.0` | Postgres | Server Actions
- **Why Selected**: Personal production site maintained by Vercel VP of DevRel, exhibiting bleeding-edge Next.js 15 Server Actions and direct database queries.
- **Expected Coverage**: Clean App Router server actions, zero-config Postgres queries, modern RSC idioms.
- **Interesting Patterns**: Server actions as simple mutation handlers without heavy wrapper libraries.
- **Potential Concerns**: Small surface area limits finding yield.

#### 3. vercel/commerce
- **Repository**: `vercel/commerce`
- **URL**: `https://github.com/vercel/commerce.git`
- **Pinned Commit**: `3761e52e60df9c6a316e067dbfd7032e494d3634`
- **Category**: `existing-baseline` | `CORE`
- **Status**: `active`
- **Size Class**: Medium (~108 files scanned, 61 analyzed)
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
- **Status**: `active`
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
- **Status**: `active`
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
- **Pinned Commit**: `6a75ef86b011665081706ba7f905b05559ac474b` (v4.0.0 release tag; repaired from unresolvable `696c21e`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Very Large Monorepo (>10,000 files; target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | NextAuth | tRPC & Server Actions
- **Why Selected**: Enterprise scheduling platform with complex organizational logic, bookings, calendar synchronizations, and webhooks.
- **Expected Coverage**: High-density server boundaries, complex multi-step validation logic, permission checks.

#### 7. formbricks/formbricks
- **Repository**: `formbricks/formbricks`
- **URL**: `https://github.com/formbricks/formbricks.git`
- **Pinned Commit**: `a1d83ac7b993ba85c5bb5ec193b99ab9e77b0baf` (v2.5.0 release tag; repaired from unresolvable `29e0a0d`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Large Monorepo (target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | Zod | Server Actions
- **Why Selected**: Open-source survey management and user experience toolkit with form submissions and multi-tenant telemetry.

#### 8. documenso/documenso
- **Repository**: `documenso/documenso`
- **URL**: `https://github.com/documenso/documenso.git`
- **Pinned Commit**: `e95e13021d7f17139b8d848ea6761e5479b25560` (v1.9.1 release tag; repaired from unresolvable `7e2d7e4`; contains Next.js App Router in `apps/web/src/app`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Large Monorepo (target `apps/web`)
- **Framework**: Next.js `14.x` | Prisma | Server Actions | PDF Manipulation
- **Why Selected**: Open-source electronic signature platform with strict security, document signing flows, signature verification, and audit trails.

#### 9. openstatusHQ/openstatus
- **Repository**: `openstatusHQ/openstatus`
- **URL**: `https://github.com/openstatusHQ/openstatus.git`
- **Pinned Commit**: `3a6efd1f91726de14f490035d4b178aabc1e1eac`
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `excluded`
- **Exclusion Reason**: `clone-timeout: Repository snapshot transfer exceeds bounded acquisition budget under network constraints`
- **Size Class**: Medium (~450 files; target `apps/web`)
- **Framework**: Next.js `14.x` | Drizzle ORM | Turso | Server Actions
- **Notes**: Snapshot transfer consistently exceeds bounded acquisition timeout (90s); transparently excluded for CI reliability.

#### 10. midday-ai/midday
- **Repository**: `midday-ai/midday`
- **URL**: `https://github.com/midday-ai/midday.git`
- **Pinned Commit**: `e27b7040efdea2b3d1cca2553a4def7aaf11a053` (midday-v0.5.0 tag; repaired from unresolvable `a38c208`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Large Monorepo (target `apps/dashboard`)
- **Framework**: Next.js `14.x` | Supabase | AI SDK | Server Actions
- **Why Selected**: Modern all-in-one financial dashboard for businesses, handling invoice generation, transactions, and banking reconciliation.

#### 11. vercel/platforms
- **Repository**: `vercel/platforms`
- **URL**: `https://github.com/vercel/platforms.git`
- **Pinned Commit**: `ec12e65709c8263dd3462c4d33261851b8a3157d` (repaired from unresolvable `e680a6b`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Medium (~150 files)
- **Framework**: Next.js `14.x` | Prisma | NextAuth | Multi-tenant Middleware
- **Why Selected**: Vercel's multi-tenant platform architecture template with wildcard subdomains and custom domain mapping.

#### 12. steven-tey/precedent
- **Repository**: `steven-tey/precedent`
- **URL**: `https://github.com/steven-tey/precedent.git`
- **Pinned Commit**: `3be40205d7cdf56082cd284f07f12251b9208f79` (repaired from unresolvable `b6f5d88`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Small-Medium (~80 files)
- **Framework**: Next.js `14.x` | Prisma | Framer Motion | NextAuth
- **Why Selected**: Modern starter with polished UI hooks, modal workflows, and feedback/auth server actions.

#### 13. infisical/infisical
- **Repository**: `infisical/infisical`
- **URL**: `https://github.com/infisical/infisical.git`
- **Pinned Commit**: `e1b25f9f6a8d81bbe6ce31513a5f17ad596984de` (v0.43.70)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `excluded`
- **Exclusion Reason**: `clone-timeout: Repository single-commit snapshot exceeds 880MB, exceeding the 45s non-interactive acquisition budget`
- **Size Class**: Large Monorepo (>880MB Git snapshot)
- **Notes**: Excluded because single-commit Git snapshot transfer requires downloading ~883 MB of binary objects, rendering bounded non-interactive acquisition impossible.

#### 14. charlie-tango/next-starter
- **Repository**: `charlie-tango/next-starter`
- **URL**: `https://github.com/charlie-tango/next-starter.git`
- **Pinned Commit**: `e8f49a781b0a88df88319ad08eb6758416035cb2`
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `excluded`
- **Exclusion Reason**: `repository-unreachable: Repository not found on GitHub (HTTP 404)`
- **Notes**: Repository was made private or deleted from GitHub upstream.

#### 15. shadcn-ui/ui
- **Repository**: `shadcn-ui/ui`
- **URL**: `https://github.com/shadcn-ui/ui.git`
- **Pinned Commit**: `460ad60d84617836762a8800755fafef37f662df` (peeled commit for release tag `shadcn@4.9.0`; repaired from unresolvable `d8521a6`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Medium (target `apps/v4`)
- **Framework**: Next.js `14.x` | Contentlayer | RSC Component Registry
- **Why Selected**: Official site for shadcn/ui. Evaluates complex RSC serialization of component code blocks, component registry endpoints, and theme customizers.

#### 16. typebot/typebot
- **Repository**: `typebot/typebot`
- **URL**: `https://github.com/typebot/typebot.git`
- **Pinned Commit**: `1081b9cf3a5fa2b79e708c4e402eb06a928e08d5`
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `excluded`
- **Exclusion Reason**: `repository-unreachable: Repository not found on GitHub under typebot/typebot (HTTP 404)`
- **Notes**: Repository was renamed or deleted upstream.

#### 17. payloadcms/payload
- **Repository**: `payloadcms/payload`
- **URL**: `https://github.com/payloadcms/payload.git`
- **Pinned Commit**: `6407e577d30d2e04a4aac8a5787416e67fd146c2` (peeled commit for release tag `v3.0.0`; repaired from unresolvable `c873428`)
- **Category**: `new-candidate` | `EXTENDED`
- **Status**: `active`
- **Size Class**: Medium-Large (target `templates/blank`)
- **Framework**: Next.js `15.x` | Payload CMS v3 | Server Components
- **Why Selected**: Payload v3 runs natively inside Next.js App Router without a separate server process, unifying CMS and frontend in a single tree.

---

### Category C: Adversarial Stress Targets (ADVERSARIAL — 3 Repositories)

#### 18. t3-oss/create-t3-app
- **Repository**: `t3-oss/create-t3-app`
- **URL**: `https://github.com/t3-oss/create-t3-app.git`
- **Pinned Commit**: `22d01d2e93fc3a16c2001413ef2d54ac2ce84a5d` (peeled commit for tag `create-t3-app@7.36.0`; repaired from unresolvable `5265e31`)
- **Category**: `new-candidate` | `ADVERSARIAL`
- **Status**: `active`
- **Size Class**: Medium (target `cli/template/extras/src/app`)
- **Framework**: Next.js App Router | tRPC / Server Actions | NextAuth | Drizzle
- **Why Selected**: Benchmark template for full T3 stack. Discriminates between tRPC server boundaries and native React Flight Server Actions.

#### 19. clerk/javascript
- **Repository**: `clerk/javascript`
- **URL**: `https://github.com/clerk/javascript.git`
- **Pinned Commit**: `d79852e4cabe9bb0681084a6e9653874cf5aa378` (peeled commit for tag `@clerk/nextjs@7.5.8`; repaired from unresolvable `b6f5285`)
- **Category**: `new-candidate` | `ADVERSARIAL`
- **Status**: `active`
- **Size Class**: Medium (target `packages/nextjs`)
- **Framework**: Next.js `14.x`/`15.x` | Clerk Auth Headers | Server Actions
- **Why Selected**: Authentication provider showcasing auth middleware, cookie tokens, `auth()` / `currentUser()` server components, and protected action patterns.

#### 20. dubinc/dub-api (Adversarial Route Handlers & Webhook Slice)
- **Repository**: `dubinc/dub-api` (Sub-corpus focus: `app/api/**`)
- **URL**: `https://github.com/dubinc/dub.git`
- **Pinned Commit**: `b8866f413cec065438d6e5faabbd9dac7d1ceea5`
- **Category**: `existing-baseline` | `ADVERSARIAL`
- **Status**: `active`
- **Size Class**: Medium (~85 Route Handler files)
- **Framework**: Next.js Route Handlers | Stripe Webhooks | Tinybird Webhooks
- **Why Selected**: Previously generated Phase 22 false positives on `ImageResponse` and webhooks. Retained as an adversarial sanity slice to ensure route handler filters never regress.

---

## 3. Candidate Corpus Summary Statistics

- **Total Candidates**: 20 repositories
- **Distribution**:
  - `CORE` (Existing Baseline): 5 repositories (100% active, 0 excluded)
  - `EXTENDED` (New Applications): 12 repositories (8 active, 4 excluded)
  - `ADVERSARIAL` (Stress & Negative Controls): 3 repositories (100% active, 0 excluded)
- **Total Active Repositories**: 16 repositories
- **Total Excluded Repositories**: 4 repositories
  - 2 `repository-unreachable` (HTTP 404 upstream: `charlie-tango/next-starter`, `typebot/typebot`)
  - 2 `clone-timeout` (payload > 880MB or network bottleneck: `infisical/infisical`, `openstatusHQ/openstatus`)
