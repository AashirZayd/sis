"use client";

import React from "react";

const message = `token=${process.env.API_TOKEN}`;

export function TemplateClientCard() {
  return <div>{message}</div>;
}
