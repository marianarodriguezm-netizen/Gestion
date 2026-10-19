/*
  AUTENTICACIÓN DE CLOUDCARE (solo frontend)

  - Los usuarios se guardan en localStorage con la contraseña convertida
    en hash SHA-256 + sal aleatoria (nunca en texto plano).
  - El campo "rol" de cada cuenta decide qué ve cada persona. Debe coincidir
    con las claves de ROLES en App.jsx: solicitante | aprobador | tecnico.
  - Usuario normal = solicitante. Administrador = aprobador o tecnico.
  - Las cuentas de administrador NO se pueden crear desde el registro público.

  IMPORTANTE: sin servidor esto es una validación de demostración. Cualquiera
  con acceso al navegador puede editar localStorage. Para producción, mueve
  esta lógica a un backend (JWT o sesiones) y no confíes en el rol del cliente.
*/

const CLAVE_USUARIOS = 'cloudcare-usuarios';

export const ROLES_ADMIN = ['aprobador', 'tecnico'];
export const esAdministrador = rol => ROLES_ADMIN.includes(rol);

// Cuentas de demostración (cámbialas o bórralas antes de entregar)
const CUENTAS_INICIALES = [
  { nombre: 'Usuario Demo', usuario: 'usuario', clave: 'Usuario123', rol: 'solicitante' },
  { nombre: 'Aprobador Demo', usuario: 'aprobador', clave: 'Aprobador123', rol: 'aprobador' },
  { nombre: 'Técnico Demo', usuario: 'tecnico', clave: 'Tecnico123', rol: 'tecnico' }
];

export const CUENTAS_DEMO = CUENTAS_INICIALES.map(({ usuario, clave, rol }) => ({ usuario, clave, rol }));

async function hashClave(clave, sal) {
  const datos = new TextEncoder().encode(`${sal}:${clave}`);
  const resumen = await crypto.subtle.digest('SHA-256', datos);
  return Array.from(new Uint8Array(resumen))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function crearSal() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function leerUsuarios() {
  try {
    const guardado = localStorage.getItem(CLAVE_USUARIOS);
    return guardado ? JSON.parse(guardado) : [];
  } catch {
    return [];
  }
}

function guardarUsuarios(lista) {
  try {
    localStorage.setItem(CLAVE_USUARIOS, JSON.stringify(lista));
    return true;
  } catch {
    return false;
  }
}

async function construirCuenta({ nombre, usuario, clave, rol }) {
  const sal = crearSal();
  return {
    nombre: nombre.trim(),
    usuario: usuario.trim().toLowerCase(),
    rol,
    sal,
    hash: await hashClave(clave, sal)
  };
}

// Crea las cuentas de demostración la primera vez que se abre la app
export async function asegurarCuentasIniciales() {
  if (leerUsuarios().length > 0) return;
  const cuentas = await Promise.all(CUENTAS_INICIALES.map(construirCuenta));
  guardarUsuarios(cuentas);
}

// Devuelve { ok: true, sesion } o { ok: false, error }
export async function iniciarSesionConCredenciales(usuario, clave) {
  const nombreUsuario = usuario.trim().toLowerCase();
  if (!nombreUsuario || !clave) {
    return { ok: false, error: 'Escribe tu usuario y tu contraseña.' };
  }

  const cuenta = leerUsuarios().find(u => u.usuario === nombreUsuario);
  const hashIntentado = cuenta ? await hashClave(clave, cuenta.sal) : null;

  // Mismo mensaje para usuario inexistente y clave errónea (no revela qué cuentas existen)
  if (!cuenta || hashIntentado !== cuenta.hash) {
    return { ok: false, error: 'Usuario o contraseña incorrectos.' };
  }

  return {
    ok: true,
    sesion: { usuario: cuenta.usuario, nombre: cuenta.nombre, rol: cuenta.rol }
  };
}

// El registro público solo crea solicitantes (usuarios normales)
export async function registrarSolicitante({ nombre, usuario, clave, confirmacion }) {
  const nombreUsuario = usuario.trim().toLowerCase();

  if (nombre.trim().length < 3) return { ok: false, error: 'Escribe tu nombre completo.' };
  if (!/^[a-z0-9._-]{4,20}$/.test(nombreUsuario)) {
    return { ok: false, error: 'El usuario debe tener de 4 a 20 caracteres: letras, números, punto, guion o guion bajo.' };
  }
  if (clave.length < 8 || !/[A-Za-z]/.test(clave) || !/\d/.test(clave)) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres, con letras y números.' };
  }
  if (clave !== confirmacion) return { ok: false, error: 'Las contraseñas no coinciden.' };

  const usuarios = leerUsuarios();
  if (usuarios.some(u => u.usuario === nombreUsuario)) {
    return { ok: false, error: 'Ese usuario ya existe. Elige otro.' };
  }

  const cuenta = await construirCuenta({ nombre, usuario: nombreUsuario, clave, rol: 'solicitante' });
  if (!guardarUsuarios([...usuarios, cuenta])) {
    return { ok: false, error: 'No se pudo guardar la cuenta en este navegador.' };
  }

  return {
    ok: true,
    sesion: { usuario: cuenta.usuario, nombre: cuenta.nombre, rol: cuenta.rol }
  };
}

