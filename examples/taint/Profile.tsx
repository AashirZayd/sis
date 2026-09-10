"use client";

import { getUserProfile } from "./session";

export function ProfileView() {
  const profile = getUserProfile();
  return <div>Welcome, {profile.username}! API Secret: {profile.secretKey}</div>;
}
