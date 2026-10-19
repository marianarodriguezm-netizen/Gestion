import { useEffect, useRef, useState } from 'react';

/*
  CHATBOT DE AYUDA DE CLOUDCARE (basado en reglas)

  Cómo funciona:
  1. Normaliza lo que escribe la persona (minúsculas, sin tildes).
  2. Busca el primer tema de TEMAS cuyo patrón coincida.
  3. Arma la respuesta con las reglas reales de la app (servicios, aprobaciones)
     y adapta el texto al rol de quien inició sesión.

  Para agregar un tema nuevo: añade un patrón en TEMAS y una función en RESPUESTAS.
*/

const SUGERENCIAS = {
  solicitante: [
    'Necesito instalar un programa',
    'No tengo internet',
    '¿Cuánto demora mi solicitud?',
    '¿Cómo veo el estado de mi solicitud?'
  ],
  aprobador: [
    '¿Cómo apruebo una solicitud?',
    '¿Cuándo se aprueba automáticamente?',
    '¿Qué es el impacto?',
    '¿Cuándo está atrasada una solicitud?'
  ],
  tecnico: [
    '¿Cómo marco una solicitud como resuelta?',
    '¿Qué prioridad tiene cada servicio?',
    '¿Cuándo está atrasada una solicitud?',
    '¿Cómo se asignan las solicitudes?'
  ]
};

const CONSEJOS = {
  software:
    'Indica el nombre y la versión del programa, y en qué equipo o laboratorio lo necesitas.',
  red:
    'Cuenta en qué zona falla (bloque, aula, piso), desde cuándo y si afecta a más personas. Eso define la prioridad.',
  hardware:
    'Indica dónde está el equipo, qué síntoma tiene y desde cuándo ocurre.',
  acceso:
    'Escribe el nombre de la aplicación o plataforma y qué permiso necesitas.'
};

const normalizar = texto =>
  texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// El orden importa: gana el primer patrón que coincida
const TEMAS = [
  { id: 'estado', patron: /\b(estado|seguimiento|como va|en que va|mi solicitud|historial|codigo)/ },
  { id: 'calificar', patron: /\b(calific|encuesta|satisfaccion|opinion)/ },
  { id: 'rechazo', patron: /\b(rechaz)/ },
  { id: 'aprobacion', patron: /\b(aprob|autoriza)/ },
  { id: 'resolver', patron: /\b(resolver|resuelta|cerrar|atender|asigna)/ },
  { id: 'prioridad', patron: /\b(prioridad|impacto)/ },
  { id: 'tiempo', patron: /\b(cuanto (demora|tarda|tiempo)|tiempo|demora|demorar|tarda|tardar|atrasad|rapido)/ },
  { id: 'software', patron: /\b(instal|programa|software|licencia|office|visual studio|antivirus)/ },
  { id: 'red', patron: /\b(wifi|internet|vpn|conexion|red|redes|se cae|sin senal)\b/ },
  { id: 'hardware', patron: /\b(no enciende|computador|portatil|pantalla|impresora|teclado|mouse|mantenimiento|equipo|hardware)/ },
  { id: 'acceso', patron: /\b(acceso|contrasena|clave|cuenta|plataforma|aula virtual|permiso|login|ingresar)/ },
  { id: 'solicitar', patron: /\b(crear|nueva solicitud|solicitar|registrar|enviar solicitud|como pido|hacer una solicitud)/ },
  { id: 'ayuda', patron: /\b(ayuda|que puedo|que haces|opciones)/ },
  { id: 'gracias', patron: /\b(gracias|listo|perfecto|excelente)/ },
  { id: 'saludo', patron: /\b(hola|buenas|buenos dias|buenas tardes|hey)\b/ }
];

/* ---------- Constructores de respuestas ---------- */

const puedeCrear = ctx => ctx.pantallas.includes('nueva');

function respuestaServicio(nombre, consejo, ctx) {
  const s = ctx.servicios[nombre];
  const aprobacion = s.autoAprobable
    ? 'Si afecta a una sola persona y la prioridad es baja o media, se aprueba sola y pasa directo al técnico.'
    : 'Requiere 1 aprobación antes de pasar al técnico.';

  const partes = [
    `Para esto sirve el servicio “${nombre}”. Lo atiende: ${s.tecnico}. Prioridad inicial: ${s.prioridad}.`,
    aprobacion,
    'Si afecta a varias personas sube la prioridad; si afecta a toda la organización se piden 2 aprobaciones.',
    consejo
  ];

  if (!puedeCrear(ctx)) {
    partes.push(`Tu rol (${ctx.nombreRol}) no crea solicitudes: eso lo hace un solicitante.`);
  } else {
    partes.push(`Recuerda describir el problema con al menos ${ctx.minDescripcion} caracteres.`);
  }

  return {
    texto: partes.join('\n\n'),
    acciones: puedeCrear(ctx)
      ? [{ tipo: 'solicitar', etiqueta: `Crear solicitud: ${nombre}`, valor: nombre }]
      : []
  };
}

