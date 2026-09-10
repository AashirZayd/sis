import React from "react";
import { ClientCard } from "../components/ClientCard.js";

export default function Page() {
  return (
    <main>
      <ClientCard title="Dashboard" count={42} />
    </main>
  );
}
