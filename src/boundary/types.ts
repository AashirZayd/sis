import type {
  Boundary,
  BoundaryKind,
  ServerAction,
  Finding,
  SourceLocation,
  ServerActionConfidence,
  ExecutionCompatibility,
} from "../core/types.js";
import type { TaintSource } from "../taint/types.js";

export type SerializabilityStatus = "serializable" | "unsupported" | "unknown";

export interface SerializabilityResult {
  status: SerializabilityStatus;
  reason?: string;
  isFunction?: boolean;
  isClassInstance?: boolean;
  taintViolation?: boolean;
  taintSource?: TaintSource;
  trace?: string[];
}

export interface PropBoundaryEdge {
  serverFile: string;
  clientComponent: string;
  clientComponentFile?: string;
  propName: string;
  location: SourceLocation;
  status: SerializabilityStatus;
  reason?: string;
  isTainted?: boolean;
}

export interface BoundaryAnalysisResult {
  boundaries: Boundary[];
  actions: ServerAction[];
  propEdges: PropBoundaryEdge[];
  findings: Finding[];
  verifiedSafeCount: number;
  violationsCount: number;
  unknownCount: number;
}