function accionIr(ctx, pantalla, etiqueta) {
  return ctx.pantallas.includes(pantalla) ? [{ tipo: 'ir', etiqueta, valor: pantalla }] : [];
}

const RESPUESTAS = {
  software: ctx => respuestaServicio('Instalación de software', CONSEJOS.software, ctx),
  red: ctx => respuestaServicio('Problema de red', CONSEJOS.red, ctx),
  hardware: ctx => respuestaServicio('Mantenimiento de equipo', CONSEJOS.hardware, ctx),
  acceso: ctx => respuestaServicio('Acceso a una aplicación', CONSEJOS.acceso, ctx),

  solicitar: ctx => ({
    texto: puedeCrear(ctx)
      ? 'Para crear una solicitud: elige el tipo de servicio, indica a cuántas personas afecta y describe el problema. El sistema define la prioridad y la ruta de aprobación por ti.\n\n¿Qué necesitas? Puedes decirme, por ejemplo, “instalar un programa” o “falla el wifi”.'
      : `Tu rol (${ctx.nombreRol}) no crea solicitudes; eso lo hace un solicitante. Desde tu panel puedes gestionar las que ya existen.`,
    acciones: puedeCrear(ctx)
      ? [{ tipo: 'ir', etiqueta: 'Ir a Nueva solicitud', valor: 'nueva' }]
      : accionIr(ctx, 'admin', 'Ir a Administración')
  }),

  estado: ctx => {
    if (ctx.pantallas.includes('seguimiento')) {
      return {
        texto:
          'En Seguimiento ves todas tus solicitudes con su estado: Pendiente de aprobación, En proceso, Resuelta o Rechazada. Abre “Ver historial de la solicitud” para ver cada paso con su fecha.',
        acciones: accionIr(ctx, 'seguimiento', 'Ir a Seguimiento')
      };
    }
    return {
      texto:
        'En Administración ves todas las solicitudes con su estado, su historial y las acciones que tu rol puede hacer.',
      acciones: accionIr(ctx, 'admin', 'Ir a Administración')
    };
  },

  calificar: ctx => ({
    texto:
      'Cuando una solicitud pasa a Resuelta, el solicitante ve en Seguimiento un selector para calificar el servicio de 1 a 5. Esa nota alimenta el indicador de satisfacción.',
    acciones: [
      ...accionIr(ctx, 'seguimiento', 'Ir a Seguimiento'),
      ...accionIr(ctx, 'dashboard', 'Ver indicadores')
    ]
  }),

  rechazo: ctx => ({
    texto:
      'Una solicitud rechazada fue revisada por un aprobador y no continúa. En el historial puedes ver cuándo ocurrió. Si aún necesitas el servicio, crea una nueva con más detalles sobre el problema.',
    acciones: [
      ...accionIr(ctx, 'seguimiento', 'Ir a Seguimiento'),
      ...accionIr(ctx, 'admin', 'Ir a Administración')
    ]
  }),

  aprobacion: ctx => ({
    texto:
      ctx.rol === 'aprobador'
        ? 'En Administración verás las solicitudes pendientes con los botones Aprobar y Rechazar. Si una solicitud requiere 2 aprobaciones, sigue pendiente después de la primera.\n\nReglas: 0 aprobaciones (automática) para servicios de bajo riesgo que afectan a una persona con prioridad baja o media; 2 cuando afecta a toda la organización; 1 en los demás casos.'
        : 'Las aprobaciones dependen del riesgo: 0 (automática) para servicios de bajo riesgo que afectan a una persona con prioridad baja o media; 2 cuando afecta a toda la organización; 1 en los demás casos. Solo el aprobador puede aprobar o rechazar.',
    acciones: ctx.rol === 'aprobador' ? accionIr(ctx, 'admin', 'Ir a Administración') : []
  }),

  resolver: ctx => ({
    texto:
      ctx.rol === 'tecnico'
        ? 'En Administración, las solicitudes En proceso muestran el botón “Marcar como resuelta”. La asignación es automática: cada tipo de servicio va al técnico que le corresponde.'
        : 'Cuando una solicitud se aprueba, se asigna automáticamente al técnico según el tipo de servicio. El técnico la atiende y la marca como resuelta; entonces el solicitante puede calificarla.',
    acciones: ctx.rol === 'tecnico' ? accionIr(ctx, 'admin', 'Ir a Administración') : []
  }),

  prioridad: ctx => ({
    texto:
      'La prioridad se sugiere según el servicio y el impacto:\n• Una persona: la del servicio (Media o Alta).\n• Varias personas: Alta.\n• Toda la organización: Urgente.\n\nEl impacto también cambia las aprobaciones: toda la organización requiere 2.',
    acciones: []
  }),

  tiempo: ctx => ({
    texto:
      'El tiempo depende de las aprobaciones. Las solicitudes de bajo riesgo se aprueban solas y pasan directo al técnico. Las demás esperan 1 aprobación (2 si afectan a toda la organización).\n\nUna solicitud abierta por más de 24 horas aparece como atrasada en Indicadores. La meta del sistema es atender en 24 horas.',
    acciones: accionIr(ctx, 'seguimiento', 'Ver mis solicitudes')
  }),

  ayuda: ctx => ({
    texto: `Puedo orientarte según tu rol (${ctx.nombreRol}). Pregúntame, por ejemplo:`,
    acciones: sugerencias(ctx)
  }),

  gracias: () => ({
    texto: '¡Con gusto! Si necesitas algo más, aquí estoy.',
    acciones: []
  }),

  saludo: ctx => ({
    texto: `¡Hola! Soy el asistente de CloudCare. Cuéntame qué necesitas y te oriento. Por ejemplo:`,
    acciones: sugerencias(ctx)
  }),

  desconocido: ctx => ({
    texto:
      'No estoy seguro de haber entendido. Prueba con otras palabras, por ejemplo “no hay internet”, “instalar un programa” o “estado de mi solicitud”.',
    acciones: sugerencias(ctx)
  })
};

