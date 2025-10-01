// index.js (Node.js/Express Backend) - Clean version with no duplicates

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const { MailerSend, Sender, Recipient, EmailParams } = require('mailersend');

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURATION & SECRETS ---
// Note: In production, use process.env.VARIABLE_NAME for all secrets.
const SPREADSHEET_ID = '1QXgtbL7V9HEsxOdVj8c4TvD3rOPWHD6EHl3c3KIPxvQ';
const SHEET_NAME = 'Users';
const CLIENT_EMAIL = 'nexa-service@nexa-database-473717.iam.gserviceaccount.com';

const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8KF+HpVb+LYUy
8XTO9qRO3sKZ2Kiy0h/BzXSGAICXbXsOtJEPLyuYPp5Ge8SOCkfrglWbI5oQpiar
z7V3TFf72KcR9b9A07MCCnak3xoYSmxueGxGthnAibHhB7vRU7mCy3IN1ydmjPtX
WCJMtUX04DErLG5aCbP8AC9myGyDXtblSOSDbz0q/5t2A3edc/7YtUt9iaogIhy7
p2z9Pvis4LioFtG3+BC6Gax54+sbrsa15Ifa87safaw3a8A+IRST0B2g/sm23OYj
fdE3Vok7UEYUQL+4up6aTeq0TJjDWTkGkVU6nVLXinxnclVrtJBnJuyY11pymaSz
9xfpw1g1AgMBAAECggEAC25Se22ujsuaK4GizI4MZmQ/I1SXzyFX35DJUvjF1y1G
DBspMuh1OA8Z04NiahSy0Np+s+miSv+lGswIJMLFF55ObBdncptJ5UZYdeS985rV
4pI7VcJrZxiWb2rmXK2+9/S/LZsUIDVRcbl/f/SFVv6lzg8pdxvezOEAADkN6p8m
NMnZ5UcPaxOLm2HLmy/vPyZFT2yne+qT/bZwYASdMbR/Nr5lcBPmJKrIXpg6Dj1q
v9livE5NcWqhiMExao8XKY0zzr+X+TR1atDBTGs9J6GIjvfhgEIXooAiHvW8xn2v
ST33ClFBMa8q9al9zrhQLE55gcM0hSSohYnoFsDk0QKBgQDjjwGAYzhTf/LHkpJ7
ejtfp4gXfcLSItja0bvb+dzOOak15p1bOS7DTZnlgPthD/g0gNmgmuM86rSUXuFP
15/qec1bGirHUbTKkD9f4qqgO6pMcxIHZHcQ8cYf+Vbi5B/yCulwqbTxIbGTICIS
/a+rwp/xFJcTwgO365x4bd7XLQKBgQDTrLDb74tSl7sogiprV0ynnBHhG3WDbw5u
a8XyZPSW5jNN8794lis+yrtQcq5v2MJe0QTzSy933xZp9gGq5RLQ4T6xrxWsw5Ts
VMSXgx+8tMMOuBOGM04zklzdmHku9h29fOCd+0TO9JxFAnx/f6k2QrB3XsjC49G1
/RUb/EuqKQKBgQDdTwI908E+6+u4jmLptmmy0KL5fbSQW5WdUmaqbFmDMu7O3gbh
Zj6FcJ4gZw2Te01/+mQs3xXq87RFq/TiiqkbB/RhCpTaHit96UTJQw+AICbijPLW
v61QjGKMTBllNkmfQ19+032HGaaymIirAY/ssq6MbuLzMzgckgct1GTpzQKBgQDC
GdkT1NUtJ3W376R2SddA2xyKD6Py4iOZnbomS+z9cpoZISqyqQF+0uhxHLhYV6vk
xkaD0q30fd1PzQY6b1SRtfqHdMWrZq1pCVI8nUC9CgTTungs118ea1g821REe+tJ
lvlh5Mdz/1pM7bq8L5Q67WxkCcaO79mdyDVTNEcuAQKBgG5tr9ardC/Wp31YBqeZ
ZQjogaBRUgcnRXXQj2CK9QiXEOAQFo+9EUa57+V8xT6VQUH8Kopoy+ulLy0cmud6
XEtI3CtopUeHn8Ply23zRDkXdFCo1Ugn2oR8nF/qoBH4/2OQQpHNyEMVDdjTyobq
+rJcqN/R/9r8YZnSLPeD/QRU
-----END PRIVATE KEY-----`;

const PAYSTACK_SECRET_KEY = 'sk_live_1f502564afb207534e3c0c940133fa910f01c946';

const MAILERSEND_API_KEY = 'mlsn.9d22578db1a5c02f535c13f03a433ea042d7615bd612594fe90b1f9afe3cefe2';
const SENDER_EMAIL = 'test-dnvo4d91ryng5r86.mlsender.net';

const DOCUSEAL_CONTRACT_URL = 'https://docuseal.com/d/w4aYAR5LfBb41G';
const KYC_FORM_URL = 'https://forms.gle/esMxwUYE3fMVG1qn6';

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // If serving frontend from here

// --- GOOGLE SHEETS SETUP ---
const doc = new GoogleSpreadsheet(SPREADSHEET_ID);

async function loadSheet() {
    try {
        await doc.useServiceAccountAuth({
            client_email: CLIENT_EMAIL,
            private_key: PRIVATE_KEY,
        });
        await doc.loadInfo(); 
        return doc.sheetsByTitle[SHEET_NAME];
    } catch (e) {
        console.error('Error loading Google Sheet:', e);
        throw new Error('Database connection failed.');
    }
}

const mailersend = new MailerSend({ apiKey: MAILERSEND_API_KEY });

async function sendWelcomeEmail(recipientEmail, name) {
    console.log(`[MAILER] Sending welcome email to ${recipientEmail}...`);
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
        console.log(`[MAILER] Email sent successfully to ${recipientEmail}.`);
    } catch (error) {
        console.error('[MAILER] Error sending email:', error);
        // Don't fail the whole operation; log and continue
    }
}

// --- UTILITY FUNCTION: Find User ---
async function findUserByEmail(sheet, email) {
    const rows = await sheet.getRows();
    return rows.find(row => row.Email.toLowerCase() === email.toLowerCase());
}

// --- API ENDPOINTS ---

/**
 * @route POST /signup
 * @desc Register a new user and add to Google Sheet.
 */
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'All fields are required.' });
    }

    try {
        const sheet = await loadSheet();
        const existingUser = await findUserByEmail(sheet, email);

        if (existingUser) {
            return res.status(409).json({ message: 'User already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newRow = await sheet.addRow({
            Name: name,
            Email: email,
            Password: hashedPassword,
            ContractStatus: 'Unsigned',
            KycStatus: 'Pending',
            AccountSize: 0,
            ContractExpiry: 'N/A',
            PayoutDate: 'N/A',
            Address: '',
            Phone: '',
            PaystackReference: ''
        });
        
        await sendWelcomeEmail(email, name);

        // Return the user data (excluding the hashed password)
        const userData = { 
            name: newRow.Name, 
            email: newRow.Email, 
            contractStatus: newRow.ContractStatus,
            kycStatus: newRow.KycStatus,
            accountSize: newRow.AccountSize
        };
        res.status(200).json(userData);

    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Server error during signup.' });
    }
});

/**
 * @route POST /login
 * @desc Authenticate a user.
 */
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, email);

        if (!userRow) {
            return res.status(401).json({ message: 'Invalid email or password.' });
        }

        const match = await bcrypt.compare(password, userRow.Password);

        if (match) {
            // Return user data for the dashboard (excluding the password)
            const userData = { 
                name: userRow.Name, 
                email: userRow.Email, 
                contractStatus: userRow.ContractStatus,
                kycStatus: userRow.KycStatus,
                accountSize: userRow.AccountSize,
                contractExpiry: userRow.ContractExpiry,
                payoutDate: userRow.PayoutDate
            };
            res.status(200).json(userData);
        } else {
            res.status(401).json({ message: 'Invalid email or password.' });
        }

    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

/**
 * @route POST /user-data
 * @desc Get user data (used by dashboard to refresh).
 */
app.post('/user-data', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, email);

        if (!userRow) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Return all necessary dashboard data
        const userData = { 
            name: userRow.Name, 
            email: userRow.Email, 
            contractStatus: userRow.ContractStatus,
            kycStatus: userRow.KycStatus,
            accountSize: userRow.AccountSize,
            contractExpiry: userRow.ContractExpiry,
            payoutDate: userRow.PayoutDate,
            address: userRow.Address,
            phone: userRow.Phone
        };
        res.status(200).json(userData);

    } catch (error) {
        console.error('User Data Fetch Error:', error);
        res.status(500).json({ message: 'Server error fetching user data.' });
    }
});

/**
 * @route POST /update-profile
 * @desc Update user profile details (Address, Phone).
 */
app.post('/update-profile', async (req, res) => {
    const { email, address, phone } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email is required.' });
    }

    try {
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, email);

        if (!userRow) {
            return res.status(404).json({ message: 'User not found.' });
        }

        userRow.Address = address || '';
        userRow.Phone = phone || '';

        await userRow.save();

        res.status(200).json({ message: 'Profile updated successfully.' });

    } catch (error) {
        console.error('Profile Update Error:', error);
        res.status(500).json({ message: 'Server error during profile update.' });
    }
});

/**
 * @route POST /paystack-webhook
 * @desc Handle Paystack transaction verification.
 * NOTE: Configure this URL in your Paystack Dashboard.
 */
app.post('/paystack-webhook', async (req, res) => {
    // Paystack Signature Verification (essential for security)
    const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
        return res.status(401).send('Unauthorized');
    }
    
    const event = req.body;

    // We only care about successful transaction events
    if (event.event !== 'charge.success') {
        return res.status(200).send('Event received but not relevant to charge success.');
    }

    const { reference, customer, amount } = event.data;
    const customerEmail = customer.email;
    const amountInUSD = amount / 100 / 100; // Paystack sends in kobo/cents; adjust for USD if needed

    console.log(`[PAYSTACK WEBHOOK] Success for Reference: ${reference}, Email: ${customerEmail}, Amount: ${amountInUSD}`);

    try {
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, customerEmail);

        if (!userRow) {
            console.error(`[PAYSTACK WEBHOOK] User not found for email: ${customerEmail}`);
            return res.status(404).send('User not found.');
        }

        // Determine Account Size based on amount
        let accountSize = 0;
        if (amountInUSD >= 2 && amountInUSD <= 20) accountSize = 100;
        else if (amountInUSD > 20 && amountInUSD <= 40) accountSize = 200; 
        else if (amountInUSD > 40 && amountInUSD <= 100) accountSize = 500;
        else if (amountInUSD > 100) accountSize = 1000;

        // Update User Data
        userRow.AccountSize = accountSize;
        userRow.ContractStatus = 'Unsigned'; // Reset to prompt contract signing
        userRow.PaystackReference = reference;
        const today = new Date();
        const expiryDate = new Date(today);
        expiryDate.setDate(today.getDate() + 30); // Default 30-day expiry
        
        userRow.ContractExpiry = expiryDate.toISOString().split('T')[0];
        userRow.PayoutDate = 'Monthly';

        await userRow.save();
        
        // Send contract email again after purchase
        await sendWelcomeEmail(customerEmail, userRow.Name);

        res.status(200).send('Webhook received and spreadsheet updated.');

    } catch (error) {
        console.error('Paystack Webhook Error:', error);
        res.status(500).send('Server error processing webhook.');
    }
});

/**
 * @route POST /verify-payment
 * @desc Verify Paystack transaction (for frontend-initiated verification).
 */
app.post('/verify-payment', async (req, res) => {
    const { reference, email } = req.body;
    if (!reference || !email) {
        return res.status(400).json({ message: 'Missing transaction reference or user email.' });
    }

    try {
        // Verify transaction with Paystack
        const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        });

        const transaction = paystackResponse.data.data;
        if (transaction.status !== 'success') {
            return res.status(402).json({ message: 'Payment verification failed or transaction not successful.' });
        }

        // Update sheet similar to webhook
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, email);

        if (!userRow) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const amountInUSD = transaction.amount / 100 / 100;
        let accountSize = 0;
        if (amountInUSD >= 2 && amountInUSD <= 20) accountSize = 100;
        else if (amountInUSD > 20 && amountInUSD <= 40) accountSize = 200; 
        else if (amountInUSD > 40 && amountInUSD <= 100) accountSize = 500;
        else if (amountInUSD > 100) accountSize = 1000;

        userRow.AccountSize = accountSize;
        userRow.ContractStatus = 'Unsigned';
        userRow.PaystackReference = reference;
        const today = new Date();
        const expiryDate = new Date(today);
        expiryDate.setDate(today.getDate() + 30);
        
        userRow.ContractExpiry = expiryDate.toISOString().split('T')[0];
        userRow.PayoutDate = 'Monthly';

        await userRow.save();
        
        await sendWelcomeEmail(email, userRow.Name);

        res.status(200).json({ message: 'Payment verified and account updated successfully.' });

    } catch (error) {
        console.error('Verify Payment Error:', error);
        if (error.response && error.response.status === 404) {
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        res.status(500).json({ message: 'Server error during payment verification.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Nexa Backend listening on port ${port}`);
    console.log(`Paystack Webhook URL: https://nexa-backend-3wxt.onrender.com/paystack-webhook`);
});
