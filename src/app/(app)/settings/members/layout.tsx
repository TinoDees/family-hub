import ModulePinGate from "@/components/module-pin-gate";

export default function MembersLayout({ children }: { children: React.ReactNode }) {
  return <ModulePinGate slug="people">{children}</ModulePinGate>;
}
