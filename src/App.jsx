import { useMemo, useState, useEffect } from 'react';
import './App.css';
import PantallaLogin from './PantallaLogin';
import PanelUsuarios from './PanelUsuarios';
import ChatbotAyuda from './ChatbotAyuda';

/*
   CONSTANTES Y REGLAS DEL PROCESO (Lean: eliminar aprobaciones que
   no agregan valor)
 */

const HORA = 3600000;

const ESTADOS = {
  PENDIENTE: 'Pendiente de aprobación',
  EN_PROCESO: 'En proceso',
  RESUELTA: 'Resuelta',
  RECHAZADA: 'Rechazada'
};

const CLASE_ESTADO = {
  [ESTADOS.PENDIENTE]: 'estado-pendiente',
  [ESTADOS.EN_PROCESO]: 'estado-proceso',
  [ESTADOS.RESUELTA]: 'estado-resuelta',
  [ESTADOS.RECHAZADA]: 'estado-rechazada'
};

// autoAprobable: servicios de bajo riesgo que pueden saltarse la aprobación manual
const SERVICIOS = {
  'Instalación de software': { prioridad: 'Media', tecnico: 'Técnico de software', autoAprobable: true },
  'Problema de red': { prioridad: 'Alta', tecnico: 'Técnico de redes', autoAprobable: false },
  'Acceso a una aplicación': { prioridad: 'Media', tecnico: 'Soporte de aplicaciones', autoAprobable: true },
  'Mantenimiento de equipo': { prioridad: 'Media', tecnico: 'Técnico de hardware', autoAprobable: false }
};

const PRIORIDADES = ['Baja', 'Media', 'Alta', 'Urgente'];
const IMPACTOS = ['Una persona', 'Varias personas', 'Toda la organización'];
const MIN_DESCRIPCION = 15;

const PREGUNTAS_PRUEBA = [
  '¿Entendiste para qué sirve CloudCare?',
  '¿Encontraste fácilmente las opciones?',
  '¿Pudiste completar el proceso de una solicitud?',
  '¿La información presentada fue suficiente?',
  '¿Usarías CloudCare para gestionar solicitudes de soporte?'
];

const NAV = [
  { id: 'inicio', etiqueta: 'Inicio', icono: '⌂' },
  { id: 'nueva', etiqueta: 'Nueva solicitud', icono: '＋' },
  { id: 'seguimiento', etiqueta: 'Seguimiento', icono: '⌕' },
  { id: 'admin', etiqueta: 'Administración', icono: '◈' },
  { id: 'usuarios', etiqueta: 'Usuarios', icono: '☺' },
  { id: 'dashboard', etiqueta: 'Indicadores', icono: '▥' },
  { id: 'pruebas', etiqueta: 'Pruebas con usuarios', icono: '✓' },
  { id: 'resultados', etiqueta: 'Resultados de encuestas', icono: '▤' }
];

const ROLES = {
  solicitante: {
    nombre: 'Solicitante',
    descripcion: 'Registra solicitudes, consulta su avance y califica el servicio.',
    icono: '☺',
    pantallas: ['inicio', 'nueva', 'seguimiento', 'pruebas'],
    acciones: ['calificar']
  },
  aprobador: {
    nombre: 'Aprobador',
    descripcion: 'Aprueba o rechaza las solicitudes que lo requieren.',
    icono: '✔',
    pantallas: ['inicio', 'admin', 'dashboard', 'resultados', 'usuarios'],
    acciones: ['aprobar', 'rechazar']
  },
  tecnico: {
    nombre: 'Técnico de TI',
    descripcion: 'Atiende las solicitudes asignadas y las marca como resueltas.',
    icono: '⚙',
    pantallas: ['inicio', 'admin', 'dashboard'],
    acciones: ['resolver']
  }
};

const PROCESO_ACTUAL = [
  'Solicitud por correo o formulario',
  'Aprobación del jefe inmediato',
  'Aprobación del área',
  'Aprobación de seguridad',
  'Aprobación de dirección',
  'Asignación manual de técnico',
  'Ejecución del servicio',
  'Cierre sin aviso al usuario'
];

const PROCESO_MEJORADO = [
  'Solicitud en la app con catálogo y datos obligatorios',
  'Clasificación y prioridad automáticas',
  'Aprobación automática, simple o doble según el riesgo',
  'Asignación automática del técnico',
  'Seguimiento en línea para el usuario',
  'Cierre con encuesta de satisfacción'
];

/* Valores "antes" y "meta" estimados. Ajústenlos con datos reales
   (entrevista a soporte TI, encuesta) y expliquen su origen. */
const KPIS = [
  {
    id: 'tiempo',
    nombre: 'Tiempo total de atención',
    antes: '120 h',
    meta: '24 h',
    actual: i => (i.promedioHoras === null ? 'Sin datos' : `${i.promedioHoras} h`),
    justificacion:
      'Estimado: cuatro aprobaciones en cadena, cerca de un día hábil cada una, más la ejecución. Con aprobación automática o única se elimina la mayor parte de la espera.'
  },
  {
    id: 'aprobaciones',
    nombre: 'Aprobaciones por solicitud',
    antes: '4',
    meta: '1',
    actual: i => (i.total === 0 ? 'Sin datos' : String(i.promedioAprobaciones)),
    justificacion:
      'Cadena actual estimada: jefe, área, seguridad y dirección. CloudCare exige 0, 1 o 2 aprobaciones según el tipo de servicio, la prioridad y el impacto.'
  },
  {
    id: 'satisfaccion',
    nombre: 'Satisfacción del usuario',
    antes: '50 %',
    meta: '85 %',
    actual: i => (i.satisfaccion === null ? 'Sin datos' : `${i.satisfaccion} %`),
    justificacion:
      'Estimado a partir de la falta de información sobre el estado de las solicitudes. CloudCare muestra el historial en línea y mide la calificación al cierre.'
  }
];

