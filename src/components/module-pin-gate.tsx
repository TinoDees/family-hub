import { getModule } from "@/lib/modules";
import { createClient } from "@/lib/supabase/server";
import PinShield from "@/components/pin-shield";

/**
 * Server wrapper for module layouts: renders children directly unless the
 * module is flagged `pinShield` in the registry, in which case the client
 * PinShield overlay guards it. Permissions (who may open at all) are enforced
 * separately by the permission resolver — this is the on-top PIN check.
 */
export default async function ModulePinGate({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const mod = getModule(slug);
  if (!mod?.pinShield) return <>{children}</>;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <>{children}</>; // auth gate handles this elsewhere

  const { data: hasPin } = await supabase.rpc("has_user_pin");
  return (
    <PinShield moduleName={mod.name} userId={user.id} hasPin={Boolean(hasPin)}>
      {children}
    </PinShield>
  );
}
