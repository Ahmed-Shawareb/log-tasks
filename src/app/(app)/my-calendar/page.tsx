import { requirePageUser } from "@/server/session";
import { MyCalendarClient } from "./my-calendar-client";

export const metadata = { title: "My calendar" };

export default async function MyCalendarPage() {
  await requirePageUser();
  return <MyCalendarClient />;
}
