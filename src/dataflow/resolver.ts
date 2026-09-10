import path from "node:path";

const EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;
const INDEX_FILES = [
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
] as const;

function normalizePosix(filePath: string): string {
  const forward = filePath.replace(/\\/g, "/");
  return path.posix.normalize(forward);
}

/**
 * Deterministically resolves a module import specifier against the set of available
 * source files in the project.
 *
 * Supports:
 * - Relative imports: `./foo`, `../lib/user`
 * - Extensions: `.ts`, `.tsx`, `.js`, `.jsx`
 * - Directory index resolution: `./foo/index.ts`, etc.
 *
 * Non-relative / package imports (e.g. `react`, `next/server`) return undefined.
 */
export function resolveModuleSpecifier(
  fromFilePath: string,
  specifier: string,
  availableFiles: Set<string>
): string | undefined {
  if (!specifier.startsWith(".")) {
    return undefined;
  }

  const normalizedFromFile = normalizePosix(fromFilePath);
  const fromDir = path.posix.dirname(normalizedFromFile);
  const candidateBase = normalizePosix(path.posix.join(fromDir, specifier));

  // 1. Direct match (e.g. specifier already had .ts extension)
  if (availableFiles.has(candidateBase)) {
    return candidateBase;
  }

  // 2. TypeScript NodeNext ESM: import './foo.js' maps to './foo.ts' or './foo.tsx'
  if (candidateBase.endsWith(".js") || candidateBase.endsWith(".jsx")) {
    const stripped = candidateBase.replace(/\.jsx?$/, "");
    if (availableFiles.has(`${stripped}.ts`)) {
      return `${stripped}.ts`;
    }
    if (availableFiles.has(`${stripped}.tsx`)) {
      return `${stripped}.tsx`;
    }
  }

  // 3. Candidate with extensions: .ts, .tsx, .js, .jsx
  for (const ext of EXTENSIONS) {
    const withExt = `${candidateBase}${ext}`;
    if (availableFiles.has(withExt)) {
      return withExt;
    }
  }

  // 3. Directory index resolution: /index.ts, /index.tsx, etc.
  for (const indexFile of INDEX_FILES) {
    const withIndex = normalizePosix(`${candidateBase}${indexFile}`);
    if (availableFiles.has(withIndex)) {
      return withIndex;
    }
  }

  return undefined;
}
