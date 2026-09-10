"use client";

import React from "react";

// Leaky client component fixture for static taint tracking
export function LeakyProfileCard() {
  const apiKey = process.env.PRIVATE_API_KEY;

  return (
    <div className="profile-card">
      <h2>User Profile</h2>
      <span data-secret={apiKey}>Confidential Info</span>
    </div>
  );
}
