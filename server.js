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
console.log('Resend availability:', resend ? '✅ Available' : '❌ No API key set');

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

  // If Resend is available, try it first (better for cloud hosting)
  if (resend) {
    try {
      console.log('Trying Resend first (cloud-optimized)...');
      const result = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: process.env.EMAIL_USER,
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
      
      console.log('Email sent via Resend:', result);
      return res.json({ 
        success: true, 
        message: 'Email sent successfully via Resend!',
        provider: 'resend'
      });
    } catch (resendErr) {
      console.log('Resend failed, falling back to SMTP:', resendErr.message);
    }
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
      console.log(`Attempting SMTP config ${i + 1}:`, {
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
      console.log(`Email sent successfully using config ${i + 1}`);
      return res.json({ 
        success: true, 
        message: 'Email sent successfully!',
        configUsed: i + 1 
      });
    } catch (err) {
      console.log(`SMTP config ${i + 1} failed:`, err.code, err.message);
      if (i === smtpConfigs.length - 1) {
        // All SMTP configs failed, try Resend as fallback
        if (resend) {
          try {
            console.log('🔄 All SMTP failed, trying Resend fallback...');
            const result = await resend.emails.send({
              from: 'onboarding@resend.dev', // Default Resend sender
              to: process.env.EMAIL_USER,
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
            
            console.log('✅ Email sent via Resend fallback:', result);
            return res.json({ 
              success: true, 
              message: 'Email sent successfully via Resend!',
              provider: 'resend'
            });
          } catch (resendErr) {
            console.error('❌ Resend fallback also failed:', resendErr.message);
          }
        } else {
          console.log('⚠️ No Resend API key available for fallback');
        }
        
        // All methods failed
        console.error('💥 All email methods exhausted');
        return res.status(500).json({ 
          success: false,
          error: 'Failed to send email', 
          detail: resend ? 
            'Both SMTP and Resend failed on cloud hosting.' : 
            'SMTP failed and no Resend API key configured.',
          suggestion: resend ? 
            'Try a different cloud email service or check your credentials.' :
            '🚀 Quick fix: Get a free Resend API key from resend.com and add RESEND_API_KEY to your environment variables.'
        });
      }
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
