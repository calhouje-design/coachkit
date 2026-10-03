import { buildStampLabel } from "../lib/buildStampLabel.js";

export default function BuildStamp() {
  return (
    <div data-testid="build-stamp" style={{ marginTop: 20, fontSize: 11, color: "#7a7570", lineHeight: 1.4 }}>
      {buildStampLabel(__COACHKIT_BUILD_SHA__)}
    </div>
  );
}
