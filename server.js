const express    = require('express');
const session    = require('express-session');
const Database   = require('better-sqlite3');
const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');
const path       = require('path');
const cors       = require('cors');

const app  = express();
const PORT = 3000;

// ════════════════════════════════════════════════════════
//  ⚙️  CONFIGURACIÓN — Cambia estos valores antes de usar
// ════════════════════════════════════════════════════════
const CONFIG = {
  // Login del panel admin
  admin: {
    usuario:  'admin',           // ← usuario para entrar al panel
    password: 'fitcore',     // ← contraseña del panel admin
  },
  // Email
  email: {
    destinatario: 'widecoocaa@fitcore.es',  // ← donde recibes los avisos
    remitente:    'tu_correo@gmail.com',     // ← tu cuenta Gmail
    password:     'xxxx xxxx xxxx xxxx',     // ← contraseña de aplicación Gmail
  },
  // Clave secreta para las sesiones (cámbiala por algo aleatorio)
  sessionSecret: 'fitcore_secret_2026_xyz',
};
// ════════════════════════════════════════════════════════

// ── Middlewares ──────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret:            CONFIG.sessionSecret,
  resave:            false,
  saveUninitialized: false,
  cookie:            { secure: false, maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));
app.use(express.static(path.join(__dirname)));

// ── Middleware de autenticación ──────────────────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session && req.session.autenticado) return next();
  // Si piden un recurso protegido sin sesión, redirigir al login
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ ok: false, error: 'No autenticado' });
  }
  res.redirect('/login.html');
}

// ── Base de datos SQLite ─────────────────────────────────────────────────────
const db = new Database('fitcore_contactos.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS contactos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha     TEXT    NOT NULL,
    nombre    TEXT    NOT NULL,
    apellidos TEXT,
    email     TEXT    NOT NULL,
    telefono  TEXT,
    interes   TEXT,
    mensaje   TEXT
  )
`);

const insertar = db.prepare(`
  INSERT INTO contactos (fecha, nombre, apellidos, email, telefono, interes, mensaje)
  VALUES (@fecha, @nombre, @apellidos, @email, @telefono, @interes, @mensaje)
`);

// ── Nodemailer transporter ───────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: CONFIG.email.remitente, pass: CONFIG.email.password },
});

// Aviso interno al equipo FitCore
async function enviarEmailAviso(c) {
  const asunto = `📬 Nuevo contacto — ${c.nombre} ${c.apellidos || ''}`.trim();
  await transporter.sendMail({
    from:    `"FitCore Web" <${CONFIG.email.remitente}>`,
    to:      CONFIG.email.destinatario,
    subject: asunto,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:#0f0f0f;padding:24px 32px;">
          <h1 style="color:#3df5a5;font-size:22px;margin:0;">FitCore — Nuevo Contacto</h1>
        </div>
        <div style="padding:28px 32px;background:#fff;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:8px 0;color:#6b7280;width:120px;">Fecha</td>    <td style="font-weight:600;">${c.fecha}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Nombre</td>   <td style="font-weight:600;">${c.nombre} ${c.apellidos || ''}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Email</td>    <td><a href="mailto:${c.email}" style="color:#3df5a5;">${c.email}</a></td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Teléfono</td> <td>${c.telefono || '—'}</td></tr>
            <tr><td style="padding:8px 0;color:#6b7280;">Interés</td>  <td>${c.interes || '—'}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;"/>
          <p style="color:#6b7280;font-size:13px;margin:0 0 8px;">Mensaje:</p>
          <p style="background:#f9fafb;padding:16px;border-radius:6px;font-size:14px;margin:0;">${c.mensaje || '(sin mensaje)'}</p>
        </div>
        <div style="background:#f9fafb;padding:16px 32px;font-size:12px;color:#9ca3af;">fitcore.es</div>
      </div>`,
  });
}

// Respuesta automática al cliente
async function enviarRespuestaCliente(c) {
  await transporter.sendMail({
    from:    `"FitCore" <${CONFIG.email.remitente}>`,
    to:      c.email,
    subject: `¡Hola ${c.nombre}! Hemos recibido tu mensaje 💪`,
    html: `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
        <div style="background:#0f0f0f;padding:32px;text-align:center;">
          <h1 style="font-family:Georgia,serif;color:#3df5a5;font-size:28px;margin:0;letter-spacing:4px;">FITCORE</h1>
          <p style="color:#555;font-size:13px;margin:8px 0 0;">Tu plataforma de fitness, nutrición y suplementación</p>
        </div>
        <div style="padding:36px 32px;background:#fff;">
          <h2 style="font-size:20px;color:#111;margin:0 0 12px;">¡Hola, ${c.nombre}! 👋</h2>
          <p style="color:#444;line-height:1.7;margin:0 0 20px;">
            Gracias por ponerte en contacto con nosotros. Hemos recibido tu mensaje correctamente
            y nuestro equipo lo revisará lo antes posible.
          </p>
          ${c.interes ? `
          <div style="background:#f0fdf7;border-left:4px solid #3df5a5;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px;">
            <p style="margin:0;font-size:13px;color:#444;">Has preguntado por:</p>
            <p style="margin:4px 0 0;font-weight:700;color:#111;">${c.interes}</p>
          </div>` : ''}
          <p style="color:#444;line-height:1.7;margin:0 0 24px;">
            Te responderemos en un plazo máximo de <strong>24–48 horas</strong> en días laborables
            (Lun–Vie, 08:00–20:00).
          </p>
          <div style="text-align:center;margin:28px 0;">
            <a href="https://fitcore.es" style="background:#0f0f0f;color:#3df5a5;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:1px;">
              Visita FitCore.es →
            </a>
          </div>
        </div>
        <div style="background:#f9fafb;padding:20px 32px;font-size:12px;color:#9ca3af;text-align:center;">
          <p style="margin:0;">© 2026 FitCore · Alcalá de Henares, Madrid</p>
          <p style="margin:4px 0 0;"><a href="mailto:widecoocaa@fitcore.es" style="color:#3df5a5;">widecoocaa@fitcore.es</a> · +34 682 599 080</p>
        </div>
      </div>`,
  });
}

