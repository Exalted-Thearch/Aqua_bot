// const sqlite3 = require("sqlite3").verbose();
// const path = require("path");

// const dbPath = path.resolve(__dirname, "aqua.db");
// const db = new sqlite3.Database(dbPath, (err) => {
//   if (err) {
//     console.error("[DB] Error connecting to database:", err.message);
//   } else {
//     console.log("[DB] Connected to the SQLite database.");
//   }
// });

// const defaultProfile = {
//   bronze: 100,
//   silver: 0,
//   gold: 0,
//   wish: 0,
//   daily: { streak: 0, lastClaimed: 0 },
//   bounty: {
//     streak: 0,
//     progress: { messages: 0, reactions: 0, welcomes: 0 },
//     lastCompleted: 0,
//   },
//   lastActivity: Date.now(),
//   isBooster: false,
// };

// function initDb() {
//   console.log("[DB INIT] Initializing database table...");
//   return new Promise((resolve, reject) => {
//     db.run(
//       `
//             CREATE TABLE IF NOT EXISTS users (
//                 user_id TEXT PRIMARY KEY,
//                 bronze INTEGER DEFAULT 0,
//                 silver INTEGER DEFAULT 0,
//                 gold INTEGER DEFAULT 0,
//                 wish INTEGER DEFAULT 0,
//                 daily_data TEXT,
//                 bounty_data TEXT,
//                 last_activity INTEGER DEFAULT 0,
//                 is_booster BOOLEAN DEFAULT FALSE
//             )
//         `,
//       (err) => {
//         if (err) {
//           console.error("[DB INIT] Error creating users table:", err.message);
//           reject(err);
//         } else {
//           console.log("[DB INIT] Users table checked/created successfully.");
//           resolve();
//         }
//       }
//     );
//   });
// }

// function getUserProfile(userId) {
//   console.log(`[GET PROFILE] Attempting to get profile for user: ${userId}`);
//   return new Promise((resolve, reject) => {
//     db.get("SELECT * FROM users WHERE user_id = ?", [userId], (err, row) => {
//       if (err) {
//         console.error(
//           `[GET PROFILE] Error fetching user ${userId}:`,
//           err.message
//         );
//         return reject(err);
//       }

//       if (row) {
//         console.log(`[GET PROFILE] Found existing profile for user: ${userId}`);
//         const profile = {
//           userId: row.user_id,
//           bronze: row.bronze,
//           silver: row.silver,
//           gold: row.gold,
//           wish: row.wish,
//           daily: JSON.parse(row.daily_data),
//           bounty: JSON.parse(row.bounty_data),
//           lastActivity: row.last_activity,
//           isBooster: row.is_booster,
//         };
//         resolve(profile);
//       } else {
//         console.log(
//           `[GET PROFILE] No profile found for ${userId}. Creating new one...`
//         );
//         const newUser = { userId: userId, ...defaultProfile };
//         const insertQuery = `
//                     INSERT INTO users (user_id, bronze, silver, gold, wish, daily_data, bounty_data, last_activity, is_booster)
//                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
//                 `;
//         const params = [
//           newUser.userId,
//           newUser.bronze,
//           newUser.silver,
//           newUser.gold,
//           newUser.wish,
//           JSON.stringify(newUser.daily),
//           JSON.stringify(newUser.bounty),
//           newUser.lastActivity,
//           newUser.isBooster,
//         ];

//         db.run(insertQuery, params, function (err) {
//           if (err) {
//             console.error(
//               `[GET PROFILE] Error creating new profile for ${userId}:`,
//               err.message
//             );
//             return reject(err);
//           }
//           console.log(
//             `[GET PROFILE] Successfully created new profile for ${userId}`
//           );
//           resolve(newUser);
//         });
//       }
//     });
//   });
// }

// function updateUserProfile(userId, updates) {
//   console.log(
//     `[UPDATE PROFILE] Attempting to update profile for user: ${userId}`
//   );
//   return new Promise((resolve, reject) => {
//     const fields = [];
//     const values = [];

//     for (const [key, value] of Object.entries(updates)) {
//       let dbKey = key;
//       if (key === "daily") dbKey = "daily_data";
//       if (key === "bounty") dbKey = "bounty_data";
//       if (key === "lastActivity") dbKey = "last_activity";
//       if (key === "isBooster") dbKey = "is_booster";

//       fields.push(`${dbKey} = ?`);
//       values.push(typeof value === "object" ? JSON.stringify(value) : value);
//     }

//     if (fields.length === 0) {
//       console.log("[UPDATE PROFILE] No fields to update.");
//       return resolve();
//     }

//     values.push(userId);
//     const query = `UPDATE users SET ${fields.join(", ")} WHERE user_id = ?`;

//     db.run(query, values, function (err) {
//       if (err) {
//         console.error(
//           `[UPDATE PROFILE] Error updating profile for ${userId}:`,
//           err.message
//         );
//         reject(err);
//       } else {
//         console.log(
//           `[UPDATE PROFILE] Successfully updated profile for ${userId}. Changes: ${this.changes}`
//         );
//         resolve();
//       }
//     });
//   });
// }

// function deleteUser(userId) {
//   return new Promise((resolve, reject) => {
//     db.run("DELETE FROM users WHERE user_id = ?", [userId], function (err) {
//       if (err) {
//         reject(err);
//       } else {
//         resolve(this.changes > 0);
//       }
//     });
//   });
// }

// module.exports = {
//   initDb,
//   getUserProfile,
//   updateUserProfile,
//   deleteUser,
//   db,
// };
