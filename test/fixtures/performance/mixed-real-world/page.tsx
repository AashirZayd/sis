import React from "react";
import { ClientCard } from "./ClientCard.js";
export default function MixedPage() {
  const invalidCallback = () => { console.log("clicked"); };
  return (
    <div>
      <ClientCard title="Valid" />
      <ClientCard title="Invalid" onClick={invalidCallback} />
    </div>
  );
}
