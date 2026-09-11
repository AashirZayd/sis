/**
 * Deterministic Runtime Prelude Contract
 *
 * Defines the contract, behaviors, and code for deterministic framework
 * primitives executed inside isolated-vm.
 */
export interface RuntimePrelude {
  /**
   * Unique identifier / global function name (e.g. "cookies", "headers", "redirect", "notFound").
   */
  readonly name: string;

  /**
   * Precise explanation of the semantic contract provided.
   */
  readonly semanticContract: string;

  /**
   * Whether this prelude is strictly deterministic across calls and runs.
   */
  readonly isDeterministic: boolean;

  /**
   * Concrete framework behaviors that ARE modeled by this prelude.
   */
  readonly modeledBehaviors: readonly string[];

  /**
   * Framework behaviors that are NOT modeled by this prelude.
   */
  readonly unmodeledBehaviors: readonly string[];

  /**
   * Standalone ES2022 JavaScript code to be injected into the isolated-vm sandbox.
   */
  readonly code: string;
}
