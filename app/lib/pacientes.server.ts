export function buildPacienteData(fd: FormData, clinicaId: string) {
  return {
    clinica_id: clinicaId,
    nombre: fd.get('nombre') as string,
    telefono: (fd.get('telefono') as string) || null,
    email: (fd.get('email') as string) || null,
    fecha_nacimiento: (fd.get('fecha_nacimiento') as string) || null,
    cedula: (fd.get('cedula') as string) || null,
    genero: (fd.get('genero') as string) || null,
    direccion: (fd.get('direccion') as string) || null,
    tipo_sangre: (fd.get('tipo_sangre') as string) || null,
    alergias: (fd.get('alergias') as string) || null,
    antecedentes_medicos: (fd.get('antecedentes_medicos') as string) || null,
    contacto_emergencia_nombre: (fd.get('contacto_emergencia_nombre') as string) || null,
    contacto_emergencia_telefono: (fd.get('contacto_emergencia_telefono') as string) || null,
    contacto_emergencia_relacion: (fd.get('contacto_emergencia_relacion') as string) || null,
  }
}
