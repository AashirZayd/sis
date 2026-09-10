"use client";
import React from "react";
export function ClientCard({ title, onClick }: { title: string; onClick?: () => void }) {
  return <button onClick={onClick}>{title}</button>;
}
