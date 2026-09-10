import React from "react";
import { getAuthenticatedUser } from "./auth/user.js";
import { UserBadge } from "./UserBadge.js";

export default function Page() {
  const user = getAuthenticatedUser(true);
  return <UserBadge secret={user.authPayload} />;
}
