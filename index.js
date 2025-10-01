// index.js - Nexa backend (SQLite + JWT + Paystack + MailerSend)
// Full version (signup/login/dashboard/update-profile/payments/webhook)
// WARNING: For production, move secrets to environment variables.

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const { MailerSend, Sender, Recipient, EmailParams } = require('mailersend');

const app = express();
const port = process.env.PORT || 3000;

// ----------------- CONFIG (HARD-CODED FOR TESTING) -----------------
// Production: move all of these into process.env variables.

// JWT
const JWT_SECRET = 'nexa_super_secret_hardcoded_for_testing_pLEASE_change_me';
const JWT_EXPIRES_IN = '24h'; // 24 hours

// Paystack
const PAYSTACK_SECRET_KEY = 'sk_live_1f502564afb207534e3c0c940133fa910f01c946';

// MailerSend
const MAILERSEND_API_KEY = 'mlsn.9d22578db1a5c02f535c13f03a433ea042d7615bd612594fe90b1f9afe3cefe2';
const SENDER_EMAIL = 'test-dnvo4d91ryng5r86.mlsender.net';

// Docuseal + KYC links
const DOCUSEAL_CONTRACT_URL = 'https://docuseal.com/d/w4aYAR5LfBb41G';
const KYC_FORM_URL = 'https://forms.gle/esMxwUYE3fMVG1qn6';

// ----------------- MIDDLEWARE -----------------
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----------------- SQLITE DB (persistent local file nexa.db) -----------------
const db = new Database(path.join(__dirname, 'nexa.db'));

// Run simple migrations (create tables if not exists)
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    contractStatus TEXT DEFAULT 'Unsigned',
    kycStatus TEXT DEFAULT 'Pending',
    accountSize INTEGER DEFAULT 0,
    contractExpiry TEXT DEFAULT 'N/A',
    payoutDate TEXT DEFAULT 'N/A',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    paystackReference TEXT DEFAULT '',
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT NOT NULL,
    email TEXT NOT NULL,
    amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    data TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

// Prepare statements for performance
const findUserByEmailStmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');
const insertUserStmt = db.prepare(`INSERT INTO users 
    (name, email, password, contractStatus, kycStatus, accountSize, contractExpiry, payoutDate, address, phone, paystackReference)
  VALUES (@name,@email,@password,@contractStatus,@kycStatus,@accountSize,@contractExpiry,@payoutDate,@address,@phone,@paystackReference)`);
const updateUserStmt = db.prepare(`UPDATE users SET
    name = COALESCE(@name, name),
    password = COALESCE(@password, password),
    contractStatus = COALESCE(@contractStatus, contractStatus),
    kycStatus = COALESCE(@kycStatus, kycStatus),
    accountSize = COALESCE(@accountSize, accountSize),
    contractExpiry = COALESCE(@contractExpiry, contractExpiry),
    payoutDate = COALESCE(@payoutDate, payoutDate),
    address = COALESCE(@address, address),
    phone = COALESCE(@phone, phone),
    paystackReference = COALESCE(@paystackReference, paystackReference)
  WHERE LOWER(email) = LOWER(@email)`);
const createPaymentStmt = db.prepare('INSERT INTO payments (reference, email, amount, status, data) VALUES (?, ?, ?, ?, ?)');
const getUserByEmailStmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)');

// ----------------- MailerSend client -----------------
const mailersend = new MailerSend({ apiKey: MAILERSEND_API_KEY });

async function sendWelcomeEmail(recipientEmail, name) {
  // Non-blocking send, but we await it to get observable logs/errors.
  const emailBody = `
    <p>Hello ${name},</p>
    <p>Welcome to Nexa! Your trading journey starts now.</p>
    <p><strong>IMPORTANT NEXT STEPS:</strong></p>
    <ul>
      <li><strong>Sign Contract:</strong> Complete your Trader Contract to comply with AML/CTF laws: <a href="${DOCUSEAL_CONTRACT_URL}">${DOCUSEAL_CONTRACT_URL}</a></li>
      <li><strong>KYC Verification:</strong> Complete your Know Your Customer form: <a href="${KYC_FORM_URL}">${KYC_FORM_URL}</a></li>
    </ul>
    <p>You will also receive a contract link again if you purchase a challenge.</p>
    <p>Happy trading,<br>The Nexa Team</p>
  `;

  try {
    const mailerSender = new Sender(SENDER_EMAIL, "Nexa Platform");
    const mailerRecipients = [new Recipient(recipientEmail, name)];
    const emailParams = new EmailParams()
      .setFrom(mailerSender)
      .setTo(mailerRecipients)
      .setSubject("Welcome to Nexa - Your Trading Journey Starts Here!")
      .setHtml(emailBody);

    await mailersend.email.send(emailParams);
    console.log(`[MAILER] Email sent to ${recipientEmail}`);
  } catch (err) {
    console.error('[MAILER] sending error:', err && err.message ? err.message : err);
    // don't throw — keep signup flow working
  }
}

