// Pending role-permission edits live in a { [roleId]: { sections, permissions } }
// map while an admin clicks checkboxes. handleSaveRolePerms used to delete the
// WHOLE roleId entry after the save resolved — silently dropping any clicks the
// admin made DURING the in-flight await (a local lost update).
//
// subtractSavedRoleChanges removes from the pending entry ONLY the fields that
// were actually saved (their value still equals the saved snapshot), leaving any
// field the admin re-toggled mid-save so it can be saved on the next click.

const isEmptyObj = (o) => !o || Object.keys(o).length === 0;

export function subtractSavedRoleChanges(pending, roleId, saved) {
  const current = pending?.[roleId];
  if (!current) return pending;

  const remaining = {};

  if (current.sections) {
    const remainingSections = {};
    for (const [secId, perms] of Object.entries(current.sections)) {
      const savedSec = saved?.sections?.[secId];
      const remainingPerms = {};
      for (const [field, val] of Object.entries(perms)) {
        // Keep the field only if it was NOT part of this save, or was re-toggled
        // to a different value while the save was in flight.
        if (!savedSec || savedSec[field] !== val) remainingPerms[field] = val;
      }
      if (!isEmptyObj(remainingPerms)) remainingSections[secId] = remainingPerms;
    }
    if (!isEmptyObj(remainingSections)) remaining.sections = remainingSections;
  }

  if (current.permissions) {
    const remainingPerms = {};
    for (const [perm, val] of Object.entries(current.permissions)) {
      const savedVal = saved?.permissions?.[perm];
      if (savedVal !== val) remainingPerms[perm] = val;
    }
    if (!isEmptyObj(remainingPerms)) remaining.permissions = remainingPerms;
  }

  const next = { ...pending };
  if (remaining.sections || remaining.permissions) next[roleId] = remaining;
  else delete next[roleId];
  return next;
}
