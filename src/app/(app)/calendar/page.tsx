import { Suspense } from "react";
import { CalendarLoader } from "./calendar-loader";

export const metadata = { title: "Calendar" };

export default function CalendarPage() {
  return <Suspense><CalendarLoader /></Suspense>;
}
