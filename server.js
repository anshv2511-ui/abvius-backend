// server.js
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize Resend if API key is available
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
console.log('🚀 Server starting...');
console.log('📧 Email configuration:');
console.log('  - EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Missing');
console.log('  - EMAIL_PASS:', process.env.EMAIL_PASS ? '✅ Set' : '❌ Missing');
console.log('  - RESEND_API_KEY:', resend ? '✅ Available' : '❌ Not set');
console.log('  - PORT:', PORT);
console.log('  - NODE_ENV:', process.env.NODE_ENV || 'development');

app.use(cors());
app.use(express.json());

// Root endpoint for basic server check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    endpoints: {
      health: '/health',
      contact: 'POST /contact'
    },
    emailConfig: {
      smtp: process.env.EMAIL_USER ? 'configured' : 'not configured',
      resend: resend ? 'configured' : 'not configured'
    }
  });
});

// Simple health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(), 
    timestamp: Date.now(),
    emailReady: !!(process.env.EMAIL_USER || resend)
  });
});

// POST /contact endpoint
app.post('/contact', async (req, res) => {
  console.log('📨 New contact form submission received');
  console.log('Request body:', req.body);
  
  const { name, email, phone, businessType, message } = req.body;
  
  if (!name || !email || !phone || !businessType || !message) {
    console.log('❌ Missing required fields');
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // If Resend is available, try it first (better for cloud hosting)
  if (resend) {
    try {
      console.log('📤 Attempting to send via Resend...');
      const result = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: process.env.EMAIL_USER || 'test@example.com',
        subject: 'New Project Enquiry from Abvius Portfolio',
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nBusiness Type: ${businessType}\n\nMessage:\n${message}`,
        html: `
          <h3>New Project Enquiry</h3>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Business Type:</strong> ${businessType}</p>
          <h4>Message:</h4>
          <p>${message.replace(/\n/g, '<br>')}</p>
        `
      });
      
      console.log('✅ Email sent successfully via Resend:', result);
      return res.json({ 
        success: true, 
        message: 'Email sent successfully via Resend!',
        provider: 'resend'
      });
    } catch (resendErr) {
      console.error('❌ Resend failed:', resendErr.message);
      console.error('Full error:', resendErr);
      // Continue to SMTP fallback
    }
  }

  // SMTP fallback configurations
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('❌ No EMAIL_USER or EMAIL_PASS configured');
    return res.status(500).json({ 
      success: false,
      error: 'Email service not configured',
      suggestion: 'Please set up EMAIL_USER and EMAIL_PASS or RESEND_API_KEY in environment variables'
    });
  }

  // Try multiple SMTP configurations for better cloud compatibility
  const smtpConfigs = [
    {
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000
    },
    {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
    },
    {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000
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
      console.log(`📤 Attempting SMTP config ${i + 1}/${smtpConfigs.length}:`, {
        service: smtpConfigs[i].service || smtpConfigs[i].host,
        port: smtpConfigs[i].port || 'default',
        secure: smtpConfigs[i].secure
      });
      
      const transporter = nodemailer.createTransport(smtpConfigs[i]);
      
      // Skip verification and try to send directly with timeout
      const sendPromise = transporter.sendMail(mailOptions);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 15 seconds')), 15000)
      );
      
      await Promise.race([sendPromise, timeoutPromise]);
      console.log(`✅ Email sent successfully using SMTP config ${i + 1}`);
      return res.json({ 
        success: true, 
        message: 'Email sent successfully!',
        provider: 'smtp',
        configUsed: i + 1 
      });
    } catch (err) {
      console.log(`❌ SMTP config ${i + 1} failed:`, err.code || err.message);
    }
  }

  // All SMTP methods failed
  console.error('� All email delivery methods failed');
  return res.status(500).json({ 
    success: false,
    error: 'Failed to send email', 
    suggestion: resend ? 
      'All email methods failed. Check Resend API key and Gmail credentials.' :
      '🚀 Recommended: Sign up at resend.com and add RESEND_API_KEY to environment variables for reliable cloud email delivery.'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
