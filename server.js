const express    = require('express');
const session    = require('express-session');
const mongoose   = require('mongoose');
const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');
const path       = require('path');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// ═════════ CONFIG ═════════
const CONFIG = {
  admin: {
    usuario: 'admin',
    password: 'fitcore',
  },
  email: {
    destinatario: 'widecoocaa@fitcore.es',
    remitente: 'tu_correo@gmail.com',
    password: 'xxxx xxxx xxxx xxxx',
  },
  sessionSecret: 'fitcore_secret_2026_xyz',
};

// ── MONGODB CONNECTION ─────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('🟢 MongoDB conectado'))
  .catch(err => console.error('🔴 MongoDB error:', err));

// ── MODEL ──────────────────────────────────
const Contacto = mongoose.model('Contacto', {
  fecha: String,
  nombre: String,
  apellidos: String,
  email: String,
  telefono: String,
  interes: String,
  mensaje: String
});

// ── MIDDLEWARES ────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: CONFIG.sessionSecret,
  resave: false,
  saveUninitialized: false,
}));

app.use(express.static(path.join(__dirname)));

// ── AUTH ───────────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.autenticado) return next();
  return res.status(401).json({ ok: false });
}

// ── EMAIL ──────────────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: CONFIG.email.remitente,
    pass: CONFIG.email.password
  }
});

// ── CONTACTO ───────────────────────────────
app.post('/contacto', async (req, res) => {
  const { nombre, apellidos, email, telefono, interes, mensaje } = req.body;

  if (!nombre || !email) {
    return res.status(400).json({ ok: false });
  }

  const fecha = new Date().toLocaleString('es-ES');

  const contacto = await Contacto.create({
    fecha, nombre, apellidos, email, telefono, interes, mensaje
  });

  res.json({ ok: true, id: contacto._id });
});

// ── LOGIN ──────────────────────────────────
app.post('/login', (req, res) => {
  const { usuario, password } = req.body;

  if (usuario === CONFIG.admin.usuario && password === CONFIG.admin.password) {
    req.session.autenticado = true;
    return res.json({ ok: true });
  }

  res.status(401).json({ ok: false });
});

// ── CONTACTOS ──────────────────────────────
app.get('/contactos', requireAuth, async (req, res) => {
  const data = await Contacto.find().sort({ _id: -1 });
  res.json(data);
});

// ── STATS ──────────────────────────────────
app.get('/contactos/stats', requireAuth, async (req, res) => {
  const total = await Contacto.countDocuments();

  const porInteres = await Contacto.aggregate([
    { $group: { _id: "$interes", total: { $sum: 1 } } }
  ]);

  res.json({ total, porInteres });
});

// ── EXCEL ──────────────────────────────────
app.get('/contactos/excel', requireAuth, async (req, res) => {
  const data = await Contacto.find();

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Contactos');

  ws.columns = [
    { header: 'Nombre', key: 'nombre' },
    { header: 'Email', key: 'email' },
    { header: 'Interés', key: 'interes' },
    { header: 'Mensaje', key: 'mensaje' }
  ];

  data.forEach(d => ws.addRow(d));

  res.setHeader('Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );

  await wb.xlsx.write(res);
  res.end();
});

// ── START ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`);
});
