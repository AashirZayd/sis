import fs from "node:fs";
import path from "node:path";
import type { DiscoveryOptions, DiscoveryResult, DiscoveredFile } from "./types.js";
import {
  shouldIgnoreDirectory,
  isSupportedSourceFile,
  isTestPath,
  toPosixPath,
} from "./filters.js";

/**
 * Recursively scans a target directory and discovers all analyzable source files.
 * Provides deterministic, lexicographically sorted file lists and handles symlink safety.
 */
export async function discoverFiles(
  targetDir: string,
  options: DiscoveryOptions = {}
): Promise<DiscoveryResult> {
  const baseDirectory = path.resolve(process.cwd(), targetDir);
  const excludeTests = options.excludeTests !== false;

  if (!fs.existsSync(baseDirectory)) {
    return {
      files: [],
      scannedCount: 0,
      skippedCount: 0,
      baseDirectory,
    };
  }

  const stat = await fs.promises.stat(baseDirectory);
  if (!stat.isDirectory()) {
    // If target is a single file, return it directly if supported
    const filename = path.basename(baseDirectory);
    if (isSupportedSourceFile(filename, options.supportedExtensions, false)) {
      const ext = path.extname(filename).toLowerCase();
      const relativePath = toPosixPath(path.relative(process.cwd(), baseDirectory));
      return {
        files: [
          {
            relativePath: relativePath || filename,
            absolutePath: baseDirectory,
            extension: ext,
          },
        ],
        scannedCount: 1,
        skippedCount: 0,
        baseDirectory,
      };
    }

    return {
      files: [],
      scannedCount: 1,
      skippedCount: 1,
      baseDirectory,
    };
  }

  const files: DiscoveredFile[] = [];
  let scannedCount = 0;
  let skippedCount = 0;

  // Track visited realpaths to avoid infinite loops across symlinks
  const visitedRealpaths = new Set<string>();

  async function walk(currentDir: string): Promise<void> {
    let entries: fs.Dirent[] = [];
    try {
      const real = await fs.promises.realpath(currentDir);
      if (visitedRealpaths.has(real)) {
        return;
      }
      visitedRealpaths.add(real);

      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      // Unreadable directory - skip gracefully
      skippedCount++;
      return;
    }

    for (const entry of entries) {
      scannedCount++;
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldIgnoreDirectory(entry.name, options.ignore, excludeTests)) {
          skippedCount++;
          continue;
        }
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isSupportedSourceFile(entry.name, options.supportedExtensions, excludeTests)) {
          const relativePath = toPosixPath(path.relative(baseDirectory, fullPath));
          if (excludeTests && isTestPath(relativePath)) {
            skippedCount++;
            continue;
          }
          const extension = path.extname(entry.name).toLowerCase();
          files.push({
            relativePath,
            absolutePath: fullPath,
            extension,
          });
        } else {
          skippedCount++;
        }
      } else if (entry.isSymbolicLink()) {
        try {
          const targetStat = await fs.promises.stat(fullPath);
          if (targetStat.isDirectory()) {
            if (shouldIgnoreDirectory(entry.name, options.ignore, excludeTests)) {
              skippedCount++;
              continue;
            }
            await walk(fullPath);
          } else if (targetStat.isFile()) {
            if (isSupportedSourceFile(entry.name, options.supportedExtensions, excludeTests)) {
              const relativePath = toPosixPath(path.relative(baseDirectory, fullPath));
              if (excludeTests && isTestPath(relativePath)) {
                skippedCount++;
                continue;
              }
              const extension = path.extname(entry.name).toLowerCase();
              files.push({
                relativePath,
                absolutePath: fullPath,
                extension,
              });
            } else {
              skippedCount++;
            }
          }
        } catch {
          skippedCount++;
        }
      }
    }
  }

  await walk(baseDirectory);

  // Deterministic lexicographical sorting across all environments
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "en"));

  return {
    files,
    scannedCount,
    skippedCount,
    baseDirectory,
  };
}
