import React from "react";
import { TaintClient } from "./TaintClient.js";

export default function TaintOnlyPage() {
  const secret = process.env.PAYMENT_PRIVATE_KEY;
  return <TaintClient token={secret} />;
}
