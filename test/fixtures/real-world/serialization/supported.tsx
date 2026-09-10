import React from "react";
import { ClientWidget } from "./ClientWidget.js";

export default function SupportedPage() {
  const now = new Date();
  const map = new Map([["a", 1]]);
  const set = new Set([1, 2, 3]);
  const buffer = new ArrayBuffer(8);
  const typed = new Uint8Array([1, 2, 3]);
  const big = BigInt(12345);
  const sym = Symbol.for("flight.symbol");
  const arr = [1, 2, "three"];
  const obj = { nested: { ok: true } };

  return (
    <ClientWidget
      date={now}
      map={map}
      set={set}
      buffer={buffer}
      typed={typed}
      big={big}
      sym={sym}
      arr={arr}
      obj={obj}
    />
  );
}
