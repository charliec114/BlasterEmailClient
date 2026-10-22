import { useToastStore } from '../store/useToastStore'

export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <span className="toast-message">{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action?.onClick()
                dismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" className="toast-close" onClick={() => dismiss(toast.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
