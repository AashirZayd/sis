import path from "node:path";

/**
 * Standard directories excluded from discovery by default.
 */
export const DEFAULT_IGNORE_PATTERNS = [
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "coverage",
  ".sis",
  ".turbo",
  "out",
] as const;

/**
 * Known test and E2E infrastructure directories excluded from production scope by default.
 */
export const DEFAULT_TEST_DIRECTORIES = [
  "playwright",
  "e2e",
  "cypress",
  "__tests__",
  "__test__",
  "tests",
  "test",
] as const;

/**
 * Standard test file patterns excluded from production scope.
 */
export const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/i,
  /\.spec\.[tj]sx?$/i,
  /\.cy\.[tj]sx?$/i,
];

/**
 * Supported Next.js / TypeScript / JavaScript source extensions.
 */
export const SUPPORTED_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
] as const;

/**
 * Normalizes any filesystem path into POSIX-compliant forward-slash format.
 * Essential for consistent output across Windows, macOS, and Linux.
 */
export function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Checks if a directory is a test infrastructure directory.
 */
export function isTestDirectory(dirName: string): boolean {
  const norm = dirName.toLowerCase().trim();
  return DEFAULT_TEST_DIRECTORIES.includes(norm as any);
}

/**
 * Checks if a relative or absolute file path belongs to non-production test infrastructure.
 */
export function isTestPath(filePath: string): boolean {
  const posix = toPosixPath(filePath);
  const segments = posix.split("/").map((s) => s.toLowerCase());

  // Check if any directory segment matches test directories
  for (let i = 0; i < segments.length - 1; i++) {
    if (DEFAULT_TEST_DIRECTORIES.includes(segments[i] as any)) {
      return true;
    }
  }

  // Check if filename matches test file patterns
  const filename = segments[segments.length - 1];
  return TEST_FILE_PATTERNS.some((pat) => pat.test(filename));
}

/**
 * Checks if a directory should be skipped during traversal.
 */
export function shouldIgnoreDirectory(
  dirName: string,
  customIgnores: string[] = [],
  excludeTests: boolean = true
): boolean {
  const norm = dirName.toLowerCase().trim();
  if (norm.startsWith(".")) return true;

  const allIgnores = new Set([...DEFAULT_IGNORE_PATTERNS, ...customIgnores]);
  if (allIgnores.has(norm as any)) return true;

  if (excludeTests && isTestDirectory(norm)) {
    return true;
  }

  return false;
}

/**
 * Checks if a file is an analyzable TypeScript or JavaScript source file.
 * Excludes TypeScript declaration files (.d.ts) as they contain no executable code.
 * Also excludes test files when excludeTests is true.
 */
export function isSupportedSourceFile(
  filename: string,
  supportedExtensions?: string[],
  excludeTests: boolean = true
): boolean {
  if (filename.endsWith(".d.ts") || filename.endsWith(".d.tsx")) {
    return false;
  }

  if (excludeTests && TEST_FILE_PATTERNS.some((pat) => pat.test(filename))) {
    return false;
  }

  const ext = path.extname(filename).toLowerCase();
  const validExts = supportedExtensions ?? SUPPORTED_EXTENSIONS;
  return validExts.includes(ext as any);
}
