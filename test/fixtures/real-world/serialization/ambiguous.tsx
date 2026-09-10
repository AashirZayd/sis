import React from "react";
import { ClientWidget } from "./ClientWidget.js";

export default function AmbiguousPage({ externalProp }: { externalProp: any }) {
  const dynamicVal = externalProp.getDynamic();
  return <ClientWidget dynamicVal={dynamicVal} />;
}
