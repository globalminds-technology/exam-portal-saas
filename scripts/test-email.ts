import dotenv from 'dotenv';
dotenv.config();

import nodemailer from 'nodemailer';

async function testBrevoEmail() {
  console.log('--- Testing Brevo SMTP Configuration ---');
  console.log('SMTP_HOST:', process.env.SMTP_HOST);
  console.log('SMTP_PORT:', process.env.SMTP_PORT);
  console.log('SMTP_USER:', process.env.SMTP_USER);
  console.log('SMTP_FROM:', process.env.SMTP_FROM);

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('\n❌ Missing Brevo SMTP credentials in .env file!');
    console.error('Please configure SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    console.log('\n1. Verifying SMTP connection to Brevo...');
    await transporter.verify();
    console.log('✓ Successfully connected and authenticated with Brevo SMTP server!');

    const testRecipient = process.argv[2] || process.env.SMTP_USER;
    console.log(`\n2. Sending test email to: ${testRecipient}...`);

    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: testRecipient,
      subject: 'GLOBAL MINDS — Brevo SMTP Integration Test',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2563eb;">Brevo SMTP is Connected Successfully!</h2>
          <p>This is a verification email from your <strong>Examination System SaaS</strong> platform.</p>
          <p>Candidate login credentials and portal links will now be dispatched automatically.</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 15px 0;" />
          <small style="color: #64748b;">Timestamp: ${new Date().toISOString()}</small>
        </div>
      `,
    });

    console.log('✓ Test email dispatched successfully!');
    console.log('Message ID:', info.messageId);
    console.log('Accepted recipients:', info.accepted);
  } catch (error: any) {
    console.error('\n❌ Brevo SMTP test failed:', error.message);
  }
}

testBrevoEmail();
