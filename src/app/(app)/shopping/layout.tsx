import { ShoppingTabs } from "@/components/shopping-tabs";

export default function ShoppingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-semibold">🛒 Shopping</h1>
      <ShoppingTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
