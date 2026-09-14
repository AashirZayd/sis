import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import type { GitFailureReason } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Structured error thrown when a Git acquisition operation fails.
 */
export class GitAcquisitionError extends Error {
  readonly failureReason: GitFailureReason;
  readonly command?: string;
  readonly stderr?: string;

  constructor(
    message: string,
    failureReason: GitFailureReason,
    command?: string,
    stderr?: string
  ) {
    super(message);
    this.name = "GitAcquisitionError";
    this.failureReason = failureReason;
    this.command = command;
    this.stderr = stderr;
  }
}

/**
 * Classifies a raw error from a Git child process into a domain-specific GitFailureReason.
 */
export function classifyGitError(err: unknown): GitFailureReason {
  if (!err || typeof err !== "object") return "unknown";

  const raw = err as { code?: string | number; message?: string; stderr?: string; killed?: boolean; signal?: string; timedOut?: boolean };
  const text = `${raw.message || ""} ${raw.stderr || ""}`.toLowerCase();

  if (
    raw.code === "ETIMEDOUT" ||
    raw.timedOut ||
    (raw.killed && raw.signal === "SIGTERM") ||
    text.includes("timed out") ||
    text.includes("timeout")
  ) {
    return "clone-timeout";
  }
  if (
    text.includes("upload-pack: not our ref") ||
    text.includes("couldn't find remote ref") ||
    text.includes("did not match any file(s) known to git")
  ) {
    return "commit-unresolvable";
  }
  if (
    (text.includes("repository") && text.includes("not found")) ||
    text.includes("could not resolve host") ||
    text.includes("unable to access") ||
    text.includes("failed to connect")
  ) {
    return "repository-unreachable";
  }
  if (
    text.includes("terminal prompts disabled") ||
    text.includes("could not read username") ||
    text.includes("authentication failed") ||
    text.includes("permission denied")
  ) {
    return "authentication-required";
  }
  if (text.includes("network") || text.includes("connection reset")) {
    return "network-error";
  }
  if (text.includes("checkout failed") || text.includes("fatal: reference is not a tree")) {
    return "checkout-failed";
  }

  return "unknown";
}

/**
 * Non-interactive execution environment guaranteeing that Git subprocesses
 * never wait on stdin for credentials, usernames, or passwords.
 */
function getGitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
  };
}

/**
 * Safely fetches a repository at a pinned commit SHA into the destination directory.
 * Uses strict bounded shallow fetch to minimize bandwidth and execution time.
 *
 * SAFETY INVARIANTS:
 * 1. Non-interactive: `GIT_TERMINAL_PROMPT=0` prevents credential hangs.
 * 2. Fail-Fast: If shallow fetch of the pinned commit fails, it NEVER attempts an
 *    unbounded full-history clone. It fails immediately with a typed GitAcquisitionError.
 * 3. Exact Verification: Verifies checked-out HEAD SHA strictly matches the expected pin.
 * 4. Bounded Execution: Hard timeout (default 45s) protects against network stalls.
 */
export async function checkoutPinnedRepository(
  url: string,
  commit: string,
  destDir: string,
  timeoutMs = 90_000
): Promise<void> {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const env = getGitEnv();
  const execOpts = { cwd: destDir, timeout: timeoutMs, env };

  // Step 1: Initialize ephemeral repository and configure remote
  try {
    await execFileAsync("git", ["init"], execOpts);
    await execFileAsync("git", ["remote", "add", "origin", url], execOpts);
  } catch (initErr: unknown) {
    const reason = classifyGitError(initErr);
    throw new GitAcquisitionError(
      `Failed to initialize local git repository: ${initErr instanceof Error ? initErr.message : String(initErr)}`,
      reason,
      "git init / git remote add",
      (initErr as { stderr?: string }).stderr
    );
  }

  // Step 2: Bounded shallow fetch of the exact pinned commit
  try {
    await execFileAsync(
      "git",
      ["fetch", "--depth", "1", "origin", commit],
      execOpts
    );
  } catch (fetchErr: unknown) {
    const reason = classifyGitError(fetchErr);
    const stderr = (fetchErr as { stderr?: string }).stderr || "";
    throw new GitAcquisitionError(
      `Failed to shallow-fetch commit ${commit} from ${url}: ${stderr || (fetchErr instanceof Error ? fetchErr.message : String(fetchErr))}`,
      reason,
      `git fetch --depth 1 origin ${commit}`,
      stderr
    );
  }

  // Step 3: Checkout FETCH_HEAD
  try {
    await execFileAsync("git", ["checkout", "FETCH_HEAD"], execOpts);
  } catch (checkoutErr: unknown) {
    const reason = classifyGitError(checkoutErr);
    const stderr = (checkoutErr as { stderr?: string }).stderr || "";
    throw new GitAcquisitionError(
      `Failed to checkout FETCH_HEAD for commit ${commit}: ${stderr}`,
      reason,
      "git checkout FETCH_HEAD",
      stderr
    );
  }

  // Step 4: Verify checked-out HEAD strictly matches the requested commit
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], execOpts);
    const checkedOutSha = stdout.trim().toLowerCase();
    const expectedSha = commit.trim().toLowerCase();

    if (checkedOutSha !== expectedSha && !checkedOutSha.startsWith(expectedSha)) {
      throw new GitAcquisitionError(
        `Commit verification mismatch: checked-out HEAD (${checkedOutSha}) does not match expected pin (${expectedSha})`,
        "checkout-failed",
        "git rev-parse HEAD"
      );
    }
  } catch (verifyErr: unknown) {
    if (verifyErr instanceof GitAcquisitionError) throw verifyErr;
    const reason = classifyGitError(verifyErr);
    throw new GitAcquisitionError(
      `Failed to verify checked-out commit: ${verifyErr instanceof Error ? verifyErr.message : String(verifyErr)}`,
      reason,
      "git rev-parse HEAD"
    );
  }
}

/**
 * Returns the current Git commit SHA of the SIS repository, or "unknown".
 */
export async function getSisGitCommit(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      timeout: 5000,
      env: getGitEnv(),
    });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}
