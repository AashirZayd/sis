export type PayloadCategory =
  | "nullish"
  | "empty"
  | "numeric-extreme"
  | "prototype-sensitive"
  | "deep-nested"
  | "serialization-trap"
  | "primitive-mismatch";

export interface GeneratedPayload {
  id: number;
  category: PayloadCategory;
  value: unknown;
  description: string;
  fuzzTarget?: string;
  strategy?: string;
  invariant?: string;
  parameter?: string;
}

export interface PayloadSynthesisOptions {
  runs?: number;
  seed?: number;
}

export interface PayloadSynthesisResult {
  payloads: GeneratedPayload[];
  requestedRuns: number;
  generatedRuns: number;
  categories: Record<PayloadCategory, number>;
  seed?: number;
}
