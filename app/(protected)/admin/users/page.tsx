import Link from "next/link";
import { UsersView } from "@/components/phase1-live";

export default function Users() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Link href="/admin/users/invite" className="btn btn-primary">Create new user</Link>
      </div>
      <UsersView />
    </div>
  );
}
