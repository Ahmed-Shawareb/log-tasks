"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Onboarding, type Slide } from "./onboarding";
import { useApp } from "./app-context";

// Who sees what on their first sign-in. Shown once (or again with ?welcome=1).

const first = (name: string) => name.split(" ")[0] ?? name;

function staffSlides(name: string, role: string): Slide[] {
  const hello: Slide = { eyebrow: "Welcome to LOG", title: `Hello, ${first(name)}`, body: "Lots of work. Lots of growth. This is where every task, deadline and deliverable of the agency lives. Here is your part of it, in under a minute.", accent: "#7c5cff" };
  const done: Slide = { eyebrow: "You're set", title: "Lights, camera, work", body: "Everything updates live for everyone. You can watch this again any time from Settings.", accent: "#ffb347" };
  const byRole: Record<string, Slide[]> = {
    ADMIN: [
      { eyebrow: "01 · Orders", title: "Start the order", body: "Create work from the four main types and send it to an account manager.", points: ["Videos Social Media", "Statics Social Media", "Videos Ads", "Statics Ads"], accent: "#ff3d81" },
      { eyebrow: "02 · The agency", title: "Every client, every team", body: "Clients, projects, people and teams are all yours to shape.", points: ["Give each project its account manager", "Set a client's dashboard login", "Add people and choose their role", "Follow everything in Reports"], accent: "#3ad7ff" },
    ],
    ACCOUNT_MANAGER: [
      { eyebrow: "01 · The slider", title: "Your orders arrive here", body: "Open Team planner: every order waiting for you sits in the slider, one row per step with what is left to give out.", accent: "#ff3d81" },
      { eyebrow: "02 · Give it out", title: "Drag a step onto a day", body: "Drop a step on a person's day, choose all or a number. Each step must be due on or after the one before it, unit by unit.", points: ["Script writing → Filming → Editing", "You can give steps to yourself too", "Flip the planner with one click", "Move a task by dragging it"], accent: "#3ad7ff" },
      { eyebrow: "03 · Social media", title: "Build the feed", body: "Social media projects get a grid like the real profile. Fill each square, drag to reorder, and your client sees it live.", accent: "#ffb347" },
    ],
    PERFORMANCE_MANAGER: [
      { eyebrow: "01 · Your share", title: "Work lands with you", body: "Account managers give your team its share in the Team planner. You'll see it in your slider.", accent: "#3ad7ff" },
      { eyebrow: "02 · Your team", title: "Split it, review it", body: "Give the parts to your people, then approve their work or send it back with notes.", accent: "#ff3d81" },
    ],
    SOCIAL_MEDIA_SPECIALIST: [
      { eyebrow: "01 · Social feeds", title: "Every grid, one place", body: "Social feeds shows each social media project exactly as it will look on the profile.", points: ["Open a post to see images and links", "Drag squares to swap them", "Add the live link once it's posted", "Download any grid, or all of them"], accent: "#ff3d81" },
    ],
    EMPLOYEE: [
      { eyebrow: "01 · Your work", title: "One place for your tasks", body: "Your dashboard and board show what's due today, what's next and what came back for changes.", accent: "#3ad7ff" },
      { eyebrow: "02 · The rhythm", title: "Start. Submit. Shine.", body: "Start a task when you begin, submit it with your files or links, and the person who gave it to you reviews it.", points: ["Changes requested? Fix and resubmit", "Add your leave in Leave & availability"], accent: "#ff3d81" },
    ],
  };
  byRole.PRODUCTION_MANAGER = byRole.PERFORMANCE_MANAGER!;
  byRole.EXTERNAL = byRole.EMPLOYEE!;
  return [hello, ...(byRole[role] ?? byRole.EMPLOYEE!), done];
}

export function clientSlides(client: string, personal = false): Slide[] {
  return [
    { eyebrow: "Welcome", title: `Hello, ${client}`, body: personal ? "This is your space: everything being made for you, and when it arrives." : "This is your space at Lots of Growth: everything we make for you, and when it arrives.", accent: "#7c5cff" },
    { eyebrow: "01 · Your feed", title: "See it before the world does", body: "Your profile grid, post by post, exactly as it will go live. Tap a post to see it; reels open the video.", points: ["Posts, reels and carousels", "Download the whole grid as one image"], accent: "#ff3d81" },
    { eyebrow: "02 · Deliverables", title: "Every piece, every date", body: "What's delivered, what's being checked and what's coming next, with a calendar of every date.", accent: "#3ad7ff" },
    { eyebrow: "03 · Always live", title: "It moves as we move", body: "The moment your team updates something, it shows up here. No refresh needed.", accent: "#ffb347" },
  ];
}

/** Staff: first sign-in (after choosing their own password), or ?welcome=1 to watch again. */
export function StaffWelcome() {
  const { user } = useApp();
  const router = useRouter();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const again = new URLSearchParams(window.location.search).get("welcome") === "1";
    if (!user.mustChangePassword && (!user.onboarded || again)) setShow(true);
  }, [user.mustChangePassword, user.onboarded]);
  if (!show) return null;
  return (
    <Onboarding slides={staffSlides(user.name, user.role)} onDone={async () => {
      await fetch("/api/me/onboarded", { method: "POST" }).catch(() => {});
      setTimeout(() => setShow(false), 1000);
      const url = new URL(window.location.href);
      if (url.searchParams.has("welcome")) { url.searchParams.delete("welcome"); router.replace(url.pathname + url.search); }
      router.refresh();
    }} />
  );
}

/** Client dashboard: first sign-in, or ?welcome=1. */
export function ClientWelcome({ client, onboarded, personal = false }: { client: string; onboarded: boolean; personal?: boolean }) {
  const [show, setShow] = useState(false);
  useEffect(() => { setShow(!onboarded || new URLSearchParams(window.location.search).get("welcome") === "1"); }, [onboarded]);
  if (!show) return null;
  return (
    <Onboarding slides={clientSlides(client, personal)} logo={!personal} finishLabel="Open my dashboard" onDone={async () => {
      await fetch("/api/portal/onboarded", { method: "POST" }).catch(() => {});
      setTimeout(() => setShow(false), 1000);
    }} />
  );
}
