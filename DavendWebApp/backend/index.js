import express from 'express';
import nodemailer from 'nodemailer';
import cors from 'cors';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: ['http://localhost:4200', 'https://davendwebapp.onrender.com'], // Render URL here
    methods: ['GET', 'POST'],
    credentials: true
  }));
  
app.use(bodyParser.json());

// Health check route
app.get('/', (req, res) => {
    res.send('Davend Email Backend Running ✔️');
  });

app.post('/service-send-email', upload.single('designFile'), async (req, res) => {
  const {
    fullName,
    email,
    phoneNumber,
    message,
    selectedService
  } = req.body;

  const file = req.file; // Access the uploaded file

  if (!fullName || !email || !phoneNumber || !message || !selectedService || !file) {
    return res.status(400).json({ message: 'Missing required fields or file' });
  }

  try {
    const testAccount = await nodemailer.createTestAccount();

    const transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure, // true for 465, false for other ports
    auth: {
        user: testAccount.user, // CHANGE BOTH USERNAME AND PASSWORD AFTER PRODUCTION
        pass: testAccount.pass
    },
    tls: {
      rejectUnauthorized: false // DO NOT ALLOW THIS AFTER PRODUCTION (ONLY FOR TESTING PURPOSES)
    }
    });

    const mailOptions = {
      from: `"${fullName}" <${email}>`,
      to: 'example@gmail.com',
      subject: `${selectedService} - Service Request`,
      text: `
        Service Requested: ${selectedService}
        Full Name: ${fullName}
        Email: ${email}
        Phone Number: ${phoneNumber}

        Message:
        ${message}
      `,
      attachments: [
        {
          filename: file.originalname,
          content: file.buffer // Use the buffer of the uploaded file
        }
      ]
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ Email sent');
    console.log('🔍 Preview URL:', nodemailer.getTestMessageUrl(info));

    res.status(200).json({
      message: 'Email sent successfully!',
      preview: nodemailer.getTestMessageUrl(info)
    });

  } catch (error) {
    console.error('❌ Email send failed:', error);
    res.status(500).json({ message: 'Failed to send email.' });
  }
});

// Contact: optional file
app.post('/contact-send-email', upload.single('attachment'), async (req, res) => {
  const { fullName, email, subject, message } = req.body;
  const file = req.file ?? null;

  if (!fullName || !email || !subject || !message) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    // For dev/demo: ephemeral test account.
    // In prod, switch to your real SMTP creds in env.
    const testAccount = await nodemailer.createTestAccount();

    const transporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
      tls: { rejectUnauthorized: false } // DEV ONLY
    });

    const mailOptions = {
      from: `"${fullName}" <${email}>`,
      to: 'example@gmail.com',
      subject: `[Contact] ${subject}`,
      text:
`From: ${fullName}
Email: ${email}

Message:
${message}`,
    };

    if (file) {
      mailOptions.attachments = [{
        filename: file.originalname,
        content: file.buffer
      }];
    }

    const info = await transporter.sendMail(mailOptions);
    res.status(200).json({
      message: 'Contact email sent!',
      preview: nodemailer.getTestMessageUrl(info)
    });
  } catch (err) {
    console.error('❌ Contact send failed:', err);
    res.status(500).json({ message: 'Failed to send contact email.' });
  }
});


app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
