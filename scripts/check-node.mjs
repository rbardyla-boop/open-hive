// OPEN HIVE admission check — packaging only, no architecture.
const minMajor = 22;
const minMinor = 6;
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < minMajor || (major === minMajor && minor < minMinor)) {
  console.error(
"OPEN HIVE requires Node >=" + minMajor + "." + minMinor + ".0 (current: " + process.versions.node + ")."
);
  console.error("Fix: upgrade Node (nvm install 22 / fnm use 22 / apt nodejs 22).");
  process.exit(1);
}
