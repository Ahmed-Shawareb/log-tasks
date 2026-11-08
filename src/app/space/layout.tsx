import { Aurora } from "@/components/aurora";

// Personal clients' dashboard: the same dashboard as /portal, with no LOG name, logo or icon anywhere.
export const metadata = {
  title: { absolute: "Your dashboard" },
  description: "Your projects, deliverables and dates.",
  icons: { icon: "/space-icon.svg" },
};

export default function SpaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Aurora />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
