import React from "react";
import { getAuthToken } from "./api/auth.js";
import { UserProfile } from "../components/UserProfile.js";

export default function DashboardPage() {
  const auth = getAuthToken();
  const logoutHandler = () => { console.log("logging out"); };

  return <UserProfile token={auth.token} onLogout={logoutHandler} />;
}
