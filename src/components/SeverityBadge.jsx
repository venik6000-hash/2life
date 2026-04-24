import { sevColors, sevLabels } from "../styles/theme";
import Badge from "./Badge";

export default function SeverityBadge({ severity }) {
  return <Badge c={sevColors[severity] || "in"} ch={sevLabels[severity] || severity || "—"} />;
}
