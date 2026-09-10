import React from "react";
import { TaintClient } from "./TaintClient.js";

export default function TaintAndSerializationPage() {
  const secret = process.env.AUTH_SECRET;
  const callback = () => { console.log("leak", secret); };
  return <TaintClient token={secret} handler={callback} />;
}
