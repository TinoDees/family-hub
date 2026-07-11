"use client";

export function ConfirmSubmit({
  label,
  confirmMessage,
  className,
}: {
  label: string;
  confirmMessage: string;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
