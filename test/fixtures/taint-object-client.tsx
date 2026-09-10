"use client";

import React from "react";

const auth = {
  token: process.env.API_TOKEN,
};

export function ObjectClientCard() {
  return <div>{auth.token}</div>;
}
