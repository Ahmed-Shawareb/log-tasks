import { Aurora } from "@/components/aurora";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <Aurora />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
