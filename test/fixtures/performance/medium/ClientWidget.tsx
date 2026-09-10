"use client";
import React from "react";
export function ClientWidget({ title, count }: { title: string; count: number }) {
  return <div>{title}: {count}</div>;
}
