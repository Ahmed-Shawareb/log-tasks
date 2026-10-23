import { Suspense } from "react";
import { requirePageUser } from "@/server/session";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePageUser();
  return <Suspense><SettingsClient /></Suspense>;
}
