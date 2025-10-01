const express = require('express');
const { google } = require('googleapis');
const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');
const bcrypt = require('bcrypt');
const cors = require('cors');
const Paystack = require('paystack')('sk_live_1f502564afb207534e3c0c940133fa910f01c946'); // Your Paystack secret key

const app = express();
app.use(cors());
app.use(express.json());

const sheets = google.sheets('v4');
const auth = new google.auth.GoogleAuth({
    credentials: {
        client_email: 'nexa-service@nexa-database-473717.iam.gserviceaccount.com',
        private_key: `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC8KF+HpVb+LYUy\n8XTO9qRO3sKZ2Kiy0h/BzXSGAICXbXsOtJEPLyuYPp5Ge8SOCkfrglWbI5oQpiar\nz7V3TFf72KcR9b9A07MCCnak3xoYSmxueGxGthnAibHhB7vRU7mCy3IN1ydmjPtX\nWCJMtUX04DErLG5aCbP8AC9myGyDXtblSOSDbz0q/5t2A3edc/7YtUt9iaogIhy7\np2z9Pvis4LioFtG3+BC6Gax54+sbrsa15Ifa87safaw3a8A+IRST0B2g/sm23OYj\nfdE3Vok7UEYUQL+4up6aTeq0TJjDWTkGkVU6nVLXinxnclVrtJBnJuyY11pymaSz\n9xfpw1g1AgMBAAECggEAC25Se22ujsuaK4GizI4MZmQ/I1SXzyFX35DJUvjF1y1G\nDBspMuh1OA8Z04NiahSy0Np+s+miSv+lGswIJML
