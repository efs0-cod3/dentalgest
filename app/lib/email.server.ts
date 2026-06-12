import { Resend } from 'resend'

export async function sendReciboEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY no está configurada')
  const resend = new Resend(apiKey)
  return resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? 'Nin Dental Clinic <onboarding@resend.dev>',
    to,
    subject,
    html,
  })
}
