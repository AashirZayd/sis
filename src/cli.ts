#!/usr/bin/env node
import { Command } from "commander";
import { audit } from "./index.js";
import {
  TargetNotFoundError,
  TargetInvalidError,
  ConfigurationError,
  ParserError,
  ExecutionError,
  SisError,
} from "./core/errors.js";
import { terminal } from "./reporter/terminal.js";
import { formatJson, formatSarif, type OutputFormat } from "./output/index.js";

// Graceful SIGINT / SIGTERM interruption handling
let activeFormat: OutputFormat = "terminal";

process.on("SIGINT", () => {
  if (activeFormat === "terminal") {
    process.stderr.write("\nAudit interrupted by user (SIGINT).\n");
  }
  process.exit(130);
});

process.on("SIGTERM", () => {
  if (activeFormat === "terminal") {
    process.stderr.write("\nAudit terminated (SIGTERM).\n");
  }
  process.exit(143);
});

const program = new Command();

program
  .name("sis")
  .description("Autonomous runtime verification for Next.js boundaries")
  .version("0.1.0", "-v, --version", "Output the current version of SIS")
  .option("--debug", "Enable verbose diagnostic stack traces");

const auditCmd = program
  .command("audit")
  .description("Audit Next.js boundary invariants and candidate server actions")
  .argument("<target>", "Path to target project, directory, or entry file")
  // Audit options
  .option("-r, --runs <number>", "Number of property-based payload synthesis runs (default: 10)", (val) => parseInt(val, 10))
  .option("--ignore <patterns...>", "Additional directories or file patterns to ignore")
  .option("--max-analysis-depth <number>", "Maximum call-depth for interprocedural analysis (default: 8)", (val) => parseInt(val, 10))
  // Output options
  .option("-f, --format <format>", "Output format: terminal, json, sarif (default: \"terminal\")")
  .option("--json", "Emit output as machine-readable JSON (alias for --format json)")
  .option("--sarif", "Emit output as OASIS SARIF 2.1.0 (alias for --format sarif)")
  .option("--silent", "Suppress human-readable terminal output")
  // Execution options
  .option("-t, --timeout <number>", "Maximum candidate execution budget inside the isolate in ms (default: 20)", (val) => parseInt(val, 10))
  .option("--no-shrink", "Disable automatic failure shrinking")
  .option("--max-shrink-attempts <number>", "Maximum shrinking attempts per failure (default: 30)", (val) => parseInt(val, 10))
  // Reproducibility options
  .option("-s, --seed <number>", "Explicit random generator seed for reproducible synthesis", (val) => parseInt(val, 10));

auditCmd.addHelpText(
  "after",
  `
Examples:
  $ npx @aashirzayd/sis audit .
  $ sis audit app/actions.ts --runs 25
  $ sis audit app/ --seed 42
  $ sis audit app/ --json
  $ sis audit app/ --sarif
  $ sis audit app/ --timeout 50 --max-shrink-attempts 50
`
);

