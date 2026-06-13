export const getReferenceRefreshType = (loaded, previousSection, currentSection) => {
  if (!loaded || previousSection === currentSection) return null;
  if (currentSection === "overview") return "deficit_preset";
  if (currentSection === "lab") return "lab_order_item";
  return null;
};