// ════════════════════════════════════════════════════════
//  RUTAS PÚBLICAS
// ════════════════════════════════════════════════════════

// POST /contacto — guardar, avisar al equipo y responder al cliente
app.post('/contacto', async (req, res) => {
  const { nombre, apellidos, email, telefono, interes, mensaje } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ ok: false, error: 'Nombre y email son obligatorios.' });
  }

  const fecha = new Date().toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });

  try {
    const info = insertar.run({ fecha, nombre, apellidos, email, telefono, interes, mensaje });
    console.log(`✅ Contacto #${info.lastInsertRowid} — ${nombre} <${email}>`);

    const contacto = { fecha, nombre, apellidos, email, telefono, interes, mensaje };

    // Emails en paralelo (no bloquean la respuesta)
    Promise.all([
      enviarEmailAviso(contacto)
        .then(() => console.log(`📧 Aviso enviado a ${CONFIG.email.destinatario}`))
        .catch(e  => console.warn('⚠️  Aviso no enviado:', e.message)),
      enviarRespuestaCliente(contacto)
        .then(() => console.log(`📨 Respuesta automática enviada a ${email}`))
        .catch(e  => console.warn('⚠️  Respuesta automática no enviada:', e.message)),
    ]);

    res.json({ ok: true, id: info.lastInsertRowid });
  } catch (err) {
    console.error('Error al guardar:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno.' });
  }
});

// POST /login
app.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (usuario === CONFIG.admin.usuario && password === CONFIG.admin.password) {
    req.session.autenticado = true;
    req.session.usuario     = usuario;
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos.' });
});

// POST /logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /auth-check — para que el frontend sepa si hay sesión activa
app.get('/auth-check', (req, res) => {
  res.json({ autenticado: !!(req.session && req.session.autenticado) });
});

// ════════════════════════════════════════════════════════
//  RUTAS PROTEGIDAS (requieren login)
// ════════════════════════════════════════════════════════

// GET /contactos — lista JSON
app.get('/contactos', requireAuth, (req, res) => {
  const todos = db.prepare('SELECT * FROM contactos ORDER BY id DESC').all();
  res.json(todos);
});

// GET /contactos/stats — datos para gráficas
app.get('/contactos/stats', requireAuth, (req, res) => {
  // Últimas 8 semanas
  const porSemana = db.prepare(`
    SELECT strftime('%Y-W%W', substr(fecha,7,4)||'-'||substr(fecha,4,2)||'-'||substr(fecha,1,2)) AS semana,
           COUNT(*) AS total
    FROM contactos
    GROUP BY semana
    ORDER BY semana DESC
    LIMIT 8
  `).all().reverse();

  // Últimos 6 meses
  const porMes = db.prepare(`
    SELECT substr(fecha,4,2)||'/'||substr(fecha,7,4) AS mes,
           COUNT(*) AS total
    FROM contactos
    GROUP BY mes
    ORDER BY substr(fecha,7,4)||substr(fecha,4,2) DESC
    LIMIT 6
  `).all().reverse();

  // Por interés
  const porInteres = db.prepare(`
    SELECT interes, COUNT(*) AS total
    FROM contactos
    WHERE interes IS NOT NULL AND interes != ''
    GROUP BY interes
    ORDER BY total DESC
  `).all();

  res.json({ porSemana, porMes, porInteres });
});

// GET /contactos/excel — exportar
app.get('/contactos/excel', requireAuth, async (req, res) => {
  const todos = db.prepare('SELECT * FROM contactos ORDER BY id DESC').all();
  const wb    = new ExcelJS.Workbook();
  wb.creator  = 'FitCore';
  wb.created  = new Date();
  const ws    = wb.addWorksheet('Contactos', { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.columns = [
    { header: 'ID',        key: 'id',        width: 6  },
    { header: 'Fecha',     key: 'fecha',     width: 22 },
    { header: 'Nombre',    key: 'nombre',    width: 18 },
    { header: 'Apellidos', key: 'apellidos', width: 20 },
    { header: 'Email',     key: 'email',     width: 28 },
    { header: 'Teléfono',  key: 'telefono',  width: 18 },
    { header: 'Interés',   key: 'interes',   width: 28 },
    { header: 'Mensaje',   key: 'mensaje',   width: 50 },
  ];

  ws.getRow(1).eachCell(cell => {
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F0F0F' } };
    cell.font      = { bold: true, color: { argb: 'FF3DF5A5' }, size: 11 };
    cell.border    = { bottom: { style: 'thin', color: { argb: 'FF3DF5A5' } } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  ws.getRow(1).height = 28;

  todos.forEach((c, i) => {
    const row = ws.addRow(c);
    row.height = 20;
    row.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFF9FAFB' : 'FFFFFFFF' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
  });

  res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="fitcore_contactos_${Date.now()}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
  console.log(`📊 Excel exportado (${todos.length} registros)`);
});

// ── Arrancar ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor FitCore → http://localhost:${PORT}`);
  console.log(`🔐 Panel admin      → http://localhost:${PORT}/login.html`);
  console.log(`\n   Usuario: ${CONFIG.admin.usuario}`);
  console.log(`   Password: ${CONFIG.admin.password}\n`);
});