/*
   FUNCIONES AUXILIARES (puras, fuera del componente)
  */

function prioridadSugerida(tipo, impacto) {
  if (impacto === 'Toda la organización') return 'Urgente';
  if (impacto === 'Varias personas') return 'Alta';
  return SERVICIOS[tipo].prioridad;
}

// 0 = automática, 1 = una aprobación, 2 = aprobación doble
function aprobacionesRequeridas({ tipo, prioridad, impacto }) {
  if (impacto === 'Toda la organización') return 2;
  if (
    SERVICIOS[tipo].autoAprobable &&
    impacto === 'Una persona' &&
    ['Baja', 'Media'].includes(prioridad)
  ) {
    return 0;
  }
  return 1;
}

function textoAprobaciones(n) {
  if (n === 0) return 'Aprobación automática: pasa directo a atención.';
  if (n === 1) return 'Requiere 1 aprobación.';
  return `Requiere ${n} aprobaciones por su alto impacto.`;
}

function fechaBonita(fecha) {
  if (!fecha) return 'No disponible';
  return new Date(fecha).toLocaleString('es-CO');
}

function crearEvento(estado, detalle, fecha) {
  return { estado, detalle, fecha };
}

function construirSolicitud({ tipo, descripcion, prioridad, impacto, creador = null }, fecha = new Date().toISOString()) {
  const requeridas = aprobacionesRequeridas({ tipo, prioridad, impacto });
  const automatica = requeridas === 0;
  const tecnico = SERVICIOS[tipo].tecnico;

  const historial = [crearEvento(ESTADOS.PENDIENTE, 'Solicitud registrada por el usuario', fecha)];
  if (automatica) {
    historial.push(
      crearEvento(
        ESTADOS.EN_PROCESO,
        `Aprobada automáticamente (servicio de bajo riesgo) y asignada a ${tecnico}`,
        fecha
      )
    );
  }

  return {
    id: Date.now(),
    tipo,
    descripcion: descripcion.trim(),
    prioridad,
    impacto,
    creador,
    estado: automatica ? ESTADOS.EN_PROCESO : ESTADOS.PENDIENTE,
    tecnico: automatica ? tecnico : 'Sin asignar',
    aprobacionesRequeridas: requeridas,
    aprobacionesHechas: 0,
    satisfaccion: null,
    fechaCreacion: fecha,
    fechaResolucion: null,
    historial
  };
}

// Devuelve la solicitud actualizada; si la acción no es válida, devuelve la misma.
function aplicarAccion(s, accion, fecha = new Date().toISOString()) {
  const historialPrevio = s.historial || [];
  const con = (estado, detalle, extra = {}) => ({
    ...s,
    ...extra,
    estado,
    historial: [...historialPrevio, crearEvento(estado, detalle, fecha)]
  });
  const tecnico = SERVICIOS[s.tipo]?.tecnico || 'Equipo de TI';

  switch (accion.tipo) {
    case 'aprobar': {
      if (s.estado !== ESTADOS.PENDIENTE) return s;
      const requeridas = s.aprobacionesRequeridas ?? 1;
      const hechas = (s.aprobacionesHechas ?? 0) + 1;
      if (hechas < requeridas) {
        return con(ESTADOS.PENDIENTE, `Aprobación ${hechas} de ${requeridas} registrada`, {
          aprobacionesHechas: hechas
        });
      }
      return con(ESTADOS.EN_PROCESO, `Solicitud aprobada y asignada a ${tecnico}`, {
        aprobacionesHechas: hechas,
        tecnico
      });
    }
    case 'rechazar':
      if (s.estado !== ESTADOS.PENDIENTE) return s;
      return con(ESTADOS.RECHAZADA, 'Solicitud rechazada por el aprobador');
    case 'resolver':
      if (s.estado !== ESTADOS.EN_PROCESO) return s;
      return con(ESTADOS.RESUELTA, 'Solicitud marcada como resuelta', { fechaResolucion: fecha });
    case 'calificar':
      if (s.estado !== ESTADOS.RESUELTA || s.satisfaccion) return s;
      return {
        ...s,
        satisfaccion: accion.valor,
        historial: [
          ...historialPrevio,
          crearEvento(ESTADOS.RESUELTA, `El usuario calificó el servicio con ${accion.valor}/5`, fecha)
        ]
      };
    default:
      return s;
  }
}

