import nodemailer from "nodemailer";

type MeetingInvitation = {
  recipientEmail: string;
  recipientName: string;
  meetingTitle: string;
  date: string;
  organizer: string;
  location: string | null;
  agenda: string[];
  meetingId: string;
  conferenceUrl?: string | null;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char] ?? char));
}

export async function sendMeetingInvitation(invitation: MeetingInvitation): Promise<void> {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://institutional-governance-ai.vercel.app").replace(/\/$/, "");

  if (!user || !appPassword) {
    throw new Error("Email invitations are not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD on the server.");
  }

  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass: appPassword } });
  const meetingUrl = `${siteUrl}/meetings/${encodeURIComponent(invitation.meetingId)}`;
  const joinUrl = invitation.conferenceUrl || `${siteUrl}/meetings/${encodeURIComponent(invitation.meetingId)}/join`;
  const agendaText = invitation.agenda.length ? invitation.agenda.map((item) => `- ${item}`).join("\n") : "No agenda has been added yet.";
  const agendaHtml = invitation.agenda.length ? invitation.agenda.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>No agenda has been added yet.</li>";
  const onlineText = invitation.conferenceUrl ? `\nJoin online: ${invitation.conferenceUrl}\n` : "";
  const onlineHtml = invitation.conferenceUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(invitation.conferenceUrl)}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Join online meeting</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(invitation.conferenceUrl)}</p>` : "";

  try {
    await transporter.sendMail({
      from: `Institutional Governance <${user}>`,
      to: invitation.recipientEmail,
      subject: `Meeting invitation: ${invitation.meetingTitle}`,
      text: [`Hello ${invitation.recipientName || invitation.recipientEmail},`, "", `You are invited to ${invitation.meetingTitle}.`, `Date and time: ${invitation.date}`, `Organizer: ${invitation.organizer}`, `Location: ${invitation.location || "Online"}`, onlineText, "Agenda:", agendaText, "", `Open meeting: ${meetingUrl}`, `Join online: ${joinUrl}`].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto"><h2>Institutional Governance</h2><p>Hello ${escapeHtml(invitation.recipientName || invitation.recipientEmail)},</p><p>You are invited to <strong>${escapeHtml(invitation.meetingTitle)}</strong>.</p><p><strong>Date and time:</strong> ${escapeHtml(invitation.date)}<br><strong>Organizer:</strong> ${escapeHtml(invitation.organizer)}<br><strong>Location:</strong> ${escapeHtml(invitation.location || (invitation.conferenceUrl ? "Online" : "Not specified"))}</p>${onlineHtml}<h3>Agenda</h3><ul>${agendaHtml}</ul><p style="margin:28px 0"><a href="${meetingUrl}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Open meeting record</a></p><p style="font-size:13px;color:#666">You may be asked to sign in before viewing the meeting record.</p></div>`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`Invitation email could not be sent: ${message}`);
  } finally {
    transporter.close();
  }
}