/* =====================================================================
   GESTIÓN DE CUENTAS (solo para el rol "aprobador")
   ===================================================================== */

const TODOS_LOS_ROLES = ['solicitante', 'aprobador', 'tecnico'];

export function listarUsuarios() {
  return leerUsuarios().map(({ nombre, usuario, rol }) => ({ nombre, usuario, rol }));
}

export async function crearCuentaPorAdmin({ nombre, usuario, clave, rol }, actor) {
  if (actor?.rol !== 'aprobador') return { ok: false, error: 'No tienes permiso para crear cuentas.' };
  if (!TODOS_LOS_ROLES.includes(rol)) return { ok: false, error: 'Elige un rol válido.' };

  const nombreUsuario = usuario.trim().toLowerCase();
  if (nombre.trim().length < 3) return { ok: false, error: 'Escribe el nombre completo.' };
  if (!/^[a-z0-9._-]{4,20}$/.test(nombreUsuario)) {
    return { ok: false, error: 'El usuario debe tener de 4 a 20 caracteres: letras, números, punto, guion o guion bajo.' };
  }
  if (clave.length < 8 || !/[A-Za-z]/.test(clave) || !/\d/.test(clave)) {
    return { ok: false, error: 'La contraseña debe tener al menos 8 caracteres, con letras y números.' };
  }

  const usuarios = leerUsuarios();
  if (usuarios.some(u => u.usuario === nombreUsuario)) {
    return { ok: false, error: 'Ese usuario ya existe. Elige otro.' };
  }

  const cuenta = await construirCuenta({ nombre, usuario: nombreUsuario, clave, rol });
  if (!guardarUsuarios([...usuarios, cuenta])) {
    return { ok: false, error: 'No se pudo guardar la cuenta en este navegador.' };
  }
  return { ok: true };
}

export function eliminarCuenta(usuario, actor) {
  if (actor?.rol !== 'aprobador') return { ok: false, error: 'No tienes permiso para eliminar cuentas.' };
  if (usuario === actor.usuario) return { ok: false, error: 'No puedes eliminar tu propia cuenta.' };

  const usuarios = leerUsuarios();
  const objetivo = usuarios.find(u => u.usuario === usuario);
  if (!objetivo) return { ok: false, error: 'La cuenta no existe.' };

  const aprobadores = usuarios.filter(u => u.rol === 'aprobador').length;
  if (objetivo.rol === 'aprobador' && aprobadores <= 1) {
    return { ok: false, error: 'Debe quedar al menos un aprobador en el sistema.' };
  }

  guardarUsuarios(usuarios.filter(u => u.usuario !== usuario));
  return { ok: true };
}
