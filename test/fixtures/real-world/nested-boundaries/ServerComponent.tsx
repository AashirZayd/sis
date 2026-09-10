import React from "react";
import { calculateDiscount } from "./helpers.js";
import { ClientCard } from "./ClientCard.js";
import { submitOrder } from "./actions.js";

export default async function ServerComponent() {
  const discount = calculateDiscount(100);
  return (
    <div>
      <ClientCard title="Special Offer" count={discount} />
    </div>
  );
}
