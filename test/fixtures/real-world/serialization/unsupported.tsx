import React from "react";
import { ClientWidget } from "./ClientWidget.js";

class CustomUser {
  constructor(public name: string) {}
}

class DatabaseHandle {
  connection = "postgres://localhost:5432";
}

export default function UnsupportedPage() {
  const fnCallback = () => console.log("clicked");
  const customInstance = new CustomUser("Alice");
  const dbHandle = new DatabaseHandle();

  return (
    <ClientWidget
      onClick={fnCallback}
      user={customInstance}
      db={dbHandle}
    />
  );
}
