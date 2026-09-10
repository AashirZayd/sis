import React from "react";
import { TaintClient } from "./TaintClient.js";

export default function SerializationOnlyPage() {
  const callback = () => { console.log("event"); };
  return <TaintClient handler={callback} />;
}
