"use client";

import React from "react";

export function DirectClientCard() {
  return <div>{process.env.PRIVATE_API_KEY}</div>;
}
