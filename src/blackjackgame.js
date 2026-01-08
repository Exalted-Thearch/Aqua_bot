// const {
//   SlashCommandBuilder,
//   EmbedBuilder,
//   ActionRowBuilder,
//   ButtonBuilder,
//   ButtonStyle,
// } = require("discord.js");
// // Import our new database functions
// // CORRECTED PATH: Points directly to the db.js file in the src folder.
// const { getUserProfile, updateUserProfile } = require("./db");

// // --- All of your existing game logic and variables go here ---
// const ranks = [
//   "2",
//   "3",
//   "4",
//   "5",
//   "6",
//   "7",
//   "8",
//   "9",
//   "10",
//   "J",
//   "Q",
//   "K",
//   "A",
// ];
// const suits = ["hearts", "diamonds", "clubs", "spades"];

// // (Your entire cardEmojis object would be here)
// const cardEmojis = {
//   CA: "<:ClubAce:1398004254693658676>",
//   C2: "<:Club2:1398004407311925391>",
//   C3: "<:Club3:1398004424986726411>",
//   C4: "<:Club4:1398004522307031173>",
//   C5: "<:Club5:1398004540913221723>",
//   C6: "<:Club6:1398004557065355535>",
//   C7: "<:Club7:1398004571271331940>",
//   C8: "<:Club8:1398004586790256863>",
//   C9: "<:Club9:1398004603261554870>",
//   C10: "<:Club10:1398004618138619925>",
//   CJ: "<:ClubJack:1398004645422698496>",
//   CQ: "<:ClubQueen:1398004668600418417>",
//   CK: "<:ClubKing:1398004691958366339>",
//   DA: "<:DiamondAce:1398005881379094689>",
//   D2: "<:Diamond2:1398005901369278579>",
//   D3: "<:Diamond3:1398005953395429567>",
//   D4: "<:Diamond4:1398006001898098780>",
//   D5: "<:Diamond5:1398006025608757368>",
//   D6: "<:Diamond6:1398006085771591732>",
//   D7: "<:Diamond7:1398006122090070098>",
//   D8: "<:Diamond8:1398006568187990056>",
//   D9: "<:Diamond9:1398006586940588072>",
//   D10: "<:Diamond10:1398006610533679135>",
//   DJ: "<:DiamondJack:1398006642385354852>",
//   DQ: "<:DiamondQueen:1398006663583367229>",
//   DK: "<:DiamondKing:1398006693551673434>",
//   HA: "<:HeartAce:1398006729945382963>",
//   H2: "<:Heart2:1398006918387077242>",
//   H3: "<:Heart3:1398006938528125041>",
//   H4: "<:Heart4:1398006963836817491>",
//   H5: "<:Heart5:1398006986175418511>",
//   H6: "<:Heart6:1398007007067373568>",
//   H7: "<:Heart7:1398007037828403365>",
//   H8: "<:Heart8:1398007091502911658>",
//   H9: "<:Heart9:1398007116169478278>",
//   H10: "<:Heart10:1398007133320122499>",
//   HJ: "<:HeartJack:1398007155692671069>",
//   HQ: "<:HeartQueen:1398007183924269191>",
//   HK: "<:HeartKing:1398007211309138002>",
//   SA: "<:Spade1:1398007394944155708>",
//   S2: "<:Spade2:1398007415471083610>",
//   S3: "<:Spade3:1398007467568267365>",
//   S4: "<:Spade4:1398007492075585648>",
//   S5: "<:Spade5:1398007534534656040>",
//   S6: "<:Spade6:1398007561470349545>",
//   S7: "<:Spade7:1398007588041523230>",
//   S8: "<:Spade8:1398007611282161845>",
//   S9: "<:Spade9:1398007645620801536>",
//   S10: "<:Spade10:1398007685953093693>",
//   SJ: "<:SpadeJack:1398007705066799185>",
//   SQ: "<:SpadeQueen:1398007727942402170>",
//   SK: "<:SpadeKing:1398007769210028246>",
// };

// function createDeck() {
//   let deck = [];
//   for (const suit of suits) {
//     for (const rank of ranks) {
//       deck.push({ rank, suit });
//     }
//   }
//   for (let i = deck.length - 1; i > 0; i--) {
//     const j = Math.floor(Math.random() * (i + 1));
//     [deck[i], deck[j]] = [deck[j], deck[i]];
//   }
//   return deck;
// }

// function drawCard(deck) {
//   if (deck.length === 0) throw new Error("Deck is empty!");
//   return deck.pop();
// }

