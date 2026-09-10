export class SisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SisError";
  }
}

export class TargetNotFoundError extends SisError {
  readonly target: string;

  constructor(target: string) {
    super(`Audit target does not exist: ${target}`);
    this.name = "TargetNotFoundError";
    this.target = target;
  }
}

export class TargetInvalidError extends SisError {
  readonly target: string;

  constructor(target: string, reason: string) {
    super(`Invalid audit target: ${target} (${reason})`);
    this.name = "TargetInvalidError";
    this.target = target;
  }
}

export class ParserError extends SisError {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly detail?: string;

  constructor(
    file: string,
    message: string,
    options?: { line?: number; column?: number; detail?: string }
  ) {
    const loc = options?.line ? `:${options.line}:${options.column ?? 1}` : "";
    super(`Failed to parse ${file}${loc}: ${message}`);
    this.name = "ParserError";
    this.file = file;
    this.line = options?.line;
    this.column = options?.column;
    this.detail = options?.detail;
  }
}
