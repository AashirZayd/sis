"use client";

import React from "react";

export function SafeCard({ apiUrl, computedVal, timestamp, info }: {
  apiUrl: string;
  computedVal: number;
  timestamp: Date;
  info: string;
}) {
  return (
    <div>
      <h1>{apiUrl}</h1>
      <p>{computedVal}</p>
      <time>{timestamp.toISOString()}</time>
      <small>{info}</small>
    </div>
  );
}
