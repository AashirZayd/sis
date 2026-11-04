import fs from "node:fs";
import path from "node:path";

/**
 * Per-run test build directories (Batch 1.1, review finding R-1).
 *
 * Every `vitest` process owns exactly one directory named
 * `run-<pid>-<startedAtMs>` under the shared parent. A process only ever deletes
 * its own directory, plus directories whose owning process is no longer alive
 * (left behind by a hard kill). Directories of live processes are never touched.
 */

const RUN_DIR_PATTERN = /^run-(\d+)-(\d+)$/;

export function runDirName(pid: number, startedAtMs: number): string {
  return `run-${pid}-${startedAtMs}`;
}

export function parseRunDirName(name: string): { pid: number; startedAtMs: number } | null {
  const match = RUN_DIR_PATTERN.exec(name);
  if (!match) return null;
  return { pid: Number(match[1]), startedAtMs: Number(match[2]) };
}

/**
 * Whether a process with this pid currently exists. `process.kill(pid, 0)` sends no
 * signal; it only checks existence. EPERM means the process exists but belongs to
 * another user, so it is treated as alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Removes run directories left behind by processes that no longer exist.
 * Entries that are not run directories are left untouched. Returns the names removed.
 */
export function pruneStaleRunDirs(
  parent: string,
  isAlive: (pid: number) => boolean = isProcessAlive
): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(parent, { withFileTypes: true });
  } catch {
    return [];
  }

  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const owner = parseRunDirName(entry.name);
    if (!owner || isAlive(owner.pid)) continue;
    try {
      fs.rmSync(path.join(parent, entry.name), { recursive: true, force: true });
      removed.push(entry.name);
    } catch {
      // Still locked (for example by a process that is shutting down on Windows):
      // leave it for a later run.
    }
  }
  return removed;
}

/**
 * Creates this process's run directory. Fails if it already exists, so a run never
 * adopts or overwrites another run's output.
 */
export function createRunDir(parent: string, pid: number, startedAtMs: number): string {
  fs.mkdirSync(parent, { recursive: true });
  const dir = path.join(parent, runDirName(pid, startedAtMs));
  fs.mkdirSync(dir);
  return dir;
}

export function removeRunDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best effort; a leftover directory is pruned by a later run once this process has exited.
  }
}
