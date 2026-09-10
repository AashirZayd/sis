"use client";

import { getProfile } from "../app/actions";

export function Profile() {
  const profile = getProfile();
  return <div>{profile.secret}</div>;
}
