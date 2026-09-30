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

type MeetingDeclineNotification = {
  organizerEmail: string;
  participantName: string;
  participantEmail: string;
  meetingTitle: string;
  meetingId: string;
  date: string;
  reason: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '\"': "&quot;" }[char] ?? char));
}

function createTransporter() {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();
  if (!user || !appPassword) {
    throw new Error("Email notifications are not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD on the server.");
  }
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user, pass: appPassword },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return { user, transporter };
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://institutional-governance-ai.onrender.com").replace(/\/$/, "");
}

export async function sendMeetingInvitation(invitation: MeetingInvitation): Promise<void> {
  const { user, transporter } = createTransporter();
  const siteUrl = getSiteUrl();
  const meetingUrl = `${siteUrl}/meetings/${encodeURIComponent(invitation.meetingId)}`;
  const joinUrl = invitation.conferenceUrl || `${siteUrl}/meetings/${encodeURIComponent(invitation.meetingId)}/join`;
  const declineUrl = `${siteUrl}/meetings/${encodeURIComponent(invitation.meetingId)}/decline`;
  const agendaText = invitation.agenda.length ? invitation.agenda.map((item) => `- ${item}`).join("\n") : "No agenda has been added yet.";
  const agendaHtml = invitation.agenda.length ? invitation.agenda.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>No agenda has been added yet.</li>";
  const onlineText = invitation.conferenceUrl ? `\nJoin online: ${invitation.conferenceUrl}\n` : "";
  const onlineHtml = invitation.conferenceUrl ? `<p style="margin:24px 0"><a href="${escapeHtml(invitation.conferenceUrl)}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Join online meeting</a></p><p style="font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(invitation.conferenceUrl)}</p>` : "";

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `Institutional Governance <${user}>`,
      to: invitation.recipientEmail,
      subject: `Meeting invitation: ${invitation.meetingTitle}`,
      text: [`Hello ${invitation.recipientName || invitation.recipientEmail},`, "", `You are invited to ${invitation.meetingTitle}.`, `Date and time: ${invitation.date}`, `Organizer: ${invitation.organizer}`, `Location: ${invitation.location || "Online"}`, onlineText, "Agenda:", agendaText, "", `Open meeting: ${meetingUrl}`, `Join online: ${joinUrl}`, "", `Cannot attend? Decline the meeting and provide your reason: ${declineUrl}`].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto"><h2>Institutional Governance</h2><p>Hello ${escapeHtml(invitation.recipientName || invitation.recipientEmail)},</p><p>You are invited to <strong>${escapeHtml(invitation.meetingTitle)}</strong>.</p><p><strong>Date and time:</strong> ${escapeHtml(invitation.date)}<br><strong>Organizer:</strong> ${escapeHtml(invitation.organizer)}<br><strong>Location:</strong> ${escapeHtml(invitation.location || (invitation.conferenceUrl ? "Online" : "Not specified"))}</p>${onlineHtml}<h3>Agenda</h3><ul>${agendaHtml}</ul><p style="margin:28px 0"><a href="${meetingUrl}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Open meeting record</a></p><p style="margin:20px 0"><a href="${declineUrl}" style="color:#b42318;font-weight:700">Cannot attend? Decline meeting and provide a reason</a></p><p style="font-size:13px;color:#666">You may be asked to sign in before viewing or responding to the meeting.</p></div>`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`Invitation email could not be sent: ${message}`);
  } finally {
    transporter.close();
  }
}

export async function sendMeetingDeclineNotification(notification: MeetingDeclineNotification): Promise<void> {
  const { user, transporter } = createTransporter();
  const siteUrl = getSiteUrl();
  const meetingUrl = `${siteUrl}/meetings/${encodeURIComponent(notification.meetingId)}`;
  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `Institutional Governance <${user}>`,
      to: notification.organizerEmail,
      subject: `Meeting declined: ${notification.meetingTitle}`,
      text: [`${notification.participantName || notification.participantEmail} has declined the meeting invitation.`, "", `Meeting: ${notification.meetingTitle}`, `Date and time: ${notification.date}`, `Participant: ${notification.participantName || notification.participantEmail}`, `Email: ${notification.participantEmail}`, `Reason: ${notification.reason}`, "", `Open meeting: ${meetingUrl}`].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:620px;margin:auto"><h2>Meeting declined</h2><p><strong>${escapeHtml(notification.participantName || notification.participantEmail)}</strong> has declined the meeting invitation.</p><p><strong>Meeting:</strong> ${escapeHtml(notification.meetingTitle)}<br><strong>Date and time:</strong> ${escapeHtml(notification.date)}<br><strong>Participant:</strong> ${escapeHtml(notification.participantName || notification.participantEmail)}<br><strong>Email:</strong> ${escapeHtml(notification.participantEmail)}</p><div style="margin:20px 0;padding:16px;background:#fff4f2;border-left:4px solid #b42318"><strong>Reason for declining:</strong><br>${escapeHtml(notification.reason).replace(/\n/g, "<br>")}</div><p><a href="${meetingUrl}" style="background:#315c4f;color:#fff;padding:13px 22px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block">Open meeting record</a></p></div>`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`Decline notification could not be sent: ${message}`);
  } finally {
    transporter.close();
  }
}
