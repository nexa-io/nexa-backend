import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'NEXA_SUPER_SECRET_KEY_2025';  // 🔐 Hardcoded securely
const TOKEN_EXPIRY = '30d'; // ⏰ 30 days expiry

app.use(cors());
app.use(express.json());

// For serving frontend if hosted together
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, 'public')));

// Initialize SQLite DB
const db = new sqlite3.Database('nexa.db', (err) => {
  if (err) console.error('DB connection error:', err);
  else console.log('✅ Connected to nexa.db');
});

// Create users table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password TEXT,
    phone TEXT,
    address TEXT,
    kycStatus TEXT DEFAULT 'Pending',
    contractStatus TEXT DEFAULT 'Pending',
    accountSize INTEGER DEFAULT 0,
    contractExpiry TEXT DEFAULT 'Not set',
    payoutDate TEXT DEFAULT 'Not set'
  )
`);

// Helper: Auth middleware
function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ message: 'No token provided' });

  const token = header.split(' ')[1];
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = decoded;
    next();
  });
}

// Signup
app.post('/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'All fields required' });

  const hashed = bcrypt.hashSync(password, 10);
  const stmt = db.prepare(`INSERT INTO users (name, email, password) VALUES (?, ?, ?)`);
  stmt.run(name, email, hashed, function (err) {
    if (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ message: 'Email already registered' });
      return res.status(500).json({ message: 'DB error' });
    }
    const token = jwt.sign({ id: this.lastID, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ token });
  });
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    res.json({ token, user });
  });
});

// Get user data
app.get('/user-data', authenticate, (req, res) => {
  db.get(`SELECT * FROM users WHERE id = ?`, [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: 'DB error' });
    if (!user) return res.status(404).json({ message: 'User not found' });
    delete user.password;
    res.json(user);
  });
});

// Update profile
app.post('/update-profile', authenticate, (req, res) => {
  const { phone, address } = req.body;
  db.run(`UPDATE users SET phone = ?, address = ? WHERE id = ?`, [phone, address, req.user.id], function (err) {
    if (err) return res.status(500).json({ message: 'DB error' });
    res.json({ message: 'Profile updated successfully' });
  });
});

// Start server
app.listen(PORT, () => console.log(`🚀 Nexa backend running on port ${PORT}`));