function calcularIndicadores(solicitudes) {
  const contar = estado => solicitudes.filter(s => s.estado === estado).length;
  const abiertas = solicitudes.filter(
    s => s.estado === ESTADOS.PENDIENTE || s.estado === ESTADOS.EN_PROCESO
  );

  const atrasadas = abiertas.filter(
    s => (Date.now() - new Date(s.fechaCreacion).getTime()) / HORA >= 24
  ).length;

  const tiempos = solicitudes
    .filter(s => s.estado === ESTADOS.RESUELTA && s.fechaCreacion && s.fechaResolucion)
    .map(s => (new Date(s.fechaResolucion) - new Date(s.fechaCreacion)) / HORA)
    .filter(h => Number.isFinite(h) && h >= 0);

  const promedio = lista =>
    lista.length ? lista.reduce((a, b) => a + b, 0) / lista.length : null;

  const horas = promedio(tiempos);
  const aprobaciones = promedio(solicitudes.map(s => s.aprobacionesRequeridas ?? 1));
  const calificaciones = solicitudes.map(s => s.satisfaccion).filter(Boolean);
  const sat = promedio(calificaciones);
  const automaticas = solicitudes.filter(s => (s.aprobacionesRequeridas ?? 1) === 0).length;

  return {
    total: solicitudes.length,
    pendientes: contar(ESTADOS.PENDIENTE),
    enProceso: contar(ESTADOS.EN_PROCESO),
    resueltas: contar(ESTADOS.RESUELTA),
    rechazadas: contar(ESTADOS.RECHAZADA),
    atrasadas,
    automaticas,
    promedioHoras: horas === null ? null : horas.toFixed(1),
    promedioAprobaciones: aprobaciones === null ? null : aprobaciones.toFixed(1),
    satisfaccion: sat === null ? null : Math.round((sat / 5) * 100)
  };
}

// Datos con fechas antiguas para poder demostrar el sistema en la presentación
function datosEjemplo() {
  const ahora = Date.now();
  const hace = h => new Date(ahora - h * HORA).toISOString();

  const plantillas = [
    { tipo: 'Acceso a una aplicación', impacto: 'Una persona', prioridad: 'Baja', descripcion: 'Necesito acceso al aula virtual para mi curso de Gestión de Procesos.', hace: 30, estado: ESTADOS.RESUELTA, dur: 3, sat: 5 },
    { tipo: 'Instalación de software', impacto: 'Una persona', prioridad: 'Media', descripcion: 'Instalar Visual Studio Code en el computador del laboratorio 2.', hace: 20, estado: ESTADOS.RESUELTA, dur: 6, sat: 4 },
    { tipo: 'Problema de red', impacto: 'Varias personas', prioridad: 'Alta', descripcion: 'El WiFi del bloque B se cae constantemente durante las clases.', hace: 28, estado: ESTADOS.EN_PROCESO },
    { tipo: 'Mantenimiento de equipo', impacto: 'Una persona', prioridad: 'Media', descripcion: 'El portátil del aula 301 no enciende desde esta mañana.', hace: 5, estado: ESTADOS.PENDIENTE },
    { tipo: 'Problema de red', impacto: 'Toda la organización', prioridad: 'Urgente', descripcion: 'No hay conexión a internet en todo el campus.', hace: 2, estado: ESTADOS.PENDIENTE },
    { tipo: 'Acceso a una aplicación', impacto: 'Varias personas', prioridad: 'Alta', descripcion: 'Solicito acceso a la plataforma de notas para todo el grupo.', hace: 50, estado: ESTADOS.RECHAZADA }
  ];

  return plantillas.map((p, i) => {
    let s = { ...construirSolicitud(p, hace(p.hace)), id: ahora - i };
    if (p.estado === ESTADOS.RECHAZADA) {
      s = aplicarAccion(s, { tipo: 'rechazar' }, hace(p.hace - 4));
    } else if (p.estado !== ESTADOS.PENDIENTE) {
      while (s.estado === ESTADOS.PENDIENTE) {
        s = aplicarAccion(s, { tipo: 'aprobar' }, hace(p.hace - 1));
      }
      if (p.estado === ESTADOS.RESUELTA) {
        s = aplicarAccion(s, { tipo: 'resolver' }, hace(p.hace - p.dur));
        s = aplicarAccion(s, { tipo: 'calificar', valor: p.sat }, hace(p.hace - p.dur));
      }
    }
    return s;
  });
}

/* =====================================================================
   HOOK Y COMPONENTES PEQUEÑOS
   ===================================================================== */

