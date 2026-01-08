// // rouletteGame.js

// const { getUserBalance, updateUserBalance } = require("./db"); // We'll need these
// const { nexus_coin } = require("./coinflip");

// // Define the properties of each roulette number (European Roulette 0-36)
// // Corrected based on your specific rules for Red/Black/Odd/Even patterns
// const rouletteWheel = [
//   {
//     number: 0,
//     color: "green",
//     isEven: false,
//     isOdd: false,
//     isHigh: false,
//     isLow: false,
//     dozen: null,
//     column: null,
//   },
//   // Range 1-10: Odd Red, Even Black
//   {
//     number: 1,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col1",
//   },
//   {
//     number: 2,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col2",
//   },
//   {
//     number: 3,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col3",
//   },
//   {
//     number: 4,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col1",
//   },
//   {
//     number: 5,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col2",
//   },
//   {
//     number: 6,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col3",
//   },
//   {
//     number: 7,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col1",
//   },
//   {
//     number: 8,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col2",
//   },
//   {
//     number: 9,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col3",
//   },
//   {
//     number: 10,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col1",
//   },
//   // Range 11-18: Odd Black, Even Red
//   {
//     number: 11,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col2",
//   },
//   {
//     number: 12,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: false,
//     isLow: true,
//     dozen: "1st",
//     column: "col3",
//   },
//   {
//     number: 13,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col1",
//   },
//   {
//     number: 14,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col2",
//   },
//   {
//     number: 15,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col3",
//   },
//   {
//     number: 16,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col1",
//   },
//   {
//     number: 17,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col2",
//   },
//   {
//     number: 18,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col3",
//   },
//   // Range 19-28: Odd Red, Even Black
//   {
//     number: 19,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col1",
//   },
//   {
//     number: 20,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col2",
//   },
//   {
//     number: 21,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col3",
//   },
//   {
//     number: 22,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col1",
//   },
//   {
//     number: 23,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col2",
//   },
//   {
//     number: 24,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "2nd",
//     column: "col3",
//   },
//   {
//     number: 25,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col1",
//   },
//   {
//     number: 26,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col2",
//   },
//   {
//     number: 27,
//     color: "red",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col3",
//   },
//   {
//     number: 28,
//     color: "black",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col1",
//   },
//   // Range 29-36: Odd Black, Even Red
//   {
//     number: 29,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col2",
//   },
//   {
//     number: 30,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col3",
//   },
//   {
//     number: 31,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col1",
//   },
//   {
//     number: 32,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col2",
//   },
//   {
//     number: 33,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col3",
//   },
//   {
//     number: 34,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col1",
//   },
//   {
//     number: 35,
//     color: "black",
//     isEven: false,
//     isOdd: true,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col2",
//   },
//   {
//     number: 36,
//     color: "red",
//     isEven: true,
//     isOdd: false,
//     isHigh: true,
//     isLow: false,
//     dozen: "3rd",
//     column: "col3",
//   },
// ];

// // Define payout multipliers (these remain the same as standard European)
// const payoutMultipliers = {
//   number: 36,
//   red: 2,
//   black: 2,
//   odd: 2,
//   even: 2,
//   low: 2,
//   high: 2,
//   "1st": 3,
//   "2nd": 3,
//   "3rd": 3,
//   col1: 3,
//   col2: 3,
//   col3: 3,
// };
// // game logic
// // rouletteGame.js

// // ... (imports, rouletteWheel, payoutMultipliers) ...
// function getRouletteSpinResult() {
//   const winningIndex = Math.floor(Math.random() * rouletteWheel.length);
//   const winningSlot = rouletteWheel[winningIndex];
//   const winningNumber = winningSlot.number;
//   const winningColor = winningSlot.color;

//   return {
//     winningNumber: winningNumber,
//     winningColor: winningColor,
//     winningSlot: winningSlot, // Return the full slot object for convenience
//   };
// }

// async function spinRoulette(
//   userId,
//   betAmount,
//   betType,
//   predefinedWinningNumber = null
// ) {
//   const currentBalance = await getUserBalance(userId);

//   // Initial validation (redundant with index.js, but safe to keep)
//   if (isNaN(betAmount) || betAmount <= 0) {
//     return {
//       message: "You must bet a valid amount!",
//       newBalance: currentBalance, // Use currentBalance here as newBalance is not yet defined
//       success: false,
//     };
//   }
//   if (betAmount > currentBalance) {
//     return {
//       message: `You don't have enough currency! Your current balance is ${currentBalance}.`,
//       newBalance: currentBalance, // Use currentBalance here
//       success: false,
//     };
//   }

