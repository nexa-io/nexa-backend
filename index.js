```javascript
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Copy nexa.db from repo to /tmp on startup
const sourceDbPath = path.join(__dirname, 'nexa.db');
const targetDbPath = '/tmp/nexa.db';
try {
    if (fs.existsSync(sourceDbPath)) {
        fs.copyFileSync(sourceDbPath, targetDbPath);
        console.log('Copied nexa.db to /tmp/nexa.db');
    } else {
        console.log('nexa.db not found in repo, creating new database');
        fs.writeFileSync(targetDbPath, ''); // Create empty file
    }
} catch (err) {
    console.error('Error copying nexa.db:', err.message);
}

// Initialize SQLite database
const db = new sqlite3.Database(targetDbPath, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
        process.exit(1);
    }
    console.log('Connected to SQLite database at /tmp/nexa.db');
    
    // Create tables with plain strings
    db.serialize(() => {
        db.run(
            'CREATE TABLE IF NOT EXISTS users (' +
            'email TEXT PRIMARY KEY, ' +
            'password TEXT NOT NULL, ' +
            'name TEXT NOT NULL, ' +
            'phone TEXT, ' +
            'address TEXT, ' +
            'isAdmin INTEGER DEFAULT 0)',
            (err) => {
                if (err) console.error('Error creating users table:', err.message);
                else console.log('Users table ready');
            }
        );
        db.run(
            'CREATE TABLE IF NOT EXISTS contracts (' +
            'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
            'userEmail TEXT, ' +
            'accountSize INTEGER, ' +
            'challengeType TEXT, ' +
            'contractStatus TEXT, ' +
            'kycStatus TEXT, ' +
            'contractExpiry TEXT, ' +
            'payoutDate TEXT, ' +
            'FOREIGN KEY(userEmail) REFERENCES users(email))',
            (err) => {
                if (err) console.error('Error creating contracts table:', err.message);
                else console.log('Contracts table ready');
            }
        );
        db.run(
            'CREATE TABLE IF NOT EXISTS notifications (' +
            'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
            'userEmail TEXT, ' +
            'message TEXT, ' +
            'createdAt TEXT, ' +
            'FOREIGN KEY(userEmail) REFERENCES users(email))',
            (err) => {
                if (err) console.error('Error creating notifications table:', err.message);
                else console.log('Notifications table ready');
            }
        );
    });
});

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        console.warn('No token provided in request');
        return res.status(401).json({ message: 'No token provided' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Token verification failed:', err.message);
        res.status(401).json({ message: 'Invalid token' });
    }
};

app.post('/register', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
        console.warn('Missing fields in register request:', req.body);
        return res.status(400).json({ message: 'All fields are required' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(
            'INSERT INTO users (email, password, name, isAdmin) VALUES (?, ?, ?, ?)',
            [email, hashedPassword, name, email === 'infocontactnexa@gmail.com' ? 1 : 0], // Auto-set admin
            function (err) {
                if (err) {
                    console.error('Register error:', err.message);
                    return res.status(400).json({ message: 'User already exists or invalid data' });
                }
                console.log(`User registered: ${email}`);
                res.status(201).json({ message: 'User registered successfully' });
            }
        );
    } catch (err) {
        console.error('Register server error:', err.message);
        res.status(500).json({ message: 'Server error during registration' });
    }
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        console.warn('Missing fields in login request:', req.body);
        return res.status(400).json({ message: 'Email and password are required' });
    }
    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) {
            console.error('Login database error:', err.message);
            return res.status(500).json({ message: 'Server error during login' });
        }
        if (!user) {
            console.warn(`Login attempt for non-existent user: ${email}`);
            return res.status(401).json({ message: 'User not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.warn(`Incorrect password for user: ${email}`);
            return res.status(401).json({ message: 'Incorrect password' });
        }
        const token = jwt.sign({ email: user.email, isAdmin: user.isAdmin }, JWT_SECRET, { expiresIn: '1h' });
        console.log(`User logged in: ${email}`);
        res.json({ token, isAdmin: user.isAdmin });
    });
});

app.get('/user-data', verifyToken, (req, res) => {
    db.get('SELECT email, name, phone, address, isAdmin FROM users WHERE email = ?', [req.user.email], (err, user) => {
        if (err) {
            console.error('User data fetch error:', err.message);
            return res.status(500).json({ message: 'Server error fetching user data' });
        }
        if (!user) {
            console.warn(`User not found: ${req.user.email}`);
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
                console.error('Update profile error:', err.message);
                return res.status(500).json({ message: 'Failed to update profile' });
            }
            console.log(`Profile updated for: ${req.user.email}`);
            res.json({ message: 'Profile updated successfully' });
        }
    );
});

app.get('/contracts', verifyToken, (req, res) => {
    db.all('SELECT * FROM contracts WHERE userEmail = ?', [req.user.email], (err, contracts) => {
        if (err) {
            console.error('Contracts fetch error:', err.message);
            return res.status(500).json({ message: 'Failed to fetch contracts' });
        }
        res.json(contracts);
    });
});

app.get('/all-contracts', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized access to all-contracts: ${req.user.email}`);
        return res.status(403).json({ message: 'Admin access required' });
    }
    db.all('SELECT * FROM contracts', (err, contracts) => {
        if (err) {
            console.error('All contracts fetch error:', err.message);
            return res.status(500).json({ message: 'Failed to fetch contracts' });
        }
        res.json(contracts);
    });
});

