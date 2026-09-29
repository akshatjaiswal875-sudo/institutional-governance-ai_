import nodemailer from "nodemailer";

type MeetingInvitation = {
  recipientEmail: string;
  recipientName: string;
  meetingTitle: string;
  date: string;
  organizer: string;
  location: string | null;
  agenda: string[];
};

export async function sendMeetingInvitation(invitation: MeetingInvitation): Promise<void> {
  const user = process.env.GMAIL_SMTP_USER?.trim();
  const appPassword = process.env.GMAIL_SMTP_APP_PASSWORD?.replace(/\s+/g, "").trim();

  if (!user || !appPassword) {
    throw new Error(
      "Email invitations are not configured. Set GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD on the server."
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user,
      pass: appPassword,
    },
  });

  const agenda = invitation.agenda.length
    ? invitation.agenda.map((item) => `- ${item}`).join("\n")
    : "No agenda has been added yet.";

  try {
    await transporter.sendMail({
      from: `Institutional Governance <${user}>`,
      to: invitation.recipientEmail,
      subject: `Meeting invitation: ${invitation.meetingTitle}`,
      text: [
        `Hello ${invitation.recipientName || invitation.recipientEmail},`,
        "",
        `You are invited to ${invitation.meetingTitle}.`,
        `Date and time: ${invitation.date}`,
        `Organizer: ${invitation.organizer}`,
        `Location or meeting link: ${invitation.location || "Not specified"}`,
        "",
        "Agenda:",
        agenda,
      ].join("\n"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown SMTP error";
    throw new Error(`Invitation email could not be sent: ${message}`);
  } finally {
    transporter.close();
  }
}
