const FONT_CONFIG = {
  S: {
    base: 13,
    heading: 17,
    sectionLabel: 11,
    label: 12,
    control: 13,
    input: 14,
    small: 11,
    message: 13,
    meta: 10,
    controlHeight: 34,
  },
  M: {
    base: 14,
    heading: 18,
    sectionLabel: 11,
    label: 12,
    control: 14,
    input: 15,
    small: 12,
    message: 14,
    meta: 10,
    controlHeight: 36,
  },
  L: {
    base: 16,
    heading: 20,
    sectionLabel: 12,
    label: 14,
    control: 15,
    input: 17,
    small: 13,
    message: 16,
    meta: 12,
    controlHeight: 42,
  },
};

export function getMessengerFontConfig(size) {
  return FONT_CONFIG[size] || FONT_CONFIG.M;
}

