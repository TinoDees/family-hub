"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteListInline } from "@/lib/actions/shopping";
import { ConfirmDialog } from "@/components/confirm-dialog";

/** Delete a shopping list behind an app-styled confirmation. */
export function DeleteListButton({
  listId,
  listName,
  itemCount,
}: {
  listId: string;
  listName: string;
  itemCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
        title="Delete this list"
      >
        🗑
      </button>
      <ConfirmDialog
        open={open}
        busy={busy}
        title="Delete this list?"
        message={
          error ??
          `"${listName}"${itemCount > 0 ? ` and its ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""} will be gone for good.`
        }
        confirmLabel="Delete list"
        onCancel={() => {
          setOpen(false);
          setError(null);
        }}
        onConfirm={async () => {
          setBusy(true);
          const res = await deleteListInline(listId);
          setBusy(false);
          if (!res.ok) {
            setError(res.error ?? "Could not delete the list");
            return;
          }
          setOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
