import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Landing Page & Static Site Validation", () => {
  const root = path.resolve(__dirname, "..");
  const docsDir = path.join(root, "docs");

  it("all required static site assets exist in docs/", () => {
    expect(fs.existsSync(path.join(docsDir, "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, "style.css"))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, "script.js"))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, "favicon.svg"))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, ".nojekyll"))).toBe(true);
    expect(fs.existsSync(path.join(docsDir, "architecture.md"))).toBe(true);
  });

  it("index.html uses strictly relative asset paths for GitHub Pages compatibility", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    // CSS, JS, and Favicon must use relative paths
    expect(html).toContain('href="./style.css"');
    expect(html).toContain('src="./script.js"');
    expect(html).toContain('href="./favicon.svg"');
    expect(html).toContain('href="./architecture.md"');

    // Must not contain root-absolute asset paths like href="/style.css"
    expect(html).not.toMatch(/href="\/style\.css"/);
    expect(html).not.toMatch(/src="\/script\.js"/);
    expect(html).not.toMatch(/href="\/favicon\.svg"/);
  });

  it("index.html contains required Hero copy and command block", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("Open Source • Developer Tool");
    expect(html).toContain("Find the edge cases you forgot to test.");
    expect(html).toContain("SIS is a zero-configuration runtime verification tool for modern Next.js Server Actions and React Server Component boundaries.");
    expect(html).toContain("npx @aashirzayd/sis audit .");
    expect(html).toContain("Node.js 24+");
    expect(html).toContain("Works directly with npx — no global install required.");
  });

  it("index.html contains authentic terminal product visual output", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("SIS — Speculative Invariant Synthesis");
    expect(html).toContain("Files analyzed");
    expect(html).toContain("209");
    expect(html).toContain("Server boundaries");
    expect(html).toContain("53");
    expect(html).toContain("Candidate actions");
    expect(html).toContain("203");
    expect(html).toContain("Prop boundaries");
    expect(html).toContain("78");
    expect(html).toContain("Runtime failures");
    expect(html).toContain("2533");
    expect(html).toContain("Taint violations");
    expect(html).toContain("16");
    expect(html).toContain("SIS found 2560 verified findings");
  });

  it("index.html contains Problem / Boundary Hazards section", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("Testing shouldn't stop at the happy path.");
    expect(html).toContain("null &amp; undefined");
    expect(html).toContain("NaN, Infinity &amp; -0");
    expect(html).toContain("prototype-sensitive");
    expect(html).toContain("deep-nested");
    expect(html).toContain("Serialization Violations");
    expect(html).toContain("Primitive Type Mismatches");
    expect(html).toContain("Secret Data Leaks");
  });

  it("index.html contains 7-step pipeline", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("Source Code");
    expect(html).toContain("AST Analysis");
    expect(html).toContain("Data Flow &amp; Taint");
    expect(html).toContain("Adversarial Synthesis");
    expect(html).toContain("Isolated Runtime");
    expect(html).toContain("Failure Shrinking");
    expect(html).toContain("Actionable Report");
  });

  it("index.html contains all 6 core features", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("Speculative Fuzzing");
    expect(html).toContain("Runtime Verification");
    expect(html).toContain("Failure Shrinking");
    expect(html).toContain("Secret Taint Analysis");
    expect(html).toContain("Deterministic Audits");
    expect(html).toContain("JSON &amp; SARIF Output");
  });

  it("index.html contains Next.js Focus and framework compatibility explanation", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("Built for the boundaries where Next.js gets interesting.");
    expect(html).toContain("Server Actions vs Server Functions");
    expect(html).toContain("React Server Component Boundaries");
    expect(html).toContain("Serializable Props Enforcement");
    expect(html).toContain("Framework-Dependent Compatibility Gate");
    expect(html).toContain("static-only");
  });

  it("index.html contains verified external links for GitHub and npm", () => {
    const html = fs.readFileSync(path.join(docsDir, "index.html"), "utf-8");

    expect(html).toContain("https://github.com/AashirZayd/sis");
    expect(html).toContain("https://www.npmjs.com/package/@aashirzayd/sis");
    expect(html).toContain("Built in the open.");
    expect(html).toContain("Let SIS find the cases you didn't think to test.");
    expect(html).toContain("© 2026 Aashir Zayd");
  });

  it("style.css includes responsive and accessibility rules", () => {
    const css = fs.readFileSync(path.join(docsDir, "style.css"), "utf-8");

    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("--font-mono");
    expect(css).toContain("--font-sans");
  });

  it("script.js handles copy feedback and tab switching", () => {
    const js = fs.readFileSync(path.join(docsDir, "script.js"), "utf-8");

    expect(js).toContain("initClipboardButtons");
    expect(js).toContain("initTabs");
    expect(js).toContain("active-code");
    expect(js).toContain("navigator.clipboard.writeText");
  });

  it("README.md links to the deployed landing page", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    expect(readme).toContain("https://aashirzayd.github.io/sis/");
  });
});
