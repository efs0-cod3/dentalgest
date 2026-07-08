# NIN Dental — Sistema de Gestión de Clínica Dental

Sistema de gestión clínica completo para clínicas dentales. Construido con React Router v7 (SSR), Supabase y Tailwind CSS v4. Mobile-friendly.

---

## Módulos

| Módulo | Descripción |
|---|---|
| **Inicio** | Dashboard con KPIs del día, citas de hoy y próximas citas |
| **Citas** | Agenda en vista tabla o calendario mensual, con filtros por estado |
| **Pacientes** | Expediente clínico completo: datos, historial, citas, documentos |
| **Caja** | Movimientos de ingresos/egresos, cuentas por cobrar con abonos |
| **Cotizaciones** | Presupuestos con validez de 20 días, opción de congelamiento con depósito |
| **Laboratorio** | Órdenes a laboratorios externos con estados y alertas de vencimiento |
| **Configuración** | Clínica, usuarios, doctores, tratamientos, agenda, caja, notificaciones |

---

## Stack

- **Framework**: [React Router v7](https://reactrouter.com/) — SSR con loaders y actions
- **Base de datos**: [Supabase](https://supabase.com/) — PostgreSQL + Auth + Storage
- **Estilos**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Email**: [Resend](https://resend.com/) — envío de recibos por correo
- **QR**: `qrcode` — códigos QR en recibos para verificación
- **Lenguaje**: TypeScript

---

## Requisitos

- Node.js 18+
- Cuenta en Supabase
- Cuenta en Resend (para emails, opcional)

---

## Configuración local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu-anon-key
SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key
RESEND_API_KEY=re_xxxxxxxxxxxx
```

> `SUPABASE_SERVICE_ROLE_KEY` es necesario para invitar usuarios desde Configuración.

### 3. Base de datos

Ejecuta las migraciones SQL en el editor de Supabase. Las tablas principales son:

```
clinicas, perfiles, doctores, tratamientos, pacientes,
citas, pagos, deudas, cotizaciones, cotizacion_items,
ordenes_laboratorio, expediente_entradas, documentos, config_clinica,
clientes_externos, trabajos_externos, facturas_externas
```

El módulo "Trabajos externos" además requiere un bucket público de Storage llamado
`externos` (Dashboard → Storage → New bucket).

### 4. Servidor de desarrollo

```bash
npm run dev
```

La app estará en `http://localhost:5173`.

---

## Producción

### Build

```bash
npm run build
npm run start
```

### Deploy recomendado: Vercel

1. Instala el adaptador:
   ```bash
   npm i @react-router/vercel
   ```
2. Actualiza `react-router.config.ts`:
   ```ts
   import { vercel } from "@react-router/vercel";
   // ...
   serverAdapter: vercel()
   ```
3. Conecta el repo en [vercel.com](https://vercel.com) y configura las variables de entorno.

### Docker

```bash
docker build -t nin-dental .
docker run -p 3000:3000 --env-file .env nin-dental
```

Compatible con Railway, Fly.io, Render y cualquier plataforma que soporte Docker o Node.js.

---

## Verificación de recibos

Los recibos incluyen un código QR que apunta a `/verificar/:id`. Esta ruta es pública y permite al paciente verificar la autenticidad del pago sin necesidad de login.

---

## Typecheck

```bash
npm run typecheck
```
