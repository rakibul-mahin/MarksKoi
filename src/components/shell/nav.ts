export type NavArea = "student" | "faculty" | "admin";
export type NavItem = { href: string; label: string; icon: "home" | "book" | "plus" | "user" | "users" | "activity" | "scroll" | "layers"; exact?: boolean };

export const NAV: Record<NavArea, NavItem[]> = {
  student: [
    { href: "/student", label: "My courses", icon: "book", exact: true },
    { href: "/student/profile", label: "Profile", icon: "user" },
  ],
  faculty: [
    { href: "/faculty", label: "Overview", icon: "home", exact: true },
    { href: "/faculty/courses", label: "Courses", icon: "book" },
    { href: "/faculty/courses/new", label: "New course", icon: "plus", exact: true },
  ],
  admin: [
    { href: "/admin", label: "Overview", icon: "home", exact: true },
    { href: "/admin/users", label: "Users & roles", icon: "users" },
    { href: "/admin/courses", label: "Courses", icon: "layers" },
    { href: "/admin/sync-runs", label: "Sync health", icon: "activity" },
    { href: "/admin/audit-logs", label: "Audit log", icon: "scroll" },
  ],
};

export const AREA_LABEL: Record<NavArea, string> = { student: "Student", faculty: "Faculty", admin: "Administration" };
export const AREA_HOME: Record<NavArea, string> = { student: "/student", faculty: "/faculty", admin: "/admin" };
