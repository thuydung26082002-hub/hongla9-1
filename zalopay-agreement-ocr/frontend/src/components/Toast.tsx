import { useEffect } from 'react'
import { CheckCircle, XCircle, Info } from 'lucide-react'

export interface ToastMsg {
  id: number
  type: 'success' | 'error' | 'info'
  message: string
}

interface Props {
  toasts: ToastMsg[]
  onDismiss: (id: number) => void
}

const ICONS = {
  success: <CheckCircle size={16} className="text-[#00CC66]" />,
  error: <XCircle size={16} className="text-[#E5484D]" />,
  info: <Info size={16} className="text-[#0030CC]" />,
}

export default function ToastContainer({ toasts, onDismiss }: Props) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ToastMsg; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-3 flex items-center gap-3 cursor-pointer"
      onClick={() => onDismiss(toast.id)}
    >
      {ICONS[toast.type]}
      <span className="text-sm text-[#1A1F36]">{toast.message}</span>
    </div>
  )
}
