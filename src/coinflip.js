// const { getUserBalance, updateUserBalance } = require("./db");
// const { formatCurrency } = require("./utils");

// const nexus_coin = "<:nexus_bronze_coin:1396438179288191007>";
// async function coinFlip(userId, betAmount, choice) {
//   // Input validation (remains the same)
//   if (isNaN(betAmount) || betAmount <= 0) {
//     return {
//       message: "You must bet a positive amount!",
//       newBalance: await getUserBalance(userId),
//       success: false,
//     };
//   }
//   const currentBalance = await getUserBalance(userId);

//   if (betAmount > currentBalance) {
//     return {
//       message: `You don't have enough currency! Your current balance is ${currentBalance}.`,
//       newBalance: currentBalance,
//       success: false,
//     };
//   }

//   // --- Start of changes for 'h'/'t' ---
//   let normalizedChoice = choice.toLowerCase(); // Allow 'h' for heads and 't' for tails
//   if (normalizedChoice === "h") normalizedChoice = "heads";
//   if (normalizedChoice === "t") normalizedChoice = "tails";

//   if (!["heads", "tails"].includes(normalizedChoice)) {
//     return {
//       message: "Please choose 'heads' or 'tails' (or 'h'/'t').",
//       newBalance: currentBalance,
//       success: false,
//     };
//   }

//   // --- Core Coin Flip Logic ---
//   const coinOutcome = Math.random() < 0.5 ? "heads" : "tails"; // 'heads' or 'tails'

//   let finalMessage;
//   let success;

//   if (normalizedChoice === coinOutcome) {
//     await updateUserBalance(userId, betAmount);
//     success = true;
//   } else {
//     await updateUserBalance(userId, -betAmount);
//     success = false;
//   }

//   const newBalance = await getUserBalance(userId);

//   // --- THIS BLOCK MUST BE UNCOMMENTED ---
//   if (success) {
//     finalMessage = `The coin landed on **${coinOutcome}**! You **won** ${nexus_coin} **${betAmount}** ! 
// -# Your new balance is **${formatCurrency(newBalance)}.**`;
//   } else {
//     finalMessage = `The coin landed on **${coinOutcome}**! You **lost** ${nexus_coin} **${betAmount}**  
// -# Your new balance is **${formatCurrency(newBalance)}.**`;
//   }

//   return {
//     outcome: coinOutcome, // 'heads' or 'tails'
//     finalMessage: finalMessage,
//     newBalance: newBalance,
//     success: success,
//   };
// }

// module.exports = { currentBalance, coinFlip, nexus_coin };
