function parseDice(input) {
  const baseMatch = input
    .trim()
    .toLowerCase()
    .match(/^(\d+)d(\d+)(.*)$/);

  if (!baseMatch) return null;

  const count = parseInt(baseMatch[1], 10);
  const sides = parseInt(baseMatch[2], 10);
  const rest = baseMatch[3].trim();

  let mode = null;
  let modifier = 0;

  // detect adv / dis anywhere
  if (/\badv\b/.test(rest)) mode = "adv";
  if (/\bdis\b/.test(rest)) mode = "dis";

  // detect modifier anywhere
  const modMatch = rest.match(/([+-]\d+)/);
  if (modMatch) modifier = parseInt(modMatch[1], 10);

  // structural rule only
  // if (mode && count !== 1) return null;

  return { count, sides, mode, modifier };
}


function rollDice(parsed) {
  let rolls = [];
  if (parsed.mode) {
    const r1 = Math.floor(Math.random() * parsed.sides) + 1;
    const r2 = Math.floor(Math.random() * parsed.sides) + 1;
    rolls = [r1, r2];
  } else {
    for (let i = 0; i < parsed.count; i++) {
      rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
    }
  }
  let chosen;
  if (parsed.mode === "adv") chosen = Math.max(...rolls);
  else if (parsed.mode === "dis") chosen = Math.min(...rolls);
  else chosen = rolls.reduce((a, b) => a + b, 0);

  const total = chosen + parsed.modifier;
  return { rolls, chosen, total };
}
function wrapRolls(rolls, maxWidth = 38) {
  const lines = [];
  let current = "";

  for (const roll of rolls) {
    const part = String(roll);

    if ((current + part).length > maxWidth) {
      lines.push(current.trim());
      current = part + " ";
    } else {
      current += part + " ";
    }
  }

  if (current.trim()) {
    lines.push(current.trim());
  }

  return lines;
}

function largeDiceTable(parsed, result) {
  const headerParts = [
  `${parsed.count}d${parsed.sides}`,
  parsed.mode ? parsed.mode : null,
  parsed.modifier !== 0
    ? `${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}`
    : null
];

const header = headerParts.filter(Boolean).join(" ");


  const ROLL_COL_WIDTH = 26; // 👈 mobile friendly
  const SUM_COL_WIDTH = 10;

  const rollLines = wrapRolls(result.rolls, ROLL_COL_WIDTH);
  const sumText = `[${result.total}]`;

  let table = "";

  table += `╔${"═".repeat(ROLL_COL_WIDTH + 2)}╤${"═".repeat(SUM_COL_WIDTH)}╗\n`;
  table += `║${center(header, ROLL_COL_WIDTH + 2)}│${center(
    "sum",
    SUM_COL_WIDTH
  )}║\n`;
  table += `╠${"═".repeat(ROLL_COL_WIDTH + 2)}╪${"═".repeat(SUM_COL_WIDTH)}╣\n`;
  table += `║${center("rolls", ROLL_COL_WIDTH + 2)}│${center(
    "total",
    SUM_COL_WIDTH
  )}║\n`;
  table += `╟${"─".repeat(ROLL_COL_WIDTH + 2)}┼${"─".repeat(SUM_COL_WIDTH)}╢\n`;

  rollLines.forEach((line, index) => {
    if (index === 0) {
      table += `║ ${line.padEnd(ROLL_COL_WIDTH)} │${center(
        sumText,
        SUM_COL_WIDTH
      )}║\n`;
    } else {
      table += `║ ${line.padEnd(ROLL_COL_WIDTH)} │${" ".repeat(
        SUM_COL_WIDTH
      )}║\n`;
    }
  });

  table += `╚${"═".repeat(ROLL_COL_WIDTH + 2)}╧${"═".repeat(SUM_COL_WIDTH)}╝`;

  return table;
}

function smallDiceTable(parsed, result) {
  const headerParts = [
  `${parsed.count}d${parsed.sides}`,
  parsed.mode ? parsed.mode : null,
  parsed.modifier !== 0
    ? `${parsed.modifier > 0 ? "+" : ""}${parsed.modifier}`
    : null
];

const header = headerParts.filter(Boolean).join(" ");


  return `╔════════════════════╗
║${center(header, 20)}║
╠══════════╤═════════╣
║${center("rolls", 10)}│${center("total", 9)}║
╟──────────┼─────────╢
║${center(result.rolls.join(", "), 10)}│${center(`[${result.total}]`, 9)}║
╚══════════╧═════════╝`;
}

function center(text, width) {
  const str = String(text);
  if (str.length >= width) return str.slice(0, width);
  const left = Math.floor((width - str.length) / 2);
  const right = width - str.length - left;
  return " ".repeat(left) + str + " ".repeat(right);
}

module.exports = { parseDice, rollDice, largeDiceTable, smallDiceTable };
