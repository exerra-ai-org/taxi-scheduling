import Modal from "./Modal";

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={title}>
      <div className="space-y-4">
        <p className="body-copy">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="btn-secondary button-text-compact"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`${variant === "danger" ? "btn-danger" : "btn-primary"} button-text-compact`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