// function calculateHandValue(hand) {
//   let value = 0;
//   let numAces = 0;
//   for (const card of hand) {
//     if (card.rank === "A") {
//       numAces++;
//       value += 11;
//     } else if (["K", "Q", "J"].includes(card.rank)) {
//       value += 10;
//     } else {
//       value += parseInt(card.rank);
//     }
//   }
//   while (value > 21 && numAces > 0) {
//     value -= 10;
//     numAces--;
//   }
//   // A more simplified but effective isSoft check
//   let isSoft = false;
//   if (numAces > 0) {
//     let valueWithAcesAsOne = value - numAces * 10;
//     if (valueWithAcesAsOne + 10 <= 21) {
//       isSoft = true;
//     }
//   }
//   const isBlackjack = value === 21 && hand.length === 2;
//   return { value, isSoft, isBlackjack };
// }

// function getCardDisplay(card) {
//   let key = card.suit.charAt(0).toUpperCase() + card.rank;
//   return cardEmojis[key] || `[${key}]`;
// }

// function getHandDisplay(hand) {
//   return hand.map(getCardDisplay).join(" ");
// }

// // A simple in-memory store for active games.
// // For a production bot, you might move this to your database.
// const activeGames = new Map();

// // --- The New Command Structure ---
// module.exports = {
//   data: new SlashCommandBuilder()
//     .setName("blackjack")
//     .setDescription("Start a game of Blackjack.")
//     .addIntegerOption((option) =>
//       option
//         .setName("bet")
//         .setDescription("The amount of Bronze to bet.")
//         .setRequired(true)
//         .setMinValue(1)
//     ), // Prevent betting 0 or negative
//   async execute(interaction) {
//     const userId = interaction.user.id;
//     const betAmount = interaction.options.getInteger("bet");

//     // Prevent starting a new game if one is already active
//     if (activeGames.has(userId)) {
//       return interaction.reply({
//         content: "You already have an active game of Blackjack!",
//         ephemeral: true,
//       });
//     }

//     try {
//       const profile = await getUserProfile(userId);

//       if (profile.bronze < betAmount) {
//         return interaction.reply({
//           content: `You don't have enough Bronze Coins. You need ${betAmount} but only have ${profile.bronze}.`,
//           ephemeral: true,
//         });
//       }

//       // --- Start the Game ---
//       const deck = createDeck();
//       const playerHand = [drawCard(deck), drawCard(deck)];
//       const dealerHand = [drawCard(deck), drawCard(deck)];

//       const playerValue = calculateHandValue(playerHand);
//       const dealerValue = calculateHandValue(dealerHand);

//       // Store the game state
//       activeGames.set(userId, {
//         deck,
//         playerHand,
//         dealerHand,
//         betAmount,
//         interaction, // Store the initial interaction to edit it later
//       });

//       const embed = new EmbedBuilder()
//         .setColor("#0099ff")
//         .setTitle("Blackjack Game")
//         .addFields(
//           {
//             name: "Your Hand",
//             value: `${getHandDisplay(playerHand)} \n**Value: ${
//               playerValue.value
//             }**`,
//             inline: true,
//           },
//           {
//             name: `Dealer's Hand`,
//             value: `${getCardDisplay(dealerHand[0])} ❔ \n**Value: ?**`,
//             inline: true,
//           }
//         )
//         .setFooter({ text: `You bet ${betAmount} Bronze Coins.` });

//       const buttons = new ActionRowBuilder().addComponents(
//         new ButtonBuilder()
//           .setCustomId(`bj_hit_${userId}`)
//           .setLabel("Hit")
//           .setStyle(ButtonStyle.Success),
//         new ButtonBuilder()
//           .setCustomId(`bj_stand_${userId}`)
//           .setLabel("Stand")
//           .setStyle(ButtonStyle.Danger)
//       );

//       // Initial check for player blackjack
//       if (playerValue.isBlackjack) {
//         // Handle immediate blackjack logic here or in a separate function
//         // For now, we'll just show the hand. The button handler will resolve it.
//         buttons.components.forEach((button) => button.setDisabled(true));
//         embed.addFields({ name: "Result", value: "BLACKJACK! 🎉" });
//         // We would normally resolve the game here, but for now, we'll let the button handler do it
//       }

//       await interaction.reply({ embeds: [embed], components: [buttons] });
//     } catch (error) {
//       console.error("Error in /blackjack command:", error);
//       await interaction.reply({
//         content: "Something went wrong while starting the game.",
//         ephemeral: true,
//       });
//     }
//   },
// };
