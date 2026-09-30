import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function JoinMeeting({ params }: { params: { id: string } }) {
  const { supabase } = await requireUser();
  const { data: meeting } = await supabase
    .from("meetings")
    .select("id,type,conference_url")
    .eq("id", params.id)
    .maybeSingle();

  if (!meeting) redirect("/meetings");
  if (meeting.type === "online" && meeting.conference_url) redirect(meeting.conference_url);
  redirect(`/meetings/${params.id}`);
}
