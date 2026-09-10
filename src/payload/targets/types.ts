import type {
  SourceLocation,
  BoundaryKind,
  ExecutionCompatibility,
} from "../../core/types.js";

export type FuzzTargetKind =
  | "server-action-argument"
  | "server-action-return"
  | "server-to-client-prop";

export type BoundaryInvariant =
  | "serializable"
  | "no-secret-crossing"
  | "argument-shape"
  | "return-value-shape"
  | "runtime-safety";

export type ShapeKind =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "union"
  | "unknown";

export interface InferredShape {
  kind: ShapeKind;
  properties?: Map<string, InferredShape>;
  elementType?: InferredShape;
  unionTypes?: InferredShape[];
  hasDefault?: boolean;
  nullable?: boolean;
  optional?: boolean;
  rawTypeAnnotation?: string;
}

export interface FuzzTarget {
  id: string;
  kind: FuzzTargetKind;
  file: string;
  location: SourceLocation;
  actionName?: string;
  componentName?: string;
  parameterName?: string;
  parameterIndex?: number;
  propName?: string;
  inferredShape: InferredShape;
  boundaryKind: BoundaryKind;
  invariants: BoundaryInvariant[];
  executionCompatibility: ExecutionCompatibility;
}
