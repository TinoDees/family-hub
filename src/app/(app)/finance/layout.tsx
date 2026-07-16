import ModulePinGate from "@/components/module-pin-gate";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <ModulePinGate slug="finance">{children}</ModulePinGate>;
}
