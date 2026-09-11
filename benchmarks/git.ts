import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const execFileAsync = promisify(execFile);

/**
 * Safely fetches a repository at a pinned commit SHA into the destination directory.
 * Uses shallow fetch to minimize bandwidth and execution time.
 */
export async function checkoutPinnedRepository(
  url: string,
  commit: string,
  destDir: string,
  timeoutMs = 120_000
): Promise<void> {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    // Strategy 1: Shallow fetch of exact commit (fastest)
    await execFileAsync("git", ["init"], { cwd: destDir, timeout: timeoutMs });
    await execFileAsync("git", ["remote", "add", "origin", url], {
      cwd: destDir,
      timeout: timeoutMs,
    });
    await execFileAsync(
      "git",
      ["fetch", "--depth", "1", "origin", commit],
      { cwd: destDir, timeout: timeoutMs }
    );
    await execFileAsync("git", ["checkout", "FETCH_HEAD"], {
      cwd: destDir,
      timeout: timeoutMs,
    });
  } catch (shallowErr) {
    // Strategy 2: Fallback to full clone and checkout if shallow fetch fails
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });

    await execFileAsync("git", ["clone", url, destDir], {
      timeout: timeoutMs,
    });
    await execFileAsync("git", ["checkout", commit], {
      cwd: destDir,
      timeout: timeoutMs,
    });
  }
}

/**
 * Returns the current Git commit SHA of the SIS repository, or "unknown".
 */
export async function getSisGitCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      timeout: 5000,
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}
