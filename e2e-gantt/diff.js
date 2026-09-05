/**
 * Proves the run only added.
 *
 * Any pre-existing row that changed, or disappeared, is a violation of the
 * constraint this session was given. New rows are expected and listed.
 */
const { readFileSync } = require("fs");
const before = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const after = JSON.parse(readFileSync(process.argv[3], "utf-8"));

let violations = 0;

for (const kind of ["items", "links", "groups", "boards"]) {
  const changed = [];
  const removed = [];
  let added = 0;

  for (const id of Object.keys(before[kind])) {
    if (!(id in after[kind])) removed.push(id);
    else if (before[kind][id] !== after[kind][id]) changed.push(id);
  }
  for (const id of Object.keys(after[kind])) if (!(id in before[kind])) added++;

  violations += changed.length + removed.length;
  console.log(
    `${kind.padEnd(7)} before=${String(Object.keys(before[kind]).length).padStart(4)}  ` +
      `added=${String(added).padStart(3)}  CHANGED=${String(changed.length).padStart(3)}  ` +
      `REMOVED=${String(removed.length).padStart(3)}`
  );
  for (const id of changed.slice(0, 5)) {
    console.log(`   changed ${id}`);
    console.log(`     was: ${before[kind][id].slice(0, 160)}`);
    console.log(`     now: ${after[kind][id].slice(0, 160)}`);
  }
  for (const id of removed.slice(0, 5)) console.log(`   removed ${id}`);
}

console.log(violations === 0 ? "\nPASS: nothing pre-existing was changed or removed." : `\nFAIL: ${violations} pre-existing rows altered.`);
process.exit(violations === 0 ? 0 : 1);
