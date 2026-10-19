import { useEffect, useState } from 'react';
import {
  CUENTAS_DEMO,
  asegurarCuentasIniciales,
  iniciarSesionConCredenciales,
  registrarSolicitante
} from './auth';

const FORM_VACIO = { nombre: '', usuario: '', clave: '', confirmacion: '' };

function PantallaLogin({ onLogin }) {
  const [modo, setModo] = useState('ingresar'); // 'ingresar' | 'registro'
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    asegurarCuentasIniciales();
  }, []);

  const cambiar = campo => e => setForm(actual => ({ ...actual, [campo]: e.target.value }));

  function cambiarModo(nuevo) {
    setModo(nuevo);
    setForm(FORM_VACIO);
    setError('');
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setCargando(true);

    try {
      await asegurarCuentasIniciales();
      const resultado =
        modo === 'ingresar'
          ? await iniciarSesionConCredenciales(form.usuario, form.clave)
          : await registrarSolicitante(form);

      if (resultado.ok) onLogin(resultado.sesion);
      else setError(resultado.error);
    } catch {
      setError('Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="app">
      <div className="workspace">
        <main className="content">
          <div className="page-heading">
            <span className="eyebrow">CLOUDCARE</span>
            <h2>{modo === 'ingresar' ? 'Inicia sesión' : 'Crea tu cuenta'}</h2>
            <p>
              {modo === 'ingresar'
                ? 'Entra con tu usuario y contraseña para ver las opciones de tu cuenta.'
                : 'Las cuentas nuevas son de usuario solicitante. Los administradores los crea el equipo de TI.'}
            </p>
          </div>

          <section className="panel form-panel">
            <form onSubmit={enviar} noValidate>
              <div className="form-grid">
                {modo === 'registro' && (
                  <div className="field full-field">
                    <label htmlFor="nombre">Nombre completo</label>
                    <input id="nombre" value={form.nombre} onChange={cambiar('nombre')} autoComplete="name" />
                  </div>
                )}

                <div className="field full-field">
                  <label htmlFor="usuario">Usuario</label>
                  <input
                    id="usuario"
                    value={form.usuario}
                    onChange={cambiar('usuario')}
                    autoComplete="username"
                    autoCapitalize="none"
                  />
                </div>

                <div className="field full-field">
                  <label htmlFor="clave">Contraseña</label>
                  <input
                    id="clave"
                    type="password"
                    value={form.clave}
                    onChange={cambiar('clave')}
                    autoComplete={modo === 'ingresar' ? 'current-password' : 'new-password'}
                  />
                </div>

                {modo === 'registro' && (
                  <div className="field full-field">
                    <label htmlFor="confirmacion">Repite la contraseña</label>
                    <input
                      id="confirmacion"
                      type="password"
                      value={form.confirmacion}
                      onChange={cambiar('confirmacion')}
                      autoComplete="new-password"
                    />
                    <small>Mínimo 8 caracteres, con letras y números.</small>
                  </div>
                )}
              </div>

              {error && (
                <div className="comparison-notice" role="alert" style={{ color: '#b93838' }}>
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button type="button" onClick={() => cambiarModo(modo === 'ingresar' ? 'registro' : 'ingresar')}>
                  {modo === 'ingresar' ? 'Crear una cuenta' : 'Ya tengo cuenta'}
                </button>
                <button className="principal" type="submit" disabled={cargando}>
                  {cargando ? 'Verificando...' : modo === 'ingresar' ? 'Iniciar sesión' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </section>

          {modo === 'ingresar' && (
            <details className="comparison-notice">
              <summary>Cuentas de demostración</summary>
              <ul>
                {CUENTAS_DEMO.map(c => (
                  <li key={c.usuario}>
                    <strong>{c.rol}</strong>: usuario <code>{c.usuario}</code>, contraseña <code>{c.clave}</code>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </main>
      </div>
    </div>
  );
}

export default PantallaLogin;
