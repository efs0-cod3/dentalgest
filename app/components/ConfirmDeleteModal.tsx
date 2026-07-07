import { AlertTriangle } from 'lucide-react'

export type ConfirmDeleteModalProps = {
  title: string
  itemLabel: string
  description?: string
  confirmLabel?: string
  isSubmitting?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteModal({
  title, itemLabel, description, confirmLabel = 'Eliminar', isSubmitting, onConfirm, onCancel,
}: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full sm:max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="w-11 h-11 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
            <AlertTriangle size={20} />
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">{title}</h2>
          <p className="text-sm font-medium text-gray-700">{itemLabel}</p>
          {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button type="button" onClick={onCancel} disabled={isSubmitting}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting}
            className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            {isSubmitting ? 'Eliminando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
