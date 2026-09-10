#!/usr/bin/env node
import { Command } from "commander";
import { audit } from "./index.js";
import { TargetNotFoundError, ParserError, SisError } from "./core/errors.js";
import { terminal } from "./reporter/terminal.js";
import { formatJson, formatSarif, type OutputFormat } from "./output/index.js";

const program = new Command();

program
  .name("sis")
  .description("Autonomous runtime verification for Next.js boundaries")
  .version("0.1.0", "-v, --version", "Output the current version of SIS")
  .option("--debug", "Enable verbose diagnostic stack traces");

program
  .command("audit")
  .description("Audit Next.js boundary invariants and candidate server actions")
  .argument("<target>", "Path to target project, directory, or entry file")
  .option("-r, --runs <number>", "Number of property-based payload synthesis runs", (val) => parseInt(val, 10))
  .option("-s, --seed <number>", "Explicit random generator seed for reproducible synthesis", (val) => parseInt(val, 10))
  .option("-t, --timeout <number>", "Maximum candidate execution time inside the sandbox (default: 20ms)", (val) => parseInt(val, 10))
  .option("--no-shrink", "Disable automatic failure shrinking")
  .option("--max-shrink-attempts <number>", "Maximum shrinking attempts per failure (default: 30)", (val) => parseInt(val, 10))
  .option("--ignore <patterns...>", "Additional directories or file patterns to ignore")
  .option("-f, --format <format>", "Output format: terminal, json, sarif", "terminal")
  .option("--max-analysis-depth <number>", "Maximum call-depth for interprocedural analysis (default: 8)", (val) => parseInt(val, 10))
  .action(async (target: string, options: {
    runs?: number;
    seed?: number;
    timeout?: number;
    shrink?: boolean;
    maxShrinkAttempts?: number;
    ignore?: string[];
    format?: string;
    maxAnalysisDepth?: number;
  }) => {
    const globalOptions = program.opts<{ debug?: boolean }>();
    const format = (options.format ?? "terminal").toLowerCase();

    if (format !== "terminal" && format !== "json" && format !== "sarif") {
      process.stderr.write(`Unknown output format: "${options.format}". Valid options are: terminal, json, sarif.\n`);
      process.exit(2);
    }

    const isSilent = format !== "terminal";

    try {
      const result = await audit(target, {
        runs: options.runs,
        seed: options.seed,
        timeoutMs: options.timeout,
        shrink: options.shrink,
        maxShrinkAttempts: options.maxShrinkAttempts,
        ignore: options.ignore,
        format: format as OutputFormat,
        maxAnalysisDepth: options.maxAnalysisDepth,
        debug: globalOptions.debug,
        silent: isSilent,
      });

      if (format === "json") {
        process.stdout.write(formatJson(result) + "\n");
      } else if (format === "sarif") {
        process.stdout.write(formatSarif(result) + "\n");
      }

      const hasErrors = result.findings.some((f) => f.severity === "error");
      if (hasErrors) {
        process.exit(1);
      }
      process.exit(0);
    } catch (err: unknown) {
      if (format !== "terminal") {
        if (err instanceof TargetNotFoundError) {
          process.stderr.write(`Error: Audit target does not exist: ${err.target}\n`);
        } else if (err instanceof ParserError) {
          process.stderr.write(`Error: Failed to parse file ${err.file}: ${err.message}\n`);
          if (globalOptions.debug && err.detail) {
            process.stderr.write(`${err.detail}\n`);
          }
        } else if (err instanceof SisError) {
          process.stderr.write(`Error: ${err.message}\n`);
          if (globalOptions.debug && err.stack) {
            process.stderr.write(`${err.stack}\n`);
          }
        } else {
          const message = err instanceof Error ? err.message : String(err);
          process.stderr.write(`Error: Unexpected failure during audit: ${message}\n`);
          if (globalOptions.debug && err instanceof Error && err.stack) {
            process.stderr.write(`${err.stack}\n`);
          }
        }
        process.exit(2);
      }

      if (err instanceof TargetNotFoundError) {
        terminal.targetNotFound(err.target);
        process.exit(2);
      }

      if (err instanceof ParserError) {
        terminal.parserError(err, globalOptions.debug);
        process.exit(2);
      }

      if (err instanceof SisError) {
        terminal.error(err.message);
        if (globalOptions.debug && err.stack) {
          console.error(err.stack);
        }
        process.exit(2);
      }

      const message = err instanceof Error ? err.message : String(err);
      terminal.error("Unexpected failure during audit", message);
      if (globalOptions.debug && err instanceof Error && err.stack) {
        console.error(err.stack);
      }
      process.exit(2);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  terminal.error("Fatal error", message);
  process.exit(1);
});
