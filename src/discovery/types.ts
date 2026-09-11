/**
 * Options configuring directory discovery and filtering.
 */
export interface DiscoveryOptions {
  /**
   * Additional folder or file patterns to ignore.
   */
  ignore?: string[];

  /**
   * List of supported file extensions (with leading dot).
   * Default: ['.ts', '.tsx', '.js', '.jsx']
   */
  /**
   * List of supported file extensions (with leading dot).
   * Default: ['.ts', '.tsx', '.js', '.jsx']
   */
  supportedExtensions?: string[];

  /**
   * Whether to exclude test infrastructure and test files.
   * Default: true
   */
  excludeTests?: boolean;
}

/**
 * Metadata for a discovered source file.
 */
export interface DiscoveredFile {
  /**
   * Relative path from the audit root directory, using normalized forward slashes.
   * Example: 'app/actions/user.ts'
   */
  relativePath: string;

  /**
   * Fully resolved absolute path on the host filesystem.
   */
  absolutePath: string;

  /**
   * Lowercase extension including leading dot (e.g. '.tsx').
   */
  extension: string;
}

/**
 * Result of recursive filesystem scanning.
 */
export interface DiscoveryResult {
  /**
   * Deterministically sorted array of discovered source files.
   */
  files: DiscoveredFile[];

  /**
   * Total number of filesystem entries scanned.
   */
  scannedCount: number;

  /**
   * Number of files/directories skipped due to ignore rules or unsupported extensions.
   */
  skippedCount: number;

  /**
   * Resolved root directory from which discovery was performed.
   */
  baseDirectory: string;
}
