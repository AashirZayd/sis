"use client";

import React from "react";

const key = "PRIVATE_API_KEY";
const value = process.env[key];

export function DynamicEnvCard() {
  return <div>{value}</div>;
}
