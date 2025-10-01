// server.js
const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const cors = require('cors');
const { google } = require('googleapis');
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
const axios = require('axios');
const path = require('path');
require('dotenv').config(); // Use .env file for secrets

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: 'YOUR_FRONTEND_URL', // e.g., https://mynexa.pages.dev
    methods: ['GET', 'POST'],
    credentials: true,
}));
app.use(bodyParser.json());

// --- CONFIGURATION ---
const GOOGLE_SHEET_ID = 'YOUR_GOOGLE_SHEET_ID'; // The ID from your sheet URL
const PAYSTACK_SECRET_KEY = 'YOUR_PAYSTACK_SECRET_KEY';
const MAILERSEND_API_KEY = 'YOUR_MAILERSEND_API_KEY';
const CONTRACT_LINK = 'https://docuseal.com/d/w4aYAR5LfBb41G';
const KYC_LINK = 'https://forms.gle/esMxwUYE3fMVG1qn6';
const BACKEND_URL = 'https://nexa-backend-3wxt.onrender.com';

// Google Sheets Auth Setup (Service Account)
const auth = new google.auth.GoogleAuth({
    keyFile: path.join(__dirname, 'YOUR_SERVICE_ACCOUNT_KEY_FILE.json'), // NOTE: You must upload this file to Render!
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

const mailersend = new MailerSend({ apiKey: MAILERSEND_API_KEY });

// --- HELPER FUNCTION: Get Row by Email ---
async function findUserRowByEmail(email) {
    const response = await sheets.spreadsheets.values.get({
        spreadsheetId: GOOGLE_SHEET_ID,
        range: 'Users!A:E', // Assuming columns A-E are Name, Email, Hash, Contract Status, KYC Status
    });
    const rows = response.data.values;
    if (!rows || rows.length < 2) return { row: null, index: -1 };

    // Start from row index 1 to skip headers
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][1] === email) { // Column B (index 1) is Email
            return { row: rows[i], index: i + 1 }; // i + 1 is the actual sheet row number
        }
    }
    return { row: null, index: -1 };
}

// --- API ENDPOINTS ---

/**
 * POST /signup
 * Creates a new user, hashes the password, writes to Google Sheet, and sends email.
 */
app.post('/signup', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ message: 'Missing required fields.' });
    }

    try {
        const { row } = await findUserRowByEmail(email);
        if (row) {
            return res.status(409).json({ message: 'User already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const initialStatus = ['Unsigned', 'Pending', '0', '']; // Contract, KYC, Account Size, Transaction Ref

        // 1. Write to Google Sheet (A: Name, B: Email, C: Hash, D: Contract, E: KYC, F: Size, G: Ref)
        const newRow = [name, email, hashedPassword, ...initialStatus];
        await sheets.spreadsheets.values.append({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: 'Users!A:G',
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] },
        });

        // 2. Send Welcome Email with Links
        const mailersendSender = new Sender("test@nexa.com", "Nexa Platform"); // Replace with your verified sender
        const mailersendRecipients = [new Recipient(email, name)];
        
        const emailParams = new EmailParams()
            .setFrom(mailersendSender)
            .setTo(mailersendRecipients)
            .setSubject("Welcome to Nexa! Important Next Steps")
            .setHtml(`
                <p>Hello ${name},</p>
                <p>Welcome to Nexa! Your account has been created successfully. To proceed, please sign your contract and complete the KYC form:</p>
                <p>1. **Sign Contract:** <a href="${CONTRACT_LINK}" target="_blank">${CONTRACT_LINK}</a></p>
                <p>2. **Complete KYC:** <a href="${KYC_LINK}" target="_blank">${KYC_LINK}</a></p>
                <p>You can now log in to the dashboard to purchase a challenge.</p>
                <p>Thanks,</p>
                <p>The Nexa Team</p>
            `);

        await mailersend.email.send(emailParams);

        // 3. Send Success Response (redirect handled by frontend)
        res.status(200).json({ message: 'Signup successful. Please check your email and log in.' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'Internal server error during signup.', details: error.message });
    }
});

/**
 * POST /login
 * Authenticates user and returns dashboard data.
 */
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Missing email or password.' });
    }

    try {
        const { row } = await findUserRowByEmail(email);
        if (!row) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const [name, storedEmail, storedHash, contractStatus, kycStatus, accountSize, transactionRef] = row;

        const isMatch = await bcrypt.compare(password, storedHash);

        if (isMatch) {
            // Success: Return data for the dashboard
            return res.status(200).json({
                name,
                email: storedEmail,
                contractStatus: contractStatus || 'Unsigned',
                kycStatus: kycStatus || 'Pending',
                accountSize: accountSize || '0',
                transactionRef: transactionRef || '',
                message: 'Login successful.',
            });
        } else {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ message: 'Internal server error during login.', details: error.message });
    }
});

/**
 * POST /verify-payment
 * Verifies Paystack transaction and updates Google Sheet.
 */
app.post('/verify-payment', async (req, res) => {
    const { reference, email } = req.body;
    if (!reference || !email) {
        return res.status(400).json({ message: 'Missing transaction reference or user email.' });
    }

    try {
        // 1. Find the user's row in the sheet
        const { row, index } = await findUserRowByEmail(email);
        if (!row) {
            return res.status(404).json({ message: 'User not found in database.' });
        }

        // 2. Verify transaction with Paystack
        const paystackResponse = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        });

        const transaction = paystackResponse.data.data;
        if (transaction.status !== 'success') {
            return res.status(402).json({ message: 'Payment verification failed or transaction not successful.' });
        }

        // 3. Determine Funded Account Size (Logic based on your Paystack Shop product setup)
        // This is a crucial area. You must match the amount/metadata to an account size.
        // Assuming your Paystack product name or description contains the funded size (e.g., "$100 Challenge")
        const productDescription = transaction.metadata?.custom_fields?.find(f => f.variable_name === 'product_name')?.value || transaction.plan || 'UNKNOWN';
        let accountSize = '0';
        
        // Simple logic based on price points or product name
        if (productDescription.includes('$100')) accountSize = '100';
        else if (productDescription.includes('$200')) accountSize = '200';
        else if (productDescription.includes('$500')) accountSize = '500';
        else if (productDescription.includes('$1,000')) accountSize = '1000';
        // Add more robust matching based on your Paystack implementation

        if (accountSize === '0') {
            console.warn('Could not determine account size from transaction metadata:', transaction);
            return res.status(400).json({ message: 'Could not determine challenge size from payment details.' });
        }
        
        // 4. Update Google Sheet
        const newValues = [
            ['Challenge Started', accountSize, reference]
        ];
        
        // Update columns D (Contract Status), F (Account Size), G (Transaction Ref) for the found row
        const updateRange = `Users!D${index}:G${index}`; 
        
        await sheets.spreadsheets.values.update({
            spreadsheetId: GOOGLE_SHEET_ID,
            range: updateRange,
            valueInputOption: 'USER_ENTERED',
            resource: { values: newValues },
        });

        // 5. Send Success Response
        res.status(200).json({
            message: 'Payment verified and account updated.',
            accountSize: accountSize,
            transactionRef: reference,
        });

    } catch (error) {
        console.error('Payment Verification Error:', error);
        // Check for specific Paystack errors (4xx codes)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
            return res.status(400).json({ message: 'Paystack verification failed.', details: error.response.data.message });
        }
        res.status(500).json({ message: 'Internal server error during payment verification.', details: error.message });
    }
});


// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