auditCmd.action(async (target: string, options: {
  runs?: number;
  seed?: number;
  timeout?: number;
  shrink?: boolean;
  maxShrinkAttempts?: number;
  ignore?: string[];
  format?: string;
  json?: boolean;
  sarif?: boolean;
  silent?: boolean;
  maxAnalysisDepth?: number;
}) => {
  const globalOptions = program.opts<{ debug?: boolean }>();

  // Determine output format & check for conflicts
  let chosenFormat: OutputFormat = "terminal";

  if (options.json && options.sarif) {
    const msg = "Cannot specify both --json and --sarif simultaneously.";
    process.stderr.write(`SIS ERROR\n\nInvalid configuration:\n  ${msg}\n\nChoose either --json or --sarif.\n`);
    process.exit(2);
  }

  if (options.json) {
    chosenFormat = "json";
  } else if (options.sarif) {
    chosenFormat = "sarif";
  } else if (options.format) {
    const rawFmt = options.format.toLowerCase();
    if (rawFmt !== "terminal" && rawFmt !== "json" && rawFmt !== "sarif") {
      process.stderr.write(`Unknown output format: "${options.format}". Valid options are: terminal, json, sarif.\n`);
      process.exit(2);
    }
    chosenFormat = rawFmt as OutputFormat;
  }

  activeFormat = chosenFormat;
  const isSilent = options.silent === true || chosenFormat !== "terminal";

  // Validate numeric input options
  if (options.runs !== undefined) {
    if (Number.isNaN(options.runs) || options.runs <= 0) {
      handleCliError(
        new ConfigurationError(`Invalid --runs value: "${options.runs}". Must be a positive integer (> 0).`, {
          option: "--runs",
          value: options.runs,
          suggestion: "Specify a positive number of runs, e.g. --runs 10",
        }),
        chosenFormat,
        globalOptions.debug
      );
      process.exit(2);
    }
  }

  if (options.timeout !== undefined) {
    if (Number.isNaN(options.timeout) || options.timeout <= 0) {
      handleCliError(
        new ConfigurationError(`Invalid --timeout value: "${options.timeout}". Must be a positive integer in milliseconds (> 0).`, {
          option: "--timeout",
          value: options.timeout,
          suggestion: "Specify a positive timeout in milliseconds, e.g. --timeout 20",
        }),
        chosenFormat,
        globalOptions.debug
      );
      process.exit(2);
    }
  }

  if (options.maxShrinkAttempts !== undefined) {
    if (Number.isNaN(options.maxShrinkAttempts) || options.maxShrinkAttempts < 0) {
      handleCliError(
        new ConfigurationError(`Invalid --max-shrink-attempts value: "${options.maxShrinkAttempts}". Must be a non-negative integer (>= 0).`, {
          option: "--max-shrink-attempts",
          value: options.maxShrinkAttempts,
          suggestion: "Specify a non-negative number of attempts, e.g. --max-shrink-attempts 30",
        }),
        chosenFormat,
        globalOptions.debug
      );
      process.exit(2);
    }
  }

  if (options.maxAnalysisDepth !== undefined) {
    if (Number.isNaN(options.maxAnalysisDepth) || options.maxAnalysisDepth <= 0) {
      handleCliError(
        new ConfigurationError(`Invalid --max-analysis-depth value: "${options.maxAnalysisDepth}". Must be a positive integer (> 0).`, {
          option: "--max-analysis-depth",
          value: options.maxAnalysisDepth,
          suggestion: "Specify a positive depth, e.g. --max-analysis-depth 8",
        }),
        chosenFormat,
        globalOptions.debug
      );
      process.exit(2);
    }
  }

  if (options.seed !== undefined && Number.isNaN(options.seed)) {
    handleCliError(
      new ConfigurationError("Invalid --seed value. Must be a valid numeric seed.", {
        option: "--seed",
        value: options.seed,
        suggestion: "Specify a valid integer seed, e.g. --seed 42",
      }),
      chosenFormat,
      globalOptions.debug
    );
    process.exit(2);
  }

  try {
    const result = await audit(target, {
      runs: options.runs,
      seed: options.seed,
      timeoutMs: options.timeout,
      shrink: options.shrink,
      maxShrinkAttempts: options.maxShrinkAttempts,
      ignore: options.ignore,
      format: chosenFormat,
      maxAnalysisDepth: options.maxAnalysisDepth,
      debug: globalOptions.debug,
      silent: isSilent,
    });

    if (chosenFormat === "json") {
      process.stdout.write(formatJson(result) + "\n");
    } else if (chosenFormat === "sarif") {
      process.stdout.write(formatSarif(result) + "\n");
    }

    const hasErrors = result.findings.some((f) => f.severity === "error");
    if (hasErrors) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err: unknown) {
    handleCliError(err, chosenFormat, globalOptions.debug);
    const exitCode = (err instanceof ExecutionError) ? 3 : 2;
    process.exit(exitCode);
  }
});

function handleCliError(err: unknown, format: OutputFormat, debug = false): void {
  if (format !== "terminal") {
    // Machine-readable format: stderr receives concise error, stdout stays untouched
    if (err instanceof TargetNotFoundError) {
      process.stderr.write(`Error: Audit target does not exist: ${err.target}\n`);
    } else if (err instanceof TargetInvalidError) {
      process.stderr.write(`Error: Invalid audit target: ${err.target} (${err.reason})\n`);
    } else if (err instanceof ConfigurationError) {
      process.stderr.write(`Error: ${err.message}\n`);
    } else if (err instanceof ParserError) {
      process.stderr.write(`Error: Failed to parse file ${err.file}: ${err.message}\n`);
      if (debug && err.detail) {
        process.stderr.write(`${err.detail}\n`);
      }
    } else if (err instanceof SisError) {
      process.stderr.write(`Error: ${err.message}\n`);
      if (debug && err.stack) {
        process.stderr.write(`${err.stack}\n`);
      }
    } else {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: Unexpected failure during audit: ${message}\n`);
      if (debug && err instanceof Error && err.stack) {
        process.stderr.write(`${err.stack}\n`);
      }
    }
    return;
  }

  // Terminal human-readable presentation
  if (err instanceof TargetNotFoundError) {
    terminal.targetNotFound(err.target);
    return;
  }

  if (err instanceof TargetInvalidError) {
    terminal.error("Invalid audit target", `${err.target}\n  Reason: ${err.reason}`);
    return;
  }

  if (err instanceof ConfigurationError) {
    terminal.configurationError(err.message, err.suggestion);
    return;
  }

  if (err instanceof ParserError) {
    terminal.parserError(err, debug);
    return;
  }

  if (err instanceof SisError) {
    terminal.error(err.message);
    if (debug && err.stack) {
      console.error(err.stack);
    }
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  terminal.error("Unexpected failure during audit", message);
  if (debug && err instanceof Error && err.stack) {
    console.error(err.stack);
  }
}

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  terminal.error("Fatal error", message);
  process.exit(2);
});

