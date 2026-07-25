import { Resend } from 'resend'

// La dirección del remitente debe ser de un dominio verificado en Resend
// (RESEND_FROM_EMAIL). El correo de la clínica no puede ir como `from`, pero
// sí como nombre visible y como reply-to: las respuestas del paciente llegan
// al buzón de la clínica.
export async function sendReciboEmail(
  to: string,
  subject: string,
  html: string,
  opts?: { fromName?: string | null; replyTo?: string | null },
) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY no está configurada')
  const resend = new Resend(apiKey)

  const fromEnv = process.env.RESEND_FROM_EMAIL ?? 'Nin Dental Clinic <onboarding@resend.dev>'
  // extrae la dirección (por si la env ya trae "Nombre <email>")
  const address = fromEnv.match(/<([^>]+)>/)?.[1] ?? fromEnv
  const from = opts?.fromName ? `${opts.fromName} <${address}>` : fromEnv

  return resend.emails.send({
    from,
    to,
    subject,
    html,
    ...(opts?.replyTo ? { replyTo: opts.replyTo } : {}),
  })
}