app.post('/add-contract', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized contract add attempt: ${req.user.email}`);
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate } = req.body;
    db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, user) => {
        if (err || !user) {
            console.error('Add contract user check error:', err?.message);
            return res.status(400).json({ message: 'User not found' });
        }
        db.run(
            'INSERT INTO contracts (userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userEmail, accountSize, challengeType, contractStatus, kycStatus, contractExpiry, payoutDate],
            (err) => {
                if (err) {
                    console.error('Add contract error:', err.message);
                    return res.status(500).json({ message: 'Failed to add contract' });
                }
                console.log(`Contract added for: ${userEmail}`);
                // Copy updated DB back to repo path to persist changes
                try {
                    fs.copyFileSync(targetDbPath, sourceDbPath);
                    console.log('Updated nexa.db copied back to repo');
                } catch (err) {
                    console.error('Error copying nexa.db back to repo:', err.message);
                }
                res.json({ message: 'Contract added successfully' });
            }
        );
    });
});

app.post('/disable-contract', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized contract disable attempt: ${req.user.email}`);
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { contractId } = req.body;
    db.run('UPDATE contracts SET contractStatus = ? WHERE id = ?', ['Disabled', contractId], (err) => {
        if (err) {
            console.error('Disable contract error:', err.message);
            return res.status(500).json({ message: 'Failed to disable contract' });
        }
        console.log(`Contract disabled: ${contractId}`);
        // Copy updated DB back to repo
        try {
            fs.copyFileSync(targetDbPath, sourceDbPath);
            console.log('Updated nexa.db copied back to repo');
        } catch (err) {
            console.error('Error copying nexa.db back to repo:', err.message);
        }
        res.json({ message: 'Contract disabled successfully' });
    });
});

app.post('/update-kyc-status', verifyToken, (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized KYC update attempt: ${req.user.email}`);
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { contractId, kycStatus } = req.body;
    if (!['Not Submitted', 'Pending', 'Approved', 'Rejected'].includes(kycStatus)) {
        console.warn(`Invalid KYC status: ${kycStatus}`);
        return res.status(400).json({ message: 'Invalid KYC status' });
    }
    db.run('UPDATE contracts SET kycStatus = ? WHERE id = ?', [kycStatus, contractId], (err) => {
        if (err) {
            console.error('Update KYC status error:', err.message);
            return res.status(500).json({ message: 'Failed to update KYC status' });
        }
        console.log(`KYC status updated for contract: ${contractId}`);
        // Copy updated DB back to repo
        try {
            fs.copyFileSync(targetDbPath, sourceDbPath);
            console.log('Updated nexa.db copied back to repo');
        } catch (err) {
            console.error('Error copying nexa.db back to repo:', err.message);
        }
        res.json({ message: 'KYC status updated successfully' });
    });
});

app.post('/send-notification', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized notification send attempt: ${req.user.email}`);
        return res.status(403).json({ message: 'Admin access required' });
    }
    const { userEmail, message } = req.body;
    if (!userEmail || !message) {
        console.warn('Missing fields in notification request:', req.body);
        return res.status(400).json({ message: 'User email and message are required' });
    }
    db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, user) => {
        if (err || !user) {
            console.error('Send notification user check error:', err?.message);
            return res.status(400).json({ message: 'User not found' });
        }
        const createdAt = new Date().toISOString();
        db.run(
            'INSERT INTO notifications (userEmail, message, createdAt) VALUES (?, ?, ?)',
            [userEmail, message, createdAt],
            (err) => {
                if (err) {
                    console.error('Send notification error:', err.message);
                    return res.status(500).json({ message: 'Failed to send notification' });
                }
                console.log(`Notification sent to: ${userEmail}`);
                // Copy updated DB back to repo
                try {
                    fs.copyFileSync(targetDbPath, sourceDbPath);
                    console.log('Updated nexa.db copied back to repo');
                } catch (err) {
                    console.error('Error copying nexa.db back to repo:', err.message);
                }
                res.json({ message: 'Notification sent successfully' });
            }
        );
    });
});

app.get('/get-notifications', verifyToken, (req, res) => {
    db.all('SELECT id, message, createdAt FROM notifications WHERE userEmail = ?', [req.user.email], (err, notifications) => {
        if (err) {
            console.error('Get notifications error:', err.message);
            return res.status(500).json({ message: 'Failed to fetch notifications' });
        }
        res.json(notifications);
    });
});

app.post('/send-contract-email', verifyToken, async (req, res) => {
    if (!req.user.isAdmin || req.user.email !== 'infocontactnexa@gmail.com') {
        console.warn(`Unauthorized email send attempt: ${req.user.email}`);
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
        console.log(`Contract email sent to: ${userEmail}`);
        res.json({ message: 'Email sent successfully' });
    } catch (err) {
        console.error('Send contract email error:', err.message);
        res.status(500).json({ message: 'Failed to send email' });
    }
});

app.get('/check-admin', verifyToken, (req, res) => {
    if (req.user.isAdmin && req.user.email === 'infocontactnexa@gmail.com') {
        res.json({ isAdmin: true });
    } else {
        console.warn(`Unauthorized admin check: ${req.user.email}`);
        res.status(403).json({ message: 'Admin access required' });
    }
});

app.get('/health', (req, res) => {
    db.get('SELECT 1', (err) => {
        if (err) {
            console.error('Health check database error:', err.message);
            return res.status(500).json({ status: 'Error', database: 'Disconnected' });
        }
        res.json({ status: 'OK', database: 'Connected' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
```
