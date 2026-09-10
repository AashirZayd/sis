"use client";

import { getProfile } from "../app/actions";

export function SafeProfile() {
  const profile = getProfile();
  return <div>{profile.safe}</div>;
}
