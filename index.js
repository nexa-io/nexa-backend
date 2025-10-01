const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = new sqlite3.Database('nexa.db', (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS users (
            email TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            isAdmin INTEGER DEFAULT 0
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userEmail TEXT,
            accountSize INTEGER,
            challengeType TEXT,
            contractStatus TEXT,
            kycStatus TEXT,
            contractExpiry TEXT,
            payoutDate TEXT,
            FOREIGN KEY(userEmail) REFERENCES users(email)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userEmail TEXT,
            message TEXT,
            createdAt TEXT,
            FOREIGN KEY(userEmail) REFERENCES users(email)
        )`);
    }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ message: 'Invalid token' });
    }
};

app.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO users (email, password, name, isAdmin) VALUES (?, ?, ?, ?)',
            [email, hashedPassword, name, 0],
            (err) => {
                if (err) {
                    return res.status(400).json({ message: 'User already exists' });
                }
                res.status(201).json({ message: 'User registered successfully' });
            }
        );
    } catch (err) {
        res.status(500).json({ message: 'Server error' });
    }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'All fields are required' });
    }
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err || !user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jwt.sign({ email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });
});

app.get('/user-data', verifyToken, (req, res) => {
    db.get('SELECT email, name, phone, address, isAdmin FROM users WHERE email = ?', [req.user.email], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(user);
    });
});

app.post('/update-profile', verifyToken, (req, res) => {
    const { phone, address } = req.body;
    db.run(
        'UPDATE users SET phone = ?, address = ? WHERE email = ?',
        [phone, address, req.user.email],
        (err) => {
            if (err) {
                return res.status(500).json({ message: 'Failed to update profile' });
            }
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

app.get('/contracts', verifyToken, (req, res) => {
    db.all('SELECT * FROM contracts WHERE userEmail = ?', [req.user.email], (err, contracts) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to fetch contracts' });
        }
        res.json(contracts);
    });
});

app.get('/all-contracts', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    db.all('SELECT * FROM contracts', (err, contracts) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to fetch contracts' });
        }
        res.json(contracts);
    });
});

app.post('/add-contract', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate } = req.body;
    db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ message: 'User not found' });
        }
        db.run(
            'INSERT INTO contracts (userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate],
            (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Failed to add contract' });
                }
                res.json({ message: 'Contract added successfully' });
            }
        );
    });
});

app.post('/disable-contract', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { contractId } = req.body;
    db.run('UPDATE contracts SET contractStatus = ? WHERE id = ?', ['Disabled', contractId], (err) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to disable contract' });
        }
        res.json({ message: 'Contract disabled successfully' });
    });
});

app.post('/update-kyc-status', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { contractId, kycStatus } = req.body;
    if (!['Not Submitted', 'Pending', 'Approved', 'Rejected'].includes(kycStatus)) {
        return res.status(400).json({ message: 'Invalid KYC status' });
    }
    db.run('UPDATE contracts SET kycStatus = ? WHERE id = ?', [kycStatus, contractId], (err) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to update KYC status' });
        }
        res.json({ message: 'KYC status updated successfully' });
    });
});

app.post('/send-notification', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { userEmail, message } = req.body;
    if (!userEmail || !message) {
        return res.status(400).json({ message: 'User email and message are required' });
    }
    db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, user) => {
        if (err || !user) {
            return res.status(400).json({ message: 'User not found' });
        }
        const createdAt = new Date().toISOString();
        db.run(
            'INSERT INTO notifications (userEmail, message, createdAt) VALUES (?, ?, ?)',
            [userEmail, message, createdAt],
            (err) => {
                if (err) {
                    return res.status(500).json({ message: 'Failed to send notification' });
                }
                res.json({ message: 'Notification sent successfully' });
            }
        );
    });
});

app.get('/get-notifications', verifyToken, (req, res) => {
    db.all('SELECT id, message, createdAt FROM notifications WHERE userEmail = ?', [req.user.email], (err, notifications) => {
        if (err) {
            return res.status(500).json({ message: 'Failed to fetch notifications' });
        }
        res.json(notifications);
    });
});

app.post('/send-contract-email', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { userEmail } = req.body;
    const mailerSendApiKey = process.env.MAILERSEND_API_KEY || 'your_mailersend_api_key';
    try {
        await axios.post(
            'https://api.mailersend.com/v1/email',
            {
                from: { email: 'infocontactnexa@gmail.com', name: 'Nexa' },
                to: [{ email: userEmail }],
                subject: 'New Contract Added - Nexa',
                text: 'A new trading contract has been added to your Nexa dashboard. Log in to view details and start trading!',
                html: '<p>A new trading contract has been added to your Nexa dashboard. Log in to view details and start trading!</p>'
            },
            { headers: { Authorization: `Bearer ${mailerSendApiKey}` } }
        );
        res.json({ message: 'Email sent successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Failed to send email' });
    }
});

app.get('/check-admin', verifyToken, (req, res) => {
    if (req.user.isAdmin && req.user.email === 'infocontactnexa@gmail.com') {
        res.json({ isAdmin: true });
    } else {
        res.status(403).json({ message: 'Admin access required' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