function sugerencias(ctx) {
  return (SUGERENCIAS[ctx.rol] || SUGERENCIAS.solicitante).map(texto => ({
    tipo: 'preguntar',
    etiqueta: texto,
    valor: texto
  }));
}

function responder(entrada, ctx) {
  const t = normalizar(entrada);
  const tema = TEMAS.find(x => x.patron.test(t))?.id;
  return (RESPUESTAS[tema] || RESPUESTAS.desconocido)(ctx);
}

/* ---------- Componente ---------- */

function ChatbotAyuda({ rol, nombreRol, pantallas, servicios, minDescripcion = 15, onSolicitar, onIr }) {
  const ctx = { rol, nombreRol, pantallas, servicios, minDescripcion };

  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState(() => [{ de: 'bot', ...RESPUESTAS.saludo(ctx) }]);

  const listaRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [mensajes, abierto]);

  useEffect(() => {
    if (abierto) inputRef.current?.focus();
  }, [abierto]);

  function enviar(entrada) {
    const limpio = entrada.trim();
    if (!limpio) return;
    const respuesta = responder(limpio, ctx);
    setMensajes(actuales => [
      ...actuales,
      { de: 'usuario', texto: limpio, acciones: [] },
      { de: 'bot', ...respuesta }
    ]);
    setTexto('');
  }

  function manejarAccion(accion) {
    if (accion.tipo === 'preguntar') {
      enviar(accion.valor);
    } else if (accion.tipo === 'solicitar') {
      onSolicitar(accion.valor);
      setAbierto(false);
    } else if (accion.tipo === 'ir') {
      onIr(accion.valor);
      setAbierto(false);
    }
  }

  return (
    <>
      {abierto && (
        <section
          className="chat-panel"
          role="dialog"
          aria-label="Asistente de ayuda de CloudCare"
          onKeyDown={e => e.key === 'Escape' && setAbierto(false)}
        >
          <header className="chat-cabecera">
            <div>
              <h3>Asistente CloudCare</h3>
              <small>Orientación según tu rol</small>
            </div>
            <button type="button" className="chat-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar el asistente">
              ×
            </button>
          </header>

          <div className="chat-mensajes" ref={listaRef} aria-live="polite">
            {mensajes.map((m, i) => (
              <div key={i} className={`chat-msg ${m.de === 'bot' ? 'chat-msg-bot' : 'chat-msg-usuario'}`}>
                <div className={`chat-burbuja ${m.de === 'bot' ? 'chat-bot' : 'chat-usuario'}`}>{m.texto}</div>
                {m.acciones?.length > 0 && (
                  <div className="chat-opciones">
                    {m.acciones.map(a => (
                      <button type="button" key={a.etiqueta} className="chat-opcion" onClick={() => manejarAccion(a)}>
                        {a.etiqueta}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <form
            className="chat-form"
            onSubmit={e => {
              e.preventDefault();
              enviar(texto);
            }}
          >
            <input
              ref={inputRef}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder="Escribe qué necesitas..."
              aria-label="Escribe tu pregunta"
              autoComplete="off"
            />
            <button type="submit">Enviar</button>
          </form>
          <p className="chat-aviso">Asistente automático: orienta, pero no reemplaza al equipo de TI.</p>
        </section>
      )}

      <button
        type="button"
        className="chat-boton"
        onClick={() => setAbierto(actual => !actual)}
        aria-expanded={abierto}
        aria-label={abierto ? 'Cerrar el asistente de ayuda' : 'Abrir el asistente de ayuda'}
      >
        {abierto ? '×' : '✦'}
      </button>
    </>
  );
}

export default ChatbotAyuda;
