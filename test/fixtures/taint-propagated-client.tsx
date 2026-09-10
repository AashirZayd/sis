"use client";

import React from "react";

const secret = process.env.PRIVATE_API_KEY;
const value = secret;

export function PropagatedClientCard() {
  return <div>{value}</div>;
}
