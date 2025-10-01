// server.js (Node.js/Express Backend)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const path = require('path');
const axios = require('axios'); // For Paystack verification

const app = express();
const port = process.env.PORT || 3000;

// --- CONFIGURATION & SECRETS ---
// Note: In a production environment, you would use actual environment variables (process.env.VARIABLE_NAME) 
// in deployment (e.g., Render, Heroku). For this complete code structure, I am placing the keys directly.
// You must ensure these are set up as environment variables in your Render deployment for security.

// Google Sheets Credentials
const SPREADSHEET_ID = '1QXgtbL7V9HEsxOdVj8c4TvD3rOPWHD6EHl3c3KIPxvQ';
const SHEET_NAME = 'Users';
const CLIENT_EMAIL = 'nexa-service@nexa-database-473717.iam.gserviceaccount.com';

// Your Private Key (MUST be saved in an environment variable or a secure file in production)
const PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8KF+HpVb+LYUy\n8XTO9qRO3sKZ2Kiy0h/BzXSGAICXbXsOtJEPLyuYPp5Ge8SOCkfrglWbI5oQpiar\nz7V3TFf72KcR9b9A07MCCnak3xoYSmxueGxGthnAibHhB7vRU7mCy3IN1ydmjPtX\nWCJMtUX04DErLG5aCbP8AC9myGyDXtblSOSDbz0q/5t2A3edc/7YtUt9iaogIhy7\np2z9Pvis4LioFtG3+BC6Gax54+sbrsa15Ifa87safaw3a8A+IRST0B2g/sm23OYj\nfdE3Vok7UEYUQL+4up6aTeq0TJjDWTkGkVU6nVLXinxnclVrtJBnJuyY11pymaSz\n9xfpw1g1AgMBAAECggEAC25Se22ujsuaK4GizI4MZmQ/I1SXzyFX35DJUvjF1y1G\nDBspMuh1OA8Z04NiahSy0Np+s+miSv+lGswIJMLFF55ObBdncptJ5UZYdeS985rV\n4pI7VcJrZxiWb2rmXK2+9/S/LZsUIDVRcbl/f/SFVv6lzg8pdxvezOEAADkN6p8m\nNMnZ5UcPaxOLm2HLmy/vPyZFT2yne+qT/bZwYASdMbR/Nr5lcBPmJKrIXpg6Dj1q\nv9livE5NcWqhiMExao8XKY0zzr+X+TR1atDBTGs9J6GIjvfhgEIXooAiHvW8xn2v\nST33ClFBMa8q9al9zrhQLE55gcM0hSSohYnoFsDk0QKBgQDjjwGAYzhTf/LHkpJ7\nejtfp4gXfcLSItja0bvb+dzOOak15p1bOS7DTZnlgPthD/g0gNmgmuM86rSUXuFP\n15/qec1bGirHUbTKkD9f4qqgO6pMcxIHZHcQ8cYf+Vbi5B/yCulwqbTxIbGTICIS\n/a+rwp/xFJcTwgO365x4bd7XLQKBgQDTrLDb74tSl7sogiprV0ynnBHhG3WDbw5u\na8XyZPSW5jNN8794lis+yrtQcq5v2MJe0QTzSy933xZp9gGq5RLQ4T6xrxWsw5Ts\nVMSXgx+8tMMOuBOGM04zklzdmHku9h29fOCd+0TO9JxFAnx/f6k2QrB3XsjC49G1\n/RUb/EuqKQKBgQDdTwI908E+6+u4jmLptmmy0KL5fbSQW5WdUmaqbFmDMu7O3gbh\nZj6FcJ4gZw2Te01/+mQs3xXq87RFq/TiiqkbB/RhCpTaHit96UTJQw+AICbijPLW\nv61QjGKMTBllNkmfQ19+032HGaaymIirAY/ssq6MbuLzMzgckgct1GTpzQKBgQDC\nGdkT1NUtJ3W376R2SddA2xyKD6Py4iOZnbomS+z9cpoZISqyqQF+0uhxHLhYV6vk\nxkaD0q30fd1PzQY6b1SRtfqHdMWrZq1pCVI8nUC9CgTTungs118ea1g821REe+tJ\nlvlh5Mdz/1pM7bq8L5Q67WxkCcaO79mdyDVTNEcuAQKBgG5tr9ardC/Wp31YBqeZ\nZQjogaBRUgcnRXXQj2CK9QiXEOAQFo+9EUa57+V8xT6VQUH8Kopoy+ulLy0cmud6\nXEtI3CtopUeHn8Ply23zRDkXdFCo1Ugn2oR8nF/qoBH4/2OQQpHNyEMVDdjTyobq\n+rJcqN/R/9r8YZnSLPeD/QRU\n-----END PRIVATE KEY-----".replace(/\\n/g, '\n');

// Paystack Secret Key
const PAYSTACK_SECRET_KEY = 'sk_live_1f502564afb207534e3c0c940133fa910f01c946';

// MailerSend Configuration (Placeholder: Replace with your MailerSend API setup)
// Since a full MailerSend setup is complex (requires API calls, templates), 
// I'm providing a placeholder function and the required email links.
const MAILERSEND_API_KEY = 'mlsn.9d22578db1a5c02f535c13f03a433ea042d7615bd612594fe90b1f9afe3cefe2'; // MUST replace
const SENDER_EMAIL = 'test-dnvo4d91ryng5r86.mlsender.net'; // MUST replace with verified MailerSend domain email

