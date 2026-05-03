const Contact = require("../models/contact.js");
const { sendEmail } = require("../services/emailService.js");

/**
 * POST /api/contact
 * Body: { name, email, phone, message }
 * Saves enquiry to DB, then attempts to send notification emails via Brevo API.
 */
exports.handleContactForm = async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { name, email, phone, message } = body;

    if (!email || !phone) {
      return res.status(400).json({ success: false, message: "Email and phone number are required." });
    }

    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(String(email).trim())) {
      return res.status(400).json({ success: false, message: "Please provide a valid email address." });
    }

    // Always save to DB first
    const contact = await Contact.create({
      name: name || "",
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      message: message || "",
      emailSent: false,
    });

    // Attempt to send emails
    let emailSent = false;
    try {
      const devEmail = process.env.DEVELOPER_EMAIL || "mfaaiznaved786@gmail.com";
      const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

      // Email to developer
      await sendEmail({
        to: devEmail,
        subject: `🚀 New Integration Enquiry from ${name || email}`,
        senderName: "ChatSphere Contact",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;
            background:#0f1117;color:#e2e8f0;border-radius:12px;">
            <h2 style="color:#2dd4bf;margin:0 0 16px">New Integration Enquiry</h2>
            <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;">Received on ${now}</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8;width:120px">Name</td>
                  <td style="padding:10px 0;border-bottom:1px solid #1e293b">${name || "Not provided"}</td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8">Email</td>
                  <td style="padding:10px 0;border-bottom:1px solid #1e293b">
                    <a href="mailto:${email}" style="color:#2dd4bf">${email}</a></td></tr>
              <tr><td style="padding:10px 0;border-bottom:1px solid #1e293b;color:#94a3b8">Phone</td>
                  <td style="padding:10px 0;border-bottom:1px solid #1e293b">${phone}</td></tr>
              <tr><td style="padding:10px 0;color:#94a3b8;vertical-align:top">Message</td>
                  <td style="padding:10px 0">${message || "No message provided."}</td></tr>
            </table>
          </div>
        `,
      });

      // Thank-you email to sender
      await sendEmail({
        to: email,
        subject: "We received your enquiry — ChatSphere",
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px;
            background:#0f1117;color:#e2e8f0;border-radius:12px;">
            <h2 style="margin:0 0 16px;color:#2dd4bf">ChatSphere</h2>
            <h3 style="margin:0 0 12px">Thank you, ${name || "there"}! 🎉</h3>
            <p style="color:#94a3b8;line-height:1.7;margin:0 0 20px">
              We've received your integration enquiry and will get back to you shortly
              at <strong style="color:#e2e8f0">${email}</strong>.
            </p>
            <p style="color:#64748b;font-size:13px;margin:0">— The ChatSphere Team</p>
          </div>
        `,
      });

      emailSent = true;
    } catch (mailErr) {
      console.log("contact form mail error (saved to DB):", mailErr.message);
    }

    if (emailSent) {
      contact.emailSent = true;
      await contact.save();
    }

    return res.json({
      success: true,
      message: emailSent
        ? "Thank you! We will reach out to you soon."
        : "Thank you! Your enquiry has been saved. We will contact you shortly.",
    });
  } catch (err) {
    console.error("contact form error:", err);
    return res.status(500).json({ success: false, message: "Failed to send message. Please try again." });
  }
};
