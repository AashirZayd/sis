import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Release & Packaging Validation", () => {
  const root = path.resolve(__dirname, "..");
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

  it("package.json contains all required release metadata", () => {
    expect(pkg.name).toBe("sis");
    expect(pkg.license).toBe("MIT");
    expect(pkg.type).toBe("module");
    expect(pkg.engines?.node).toBe(">=18");
    expect(pkg.author).toBe("Aashir Zayd");
    expect(pkg.repository?.url).toBe("git+https://github.com/AashirZayd/sis.git");
    expect(pkg.homepage).toBe("https://github.com/AashirZayd/sis#readme");
    expect(pkg.bugs?.url).toBe("https://github.com/AashirZayd/sis/issues");
    expect(pkg.files).toContain("dist");
  });

  it("package entrypoints and binary targets exist on disk", () => {
    // Check main entry
    const mainPath = path.join(root, pkg.main);
    expect(fs.existsSync(mainPath)).toBe(true);

    // Check types entry
    const typesPath = path.join(root, pkg.types);
    expect(fs.existsSync(typesPath)).toBe(true);

    // Check bin executable
    const binPath = path.join(root, pkg.bin.sis);
    expect(fs.existsSync(binPath)).toBe(true);

    // Check exports
    const exportTypes = path.join(root, pkg.exports["."].types);
    const exportImport = path.join(root, pkg.exports["."].import);
    expect(fs.existsSync(exportTypes)).toBe(true);
    expect(fs.existsSync(exportImport)).toBe(true);
  });

  it("CLI executable contains proper node shebang", () => {
    const binPath = path.join(root, pkg.bin.sis);
    const content = fs.readFileSync(binPath, "utf-8");
    expect(content.startsWith("#!/usr/bin/env node")).toBe(true);
  });

  it("README installation and rule catalog align with package and types", () => {
    const readme = fs.readFileSync(path.join(root, "README.md"), "utf-8");
    expect(readme).toContain("npm install --save-dev sis");
    expect(readme).toContain("npx sis audit");

    // Verify all 5 stable rules documented
    expect(readme).toContain("SIS001");
    expect(readme).toContain("SIS002");
    expect(readme).toContain("SIS003");
    expect(readme).toContain("SIS004");
    expect(readme).toContain("SIS005");
  });

  it("open-source repository documents (CHANGELOG, CONTRIBUTING, SECURITY) exist", () => {
    expect(fs.existsSync(path.join(root, "CHANGELOG.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "CONTRIBUTING.md"))).toBe(true);
    expect(fs.existsSync(path.join(root, "SECURITY.md"))).toBe(true);

    const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf-8");
    expect(changelog).toContain("Changelog");
    expect(changelog).toContain("0.1.0");

    const contributing = fs.readFileSync(path.join(root, "CONTRIBUTING.md"), "utf-8");
    expect(contributing).toContain("Contributing to SIS");
    expect(contributing).toContain("npm test");

    const security = fs.readFileSync(path.join(root, "SECURITY.md"), "utf-8");
    expect(security).toContain("Security Policy");
    expect(security).toContain("Reporting a Vulnerability");
  });
});