// Estado de React sincronizado con localStorage (con manejo de errores)
function useLocalStorage(clave, valorInicial) {
  const [valor, setValor] = useState(() => {
    try {
      const guardado = localStorage.getItem(clave);
      return guardado ? JSON.parse(guardado) : valorInicial;
    } catch {
      return valorInicial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {
      /* si el almacenamiento falla, la app sigue funcionando en memoria */
    }
  }, [clave, valor]);

  return [valor, setValor];
}

function InsigniaEstado({ estado }) {
  return <span className={`estado ${CLASE_ESTADO[estado] || ''}`}>{estado}</span>;
}

function TarjetaSolicitud({ s, acciones, modo, onAccion }) {
  const requeridas = s.aprobacionesRequeridas ?? 1;
  const hechas = s.aprobacionesHechas ?? 0;
  const puede = accion => acciones.includes(accion);

  return (
    <article className="solicitud">
      <h3>{s.tipo}</h3>
      <p>Código: <strong>CC-{s.id}</strong></p>
      <p>{s.descripcion}</p>
      <p>Prioridad: <strong>{s.prioridad || 'No definida'}</strong> · Impacto: <strong>{s.impacto || 'No definido'}</strong></p>
      <p>Estado: <InsigniaEstado estado={s.estado} /></p>
      <p>
        Aprobaciones:{' '}
        <strong>
          {requeridas === 0 ? 'Automática (sin aprobación manual)' : `${hechas} de ${requeridas}`}
        </strong>
      </p>
      <p>Técnico: {s.tecnico || 'Sin asignar'}</p>
      <p>Creada: {fechaBonita(s.fechaCreacion)}</p>
      {s.fechaResolucion && <p>Resuelta: {fechaBonita(s.fechaResolucion)}</p>}
      {s.satisfaccion && <p>Calificación del usuario: <strong>{s.satisfaccion} / 5</strong></p>}

      <details>
        <summary>Ver historial de la solicitud</summary>
        <ul>
          {(s.historial || []).map((evento, indice) => (
            <li key={`${s.id}-${indice}`}>
              <strong>{evento.estado}</strong>
              <p>{evento.detalle}</p>
              <small>{fechaBonita(evento.fecha)}</small>
            </li>
          ))}
        </ul>
      </details>

      {modo === 'admin' && s.estado === ESTADOS.PENDIENTE && (puede('aprobar') || puede('rechazar')) && (
        <div className="acciones">
          {puede('aprobar') && (
            <button onClick={() => onAccion(s.id, { tipo: 'aprobar' })}>Aprobar solicitud</button>
          )}
          {puede('rechazar') && (
            <button onClick={() => onAccion(s.id, { tipo: 'rechazar' })}>Rechazar solicitud</button>
          )}
        </div>
      )}

      {modo === 'admin' && s.estado === ESTADOS.EN_PROCESO && puede('resolver') && (
        <div className="acciones">
          <button onClick={() => onAccion(s.id, { tipo: 'resolver' })}>Marcar como resuelta</button>
        </div>
      )}

      {modo === 'seguimiento' && s.estado === ESTADOS.RESUELTA && !s.satisfaccion && puede('calificar') && (
        <div className="field">
          <label htmlFor={`cal-${s.id}`}>Tu solicitud fue resuelta. ¿Cómo calificas el servicio?</label>
          <select
            id={`cal-${s.id}`}
            defaultValue=""
            onChange={e => e.target.value && onAccion(s.id, { tipo: 'calificar', valor: Number(e.target.value) })}
          >
            <option value="">Selecciona una calificación</option>
            <option value="5">5 · Excelente</option>
            <option value="4">4 · Bueno</option>
            <option value="3">3 · Regular</option>
            <option value="2">2 · Malo</option>
            <option value="1">1 · Muy malo</option>
          </select>
        </div>
      )}
    </article>
  );
}

function EstadoVacio({ titulo, texto, onCrear }) {
  return (
    <div className="empty-state">
      <span>▤</span>
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {onCrear && <button className="principal" onClick={onCrear}>Crear solicitud</button>}
    </div>
  );
}

/* =====================================================================
   COMPONENTE PRINCIPAL
   ===================================================================== */

function App() {
  const [sesion, setSesion] = useLocalStorage('cloudcare-sesion', null);
  const rol = sesion?.rol; const [solicitudes, setSolicitudes] = useLocalStorage('cloudcare-solicitudes', []);
  const [pruebas, setPruebas] = useLocalStorage('cloudcare-pruebas', []);
  const [pantalla, setPantalla] = useState('inicio');

  const [form, setForm] = useState({
    tipo: 'Instalación de software',
    descripcion: '',
    prioridad: 'Media',
    impacto: 'Una persona'
  });
  const [errorForm, setErrorForm] = useState('');

  const [respuestasPrueba, setRespuestasPrueba] = useState(Array(PREGUNTAS_PRUEBA.length).fill(''));
  const [comentariosPrueba, setComentariosPrueba] = useState('');
  const [mensajePrueba, setMensajePrueba] = useState('');

  const ind = useMemo(() => calcularIndicadores(solicitudes), [solicitudes]);

  const resultadosPreguntas = useMemo(
    () =>
      PREGUNTAS_PRUEBA.map((pregunta, indice) => {
        const si = pruebas.filter(p => p.respuestas?.[indice] === 'Sí').length;
        const no = pruebas.filter(p => p.respuestas?.[indice] === 'No').length;
        const total = si + no;
        return {
          pregunta,
          si,
          no,
          porcentajeSi: total ? Math.round((si / total) * 100) : 0,
          porcentajeNo: total ? Math.round((no / total) * 100) : 0
        };
      }),
    [pruebas]
  );

  const rolActual = ROLES[rol];

  /* ----- Acciones ----- */
  function cerrarSesion() {
    setSesion(null);
    setPantalla('inicio');
  }

  function abrirNuevaConTipo(tipo) {
  actualizarForm({ tipo });
  setPantalla('nueva');
}

  function actualizarForm(cambios) {
    setForm(actual => {
      const nuevo = { ...actual, ...cambios };
      // Si cambia el tipo o el impacto, se recalcula la prioridad sugerida
      if ('tipo' in cambios || 'impacto' in cambios) {
        nuevo.prioridad = prioridadSugerida(nuevo.tipo, nuevo.impacto);
      }
      return nuevo;
    });
  }

  function crearSolicitud(e) {
    e.preventDefault();

    if (form.descripcion.trim().length < MIN_DESCRIPCION) {
      setErrorForm(`Describe el problema con al menos ${MIN_DESCRIPCION} caracteres para evitar devoluciones por información incompleta.`);
      return;
    }

    setErrorForm('');
    setSolicitudes(actuales => [construirSolicitud({ ...form, creador: sesion.usuario }), ...actuales]); setForm(actual => ({
      ...actual,
      descripcion: '',
      prioridad: prioridadSugerida(actual.tipo, 'Una persona'),
      impacto: 'Una persona'
    }));
    setPantalla('seguimiento');
  }

  function ejecutarAccion(id, accion) {
    if (!rolActual?.acciones.includes(accion.tipo)) return;
    setSolicitudes(actuales => actuales.map(s => (s.id === id ? aplicarAccion(s, accion) : s)));
  }

  function cargarEjemplo() {
    setSolicitudes(actuales => [...datosEjemplo(), ...actuales]);
  }

  function borrarDatos() {
    if (window.confirm('¿Borrar todas las solicitudes guardadas?')) setSolicitudes([]);
  }

  function guardarPrueba(e) {
    e.preventDefault();
    const evaluacion = {
      respuestas: respuestasPrueba,
      comentarios: comentariosPrueba.trim(),
      fecha: new Date().toLocaleString('es-CO')
    };
    setPruebas(actuales => [...actuales, evaluacion]);
    setRespuestasPrueba(Array(PREGUNTAS_PRUEBA.length).fill(''));
    setComentariosPrueba('');
    setMensajePrueba('Evaluación guardada. ¡Gracias por participar!');
  }

  /* ----- Pantalla de inicio de sesión (sin rol seleccionado) ----- */

  if (!rolActual) {
    return (
      <PantallaLogin
        onLogin={nuevaSesion => {
          setSesion(nuevaSesion);
          setPantalla('inicio');
        }}
      />
    );
  }

  /* ----- Aplicación ----- */

  const menu = NAV.filter(item => rolActual.pantallas.includes(item.id));
  const pantallaActual = rolActual.pantallas.includes(pantalla) ? pantalla : 'inicio';
  const tituloPantalla = NAV.find(item => item.id === pantallaActual)?.etiqueta;
  const aprobacionesPreview = aprobacionesRequeridas(form);
  const accesosRapidos = menu.filter(
    item => !['inicio', 'pruebas', 'resultados', 'usuarios'].includes(item.id)
  );
  const misSolicitudes = solicitudes.filter(s => s.creador === sesion.usuario);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">☁</div>
          <div>
            <h1>CloudCare</h1>
            <p>Soporte TI, siempre contigo</p>
          </div>
        </div>

        <div className="nav-label">MENÚ · {rolActual.nombre.toUpperCase()}</div>

        <nav className="sidebar-nav">
          {menu.map(item => (
            <button
              key={item.id}
              className={pantallaActual === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => setPantalla(item.id)}
            >
              <span>{item.icono}</span> {item.etiqueta}
            </button>
          ))}
          <button className="nav-item" onClick={cerrarSesion}>
            <span>⎋</span> Cambiar de rol
          </button>
        </nav>

        <div className="sidebar-message">
          <span>✦</span>
          <p>Pequeños problemas,<br />grandes soluciones.</p>
          <small>Estamos aquí para ayudarte.</small>
        </div>

        <div className="sidebar-footer">
          <span className="online-dot"></span>
          Sistema de soporte activo
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div>
            <span className="breadcrumb">CLOUDCARE / </span>
            <strong>{tituloPantalla}</strong>
          </div>
          <div className="topbar-status">
            <span className="online-dot"></span>
            {rolActual.nombre}
          </div>
        </header>

        <main className="content">
          {/* ---------- INICIO ---------- */}
          {pantallaActual === 'inicio' && (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <span className="eyebrow">TU CENTRO DE SOPORTE TECNOLÓGICO</span>
                  <h2>Menos aprobaciones, más soluciones.</h2>
                  <p>
                    Bienvenido, {rolActual.nombre.toLowerCase()}. {rolActual.descripcion}
                  </p>
                  {rolActual.pantallas.includes('nueva') && (
                    <button className="principal hero-button" onClick={() => setPantalla('nueva')}>
                      <span>＋</span> Crear una solicitud
                    </button>
                  )}
                </div>
                <div className="hero-art">
                  <div className="orbit orbit-one"></div>
                  <div className="orbit orbit-two"></div>
                  <div className="hero-cloud">☁</div>
                  <div className="hero-chip chip-one">⌘</div>
                  <div className="hero-chip chip-two">⌁</div>
                  <div className="hero-chip chip-three">✧</div>
                  <div className="hero-caption">Conectamos tus ideas<br />con soluciones.</div>
                </div>
              </section>

              <div className="home-dashboard-layout">
                <div className="home-main-column">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">ACCESO RÁPIDO</span>
                      <h2>¿Qué necesitas hacer hoy?</h2>
                    </div>
                    <span className="muted">{ind.total} solicitudes registradas</span>
                  </div>

                  <div className="quick-grid">
                    {accesosRapidos.map(item => (
                      <button key={item.id} className="quick-card quick-blue" onClick={() => setPantalla(item.id)}>
                        <span className="quick-icon">{item.icono}</span>
                        <h3>{item.etiqueta}</h3>
                        <p>Ir a la sección de {item.etiqueta.toLowerCase()}.</p>
                        <span className="quick-link">Abrir</span>
                      </button>
                    ))}
                  </div>

                  <div className="section-heading home-summary-heading">
                    <div>
                      <span className="eyebrow">RESUMEN GENERAL</span>
                      <h2>Estado de las solicitudes</h2>
                    </div>
                  </div>

                  <div className="summary-grid">
                    <article className="summary-card">
                      <span className="summary-icon blue-icon">▤</span>
                      <p>Total registradas</p>
                      <h3>{ind.total}</h3>
                    </article>
                    <article className="summary-card">
                      <span className="summary-icon orange-icon">◷</span>
                      <p>Pendientes</p>
                      <h3>{ind.pendientes}</h3>
                    </article>
                    <article className="summary-card">
                      <span className="summary-icon purple-icon">⚙</span>
                      <p>En proceso</p>
                      <h3>{ind.enProceso}</h3>
                    </article>
                    <article className="summary-card">
                      <span className="summary-icon green-icon">✓</span>
                      <p>Resueltas</p>
                      <h3>{ind.resueltas}</h3>
                    </article>
                  </div>
                </div>

                <aside className="home-side-column">
                  <div className="home-side-panel">
                    <span className="eyebrow">VISTA GENERAL</span>
                    <h2>Tu centro de soporte</h2>
                    <p className="home-side-description">
                      {ind.automaticas} de {ind.total} solicitudes se aprobaron automáticamente.
                    </p>
                    <div className="home-side-total">
                      <span>Total de solicitudes</span>
                      <strong>{ind.total}</strong>
                    </div>
                    <div className="home-status-row">
                      <span className="home-status-dot status-blue"></span>
                      <span>En proceso</span>
                      <strong>{ind.enProceso}</strong>
                    </div>
                    <div className="home-status-row">
                      <span className="home-status-dot status-orange"></span>
                      <span>Pendientes</span>
                      <strong>{ind.pendientes}</strong>
                    </div>
                    <div className="home-status-row">
                      <span className="home-status-dot status-green"></span>
                      <span>Resueltas</span>
                      <strong>{ind.resueltas}</strong>
                    </div>
                  </div>
                </aside>
              </div>
            </>
          )}

          {/* ---------- NUEVA SOLICITUD ---------- */}
          {pantallaActual === 'nueva' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">CENTRO DE AYUDA</span>
                <h2>Crear nueva solicitud</h2>
                <p>Cuéntanos qué necesitas. El sistema define la prioridad y las aprobaciones por ti.</p>
              </div>
              <section className="panel form-panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">＋</div>
                  <div>
                    <h3>Información de la solicitud</h3>
                    <p>Completa los datos para registrar tu requerimiento.</p>
                  </div>
                </div>
                <form onSubmit={crearSolicitud}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="tipo">Tipo de servicio</label>
                      <select id="tipo" value={form.tipo} onChange={e => actualizarForm({ tipo: e.target.value })}>
                        {Object.keys(SERVICIOS).map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="prioridad">Prioridad sugerida</label>
                      <select id="prioridad" value={form.prioridad} onChange={e => actualizarForm({ prioridad: e.target.value })}>
                        {PRIORIDADES.map(p => <option key={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="field full-field">
                      <label htmlFor="impacto">¿A cuántas personas afecta?</label>
                      <select id="impacto" value={form.impacto} onChange={e => actualizarForm({ impacto: e.target.value })}>
                        {IMPACTOS.map(i => <option key={i}>{i}</option>)}
                      </select>
                    </div>
                    <div className="field full-field">
                      <label htmlFor="descripcion">Descripción del problema</label>
                      <textarea
                        id="descripcion"
                        value={form.descripcion}
                        onChange={e => actualizarForm({ descripcion: e.target.value })}
                        placeholder="Describe lo que ocurre y qué necesitas..."
                        required
                      />
                      <small>Incluye detalles que ayuden al equipo de soporte a entender el problema.</small>
                      {errorForm && <small role="alert" style={{ color: '#b93838' }}>{errorForm}</small>}
                    </div>
                  </div>

                  <div className="comparison-notice">
                    <strong>Ruta de aprobación:</strong> {textoAprobaciones(aprobacionesPreview)}
                  </div>

                  <div className="form-actions">
                    <span className="muted">Mínimo {MIN_DESCRIPCION} caracteres en la descripción.</span>
                    <button className="principal" type="submit">Enviar solicitud</button>
                  </div>
                </form>
              </section>
            </>
          )}

          {/* ---------- SEGUIMIENTO ---------- */}
          {pantallaActual === 'seguimiento' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">CONSULTA Y CONTROL</span>
                <h2>Seguimiento de solicitudes</h2>
                <p>Consulta el estado actual y el historial de cada requerimiento.</p>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">⌕</div>
                  <div>
                    <h3>Mis solicitudes</h3>
                    <p>{misSolicitudes.length} solicitudes en el sistema</p>
                  </div>
                </div>
                {misSolicitudes.length === 0 ? (
                  <EstadoVacio
                    titulo="Aún no hay solicitudes"
                    texto="Crea tu primera solicitud para verla aquí."
                    onCrear={() => setPantalla('nueva')}
                  />
                ) : (
                  misSolicitudes.map(s => (
                    <TarjetaSolicitud key={s.id} s={s} acciones={rolActual.acciones} modo="seguimiento" onAccion={ejecutarAccion} />
                  ))
                )}
              </section>
            </>
          )}

          {/* ---------- ADMINISTRACIÓN ---------- */}
          {pantallaActual === 'admin' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">PANEL DE CONTROL</span>
                <h2>Administración</h2>
                <p>
                  {rolActual.acciones.includes('aprobar')
                    ? 'Aprueba o rechaza las solicitudes que no se aprobaron automáticamente.'
                    : 'Atiende las solicitudes aprobadas y márcalas como resueltas.'}
                </p>
              </div>
              <div className="admin-summary">
                <div><span className="online-dot"></span><strong>{ind.pendientes}</strong><small>Pendientes de aprobación</small></div>
                <div><span className="admin-blue-dot"></span><strong>{ind.enProceso}</strong><small>En proceso</small></div>
                <div><span className="admin-green-dot"></span><strong>{ind.resueltas}</strong><small>Resueltas</small></div>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">◈</div>
                  <div>
                    <h3>Gestión de solicitudes</h3>
                    <p>Selecciona una acción para actualizar cada caso.</p>
                  </div>
                </div>
                {solicitudes.length === 0 ? (
                  <EstadoVacio titulo="No hay solicitudes registradas" texto="Cuando se envíe una solicitud, aparecerá aquí." />
                ) : (
                  solicitudes.map(s => (
                    <TarjetaSolicitud key={s.id} s={s} acciones={rolActual.acciones} modo="admin" onAccion={ejecutarAccion} />
                  ))
                )}
              </section>
            </>
          )}

          {/* ---------- INDICADORES ---------- */}
          {pantallaActual === 'dashboard' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">DATOS Y RENDIMIENTO</span>
                <h2>Indicadores de CloudCare</h2>
                <p>Compara el proceso anterior con los resultados reales de la aplicación.</p>
              </div>

              <div className="dashboard-grid">
                <article className="metric-card metric-blue">
                  <span>Total de solicitudes</span>
                  <h3>{ind.total}</h3>
                  <small>Todos los casos registrados</small>
                  <div className="metric-symbol">▤</div>
                </article>
                <article className="metric-card metric-orange">
                  <span>Pendientes de aprobación</span>
                  <h3>{ind.pendientes}</h3>
                  <small>Esperan revisión</small>
                  <div className="metric-symbol">◷</div>
                </article>
                <article className="metric-card metric-purple">
                  <span>En proceso</span>
                  <h3>{ind.enProceso}</h3>
                  <small>Atención en curso</small>
                  <div className="metric-symbol">⚙</div>
                </article>
                <article className="metric-card metric-green">
                  <span>Resueltas</span>
                  <h3>{ind.resueltas}</h3>
                  <small>Casos completados</small>
                  <div className="metric-symbol">✓</div>
                </article>
                <article className="metric-card metric-red">
                  <span>Rechazadas</span>
                  <h3>{ind.rechazadas}</h3>
                  <small>Casos rechazados</small>
                  <div className="metric-symbol">×</div>
                </article>
                <article className="metric-card metric-orange">
                  <span>Atrasadas (+24 h)</span>
                  <h3>{ind.atrasadas}</h3>
                  <small>Requieren seguimiento</small>
                  <div className="metric-symbol">!</div>
                </article>
              </div>

              <section className="panel comparison-panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">⇄</div>
                  <div>
                    <h3>Tres KPI: antes y después</h3>
                    <p>Valores "antes" y "meta" estimados; la columna "Actual" se calcula con los datos de la app.</p>
                  </div>
                </div>

                <div className="dashboard-grid">
                  {KPIS.map(kpi => (
                    <article key={kpi.id} className="comparison-card comparison-after">
                      <h3>{kpi.nombre}</h3>
                      <div className="comparison-item"><span>Antes (estimado)</span><strong>{kpi.antes}</strong></div>
                      <div className="comparison-item"><span>Meta con CloudCare</span><strong>{kpi.meta}</strong></div>
                      <div className="comparison-item"><span>Actual en la app</span><strong>{kpi.actual(ind)}</strong></div>
                      <p className="muted">{kpi.justificacion}</p>
                    </article>
                  ))}
                </div>

                <div className="comparison-notice">
                  <strong>Valores por validar.</strong>
                  <p>
                    Las cifras de "antes" y "meta" son supuestos del equipo. Respáldenlas con una entrevista a soporte TI
                    o una encuesta antes de la presentación.
                  </p>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">☰</div>
                  <div>
                    <h3>Metodología Lean: proceso actual y mejorado</h3>
                    <p>Se eliminan las aprobaciones y esperas que no agregan valor.</p>
                  </div>
                </div>
                <div className="comparison-grid">
                  <article className="comparison-card comparison-before">
                    <h3>Proceso actual</h3>
                    <ol>{PROCESO_ACTUAL.map(paso => <li key={paso}>{paso}</li>)}</ol>
                  </article>
                  <article className="comparison-card comparison-after">
                    <h3>Proceso con CloudCare</h3>
                    <ol>{PROCESO_MEJORADO.map(paso => <li key={paso}>{paso}</li>)}</ol>
                  </article>
                </div>
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">⚙</div>
                  <div>
                    <h3>Datos para la demostración</h3>
                    <p>Carga solicitudes de ejemplo con fechas anteriores para probar los indicadores.</p>
                  </div>
                </div>
                <div className="acciones">
                  <button onClick={cargarEjemplo}>Cargar datos de ejemplo</button>
                  <button onClick={borrarDatos}>Borrar todas las solicitudes</button>
                </div>
              </section>
            </>
          )}

          {/* ---------- PRUEBAS CON USUARIOS ---------- */}
          {pantallaActual === 'pruebas' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">EVALUACIÓN DEL SISTEMA</span>
                <h2>Pruebas con usuarios</h2>
                <p>Ayúdanos a evaluar la facilidad de uso de CloudCare.</p>
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">✓</div>
                  <div>
                    <h3>Encuesta de experiencia</h3>
                    <p>Marca Sí o No para cada pregunta.</p>
                  </div>
                </div>
                <form onSubmit={guardarPrueba}>
                  {PREGUNTAS_PRUEBA.map((pregunta, indice) => (
                    <div className="field" key={pregunta}>
                      <label htmlFor={`pregunta-${indice}`}>{indice + 1}. {pregunta}</label>
                      <select
                        id={`pregunta-${indice}`}
                        value={respuestasPrueba[indice]}
                        onChange={e => {
                          setMensajePrueba('');
                          setRespuestasPrueba(actuales => actuales.map((r, i) => (i === indice ? e.target.value : r)));
                        }}
                        required
                      >
                        <option value="">Selecciona una respuesta</option>
                        <option value="Sí">Sí</option>
                        <option value="No">No</option>
                      </select>
                    </div>
                  ))}
                  <div className="field">
                    <label htmlFor="comentarios">Comentarios o sugerencias</label>
                    <textarea
                      id="comentarios"
                      value={comentariosPrueba}
                      onChange={e => setComentariosPrueba(e.target.value)}
                      placeholder="¿Qué mejorarías de CloudCare?"
                    />
                  </div>
                  <div className="form-actions">
                    {mensajePrueba && <span className="muted" role="status">{mensajePrueba}</span>}
                    <button className="principal" type="submit">Guardar evaluación</button>
                  </div>
                </form>
              </section>
            </>
          )}

          {/* ---------- RESULTADOS DE ENCUESTAS ---------- */}
          {pantallaActual === 'resultados' && (
            <>
              <div className="page-heading">
                <span className="eyebrow">EVALUACIÓN DEL SISTEMA</span>
                <h2>Resultados de encuestas</h2>
                <p>Consulta las respuestas y opiniones de los usuarios sobre la experiencia con CloudCare.</p>
              </div>

              <div className="dashboard-grid">
                <article className="metric-card metric-blue">
                  <span>Total de evaluaciones</span>
                  <h3>{pruebas.length}</h3>
                  <small>Encuestas guardadas</small>
                  <div className="metric-symbol">▤</div>
                </article>
                <article className="metric-card metric-green">
                  <span>Total de respuestas Sí</span>
                  <h3>{resultadosPreguntas.reduce((t, p) => t + p.si, 0)}</h3>
                  <small>Respuestas positivas</small>
                  <div className="metric-symbol">✓</div>
                </article>
                <article className="metric-card metric-red">
                  <span>Total de respuestas No</span>
                  <h3>{resultadosPreguntas.reduce((t, p) => t + p.no, 0)}</h3>
                  <small>Respuestas negativas</small>
                  <div className="metric-symbol">×</div>
                </article>
              </div>

              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">%</div>
                  <div>
                    <h3>Resultados por pregunta</h3>
                    <p>Porcentajes calculados a partir de las respuestas registradas.</p>
                  </div>
                </div>
                {resultadosPreguntas.map((r, indice) => (
                  <div className="improvement-row" key={r.pregunta}>
                    <div>
                      <strong>{indice + 1}. {r.pregunta}</strong>
                      <p>Sí: {r.si} ({r.porcentajeSi} %) · No: {r.no} ({r.porcentajeNo} %)</p>
                    </div>
                    <div className="improvement-track">
                      <div style={{ width: `${r.porcentajeSi}%` }} />
                    </div>
                  </div>
                ))}
                {pruebas.length === 0 && (
                  <p className="muted">Todavía no hay evaluaciones guardadas. Realiza una encuesta para ver los resultados.</p>
                )}
              </section>

              <section className="panel">
                <div className="panel-heading">
                  <div className="panel-heading-icon">✎</div>
                  <div>
                    <h3>Comentarios de los usuarios</h3>
                    <p>Sugerencias compartidas durante las pruebas.</p>
                  </div>
                </div>
                {pruebas.filter(p => p.comentarios).length === 0 ? (
                  <p className="muted">Todavía no hay comentarios registrados.</p>
                ) : (
                  pruebas
                    .filter(p => p.comentarios)
                    .map((p, indice) => (
                      <article className="solicitud" key={indice}>
                        <p>{p.comentarios}</p>
                        <small>{p.fecha}</small>
                      </article>
                    ))
                )}
              </section>
            </>
          )}
          // USUARIOS
          {pantallaActual === 'usuarios' && <PanelUsuarios sesion={sesion} />}
        </main>

        <footer className="app-footer">
          <span>☁ CloudCare</span>
          <span>Menos papeleo, más soluciones.</span>
          <span>Soporte TI · {new Date().getFullYear()}</span>
        </footer>
      </div>
            <ChatbotAyuda
        rol={rol}
        nombreRol={rolActual.nombre}
        pantallas={rolActual.pantallas}
        servicios={SERVICIOS}
        minDescripcion={MIN_DESCRIPCION}
        onSolicitar={abrirNuevaConTipo}
        onIr={setPantalla}
      />
    </div>
  );
}


export default App;
