"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteListInline } from "@/lib/actions/shopping";

/** Delete a shopping list after an explicit confirm (item count shown). */
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
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (
          !confirm(
            `Delete "${listName}"${itemCount > 0 ? ` and its ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}? This can't be undone.`
          )
        )
          return;
        setBusy(true);
        const res = await deleteListInline(listId);
        setBusy(false);
        if (!res.ok) alert(res.error ?? "Could not delete the list");
        else router.refresh();
      }}
      className="rounded-lg border border-stone-200 px-2 py-1 text-xs text-stone-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
      title="Delete this list"
    >
      🗑
    </button>
  );
}
