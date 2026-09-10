"use client";

import React from "react";

const url = process.env.NEXT_PUBLIC_API_URL;

export function PublicEnvCard() {
  return <div>{url}</div>;
}
