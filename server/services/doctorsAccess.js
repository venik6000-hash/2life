// Authorization for the doctor registry (GET /api/doctors).
//
// The registry is staff metadata used to populate the doctor pickers when
// editing client stages. Two rules:
//   1. Patients (client roles) must never read it — they only use chat. A bare
//      requireAuth() let any logged-in user (including client roles) read the
//      full registry, including the doctor→login-account linkage.
//   2. user_id (the doctor→account link) is admin-only metadata managed through
//      the separate admin panel (/api/admin/doctors). Non-admin staff need only
//      name + role for the pickers, so the linkage is stripped for them.

// True only for resolvable, non-client roles. Null perms (deleted/unknown role)
// is treated as no access — such a user can't edit anything anyway.
const canViewDoctorRegistry = (permissions) => !!permissions && !permissions.isClient;

// Admins get the full rows (incl. user_id); everyone else gets name + role only.
const projectDoctorsForViewer = (doctors, isAdmin) =>
  isAdmin
    ? (doctors || [])
    : (doctors || []).map(({ name, role }) => ({ name, role }));

module.exports = { canViewDoctorRegistry, projectDoctorsForViewer };