// ----------------- Helpers -----------------
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function verifyTokenHeader(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth) return null;
  const parts = auth.split(' ');
  if (parts.length !== 2) return null;
  const scheme = parts[0];
  const token = parts[1];
  if (!/^Bearer$/i.test(scheme)) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

function calculateAccountSizeFromUSD(amountInUSD) {
  let accountSize = 0;
  if (amountInUSD >= 2 && amountInUSD <= 20) accountSize = 100;
  else if (amountInUSD > 20 && amountInUSD <= 40) accountSize = 200;
  else if (amountInUSD > 40 && amountInUSD <= 100) accountSize = 500;
  else if (amountInUSD > 100) accountSize = 1000;
  return accountSize;
}

// ----------------- API ENDPOINTS -----------------

/**
 * POST /signup
 * body: { name, email, password }
 * returns: { token, user }
 */
app.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'All fields are required.' });

    // check existing
    const existing = findUserByEmailStmt.get(email);
    if (existing) return res.status(409).json({ message: 'User already exists.' });

    const hashed = await bcrypt.hash(password, 10);

    const info = {
      name,
      email,
      password: hashed,
      contractStatus: 'Unsigned',
      kycStatus: 'Pending',
      accountSize: 0,
      contractExpiry: 'N/A',
      payoutDate: 'N/A',
      address: '',
      phone: '',
      paystackReference: ''
    };

    const insert = insertUserStmt.run(info);
    // get stored user
    const stored = getUserByEmailStmt.get(email);

    // send welcome email (fire and forget but awaited for logging)
    sendWelcomeEmail(email, name).catch(() => {});

    const token = signToken({ id: stored.id, email: stored.email, name: stored.name });

    // return non-sensitive user fields
    const user = {
      id: stored.id,
      name: stored.name,
      email: stored.email,
      contractStatus: stored.contractStatus,
      kycStatus: stored.kycStatus,
      accountSize: stored.accountSize,
      contractExpiry: stored.contractExpiry,
      payoutDate: stored.payoutDate,
      address: stored.address,
      phone: stored.phone
    };

    return res.status(200).json({ token, user });
  } catch (err) {
    console.error('Signup Error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error during signup.' });
  }
});

/**
 * POST /login
 * body: { email, password }
 * returns: { token, user }
 */
app.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });

    const row = findUserByEmailStmt.get(email);
    if (!row) return res.status(401).json({ message: 'Invalid email or password.' });

    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(401).json({ message: 'Invalid email or password.' });

    const token = signToken({ id: row.id, email: row.email, name: row.name });

    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      contractStatus: row.contractStatus,
      kycStatus: row.kycStatus,
      accountSize: row.accountSize,
      contractExpiry: row.contractExpiry,
      payoutDate: row.payoutDate,
      address: row.address,
      phone: row.phone
    };

    return res.status(200).json({ token, user });
  } catch (err) {
    console.error('Login Error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error during login.' });
  }
});

/**
 * POST /user-data
 * Accepts either Authorization: Bearer <token> OR body { email }
 * returns: user object
 */
app.post('/user-data', async (req, res) => {
  try {
    // Try token first
    const verified = verifyTokenHeader(req);
    let email;
    if (verified && verified.email) {
      email = verified.email;
    } else {
      // fallback to body
      email = req.body.email;
    }

    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const row = getUserByEmailStmt.get(email);
    if (!row) return res.status(404).json({ message: 'User not found.' });

    const user = {
      id: row.id,
      name: row.name,
      email: row.email,
      contractStatus: row.contractStatus,
      kycStatus: row.kycStatus,
      accountSize: row.accountSize,
      contractExpiry: row.contractExpiry,
      payoutDate: row.payoutDate,
      address: row.address,
      phone: row.phone
    };

    return res.status(200).json(user);
  } catch (err) {
    console.error('User Data Fetch Error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error fetching user data.' });
  }
});

/**
 * POST /update-profile
 * body: { email, address, phone }
 */
