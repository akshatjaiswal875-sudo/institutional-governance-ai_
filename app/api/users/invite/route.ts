import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/lib/audit";

const roles = ["Super Admin", "Meeting Secretary", "Faculty / Officer", "Member", "Auditor"] as const;
type Role = (typeof roles)[number];

function generateTemporaryPassword() {
  return `${randomBytes(6).toString("base64url")}!A9`;
}

function getMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!host || !user || !pass) {
    throw new Error("Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in Vercel.");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function POST(request: Request) {
  try {
    const { profile, supabase } = await requireUser(["Super Admin"]);
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "Member") as Role;
    const department = String(body.department ?? "").trim() || null;

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!roles.includes(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    // This endpoint is privileged: all public.users reads/writes and Auth
    // administration are performed with the server-only service-role client.
    const admin = createAdminClient();
    const { data: existing, error: duplicateError } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    const temporaryPassword = generateTemporaryPassword();
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "");

    // must_change_password is stored in app_metadata, not user_metadata.
    // user_metadata is client-editable and therefore must never control an
    // authorization/security gate such as the first-login password requirement.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      app_metadata: { must_change_password: true },
    });

    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? "Unable to create user." }, { status: 400 });
    }

    const { data: user, error: profileError } = await admin
      .from("users")
      .upsert(
        { id: created.user.id, email, role: role || "Member", department },
        { onConflict: "id" },
      )
      .select("id,email,role,department,created_at")
      .single();

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 400 });
    }

    try {
      const transporter = getMailer();
      const from = process.env.SMTP_FROM || process.env.SMTP_USER;
      await transporter.sendMail({
        from,
        to: email,
        subject: "Institutional Governance AI — Your account details",
        text: `Your Institutional Governance AI account has been created.\n\nEmail: ${email}\nTemporary password: ${temporaryPassword}\nRole: ${role}\nDepartment: ${department ?? "Not specified"}\n\nSign in: ${appUrl}/login\n\nFor security, you will be required to create a new password immediately after your first login. Do not share this email.`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Institutional Governance AI</h2><p>Your account has been created.</p><p><strong>Email:</strong> ${email}<br><strong>Temporary password:</strong> ${temporaryPassword}<br><strong>Role:</strong> ${role}<br><strong>Department:</strong> ${department ?? "Not specified"}</p><p><a href="${appUrl}/login">Sign in to Institutional Governance AI</a></p><p style="color:#666">For security, you will be required to create a new password immediately after your first login. Do not share this email.</p></div>`,
      });
    } catch (mailError) {
      // Do not leave an Auth/profile account behind when credentials could not
      // be delivered. The Auth FK/trigger also protects profile consistency.
      await admin.auth.admin.deleteUser(created.user.id);
      const message = mailError instanceof Error ? mailError.message : "Unable to send account email.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await recordAudit(supabase, profile.id, "USER_CREATED_WITH_TEMP_PASSWORD", "users", created.user.id, {
      email,
      role,
      department,
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create user.";
    const status = message === "FORBIDDEN" || message === "UNAUTHORIZED" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "You are not allowed to create users." : message }, { status });
  }
}
