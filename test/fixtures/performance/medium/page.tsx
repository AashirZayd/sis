import React from "react";
import { ClientWidget } from "./ClientWidget.js";
export default function MediumPage() {
  return (
    <div>
      <ClientWidget title="W1" count={1} />
      <ClientWidget title="W2" count={2} />
      <ClientWidget title="W3" count={3} />
    </div>
  );
}