//   const allowedBetTypes = [
//     "red",
//     "black",
//     "odd",
//     "even",
//     "low",
//     "high",
//     "1st",
//     "2nd",
//     "3rd",
//     "col1",
//     "col2",
//     "col3",
//   ].concat(Array.from({ length: 37 }, (_, i) => i.toString()));

//   let normalizedBetType = betType.toLowerCase();

//   const numBet = parseInt(normalizedBetType);
//   if (!isNaN(numBet) && numBet >= 0 && numBet <= 36) {
//     normalizedBetType = numBet.toString();
//   } else if (!allowedBetTypes.includes(normalizedBetType)) {
//     return {
//       message:
//         "Invalid bet type. Please bet on a number (0-36), color (red/black), odd/even, high/low, dozen (1st/2nd/3rd), or column (col1/col2/col3).",
//       newBalance: currentBalance, // Use currentBalance here
//       success: false,
//     };
//   }

//   let winningIndex;
//   if (
//     predefinedWinningNumber !== null &&
//     typeof predefinedWinningNumber === "number" &&
//     predefinedWinningNumber >= 0 &&
//     predefinedWinningNumber <= 36
//   ) {
//     winningIndex = rouletteWheel.findIndex(
//       (slot) => slot.number === predefinedWinningNumber
//     );
//   } else {
//     winningIndex = Math.floor(Math.random() * rouletteWheel.length); // Generate randomly if not predefined
//   }
//   const winningSlot = rouletteWheel[winningIndex];
//   const winningNumber = winningSlot.number;
//   const winningColor = winningSlot.color; // This is a string like 'red', 'black', 'green'

//   let finalMessage;
//   let success = false;
//   let payout = 0;
//   let winMultiplier = 0;

//   let userWon = false;
//   // winningConditionMet is declared but not used, can be removed: let winningConditionMet = false;

//   // Check for number bets
//   if (!isNaN(numBet) && numBet.toString() === normalizedBetType) {
//     if (winningNumber === numBet) {
//       userWon = true;
//       winMultiplier = payoutMultipliers.number;
//     }
//   }
//   // Check for color bets
//   else if (["red", "black"].includes(normalizedBetType)) {
//     if (winningNumber !== 0 && winningColor === normalizedBetType) {
//       userWon = true;
//       winMultiplier = payoutMultipliers[normalizedBetType];
//     }
//   }
//   // Check for odd/even bets
//   else if (["odd", "even"].includes(normalizedBetType)) {
//     if (
//       winningNumber !== 0 &&
//       winningSlot.isOdd === (normalizedBetType === "odd") &&
//       winningSlot.isEven === (normalizedBetType === "even")
//     ) {
//       userWon = true;
//       winMultiplier = payoutMultipliers[normalizedBetType];
//     }
//   }
//   // Check for high/low bets
//   else if (["low", "high"].includes(normalizedBetType)) {
//     // --- FIX HERE: Changed winningColor.isLow to winningSlot.isLow ---
//     if (
//       winningNumber !== 0 &&
//       winningSlot.isLow === (normalizedBetType === "low") &&
//       winningSlot.isHigh === (normalizedBetType === "high")
//     ) {
//       userWon = true;
//       winMultiplier = payoutMultipliers[normalizedBetType];
//     }
//   }
//   // Check for dozen bets
//   else if (["1st", "2nd", "3rd"].includes(normalizedBetType)) {
//     if (winningSlot.dozen === normalizedBetType) {
//       userWon = true;
//       winMultiplier = payoutMultipliers[normalizedBetType];
//     }
//   }
//   // Check for column bets
//   else if (["col1", "col2", "col3"].includes(normalizedBetType)) {
//     if (winningSlot.column === normalizedBetType) {
//       userWon = true;
//       winMultiplier = payoutMultipliers[normalizedBetType];
//     }
//   }

//   if (userWon) {
//     payout = betAmount * winMultiplier;
//     await updateUserBalance(userId, payout);
//     success = true;
//     finalMessage = `The ball landed on **${winningNumber}** **(${winningColor})**! You bet on **${betType}** and WON ${nexus_coin} **${payout}** !`;
//   } else {
//     await updateUserBalance(userId, -betAmount); // Deduct the bet amount
//     success = false;
//     finalMessage = `The ball landed on **${winningNumber}** **(${winningColor})**! You bet on **${betType}** and LOST ${nexus_coin} **${betAmount}**.`;
//   }

//   return {
//     winningNumber: winningNumber,
//     winningColor: winningColor,
//     betType: betType, // Original bet type for message
//     betAmount: betAmount,
//     payout: payout,
//     finalMessage: finalMessage,
//     success: success,
//   };
// }

// module.exports = {
//   spinRoulette,
//   rouletteWheel,
//   payoutMultipliers,
//   getRouletteSpinResult,
// };
