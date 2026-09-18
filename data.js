/* Datos base del prototipo: ejes, equipos y las 102 propuestas del
   programa "Conectemos la Chile" (FECh 2026), extraídas del documento oficial. */

const EJES = [
  { id: 1,  nombre: 'Condiciones de Estudio y Bienestar Estudiantil', corto: 'Bienestar estudiantil' },
  { id: 2,  nombre: 'Una FECh para Chile y la Chile', corto: 'FECh para la Chile' },
  { id: 3,  nombre: 'Movimiento Estudiantil y Contexto Nacional', corto: 'Movimiento estudiantil' },
  { id: 4,  nombre: 'Género, Disidencias y Educación No Sexista', corto: 'Género y disidencias' },
  { id: 5,  nombre: 'Arte, Cultura, Deporte y Encuentro Estudiantil', corto: 'Arte, cultura y deporte' },
  { id: 6,  nombre: 'Academia y Mundo Laboral', corto: 'Academia y trabajo' },
  { id: 7,  nombre: 'Gobierno Universitario', corto: 'Gobierno universitario' },
  { id: 8,  nombre: 'Financiamiento de la Educación Superior', corto: 'Financiamiento' },
  { id: 9,  nombre: 'Memoria, Derechos Humanos y Pueblos Oprimidos', corto: 'Memoria y DD.HH.' },
  { id: 10, nombre: 'Universidad Sustentable: Cumplimiento y Participación', corto: 'Sustentabilidad' }
];

const EQUIPOS = [
  { id: 'MESA', nombre: 'Mesa Ejecutiva FECh',              corto: 'Mesa Ejecutiva', color: 1, lider: '' },
  { id: 'BIE',  nombre: 'Secretaría de Bienestar',           corto: 'Bienestar', color: 2, lider: '' },
  { id: 'GEN',  nombre: 'Secretaría de Género y Disidencias',corto: 'Género', color: 3, lider: '' },
  { id: 'CUL',  nombre: 'Secretaría de Cultura y Deporte',   corto: 'Cultura y Deporte', color: 4, lider: '' },
  { id: 'ACA',  nombre: 'Secretaría Académica y Laboral',    corto: 'Académica', color: 5, lider: '' },
  { id: 'MEM',  nombre: 'Secretaría de Memoria y DD.HH.',    corto: 'Memoria y DD.HH.', color: 6, lider: '' },
  { id: 'SUS',  nombre: 'Secretaría de Sustentabilidad',     corto: 'Sustentabilidad', color: 7, lider: '' },
  { id: 'TER',  nombre: 'Secretaría Territorial y Comunicaciones', corto: 'Territorial', color: 8, lider: '' }
];

