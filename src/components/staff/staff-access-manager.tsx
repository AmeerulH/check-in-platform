"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type StaffAccessManagerProps = {
  currentStaffMemberId: string;
  staffMembers: Array<{
    active: boolean;
    id: string;
    normalized_email: string;
    role: string;
  }>;
};

type StaffResponse = {
  data?: { normalized_email: string; role: string };
  error?: { code?: string; message?: string };
};

export function StaffAccessManager({
  currentStaffMemberId,
  staffMembers,
}: StaffAccessManagerProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("organizer");
  const [roleChanges, setRoleChanges] = useState<Record<string, string>>({});
  const [savingStaffId, setSavingStaffId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function addStaffMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");

    try {
      const response = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = (await response.json()) as StaffResponse;

      if (!response.ok || !body.data) {
        setStatus("error");
        setMessage(body.error?.message ?? "We could not add this staff member. Please try again.");
        return;
      }

      setEmail("");
      setStatus("success");
      setMessage(`${body.data.normalized_email} can now request a staff sign-in link.`);
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("We could not reach the staff service. Check your connection and try again.");
    }
  }

  async function updateStaffRole(staffId: string) {
    const nextRole = roleChanges[staffId];
    const currentRole = staffMembers.find((staffMember) => staffMember.id === staffId)?.role;
    if (!nextRole || nextRole === currentRole) return;

    setSavingStaffId(staffId);
    setStatus("idle");
    setMessage("");
    try {
      const response = await fetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = (await response.json()) as StaffResponse;

      if (!response.ok || !body.data) {
        setStatus("error");
        setMessage(body.error?.message ?? "We could not update this staff role. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(`${body.data.normalized_email} is now an ${body.data.role}.`);
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("We could not reach the staff service. Check your connection and try again.");
    } finally {
      setSavingStaffId(null);
    }
  }

  return (
    <div className="staff-access-layout">
      <section className="content-panel staff-add-panel">
        <div className="panel-heading">
          <div>
            <h2>Add staff access</h2>
            <p>They will receive access only after signing in with this email.</p>
          </div>
        </div>
        <form className="staff-form" onSubmit={addStaffMember}>
          <label>
            <span className="field-label">Email address <span className="required-mark" aria-hidden="true">*</span></span>
            <input
              autoComplete="email"
              disabled={status === "saving"}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            <span className="field-label">Role</span>
            <select disabled={status === "saving"} onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="organizer">Organizer, can manage staff and guests</option>
              <option value="scanner">Scanner, can check in guests</option>
              <option value="viewer">Viewer, can view attendance</option>
            </select>
          </label>
          <button disabled={!email.trim() || status === "saving"} type="submit">
            {status === "saving" ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <UserPlus aria-hidden="true" size={18} />}
            {status === "saving" ? "Adding…" : "Add staff"}
          </button>
          {status !== "idle" && (
            <p className={`staff-form-message ${status === "error" ? "status-error" : "status-success"}`} role={status === "error" ? "alert" : "status"}>
              {message}
            </p>
          )}
        </form>
      </section>
      <section className="content-panel staff-list-panel">
        <div className="panel-heading">
          <div>
            <h2>Approved staff</h2>
            <p>{staffMembers.length} people can access this event workspace.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="staff-access-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Access</th>
                <th><span className="sr-only">Update role</span></th>
              </tr>
            </thead>
            <tbody>
              {staffMembers.map((staffMember) => (
                <tr key={staffMember.id}>
                  <td data-label="Email">{staffMember.normalized_email}</td>
                  <td data-label="Role">
                    {staffMember.id === currentStaffMemberId ? (
                      <span className="staff-role">{staffMember.role}</span>
                    ) : (
                      <select
                        className="staff-role-select"
                        disabled={savingStaffId === staffMember.id}
                        onChange={(event) => setRoleChanges((current) => ({
                          ...current,
                          [staffMember.id]: event.target.value,
                        }))}
                        value={roleChanges[staffMember.id] ?? staffMember.role}
                      >
                        <option value="organizer">Organizer</option>
                        <option value="scanner">Scanner</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    )}
                  </td>
                  <td data-label="Access">
                    <span className={`status-badge ${staffMember.active ? "status-checked_in" : "status-not_arrived"}`}>
                      {staffMember.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="staff-save-cell" data-label="Role update">
                    {staffMember.id !== currentStaffMemberId && (
                      <button
                        className="staff-role-save"
                        disabled={
                          savingStaffId === staffMember.id ||
                          (roleChanges[staffMember.id] ?? staffMember.role) === staffMember.role
                        }
                        onClick={() => void updateStaffRole(staffMember.id)}
                        type="button"
                      >
                        {savingStaffId === staffMember.id ? "Saving…" : "Save"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
