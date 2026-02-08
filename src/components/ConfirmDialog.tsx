interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/30" onClick={onCancel} />
      <div className="relative bg-paper p-5 mx-6 max-w-sm w-full border-t-2 border-blush">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-faded mb-5">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-rule text-sm font-medium
              text-faded active:bg-card active:scale-[0.98] transition-all duration-75"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-blush text-white text-sm font-medium
              active:scale-[0.97] transition-transform duration-75"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
