import { Aurora } from "@/components/aurora";

export const metadata = { title: { default: "Client dashboard", template: "%s · LOG" } };

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <Aurora />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
