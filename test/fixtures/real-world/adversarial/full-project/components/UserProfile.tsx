"use client";

import React from "react";

export function UserProfile({ token, onLogout }: { token?: string; onLogout?: () => void }) {
  return (
    <div>
      <span>Token: {token}</span>
      <button onClick={onLogout}>Logout</button>
    </div>
  );
}
