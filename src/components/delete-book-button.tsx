"use client";

/** Submit button for the delete form on the book page — asks before firing. */
export function DeleteBookButton() {
  return (
    <button
      type="submit"
      onClick={(e) => {
        if (
          !window.confirm(
            "Remove this book from the family shelf? The file is deleted for everyone."
          )
        ) {
          e.preventDefault();
        }
      }}
      className="rounded-lg px-3 py-2 text-sm text-stone-400 hover:text-red-600"
    >
      Delete
    </button>
  );
}