/* [código, eje, sub-eje, título, equipo sugerido] */
const PROPUESTAS_BASE = [
  ['1.1',  1, 'Salud Mental', 'Talleres sobre problemáticas de Salud Mental', 'BIE'],
  ['1.2',  1, 'Salud Mental', 'Capacitación de actores estratégicos con certificación DSE', 'BIE'],
  ['1.3',  1, 'Salud Mental', 'Diagnóstico participativo de Bienestar Estudiantil', 'BIE'],
  ['1.4',  1, 'Salud Mental', 'Impulsar una estrategia de Salud Mental en la Universidad', 'BIE'],
  ['1.5',  1, 'Salud Mental', 'Garantías frente a tragedias y acompañamiento colectivo', 'BIE'],
  ['1.6',  1, 'Salud Mental', 'Fortalecimiento y aumento de capacidades de la DSE', 'BIE'],
  ['1.7',  1, 'Salud Mental', 'Ampliación del sistema de franquicias médicas', 'BIE'],
  ['1.8',  1, 'Salud Mental', 'Justificaciones de inasistencia transversales', 'BIE'],
  ['1.9',  1, 'Alimentación', 'Alimentación digna para toda la UChile', 'BIE'],
  ['1.10', 1, 'Alimentación', 'Mesa triestamental de alimentación', 'BIE'],
  ['1.11', 1, 'Alimentación', 'Casinos en todas las facultades', 'BIE'],
  ['1.12', 1, 'Alimentación', 'Espacios de alimentación con equipamiento mínimo', 'BIE'],
  ['1.13', 1, 'Alimentación', 'Sistema transversal de tickets de almuerzo', 'BIE'],
  ['1.14', 1, 'Alimentación', 'La "Juna" en todas partes: JUNAEB en todos los locales', 'BIE'],
  ['1.15', 1, 'Transporte', 'Beca de transporte para estudiantes de zonas rurales', 'BIE'],
  ['1.16', 1, 'Transporte', 'Convenios de transporte interregional para estudiantes', 'BIE'],
  ['1.17', 1, 'Garantías académicas e infraestructura', 'Garantías académicas universales y mecanismos de resguardo', 'ACA'],
  ['1.18', 1, 'Garantías académicas e infraestructura', 'Política de adecuaciones para estudiantes neuro divergentes', 'ACA'],
  ['1.19', 1, 'Garantías académicas e infraestructura', 'Estatuto para estudiantes trabajadores', 'ACA'],
  ['1.20', 1, 'Garantías académicas e infraestructura', 'Perfeccionamiento del Protocolo de Corresponsabilidad', 'GEN'],
  ['1.21', 1, 'Garantías académicas e infraestructura', 'Mejora de infraestructura para personas cuidadoras', 'GEN'],
  ['1.22', 1, 'Garantías académicas e infraestructura', 'Programa y beca de Residencia Universitaria', 'BIE'],
  ['1.23', 1, 'Garantías académicas e infraestructura', 'Plan de acompañamiento a estudiantes de región', 'BIE'],
  ['1.24', 1, 'Garantías académicas e infraestructura', 'Acompañamiento psicosocial para estudiantes de región', 'BIE'],
  ['1.25', 1, 'Garantías académicas e infraestructura', 'Recorridos por Santiago para estudiantes de región', 'TER'],
  ['1.26', 1, 'Garantías académicas e infraestructura', 'Impulsar un Plan de Infraestructura UCh', 'MESA'],

  ['2.1',  2, 'Universidad y Federación al servicio de lo público', 'Acceso universal en toda la Universidad (TUI sin distinción)', 'MESA'],
  ['2.2',  2, 'Universidad y Federación al servicio de lo público', 'Estudiantes al servicio de Chile: vinculación territorial', 'TER'],
  ['2.3',  2, 'Universidad y Federación al servicio de lo público', 'Vínculo de la FECh con los Preuniversitarios Populares UCh', 'TER'],
  ['2.4',  2, 'Universidad y Federación al servicio de lo público', 'Escuelas de liderazgos estudiantiles y territoriales', 'TER'],
  ['2.5',  2, 'Universidad y Federación al servicio de lo público', 'Comisión de revisión del rol público en las mallas', 'ACA'],
  ['2.6',  2, 'Conectar la FECh a la Chile', 'Reactivación del CEFECh', 'MESA'],
  ['2.7',  2, 'Conectar la FECh a la Chile', 'Política de participación federativa para mechones', 'MESA'],
  ['2.8',  2, 'Conectar la FECh a la Chile', 'Aló FECh: buzones en todos los campus', 'TER'],
  ['2.9',  2, 'Conectar la FECh a la Chile', '¡Pleno FECh en los campus!', 'MESA'],
  ['2.10', 2, 'Conectar la FECh a la Chile', 'Web-FECh', 'TER'],
  ['2.11', 2, 'Conectar la FECh a la Chile', 'La Casa de les Estudiantes: reapertura permanente', 'MESA'],

  ['3.1',  3, 'Movimiento Estudiantil', 'Coordinar con las Federaciones Estatales de Santiago', 'MESA'],
  ['3.2',  3, 'Movimiento Estudiantil', 'Proponer un Plan de Lucha Estudiantil en la CONFECh', 'MESA'],
  ['3.3',  3, 'Movimiento Estudiantil', 'Cuidado y apoyo a estudiantes movilizados', 'MESA'],

  ['4.1',  4, 'Género y Disidencias', 'Dispensadores de material de higiene menstrual', 'GEN'],
  ['4.2',  4, 'Género y Disidencias', 'Dispensadores de preservativos', 'GEN'],
  ['4.3',  4, 'Género y Disidencias', 'Promover a organizaciones feministas y disidentes', 'GEN'],
  ['4.4',  4, 'Género y Disidencias', 'Promoción de organizaciones de cuidadoras y cuidadores', 'GEN'],
  ['4.5',  4, 'Género y Disidencias', 'Avanzar en paridad bibliográfica', 'ACA'],
  ['4.6',  4, 'Género y Disidencias', 'Escuela de lideresas feministas "Amanda Labarca"', 'GEN'],
  ['4.7',  4, 'Género y Disidencias', 'Escuela de género para dirigentes sociales varones', 'GEN'],
  ['4.8',  4, 'Género y Disidencias', 'Política de inhabilidades docentes por violencia de género', 'GEN'],
  ['4.9',  4, 'Género y Disidencias', 'Ferias de salud sexual y testeo de ETS', 'GEN'],
  ['4.10', 4, 'Género y Disidencias', 'Participación en comisiones triestamentales de género (DIGEN)', 'GEN'],
  ['4.11', 4, 'Género y Disidencias', 'Actualicemos el instructivo Mara Rita', 'GEN'],
  ['4.12', 4, 'Género y Disidencias', 'Reconocimiento institucional a las labores de cuidados', 'GEN'],
  ['4.13', 4, 'Género y Disidencias', 'Encuentro Programático Feminista y Disidente', 'GEN'],

  ['5.1',  5, 'Arte y Cultura', 'Desburocratización en el uso de espacios', 'CUL'],
  ['5.2',  5, 'Arte y Cultura', 'Difusión y acompañamiento de fondos concursables', 'CUL'],
  ['5.3',  5, 'Arte y Cultura', 'Festival de la Primavera', 'CUL'],
  ['5.4',  5, 'Arte y Cultura', 'Festival de invierno y actividades culturales', 'CUL'],
  ['5.5',  5, 'Arte y Cultura', 'Festival José Balmes de Arte y Política', 'CUL'],
  ['5.6',  5, 'Arte y Cultura', 'Vinculación con organizaciones culturales internas y externas', 'CUL'],
  ['5.7',  5, 'Deporte', 'Rol activo en el plan de recuperación del Club Universidad de Chile', 'CUL'],
  ['5.8',  5, 'Deporte', 'Catastro de utilización de los espacios deportivos', 'CUL'],
  ['5.9',  5, 'Deporte', 'Horario protegido en los Juegos Olímpicos Estudiantiles (JOE)', 'CUL'],
  ['5.10', 5, 'Deporte', 'Encuentro anual de organizaciones deportivas', 'CUL'],
  ['5.11', 5, 'Deporte', 'Difusión de las selecciones de la Universidad', 'CUL'],
  ['5.12', 5, 'Deporte', 'Trabajo permanente y vinculante con el CDE UChile', 'CUL'],
  ['5.13', 5, 'Deporte', 'Jornadas de proyección de campeonatos en las facultades', 'CUL'],

  ['6.1',  6, 'Academia y Mundo Laboral', 'Política formal de pasantías y pre prácticas', 'ACA'],
  ['6.2',  6, 'Academia y Mundo Laboral', 'Bolsa Laboral UChile', 'ACA'],
  ['6.3',  6, 'Academia y Mundo Laboral', 'Ferias laborales y vinculación con el mundo del trabajo', 'ACA'],
  ['6.4',  6, 'Academia y Mundo Laboral', 'Feria laboral con enfoque de género', 'ACA'],
  ['6.5',  6, 'Academia y Mundo Laboral', 'Encuentros interdisciplinarios de organizaciones académicas', 'ACA'],
  ['6.6',  6, 'Academia y Mundo Laboral', 'Condiciones dignas para las prácticas del área de la Salud', 'ACA'],
  ['6.7',  6, 'Academia y Mundo Laboral', 'Promoción de las perspectivas olvidadas en la producción de conocimiento', 'ACA'],
  ['6.8',  6, 'Academia y Mundo Laboral', 'Reconocer la investigación estudiantil como un trabajo', 'ACA'],
  ['6.9',  6, 'Academia y Mundo Laboral', 'Sistemas de nivelación para mechones', 'ACA'],
  ['6.10', 6, 'Academia y Mundo Laboral', 'Política de semestre de verano a nivel UChile', 'ACA'],
  ['6.11', 6, 'Academia y Mundo Laboral', 'Acceso a certificación de inglés', 'ACA'],

  ['7.1',  7, 'Gobierno Universitario', 'Facilitar herramientas a organizaciones sociales y secretarías FECh', 'MESA'],
  ['7.2',  7, 'Gobierno Universitario', 'Propiciar el trabajo territorial de las Consejerías FECh', 'TER'],
  ['7.3',  7, 'Gobierno Universitario', 'Coordinar consejerías de facultad y de campus', 'TER'],
  ['7.4',  7, 'Gobierno Universitario', 'Trabajo con la bancada estudiantil del Senado Universitario', 'MESA'],
  ['7.5',  7, 'Gobierno Universitario', 'Implementación del voto triestamental en consejos de Facultad', 'MESA'],
  ['7.6',  7, 'Gobierno Universitario', 'Alianza FENAFUCh, SITRAUCh y ACAUCh por el cogobierno', 'MESA'],
  ['7.7',  7, 'Gobierno Universitario', 'Claridad y transparencia de los presupuestos FECh', 'MESA'],

  ['8.1',  8, 'Financiamiento', 'Incorporación vinculante de la FECh en la comisión de financiamiento', 'MESA'],
  ['8.2',  8, 'Financiamiento', 'Redistribución equitativa interfacultades de los recursos', 'MESA'],
  ['8.3',  8, 'Financiamiento', 'Condonación de la deuda de la Facultad de Artes', 'MESA'],
  ['8.4',  8, 'Financiamiento', 'Política de financiamiento para las facultades precarizadas', 'MESA'],

  ['9.1',  9, 'Memoria y DD.HH.', 'Fortalecimiento del Archivo FECh', 'MEM'],
  ['9.2',  9, 'Memoria y DD.HH.', 'Promoción de la Secretaría de MM.DD.HH.', 'MEM'],
  ['9.3',  9, 'Memoria y DD.HH.', 'Casa FECh como sitio de memoria', 'MEM'],
  ['9.4',  9, 'Memoria y DD.HH.', 'Actividades en solidaridad con los pueblos oprimidos', 'MEM'],
  ['9.5',  9, 'Memoria y DD.HH.', 'Ruta de la memoria UChile hecha por estudiantes', 'MEM'],
  ['9.6',  9, 'Memoria y DD.HH.', 'Actividades de memoria con participación triestamental', 'MEM'],
  ['9.7',  9, 'Memoria y DD.HH.', 'Romper relaciones con universidades de Israel', 'MEM'],
  ['9.8',  9, 'Memoria y DD.HH.', 'Memoria 120 años FECh', 'MEM'],

  ['10.1', 10, 'Universidad Sustentable', 'Sistema de seguimiento estudiantil del Plan de Sustentabilidad', 'SUS'],
  ['10.2', 10, 'Universidad Sustentable', 'Cumplimiento efectivo de los Comités Locales de Unidad Sustentable', 'SUS'],
  ['10.3', 10, 'Universidad Sustentable', 'Transparencia en recursos de sustentabilidad', 'SUS'],
  ['10.4', 10, 'Universidad Sustentable', 'Sustentabilidad en la formación universitaria', 'SUS'],
  ['10.5', 10, 'Universidad Sustentable', 'Articulación con organizaciones medioambientales estudiantiles', 'SUS'],
  ['10.6', 10, 'Universidad Sustentable', 'Fomento de la formación estudiantil interdisciplinaria', 'SUS']
];

/* Perfiles de acceso: el prototipo sólo cambia qué se puede editar.
   Cuando exista backend, esta lista viene del servidor con autenticación real. */
const PERFILES = [
  { id: 'admin',  nombre: 'Mesa Ejecutiva (edición total)', rol: 'admin',       equipo: null },
  { id: 'coord',  nombre: 'Coordinación de equipo',          rol: 'coordinador', equipo: null },
  { id: 'lector', nombre: 'Lectura (solo consulta)',         rol: 'lector',      equipo: null }
];
