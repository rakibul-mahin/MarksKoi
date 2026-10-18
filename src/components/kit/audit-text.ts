const TEXT: Record<string, string> = {
  "offering.created": "created the course",
  "offering.updated": "updated course details",
  "offering.archived": "archived the course",
  "offering.restored": "restored the course",
  "offering.deleted": "permanently deleted a course",
  "offering.faculty_added": "added a co-instructor",
  "offering.faculty_removed": "removed a co-instructor",
  "source.connected": "connected a spreadsheet",
  "source.verified": "verified the spreadsheet connection",
  "source.replaced": "replaced the spreadsheet",
  "mapping.saved": "updated the column mapping",
  "sync.manual": "ran a sync",
  "publication.published": "published results",
  "publication.unpublished": "unpublished results",
  "publication.auto_published": "automatically republished results",
  "role.granted": "granted a role",
  "role.revoked": "revoked a role",
  "profile.suspended": "suspended an account",
  "profile.reactivated": "reactivated an account",
  "sessions.revoked": "signed a user out everywhere",
  "admin.viewed_user": "viewed a user's details",
  "admin.sync_recovered": "recovered a stuck sync",
  "auth.sign_in": "signed in",
  "auth.sign_in_denied": "was denied sign-in",
};

export function describeAuditAction(action: string): string {
  return TEXT[action] ?? action;
}
