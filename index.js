const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new sqlite3.Database('nexa.db', (err) => {
    if (err) console.error('Database connection error:', err);
    else console.log('Connected to nexa.db');
});

// Create tables if they don't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        email TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        isAdmin BOOLEAN DEFAULT 0
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS contracts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userEmail TEXT NOT NULL,
        accountSize INTEGER NOT NULL,
        challengeType TEXT NOT NULL,
        contractStatus TEXT NOT NULL,
        kycStatus TEXT NOT NULL,
        contractExpiry TEXT NOT NULL,
        payoutDate TEXT NOT NULL,
        FOREIGN KEY (userEmail) REFERENCES users(email)
    )`);
});

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    jwt.verify(token, 'your_jwt_secret', (err, user) => {
        if (err) return res.status(403).json({ message: 'Invalid token' });
        req.user = user;
        next();
    });
};

// Signup
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            `INSERT INTO users (email, password, name, isAdmin) VALUES (?, ?, ?, ?)`,
            [email, hashedPassword, name, email === 'infocontactnexa@gmail.com' ? 1 : 0],
            (err) => {
                if (err) return res.status(400).json({ message: 'User already exists' });
                const token = jwt.sign({ email }, 'your_jwt_secret', { expiresIn: '1h' });
                res.status(200).json({ token, user: { email, name } });
            }
        );
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    db.get(`SELECT * FROM users WHERE email = ?`, [email], async (err, user) => {
        if (err || !user) return res.status(400).json({ message: 'Invalid credentials' });
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ message: 'Invalid credentials' });
        const token = jwt.sign({ email }, 'your_jwt_secret', { expiresIn: '1h' });
        res.status(200).json({ token, user: { email, name: user.name, isAdmin: user.isAdmin } });
    });
});

// User Data
app.get('/user-data', authenticateToken, (req, res) => {
    db.get(`SELECT email, name, phone, address, isAdmin FROM users WHERE email = ?`, [req.user.email], (err, user) => {
        if (err || !user) return res.status(404).json({ message: 'User not found' });
        res.status(200).json({
            name: user.name,
            email: user.email,
            phone: user.phone || 'Not set',
            address: user.address || 'Not set',
            isAdmin: user.isAdmin
        });
    });
});

// Check Admin
app.get('/check-admin', authenticateToken, (req, res) => {
    db.get(`SELECT isAdmin FROM users WHERE email = ?`, [req.user.email], (err, user) => {
        if (err || !user || !user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        res.status(200).json({ success: true });
    });
});

// Get User Contracts
app.get('/contracts', authenticateToken, (req, res) => {
    db.all(`SELECT * FROM contracts WHERE userEmail = ?`, [req.user.email], (err, contracts) => {
        if (err) return res.status(500).json({ message: 'Error fetching contracts' });
        res.status(200).json(contracts);
    });
});

// Get All Contracts (Admin)
app.get('/all-contracts', authenticateToken, (req, res) => {
    db.get(`SELECT isAdmin FROM users WHERE email = ?`, [req.user.email], (err, user) => {
        if (err || !user || !user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        db.all(`SELECT * FROM contracts`, [], (err, contracts) => {
            if (err) return res.status(500).json({ message: 'Error fetching contracts' });
            res.status(200).json(contracts);
        });
    });
});

// Add Contract
app.post('/add-contract', authenticateToken, async (req, res) => {
    const { userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate } = req.body;
    try {
        db.get(`SELECT isAdmin FROM users WHERE email = ?`, [req.user.email], (err, admin) => {
            if (err || !admin || !admin.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
                return res.status(403).json({ message: 'Unauthorized' });
            }
            db.get(`SELECT email FROM users WHERE email = ?`, [userEmail], (err, user) => {
                if (err || !user) return res.status(404).json({ message: 'User not found' });
                db.run(
                    `INSERT INTO contracts (userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate],
                    function (err) {
                        if (err) return res.status(500).json({ message: 'Error adding contract' });
                        res.status(200).json({ message: 'Contract added', contractId: this.lastID });
                    }
                );
            });
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Disable Contract
app.post('/disable-contract', authenticateToken, (req, res) => {
    const { contractId } = req.body;
    db.get(`SELECT isAdmin FROM users WHERE email = ?`, [req.user.email], (err, admin) => {
        if (err || !admin || !admin.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
            return res.status(403).json({ message: 'Unauthorized' });
        }
        db.run(`UPDATE contracts SET contractStatus = 'Disabled' WHERE id = ?`, [contractId], (err) => {
            if (err) return res.status(500).json({ message: 'Error disabling contract' });
            res.status(200).json({ message: 'Contract disabled' });
        });
    });
});

// Send Contract Email
app.post('/send-contract-email', authenticateToken, async (req, res) => {
    const { userEmail } = req.body;
    try {
        await axios.post('https://api.mailersend.com/v1/email', {
            from: { email: 'infocontactnexa@gmail.com' },
            to: [{ email: userEmail }],
            subject: 'Nexa Contract Details',
            html: `Your contract has been added. Sign here: <a href="https://docuseal.com/d/w4aYAR5LfBb41G">Contract</a><br>Complete KYC: <a href="https://forms.gle/esMxwUYE3fMVG1qn6">KYC Form</a>`
        }, {
            headers: {
                'Authorization': `Bearer mlsn.9d22578db1a5c02f535c13f03a433ea042d7615bd612594fe90b1f9afe3cefe2`
            }
        });
        res.status(200).json({ message: 'Email sent' });
    } catch (err) {
        res.status(500).json({ message: 'Error sending email' });
    }
});

// Update Profile
app.post('/update-profile', authenticateToken, (req, res) => {
    const { phone, address } = req.body;
    db.run(
        `UPDATE users SET phone = ?, address = ? WHERE email = ?`,
        [phone, address, req.user.email],
        (err) => {
            if (err) return res.status(500).json({ message: 'Error updating profile' });
            res.status(200).json({ message: 'Profile updated' });
        }
    );
});

app.listen(process.env.PORT || 3000, () => {
    console.log('Server running');
});
