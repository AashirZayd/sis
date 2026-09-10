"use client";

import React from "react";

export function ClientCard({ title, count }: { title: string; count: number }) {
  return <div>{title}: {count}</div>;
}

export default function DefaultClientCard({ message }: { message: string }) {
  return <div>{message}</div>;
}
