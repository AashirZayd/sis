"use client";

import React from "react";

export function TaintClient({ token, handler }: { token?: any; handler?: any }) {
  return <button onClick={handler}>{token}</button>;
}
