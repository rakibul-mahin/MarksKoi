"use client";

import { LogOut, ShieldBan, ShieldCheck, Unlink } from "lucide-react";
import { ActionButton } from "@/components/kit/action-button";
import { revokeSessionsAction, setRoleAction, setSuspendedAction } from "@/server/actions/admin";

const ROLES = [
  { role: "STUDENT", label: "Student", help: "Can see their own published results." },
  { role: "FACULTY", label: "Faculty", help: "Can create and manage their own courses." },
  { role: "ADMIN", label: "Administrator", help: "Can manage access and operations." },
] as const;

export function UserAdminControls({ profileId, isSelf, roles, suspended, hasGoogle }: { profileId: string; isSelf: boolean; roles: string[]; suspended: boolean; hasGoogle: boolean }) {
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-rule rounded-xl bg-card ring-1 ring-foreground/10">
        {ROLES.map((r) => {
          const has = roles.includes(r.role);
          const lockSelf = isSelf && r.role === "ADMIN" && has;
          return (
            <li key={r.role} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-xs text-muted-foreground">{r.help}</span>
              </span>
              <ActionButton
                size="sm"
                variant={has ? "outline" : "default"}
                disabled={lockSelf}
                action={() => setRoleAction(profileId, r.role, !has)}
                confirm={
                  r.role === "ADMIN" || has
                    ? {
                        title: has ? `Revoke ${r.label.toLowerCase()} access?` : "Grant administrator access?",
                        description: has ? <p>They lose this access on their next page load. It won&apos;t be re-granted automatically.</p> : <p>Administrators can change anyone&apos;s access and see all courses and audit logs.</p>,
                        confirmLabel: has ? "Revoke" : "Grant",
                        destructive: has,
                      }
                    : undefined
                }
              >
                {has ? "Revoke" : "Grant"}
              </ActionButton>
            </li>
          );
        })}
      </ul>
      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="outline"
            size="sm"
            action={() => revokeSessionsAction(profileId, false)}
            confirm={{ title: "Sign this person out everywhere?", description: <p>All of their active sessions end immediately. They can sign in again.</p>, confirmLabel: "Sign out everywhere" }}
          >
            <LogOut aria-hidden="true" /> Sign out everywhere
          </ActionButton>
          {hasGoogle && (
            <ActionButton
              variant="outline"
              size="sm"
              action={() => revokeSessionsAction(profileId, true)}
              confirm={{
                title: "Reset Google account link?",
                description: <p>Use this when someone&apos;s Google account was recreated. Their next sign-in links the new Google account to this profile. Their sessions end now.</p>,
                confirmLabel: "Reset link",
              }}
            >
              <Unlink aria-hidden="true" /> Reset Google link
            </ActionButton>
          )}
          {suspended ? (
            <ActionButton variant="outline" size="sm" action={() => setSuspendedAction(profileId, false)}>
              <ShieldCheck aria-hidden="true" /> Reactivate account
            </ActionButton>
          ) : (
            <ActionButton
              variant="outline"
              size="sm"
              action={() => setSuspendedAction(profileId, true)}
              confirm={{ title: "Suspend this account?", description: <p>They are signed out and can&apos;t sign in until reactivated. Their academic records are kept.</p>, confirmLabel: "Suspend", destructive: true }}
            >
              <ShieldBan aria-hidden="true" /> Suspend
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}
