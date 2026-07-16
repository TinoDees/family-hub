import ModulePinGate from "@/components/module-pin-gate";

export default function ParentalLayout({ children }: { children: React.ReactNode }) {
  return <ModulePinGate slug="parental">{children}</ModulePinGate>;
}
