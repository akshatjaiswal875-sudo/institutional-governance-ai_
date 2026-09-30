import nodemailer from "nodemailer";

type ReminderInput = {
  recipientEmail: string;
  recipientName?: string | null;
  meetingTitle: string;
  meetingDate: string;
  organizer: string;
  location?: string | null;
  meetingId: string;
  conferenceUrl?: string | null;
  reminderType: "24h" | "1h" | "15m";
};

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char] ?? char));
}

export async function sendMeetingReminder(input: ReminderInput): Promise<void> {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://institutional-governance-ai.onrender.com").replace(/\/$/, "");
  if (!user || !appPassword) throw new Error("Email reminders are not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD on the server.");

  const labels: Record<ReminderInput["reminderType"], string> = {
    "24h": "24-hour reminder",
    "1h": "1-hour reminder",
    "15m": "15-minute reminder",
  };
  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: appPassword } });
  const meetingUrl = `${siteUrl}/meetings/${encodeURIComponent(input.meetingId)}`;
  const joinUrl = input.conferenceUrl || `${siteUrl}/meetings/${encodeURIComponent(input.meetingId)}/join`;

  try {
    await transporter.sendMail({
      from: `Institutional Governance <${user}>`,
      to: input.recipientEmail,
      subject: `${labels[input.reminderType]}: ${input.meetingTitle}`,
      text: [
        `Hello ${input.recipientName || input.recipientEmail},`,
        "",
        `${input.meetingTitle} is coming up (${labels[input.reminderType]}).`,
        `Date and time: ${input.meetingDate}`,
        `Organizer: ${input.organizer}`,
        `Location: ${input.location || (input.conferenceUrl ? "Online" : "Not specified")}`,
        input.conferenceUrl ? `Join online: ${input.conferenceUrl}` : `Open meeting: ${meetingUrl}`,
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto"><h2>Meeting reminder</h2><p>Hello ${escapeHtml(input.recipientName || input.recipientEmail)},</p><p><strong>${escapeHtml(input.meetingTitle)}</strong> is coming up.</p><p><strong>${escapeHtml(labels[input.reminderType])}</strong><br><strong>Date and time:</strong> ${escapeHtml(input.meetingDate)}<br><strong>Organizer:</strong> ${escapeHtml(input.organizer)}<br><strong>Location:</strong> ${escapeHtml(input.location || (input.conferenceUrl ? "Online" : "Not specified"))}</p><p><a href="${escapeHtml(input.conferenceUrl || joinUrl)}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">${input.conferenceUrl ? "Join online meeting" : "Open meeting"}</a></p></div>`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`Meeting reminder could not be sent: ${message}`);
  } finally {
    transporter.close();
  }
}
