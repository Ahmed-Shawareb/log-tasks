import { Suspense } from "react";
import { BoardClient } from "./board-client";

export const metadata = { title: "Board" };

export default function BoardPage() {
  return <Suspense><BoardClient /></Suspense>;
}