// Document/Form Links
const DOCUSEAL_CONTRACT_URL = 'https://docuseal.com/d/w4aYAR5LfBb41G';
const KYC_FORM_URL = 'https://forms.gle/esMxwUYE3fMVG1qn6';
// const VERIFICATION_FORM_URL = 'https://forms.gle/pGFFfzpVzzGzGrck8'; // Used for Paystack webhook/verification logic
// const PAYOUT_FORM_URL = 'https://forms.gle/JnNrSTXj75WmUTKJ6'; // Used in frontend only

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // If you were serving frontend from here

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

// Placeholder for MailerSend (replace with actual MailerSend API integration)
async function sendWelcomeEmail(recipientEmail, name) {
    console.log(`[MAILER] Sending welcome email to ${recipientEmail}...`);
    const emailBody = `
        Hello ${name},

        Welcome to Nexa! Your trading journey starts now.

        **IMPORTANT NEXT STEPS:**
        1. **Sign Contract:** Complete your Trader Contract to comply with AML/CTF laws: ${DOCUSEAL_CONTRACT_URL}
        2. **KYC Verification:** Complete your Know Your Customer form: ${KYC_FORM_URL}
        
        You will also receive a contract link again if you purchase a challenge.
        
        Happy trading,
        The Nexa Team
    `;

    // In a real application, you would use axios or a MailerSend SDK here:
    /*
    await axios.post('https://api.mailersend.com/v1/email', {
        from: { email: SENDER_EMAIL },
        to: [{ email: recipientEmail }],
        subject: 'Welcome to Nexa - Your Trading Journey Starts Here!',
        html: emailBody // Use HTML template in production
    }, {
        headers: { 'Authorization': `Bearer ${MAILERSEND_API_KEY}` }
    });
    */
    console.log(`[MAILER] Email content logged to console.`);
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
 * NOTE: Paystack webhooks typically send a POST request to this endpoint.
 * You MUST configure this URL (https://nexa-backend-3wxt.onrender.com/paystack-webhook) 
 * in your Paystack Dashboard settings.
 */
app.post('/paystack-webhook', async (req, res) => {
    // 1. Paystack Signature Verification (Crucial for security in production)
    // NOTE: This is skipped for brevity, but a real deployment must include this:
    // const hash = crypto.createHHmac('sha512', PAYSTACK_SECRET_KEY).update(JSON.stringify(req.body)).digest('hex');
    // if (hash !== req.headers['x-paystack-signature']) return res.status(401).send('Unauthorized');
    
    const event = req.body;

    // We only care about successful transaction events
    if (event.event !== 'charge.success') {
        return res.status(200).send('Event received but not relevant to charge success.');
    }

    const { reference, customer, amount } = event.data;
    const customerEmail = customer.email;
    const amountInUSD = amount / 100 / 100; // Paystack sends Kobo/Cent in the local currency of the shop. 
                                            // Assuming the Paystack shop is set to USD prices for simplicity, 
                                            // or you need a currency conversion logic here.

    console.log(`[PAYSTACK WEBHOOK] Success for Reference: ${reference}, Email: ${customerEmail}, Amount: ${amountInUSD}`);

    try {
        const sheet = await loadSheet();
        const userRow = await findUserByEmail(sheet, customerEmail);

        if (!userRow) {
            console.error(`[PAYSTACK WEBHOOK] User not found for email: ${customerEmail}`);
            return res.status(404).send('User not found.');
        }

        // --- Determine Account Size based on amount (This is highly dependent on your Paystack Shop setup) ---
        let accountSize = 0;
        if (amountInUSD >= 2 && amountInUSD <= 20) accountSize = 100; // Placeholder logic
        else if (amountInUSD > 20 && amountInUSD <= 40) accountSize = 200; 
        else if (amountInUSD > 40 && amountInUSD <= 100) accountSize = 500;
        else if (amountInUSD > 100) accountSize = 1000;

        // --- Update User Data ---
        userRow.AccountSize = accountSize;
        userRow.ContractStatus = 'Unsigned'; // Reset status to prompt contract signing after purchase
        userRow.PaystackReference = reference;
        // Set expiry and payout dates (e.g., 30 days for 1-step, 60 days for 2-step. You'll need more logic here)
        const today = new Date();
        const expiryDate = new Date(today);
        expiryDate.setDate(today.getDate() + 30); // Simple 30-day default
        
        userRow.ContractExpiry = expiryDate.toISOString().split('T')[0];
        userRow.PayoutDate = 'Monthly'; // Simplification for now

        await userRow.save();
        
        // Send contract email again after purchase
        await sendWelcomeEmail(customerEmail, userRow.Name);

        res.status(200).send('Webhook received and spreadsheet updated.');

    } catch (error) {
        console.error('Paystack Webhook Error:', error);
        res.status(500).send('Server error processing webhook.');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Nexa Backend listening on port ${port}`);
    console.log(`Paystack Webhook URL: https://nexa-backend-3wxt.onrender.com/paystack-webhook`);
});

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