app.post('/update-profile', async (req, res) => {
  try {
    const { email, address, phone } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });

    const row = getUserByEmailStmt.get(email);
    if (!row) return res.status(404).json({ message: 'User not found.' });

    // Basic phone validation (if provided)
    if (phone && !/^\+?\d{7,15}$/.test(phone)) {
      return res.status(400).json({ message: 'Invalid phone format.' });
    }

    updateUserStmt.run({
      email,
      address: address || row.address,
      phone: phone || row.phone
    });

    const updated = getUserByEmailStmt.get(email);

    return res.status(200).json({ message: 'Profile updated successfully.', user: {
      id: updated.id, name: updated.name, email: updated.email,
      contractStatus: updated.contractStatus, kycStatus: updated.kycStatus,
      accountSize: updated.accountSize, contractExpiry: updated.contractExpiry,
      payoutDate: updated.payoutDate, address: updated.address, phone: updated.phone
    }});
  } catch (err) {
    console.error('Profile Update Error:', err && err.message ? err.message : err);
    return res.status(500).json({ message: 'Server error during profile update.' });
  }
});

/**
 * POST /verify-payment
 * body: { reference, email }
 * Verifies Paystack transaction, updates user account size and records payment in DB
 */
app.post('/verify-payment', async (req, res) => {
  try {
    const { reference, email } = req.body;
    if (!reference || !email) return res.status(400).json({ message: 'Missing transaction reference or user email.' });

    // Call Paystack verify API
    const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });

    const transaction = paystackResponse.data && paystackResponse.data.data;
    if (!transaction || transaction.status !== 'success') {
      return res.status(402).json({ message: 'Payment verification failed or transaction not successful.' });
    }

    // Calculate amount in USD (if your flow uses NGN, adjust accordingly)
    // Paystack returns amount in kobo (for NGN) or cents (if currency USD) — this code assumes amount is in kobo and we convert to USD at 1:100? 
    // To keep the previous behavior: transaction.amount / 100 / 100
    const amountInUSD = (transaction.amount || 0) / 100 / 100;
    const accountSize = calculateAccountSizeFromUSD(amountInUSD);

    // Update user
    const userRow = getUserByEmailStmt.get(email);
    if (!userRow) return res.status(404).json({ message: 'User not found.' });

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30-day expiry

    updateUserStmt.run({
      email,
      accountSize,
      contractStatus: 'Unsigned',
      contractExpiry: expiryDate.toISOString().split('T')[0],
      payoutDate: 'Monthly',
      paystackReference: reference
    });

    // record payment
    createPaymentStmt.run(reference, email, transaction.amount || 0, transaction.status || 'success', JSON.stringify(transaction));

    // send contract email again
    sendWelcomeEmail(email, userRow.name).catch(() => {});

    return res.status(200).json({ message: 'Payment verified and account updated successfully.' });
  } catch (err) {
    console.error('Verify Payment Error:', err && err.response ? err.response.data || err.response.statusText : err && err.message ? err.message : err);
    if (err.response && err.response.status === 404) {
      return res.status(404).json({ message: 'Transaction not found.' });
    }
    return res.status(500).json({ message: 'Server error during payment verification.' });
  }
});

/**
 * POST /paystack-webhook
 * Paystack will call this endpoint. We verify signature and process charge.success events.
 */
app.post('/paystack-webhook', async (req, res) => {
  try {
    const signature = req.headers['x-paystack-signature'] || '';
    const computed = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');

    if (computed !== signature) {
      console.warn('Invalid Paystack signature');
      return res.status(401).send('Unauthorized');
    }

    const event = req.body;
    if (event.event !== 'charge.success') {
      return res.status(200).send('Event received but not relevant.');
    }

    const { reference, customer, amount } = event.data;
    const customerEmail = (customer && customer.email) || event.data.customer.email;

    // Use same conversion as verify-payment
    const amountInUSD = (amount || 0) / 100 / 100;
    const accountSize = calculateAccountSizeFromUSD(amountInUSD);

    // find user
    const userRow = getUserByEmailStmt.get(customerEmail);
    if (!userRow) {
      console.error(`User not found for email ${customerEmail}`);
      return res.status(404).send('User not found.');
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

    updateUserStmt.run({
      email: customerEmail,
      accountSize,
      contractStatus: 'Unsigned',
      contractExpiry: expiryDate.toISOString().split('T')[0],
      payoutDate: 'Monthly',
      paystackReference: reference
    });

    createPaymentStmt.run(reference, customerEmail, amount || 0, 'success', JSON.stringify(event.data));

    // send contract email
    sendWelcomeEmail(customerEmail, userRow.name).catch(() => {});

    return res.status(200).send('Webhook processed.');
  } catch (err) {
    console.error('Paystack Webhook Error:', err && err.message ? err.message : err);
    return res.status(500).send('Server error processing webhook.');
  }
});

// Simple health endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Start server
app.listen(port, () => {
  console.log(`Nexa Backend listening on port ${port}`);
  console.log(`DB path: ${path.join(__dirname, 'nexa.db')}`);
});
