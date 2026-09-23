const nodemailer = require('nodemailer');

const sendPasswordResetEmail = async (email, newPassword) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('Email not configured. New password:', newPassword);
    return { message: 'Email not configured, password logged to console' };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #2563eb;">إعادة تعيين كلمة المرور - قرّب</h2>
      <p>مرحباً،</p>
      <p>تم إعادة تعيين كلمة المرور الخاصة بك.</p>
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px;">
        <p><strong>كلمة المرور الجديدة:</strong> <span style="color: #2563eb; font-size: 18px;">${newPassword}</span></p>
      </div>
      <p style="color: #dc2626;">يرجى تغيير كلمة المرور فور تسجيل الدخول.</p>
      <p style="color: #6b7280; font-size: 12px;">فريق قرّب</p>
    </div>
  `;

  return transporter.sendMail({
    from: `"Qarrab" <${process.env.SMTP_USER}>`,
    to: email,
    subject: 'إعادة تعيين كلمة المرور - قرّب',
    html
  });
};

module.exports = { sendPasswordResetEmail };
