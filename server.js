// server.js
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
// Simple health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// POST /contact endpoint
app.post('/contact', async (req, res) => {
  const { name, email, phone, businessType, message } = req.body;
  if (!name || !email || !phone || !businessType || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Try multiple SMTP configurations for better cloud compatibility
  const smtpConfigs = [
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true, // SSL
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    },
    {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    },
    {
      service: 'gmail',
      port: 2587, // Alternative port
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    }
  ];

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_USER,
    subject: 'New Project Enquiry from Abvius Portfolio',
    text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nBusiness Type: ${businessType}\n\nMessage:\n${message}`
  };

  // Try each SMTP config until one works
  for (let i = 0; i < smtpConfigs.length; i++) {
    try {
      const transporter = nodemailer.createTransporter(smtpConfigs[i]);
      await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully using config ${i + 1}`);
      return res.json({ success: true });
    } catch (err) {
      console.log(`SMTP config ${i + 1} failed:`, err.message);
      if (i === smtpConfigs.length - 1) {
        // All configs failed
        console.error('All SMTP configurations failed:', err);
        return res.status(500).json({ 
          error: 'Failed to send email', 
          detail: 'All SMTP configurations failed. Consider using a cloud email service.',
          lastError: err.message 
        });
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
