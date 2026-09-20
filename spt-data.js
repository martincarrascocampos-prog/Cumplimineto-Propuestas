/* SPT — Sistema de Planificación de Trabajo · Secretaría de Participación.
   Acá va sólo la FORMA: las listas maestras que ordenan el trabajo.
   Los proyectos, pasos, plazos y la agenda se cargan desde la aplicación. */

const SPT = {
  version: '3.1',
  secretaria: 'Secretaría de Participación',

  listas: {
    clasificacion: ['Interno', 'Externo', 'Sistematización'],
    naturaleza: ['Programático', 'No Programático'],
    origen: ['Ejes del Programa', 'Plan de Lucha', 'Estatuto', 'Todos', 'N/A'],
    plazo: ['Corto plazo', 'Mediano plazo', 'Largo plazo'],
    urgencia: ['Urgente (ver cuánto antes)', 'Prioritario', 'Estándar', 'Diferible'],
    estadoPaso: ['Pendiente', 'Completado', 'No aplica'],
    formato: ['Presencial', 'Virtual'],
    estadoProyecto: ['Activo', 'Terminado']
  },

  /* Para registrar a quien viene de fuera de la secretaría: el resto de la
     Mesa, y los espacios con que se trabaja seguido. */
  equiposFECh: [
    'Presidencia', 'Vicepresidencia', 'Secretaría General',
    'Secretaría de Comunicaciones', 'Secretaría de Bienestar',
    'Secretaría de Finanzas', 'Consejería', 'Centro de Estudiantes',
    'Organización estudiantil', 'Otro'
  ],

  /* Los enlaces que la secretaría tiene siempre a mano; las direcciones
     se pegan desde la aplicación. */
  enlacesBase: [
    'Estatuto FECh', 'Programa', 'Plan de Lucha', 'Reglamento Interno',
    'Drive interno — Secretaría', 'Carpeta de Actas', 'Carpeta de Documentos', 'Carpeta de Difusión'
  ],

  /* Cuánto pesa cada urgencia al ordenar el tablero. */
  pesoUrgencia: {
    'Urgente (ver cuánto antes)': 4,
    'Prioritario': 3,
    'Estándar': 2,
    'Diferible': 1
  }
};
