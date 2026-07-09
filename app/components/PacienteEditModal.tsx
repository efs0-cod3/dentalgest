import { Form, useNavigation } from 'react-router'
import { X } from 'lucide-react'
import { useCloseOnSubmit } from '~/lib/hooks'

export type PacienteEditable = {
  id: string
  nombre: string; telefono: string | null; email: string | null
  fecha_nacimiento: string | null; cedula: string | null; genero: string | null; direccion: string | null
  tipo_sangre: string | null; alergias: string | null; antecedentes_medicos: string | null
  contacto_emergencia_nombre: string | null; contacto_emergencia_telefono: string | null
  contacto_emergencia_relacion: string | null
}

export function PacienteEditModal({ paciente, onClose }: { paciente: PacienteEditable | null; onClose: () => void }) {
  const navigation = useNavigation()
  const isSubmitting = navigation.state === 'submitting'
  useCloseOnSubmit(onClose)

  const field = (label: string, name: string, type = 'text', props: any = {}) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type={type} name={name} defaultValue={(paciente as any)?.[name] ?? ''} {...props}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-semibold text-gray-900">{paciente ? 'Editar paciente' : 'Nuevo paciente'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <Form method="post" className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-6">
          <input type="hidden" name="intent" value={paciente ? 'update' : 'create'} />
          {paciente && <input type="hidden" name="id" value={paciente.id} />}

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Datos personales</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo <span className="text-red-500">*</span></label>
                <input type="text" name="nombre" required defaultValue={paciente?.nombre ?? ''} placeholder="Nombre completo"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {field('Fecha de nacimiento', 'fecha_nacimiento', 'date')}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Género</label>
                <select name="genero" defaultValue={paciente?.genero ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Seleccionar —</option>
                  {['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'].map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              {field('Cedula / Identificación', 'cedula')}
              <div className="col-span-1 sm:col-span-2">{field('Dirección', 'direccion')}</div>
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contacto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Teléfono', 'telefono', 'tel', { placeholder: '555-0000' })}
              {field('Correo electrónico', 'email', 'email', { placeholder: 'correo@ejemplo.com' })}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Contacto de emergencia</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {field('Nombre', 'contacto_emergencia_nombre')}
              {field('Teléfono', 'contacto_emergencia_telefono', 'tel')}
              {field('Relación', 'contacto_emergencia_relacion', 'text', { placeholder: 'Ej. Madre, Esposo' })}
            </div>
          </section>

          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Historial médico</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de sangre</label>
                <select name="tipo_sangre" defaultValue={paciente?.tipo_sangre ?? ''}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Desconocido —</option>
                  {['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Alergias</label>
                <input type="text" name="alergias" defaultValue={paciente?.alergias ?? ''} placeholder="Ej. Penicilina, látex"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Antecedentes médicos</label>
                <textarea name="antecedentes_medicos" rows={3} defaultValue={paciente?.antecedentes_medicos ?? ''}
                  placeholder="Enfermedades crónicas, cirugías previas, medicamentos actuales…"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2 pt-2 flex-shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancelar</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {isSubmitting ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </Form>
      </div>
    </div>
  )
}
