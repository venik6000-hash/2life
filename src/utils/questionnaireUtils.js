// Returns a setter that navigates a dot-separated path in s.questionnaire and sets key=value.
export function makeFieldSaver(uS, path) {
  return (key, value) => uS(s => {
    const pts = path.split(".");
    let o = s.questionnaire;
    for (const p of pts) {
      if (o && o[p] !== undefined) o = o[p];
    }
    o[key] = value;
  });
}
