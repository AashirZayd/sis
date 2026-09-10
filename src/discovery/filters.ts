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
 * Checks if a directory should be skipped during traversal.
 */
export function shouldIgnoreDirectory(
  dirName: string,
  customIgnores: string[] = []
): boolean {
  const allIgnores = new Set([...DEFAULT_IGNORE_PATTERNS, ...customIgnores]);
  return allIgnores.has(dirName) || dirName.startsWith(".");
}

/**
 * Checks if a file is an analyzable TypeScript or JavaScript source file.
 * Excludes TypeScript declaration files (.d.ts) as they contain no executable code.
 */
export function isSupportedSourceFile(
  filename: string,
  supportedExtensions?: string[]
): boolean {
  if (filename.endsWith(".d.ts") || filename.endsWith(".d.tsx")) {
    return false;
  }

  const ext = path.extname(filename).toLowerCase();
  const validExts = supportedExtensions ?? SUPPORTED_EXTENSIONS;
  return validExts.includes(ext as any);
}
