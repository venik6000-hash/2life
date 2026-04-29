const { getRoleByName, getRoleSections, getRolePermissions } = require('./db');

// Returns full permissions object for a role name
// Admin always gets full access regardless of DB config
const getPermissionsForRole = async (roleName) => {
  if (roleName === 'admin') {
    const sections = ['overview','questionnaire','nutrition','menu','protocol','injections','analytics','lab','journal','messenger'];
    const sectionsObj = {};
    for (const s of sections) sectionsObj[s] = { read: true, write: true };
    return { sections: sectionsObj, canDeleteClient: true, canCreateClient: true, canImportData: true, isAdmin: true };
  }

  let role = await getRoleByName(roleName);
  if (!role && roleName === "client") role = await getRoleByName("viewer");
  if (!role && roleName === "viewer") role = await getRoleByName("client");
  if (!role) return null;

  const sectionRows = await getRoleSections(role.id);
  const permRows = await getRolePermissions(role.id);

  const sectionsObj = {};
  for (const row of sectionRows) {
    sectionsObj[row.section_id] = { read: row.can_read, write: row.can_write };
  }

  const perms = {};
  for (const row of permRows) {
    perms[row.permission] = row.granted;
  }

  return {
    sections: sectionsObj,
    canDeleteClient: !!perms['delete_client'],
    canCreateClient: !!perms['create_client'],
    canImportData:   !!perms['import_data'],
    isAdmin: false,
  };
};

module.exports = { getPermissionsForRole };
