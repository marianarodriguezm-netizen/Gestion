import { useState } from 'react';
import { crearCuentaPorAdmin, eliminarCuenta, listarUsuarios } from './auth';

const NOMBRES_ROL = {
  solicitante: 'Solicitante',
  aprobador: 'Aprobador',
  tecnico: 'Técnico de TI'
};

const FORM_VACIO = { nombre: '', usuario: '', clave: '', rol: 'tecnico' };

function PanelUsuarios({ sesion }) {
  const [usuarios, setUsuarios] = useState(() => listarUsuarios());
  const [form, setForm] = useState(FORM_VACIO);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [cargando, setCargando] = useState(false);

  const cambiar = campo => e => setForm(actual => ({ ...actual, [campo]: e.target.value }));

  async function crear(e) {
    e.preventDefault();
    setCargando(true);
    const resultado = await crearCuentaPorAdmin(form, sesion);
    setCargando(false);

    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: `Cuenta "${form.usuario.trim().toLowerCase()}" creada.` });
      setForm(FORM_VACIO);
      setUsuarios(listarUsuarios());
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error });
    }
  }

  function eliminar(usuario) {
    if (!window.confirm(`¿Eliminar la cuenta "${usuario}"?`)) return;
    const resultado = eliminarCuenta(usuario, sesion);
    if (resultado.ok) {
      setMensaje({ tipo: 'ok', texto: `Cuenta "${usuario}" eliminada.` });
      setUsuarios(listarUsuarios());
    } else {
      setMensaje({ tipo: 'error', texto: resultado.error });
    }
  }

  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CONTROL DE ACCESO</span>
        <h2>Gestión de usuarios</h2>
        <p>Crea cuentas de aprobador y técnico, o elimina las que ya no se necesiten.</p>
      </div>

      <section className="panel form-panel">
        <div className="panel-heading">
          <div className="panel-heading-icon">＋</div>
          <div>
            <h3>Nueva cuenta</h3>
            <p>La persona podrá cambiar de rol solo si tú la eliminas y la creas de nuevo.</p>
          </div>
        </div>

        <form onSubmit={crear} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="nu-nombre">Nombre completo</label>
              <input id="nu-nombre" value={form.nombre} onChange={cambiar('nombre')} />
            </div>
            <div className="field">
              <label htmlFor="nu-usuario">Usuario</label>
              <input id="nu-usuario" value={form.usuario} onChange={cambiar('usuario')} autoCapitalize="none" />
            </div>
            <div className="field">
              <label htmlFor="nu-clave">Contraseña inicial</label>
              <input id="nu-clave" type="password" value={form.clave} onChange={cambiar('clave')} autoComplete="new-password" />
              <small>Mínimo 8 caracteres, con letras y números.</small>
            </div>
            <div className="field">
              <label htmlFor="nu-rol">Rol</label>
              <select id="nu-rol" value={form.rol} onChange={cambiar('rol')}>
                {Object.entries(NOMBRES_ROL).map(([clave, nombre]) => (
                  <option key={clave} value={clave}>{nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {mensaje.texto && (
            <div
              className="comparison-notice"
              role={mensaje.tipo === 'error' ? 'alert' : 'status'}
              style={mensaje.tipo === 'error' ? { color: '#b93838' } : undefined}
            >
              {mensaje.texto}
            </div>
          )}

          <div className="form-actions">
            <span className="muted">Las cuentas nuevas pueden iniciar sesión de inmediato.</span>
            <button className="principal" type="submit" disabled={cargando}>
              {cargando ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div className="panel-heading-icon">☺</div>
          <div>
            <h3>Cuentas registradas</h3>
            <p>{usuarios.length} cuentas en el sistema</p>
          </div>
        </div>

        {usuarios.map(u => (
          <article className="solicitud" key={u.usuario}>
            <h3>{u.nombre}</h3>
            <p>Usuario: <strong>{u.usuario}</strong> · Rol: <strong>{NOMBRES_ROL[u.rol] || u.rol}</strong></p>
            {u.usuario !== sesion.usuario && (
              <div className="acciones">
                <button onClick={() => eliminar(u.usuario)}>Eliminar cuenta</button>
              </div>
            )}
            {u.usuario === sesion.usuario && <p className="muted">Esta es tu cuenta.</p>}
          </article>
        ))}
      </section>
    </>
  );
}

export default PanelUsuarios;
