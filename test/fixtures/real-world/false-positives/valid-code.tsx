import React from "react";
import { SafeCard } from "./SafeCard.js";

const description = "Use 'use server' at the top of server action files";
/* Another comment mentioning "use client" */

async function internalServerHelper(x: number) {
  return x * 2;
}

const publicApiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api.example.com";

export default async function SafePage() {
  const val = await internalServerHelper(21);
  const date = new Date("2026-09-11T00:00:00Z");

  return (
    <SafeCard
      apiUrl={publicApiUrl}
      computedVal={val}
      timestamp={date}
      info={description}
    />
  );
}
