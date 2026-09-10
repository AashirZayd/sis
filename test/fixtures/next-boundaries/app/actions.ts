"use server";

import { dbInstance, DatabaseConnection } from "../lib/db.js";

export async function getSafeProfile() {
  return {
    name: "Alice",
    createdAt: new Date(),
    tags: new Set(["admin", "user"]),
  };
}

export async function leakSecret() {
  return process.env.DATABASE_URL;
}

export async function returnDatabase() {
  return new DatabaseConnection();
}

export async function returnCallback() {
  return () => {
    return "unsupported callback";
  };
}
