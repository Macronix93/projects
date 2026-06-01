// Server connection
require("dotenv").config();

const express = require("express");
const https = require("https");
const fs = require("fs");
const app = express();
const serverOptions = {
    key: Buffer.from(fs.readFileSync(process.env.SSL_KEY_PATH)),
    cert: Buffer.from(fs.readFileSync(process.env.SSL_CERT_PATH))
};
const server = new https.Server(serverOptions, app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN
    }
});

const port = process.env.PORT || 8000;
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

app.use("/", express.static(__dirname));
app.get("/", function (req, res) {
    res.sendFile("index.html");
});

const crypto = require("crypto");
const cron = require('node-cron');
cron.schedule('0 6 * * 0', () => {
    console.log("Start Account Cleanup...");
    cleanInactiveAccounts().catch(err => console.error("Cleanup error:", err));
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("Could not connect to MongoDB...", err));

// User Schema
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now},
    currentSessionId: { type: String, default: null },
    authToken: { type: String, default: null },
    stats: {
        total: { wins: { type: Number, default: 0 }, loses: { type: Number, default: 0 }, ties: { type: Number, default: 0 }, games: { type: Number, default: 0}},
        mode2p: { wins: { type: Number, default: 0 }, loses: { type: Number, default: 0 }, ties: { type: Number, default: 0 }, games: { type: Number, default: 0 }},
        mode3p: { wins: { type: Number, default: 0 }, loses: { type: Number, default: 0 }, ties: { type: Number, default: 0 }, games: { type: Number, default: 0 }},
        mode4p: { wins: { type: Number, default: 0 }, loses: { type: Number, default: 0 }, ties: { type: Number, default: 0 }, games: { type: Number, default: 0 }}
    }
});
userSchema.index({ "stats.total.games": 1, createdAt: 1 });
const User = mongoose.model("User", userSchema);

// Server code
const reservedNames = [
    "admin",
    "system",
    "moderator",
    "server",
    "mod",
    "owner",
    "root",
    "staff",
    "support",
    "dev",
    "developer",
    "ai",
    "cpu",
    "guest",
    "anonymous",
    "bot"
];
const colorPool = [
    "#cc3739", // Rot
    "#facc15", // Sonnengelb
    // "#16a34a", // Waldgrün
    // "#9333ea", // Kräftiges Violett
    // "#ff7b00", // Sattes Orange
    "#ffffff", // Reinweiß
    "#00b2ff", // Aqua
    // "#ff00ff", // Magenta / Fuchsia
    "#adff2f",  // Lime / Giftgrün
	"#5c5c5c" // Grau
];
let players = [];
let lobbies = [];
const lobbyTimers = {};
let chatHistory = [];
const MAX_HISTORY_LENGTH = 30;
const MAX_CHAT_SPAM_TIME = 750;
let lastMessageTime = {};
const playerSymbols = ["●", "○", "▲", "■"];

// Helper functions
function getPlayerCount(lobby) {
    return lobby.players.filter(p => p !== null).length;
}

function emitUniquePlayerList() {
    const uniquePlayers = players.filter((v, i, a) =>
        a.findIndex(t => t.sessionId === v.sessionId) === i
    ).map(p => ({
        name: p.name,
        id: p.id,
        sessionId: p.sessionId,
        isGuest: p.isGuest,
        stats: p.stats
    }));

    io.emit("update-player-list", uniquePlayers);
}

function getUniqueColors(count) {
    let poolCopy = [...colorPool];
    let selected = [];

    for (let i = 0; i < count; i++) {
        const randomIndex = Math.floor(Math.random() * poolCopy.length);
        selected.push(poolCopy.splice(randomIndex, 1)[0]);
    }
    return selected;
}

async function updatePlayerStats(lobby) {
    const hasBots = lobby.players.some(p => p && p.isBot);
    if (hasBots) return;

    const modeKey = `mode${lobby.maxPlayers}p`;
    const isDraw = (lobby.currentPlayerIndex === -1);

    for (let index = 0; index < lobby.players.length; index++) {
        const playerInLobby = lobby.players[index];
        if (!playerInLobby) continue;

        const isWinner = (index === lobby.currentPlayerIndex);
        const isLoser = (!isWinner && !isDraw);

        const serverPlayer = players.find(p => p.sessionId === playerInLobby.sessionId);
        if (serverPlayer) {
            serverPlayer.stats.total.games++;
            serverPlayer.stats[modeKey].games++;

            if (isWinner) {
                serverPlayer.stats.total.wins++;
                serverPlayer.stats[modeKey].wins++;
            } else if (isDraw) {
                serverPlayer.stats.total.ties++;
                serverPlayer.stats[modeKey].ties++;
            } else if (isLoser) {
                serverPlayer.stats.total.loses++;
                serverPlayer.stats[modeKey].loses++;
            }

            playerInLobby.stats = JSON.parse(JSON.stringify(serverPlayer.stats));
        }

        if (!playerInLobby.isGuest) {
            const update = {};
            update[`stats.total.games`] = 1;
            update[`stats.${modeKey}.games`] = 1;

            if (isWinner) {
                update[`stats.total.wins`] = 1;
                update[`stats.${modeKey}.wins`] = 1;
            } else if (isDraw) {
                update[`stats.total.ties`] = 1;
                update[`stats.${modeKey}.ties`] = 1;
            } else if (isLoser) {
                update[`stats.total.loses`] = 1;
                update[`stats.${modeKey}.loses`] = 1;
            }

            try {
                await User.findOneAndUpdate(
                    { username: playerInLobby.name },
                    { $inc: update }
                );
            } catch (err) {
                console.error("Error while updatedin stats in db:", err);
            }
        }
    }
    emitUniquePlayerList();
}

function handlePlayerExit(socket, sessionIdToRemove) {
    if (!sessionIdToRemove) return;

    for (let i = lobbies.length - 1; i >= 0; i--) {
        const lobby = lobbies[i];
        const playerIdx = lobby.players.findIndex(p => p && p.sessionId === sessionIdToRemove && !p.isBot);

        if (playerIdx !== -1) {
            const isWaitingMode = getPlayerCount(lobby) < lobby.maxPlayers;
            const isGameRunning = getPlayerCount(lobby) === lobby.maxPlayers && !lobby.gameOver;

            if (isGameRunning) {
                lobby.players[playerIdx].isBot = true;
                lobby.players[playerIdx].id = "bot-" + Date.now();

                if (lobby.currentPlayerIndex === playerIdx) {
                    stopTimer(lobby);
                    setTimeout(() => executeBotMove(lobby), 1000);
                }
            } else {
                lobby.players[playerIdx] = null;

                if (isWaitingMode) {
                    lobby.gameOver = false;
                    stopTimer(lobby);
                }

                if (lobby.gameOver) {
                    const currentRows = lobby.board.length;
                    const currentCols = lobby.board[0].length;
                    lobby.board = Array.from({length: currentRows}, () => Array(currentCols).fill(""));
                    lobby.gameOver = false;
                    lobby.lastMove = null;
                    lobby.winningLine = [];
                    lobby.currentPlayerIndex = 0;
                    stopTimer(lobby);
                    console.log(`Lobby ${lobby.roomID} reset because a player left after game over.`);
                }
            }

            const humanPlayers = lobby.players.filter(p => p !== null && !p.isBot);

            if (humanPlayers.length === 0) {
                stopTimer(lobby);
                io.to(lobby.roomID).emit("lobby-closed", "The lobby was closed because all human players left!");
                lobbies.splice(i, 1);
            } else {
                if (lobby.hostID_Session === sessionIdToRemove) {
                    const nextHuman = humanPlayers[0];
                    lobby.hostID = nextHuman.id;
                    lobby.hostID_Session = nextHuman.sessionId;
                    lobby.lobbyName = "Lobby of " + nextHuman.name;
                }
                io.to(lobby.roomID).emit("update-lobby-game-state", lobby);
            }
        }
    }

    io.emit("update-lobby-list", lobbies);

    socket.rooms.forEach(room => {
        if (room !== socket.id) socket.leave(room);
    });
}

function executeBotMove(lobby) {
    if (lobby.gameOver) return;

    const activePlayerIndex = lobby.currentPlayerIndex;
    const botSymbol = playerSymbols[activePlayerIndex];
    const numCols = lobby.board[0].length;
    const numRows = lobby.board.length;

    const getRow = (col) => {
        for (let r = numRows - 1; r >= 0; r--) {
            if (lobby.board[r][col] === "") return r;
        }
        return -1;
    };

    // Hilfsfunktion: Bewertet eine Reihe von 4 Feldern
    const scoreWindow = (window, symbol) => {
        let score = 0;
        const countFriendly = window.filter(s => s === symbol).length;
        const countEmpty = window.filter(s => s === "").length;
        const countOpponent = window.filter(s => s !== symbol && s !== "").length;

        if (countFriendly === 4) score += 10000;
        else if (countFriendly === 3 && countEmpty === 1) score += 100;
        else if (countFriendly === 2 && countEmpty === 2) score += 10;

        // GEGNER BLOCKEN (Wichtig für 1v1 Fallen)
        if (countOpponent === 3 && countEmpty === 1) score -= 500; // Blocke Dreier-Reihen sofort
        else if (countOpponent === 2 && countEmpty === 2) score -= 50; // Störe Zweier-Reihen frühzeitig

        return score;
    };

    // Bewertet das gesamte Board für ein bestimmtes Symbol
    const evaluateBoard = (board, symbol) => {
        let totalScore = 0;

        // Horizontal
        for (let r = 0; r < numRows; r++) {
            for (let c = 0; c <= numCols - 4; c++) {
                const window = [board[r][c], board[r][c+1], board[r][c+2], board[r][c+3]];
                totalScore += scoreWindow(window, symbol);
            }
        }
        // Vertikal
        for (let c = 0; c < numCols; c++) {
            for (let r = 0; r <= numRows - 4; r++) {
                const window = [board[r][c], board[r+1][c], board[r+2][c], board[r+3][c]];
                totalScore += scoreWindow(window, symbol);
            }
        }
        // Diagonal /
        for (let r = 0; r <= numRows - 4; r++) {
            for (let c = 0; c <= numCols - 4; c++) {
                const window = [board[r][c], board[r+1][c+1], board[r+2][c+2], board[r+3][c+3]];
                totalScore += scoreWindow(window, symbol);
            }
        }
        // Diagonal \
        for (let r = 3; r < numRows; r++) {
            for (let c = 0; c <= numCols - 4; c++) {
                const window = [board[r][c], board[r-1][c+1], board[r-2][c+2], board[r-3][c+3]];
                totalScore += scoreWindow(window, symbol);
            }
        }
        return totalScore;
    };

    let bestScore = -Infinity;
    let bestCols = [];

    for (let c = 0; c < numCols; c++) {
        let r = getRow(c);
        if (r === -1) continue;

        lobby.board[r][c] = botSymbol;

        let score = 0;

        if (checkPureWin(lobby, botSymbol)) {
            score = 1000000;
        } else {
            score = evaluateBoard(lobby.board, botSymbol);
            score += (Math.floor(numCols / 2) - Math.abs(Math.floor(numCols / 2) - c)) * 5;

            if (r > 0) {
                for (let i = 0; i < lobby.maxPlayers; i++) {
                    if (i === activePlayerIndex) continue;
                    if (simulateAndCheckWin(lobby, r - 1, c, playerSymbols[i])) {
                        score -= 50000; // Massiver Abzug
                    }
                }
            }
        }

        lobby.board[r][c] = "";

        if (score > bestScore) {
            bestScore = score;
            bestCols = [c];
        } else if (score === bestScore) {
            bestCols.push(c);
        }
    }

    let chosenCol = bestCols[Math.floor(Math.random() * bestCols.length)];

    if (chosenCol !== undefined) {
        let finalRow = getRow(chosenCol);
        lobby.board[finalRow][chosenCol] = botSymbol;
        lobby.lastMove = { r: finalRow, c: chosenCol };

        if (checkForWin(lobby, botSymbol)) {
            stopTimer(lobby);
        } else {
            lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.maxPlayers;
            const nextPlayer = lobby.players[lobby.currentPlayerIndex];
            if (nextPlayer && nextPlayer.isBot) {
                setTimeout(() => executeBotMove(lobby), 1000);
            } else {
                startTimer(lobby);
            }
        }
        io.to(lobby.roomID).emit("update-lobby-game-state", lobby);
    }
}

function simulateAndCheckWin(lobby, row, col, symbol) {
    lobby.board[row][col] = symbol;
    const win = checkPureWin(lobby, symbol);
    lobby.board[row][col] = "";
    return win;
}

function checkPureWin(lobby, player) {
    const numRows = lobby.board.length;
    const numCols = lobby.board[0].length;

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r][c+1] === player && lobby.board[r][c+2] === player && lobby.board[r][c+3] === player) return true;
        }
    }
    for (let c = 0; c < numCols; c++) {
        for (let r = 0; r <= numRows - 4; r++) {
            if (lobby.board[r][c] === player && lobby.board[r+1][c] === player && lobby.board[r+2][c] === player && lobby.board[r+3][c] === player) return true;
        }
    }
    for (let r = 0; r <= numRows - 4; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r+1][c+1] === player && lobby.board[r+2][c+2] === player && lobby.board[r+3][c+3] === player) return true;
        }
    }
    for (let r = 3; r < numRows; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r-1][c+1] === player && lobby.board[r-2][c+2] === player && lobby.board[r-3][c+3] === player) return true;
        }
    }
    return false;
}

// Helper function for timer
function startTimer(lobby) {
    if (lobbyTimers[lobby.roomID]) clearInterval(lobbyTimers[lobby.roomID]);

    lobby.timeLeft = 30;
    io.to(lobby.roomID).emit("timer-update", lobby.timeLeft, lobby.currentPlayerIndex);

    lobbyTimers[lobby.roomID] = setInterval(() => {
        if (!lobby.gameOver && getPlayerCount(lobby) === lobby.maxPlayers) {
            lobby.timeLeft--;

            if (lobby.timeLeft <= 0) {
                // Auto-Move Logik
                let validCols = [];
                for (let c = 0; c < lobby.board[0].length; c++) {
                    if (lobby.board[0][c] === "") validCols.push(c);
                }

                if (validCols.length > 0) {
                    const randomCol = validCols[Math.floor(Math.random() * validCols.length)];
                    const currentSymbol = playerSymbols[lobby.currentPlayerIndex];

                    for (let row = lobby.board.length - 1; row >= 0; row--) {
                        if (lobby.board[row][randomCol] === "") {
                            lobby.board[row][randomCol] = currentSymbol;
                            lobby.lastMove = { r: row, c: randomCol };

                            if (!checkForWin(lobby, currentSymbol)) {
                                lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.maxPlayers;

                                const nextPlayer = lobby.players[lobby.currentPlayerIndex];
                                if (nextPlayer && nextPlayer.isBot) {
                                    stopTimer(lobby);
                                    setTimeout(() => executeBotMove(lobby), 1000);
                                } else {
                                    startTimer(lobby);
                                }
                            } else {
                                stopTimer(lobby);
                            }
                            break;
                        }
                    }
                }
                io.to(lobby.roomID).emit("update-lobby-game-state", lobby);
            } else {
                io.to(lobby.roomID).emit("timer-update", lobby.timeLeft, lobby.currentPlayerIndex);
            }
        } else {
            stopTimer(lobby);
        }
    }, 1000);
}

function stopTimer(lobby) {
    if (lobby && lobbyTimers[lobby.roomID]) {
        clearInterval(lobbyTimers[lobby.roomID]);
        delete lobbyTimers[lobby.roomID];
    }
}

io.engine.on("connection_error", (err) => {
    const { code, message } = err;
    console.log("Socket-Fehler:", message);
    console.log("Code:", code);
});

io.on("connection", socket => {
    socket.on("logout", (sessionId) => {
        const player = players.find(p => p.id === socket.id);
        if (!player) return;

        socket.userId = null;
        socket.username = null;

        player.userId = null;
        player.isGuest = true;
        player.name = "Guest" + Math.floor(1000 + Math.random() * 9000);
        player.stats = {
            total: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode2p: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode3p: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode4p: { wins: 0, loses: 0, ties: 0, games: 0 }
        };

        handlePlayerExit(socket, sessionId);

        socket.emit("logout-confirmed", player.name);
        emitUniquePlayerList();
        io.emit("update-lobby-list", lobbies);
    });

    socket.on("register", async (data) => {
        try {
            const { username, password } = data;
            const trimmedName = username.trim();
            const lower = trimmedName.toLowerCase();
            if (reservedNames.includes(lower)) return socket.emit("auth-error", "This username is not allowed.");
            const existingUser = await User.findOne({ username: { $regex: new RegExp("^" + trimmedName + "$", "i") } });
            if (existingUser) return socket.emit("auth-error", "Username already exists!");
            const nameOnline = players.some(p =>
                p.name.toLowerCase() === trimmedName.toLowerCase() &&
                p.id !== socket.id
            );
            if (nameOnline) return socket.emit("auth-error", "This name is currently in use by a Guest!");
            if (socket.rooms.size !== 1) return socket.emit("auth-error", "You can't change your name while in a lobby!");
            if (trimmedName.length > 25 || trimmedName.length < 3) return socket.emit("auth-error", "Name is too short or too long!");
            if (password.length > 32 || password.length < 6) return socket.emit("auth-error", "Password must be between 6 and 32 characters!");
            if (!isAlphaNumericWithSpaces(trimmedName)) return socket.emit("auth-error", "Name contains too many illegal characters!");

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = new User({
                username: trimmedName,
                password: hashedPassword,
                currentSessionId: data.sessionId,
                authToken: crypto.randomBytes(64).toString('hex')
            });
            await newUser.save();

            const pIndex = players.findIndex(p => p.id === socket.id);
            if (pIndex !== -1) {
                players[pIndex].name = newUser.username;
                players[pIndex].isGuest = false;
                players[pIndex].stats = newUser.stats;
                players[pIndex].userId = newUser._id.toString();
            }

            socket.emit("auth-success", { username: newUser.username, stats: newUser.stats, token: newUser.authToken, message: "Registered successfully!" });

            emitUniquePlayerList();
        } catch (err) {
            socket.emit("auth-error", "Registration failed.");
        }
    });

    socket.on("login", async (data) => {
        try {
            if (socket.userId) {
                return socket.emit("auth-error", "Already logged in.");
            }

            const user = await User.findOne({ username: data.username });
            if (!user || !(await bcrypt.compare(data.password, user.password))) {
                return socket.emit("auth-error", "Login failed.");
            }

            const alreadyLoggedIn = players.some(p => p.userId === user._id.toString());
            if (alreadyLoggedIn) {
                return socket.emit("auth-error", "User already logged in elsewhere.");
            }

            socket.userId = user._id.toString();
            socket.username = user.username;
            user.currentSessionId = data.sessionId;
            const token = crypto.randomBytes(64).toString('hex');
            user.authToken = token;
            await user.save();

            const pIndex = players.findIndex(p => p.id === socket.id);
            if(pIndex !== -1) {
                players[pIndex].name = user.username;
                players[pIndex].isGuest = false;
                players[pIndex].stats = user.stats;
                players[pIndex].userId = user._id.toString();
            }

            socket.emit("auth-success", {
                username: user.username,
                stats: user.stats,
                token: token,
                message: "Logged in successfully!"
            });

            emitUniquePlayerList();
        } catch (err) {
            socket.emit("auth-error", "Login failed");
        }
    });

    socket.on("auto-login", async (token, sessionId) => {
        try {
            const user = await User.findOne({ authToken: token });
            if (!user) return socket.emit("auth-error", "Session expired.");

            const alreadyOnline = players.find(p => p.userId === user._id.toString() && p.sessionId !== sessionId);

            if (alreadyOnline) {
                return socket.emit("auth-error", "Account already logged in elsewhere!");
            }

            socket.userId = user._id.toString();
            socket.username = user.username;

            let pIndex = players.findIndex(p => p.sessionId === sessionId);
            if (pIndex !== -1) {
                players[pIndex].id = socket.id;
                players[pIndex].name = user.username;
                players[pIndex].isGuest = false;
                players[pIndex].stats = user.stats;
            } else {
                players.push({
                    name: user.username,
                    id: socket.id,
                    sessionId: sessionId,
                    isGuest: false,
                    stats: user.stats,
                    userId: user._id.toString()
                });
            }

            socket.emit("auth-success", {
                username: user.username,
                stats: user.stats
            });

            emitUniquePlayerList();
            io.emit("update-lobby-list", lobbies);
            socket.emit("load-chat-history", chatHistory);
        } catch (err) {
            socket.emit("auth-error", "Auto-Login failed.");
        }
    });

    socket.on("add-player-to-list", async (playerName, playerID, sessionId) => {
        const registeredUser = await User.findOne({ currentSessionId: sessionId });

        let finalName = playerName;
        let userStats = {
            total: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode2p: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode3p: { wins: 0, loses: 0, ties: 0, games: 0 },
            mode4p: { wins: 0, loses: 0, ties: 0, games: 0 }
        };
        let isGuest = true;

        if (registeredUser) {
            finalName = registeredUser.username;
            userStats = registeredUser.stats;
            isGuest = false;
            socket.emit("auth-success", { username: finalName, stats: registeredUser.stats, message: "Auto-Login erfolgreich!" });
        } else {
            const nameExists = players.some(p => p.name.toLowerCase() === finalName.toLowerCase() && p.sessionId !== sessionId);
            if (nameExists) {
                finalName = playerName + "#" + Math.floor(1000 + Math.random() * 9000);
            }
        }

        players.push({
            name: finalName,
            id: playerID,
            sessionId: sessionId,
            isGuest: isGuest,
            stats: userStats
        });

        const lobby = lobbies.find(l => l.players.some(p => p && p.sessionId === sessionId && !p.isBot));
        if (lobby) {
            const pInLobby = lobby.players.find(p => p && p.sessionId === sessionId);
            const isStarted = getPlayerCount(lobby) === lobby.maxPlayers;

            if (pInLobby && !pInLobby.isBot && isStarted && !lobby.gameOver) {
                pInLobby.isBot = false;
                pInLobby.id = playerID;
                pInLobby.name = finalName;

                if (lobby.hostID_Session === sessionId) {
                    lobby.hostID = playerID;
                }

                socket.join(lobby.roomID);
                socket.emit("show-lobby", lobby.roomID, false, lobby.maxPlayers);
                io.to(lobby.roomID).emit("update-lobby-game-state", lobby);
            }
        }

        emitUniquePlayerList();
        io.emit("update-lobby-list", lobbies);
        socket.emit("load-chat-history", chatHistory);
    });

    // Handle disconnecting of players
    socket.on("disconnecting", () => {
        const player = players.find(p => p.id === socket.id);
        if (!player) return;

        const sId = player.sessionId;

        let roomIDBeforeDisconnect = null;
        for (const room of socket.rooms) {
            if (room !== socket.id) {
                roomIDBeforeDisconnect = room;
                break;
            }
        }

        players = players.filter(p => p.id !== socket.id);

        setTimeout(() => {
            const otherSocketsWithSameSession = players.filter(p => p.sessionId === sId);

            if (otherSocketsWithSameSession.length === 0) {
                handlePlayerExit(socket, sId);
            } else if (roomIDBeforeDisconnect) {
                let tabStillInLobby = false;

                for (const p of otherSocketsWithSameSession) {
                    const otherSocket = io.sockets.sockets.get(p.id);
                    if (otherSocket && otherSocket.rooms.has(roomIDBeforeDisconnect)) {
                        tabStillInLobby = true;
                        break;
                    }
                }

                if (!tabStillInLobby) {
                    handlePlayerExit(socket, sId);
                }
            }

            emitUniquePlayerList();
        }, 2000);
    });
	
    socket.on("send-chat-message", (message, playerID) => {
        if (message.length > 200 || message.length < 1) {
            socket.emit("lobby-error", "Chat message is too short or too long!");
            return;
        }

        const now = new Date();
        if (lastMessageTime[playerID] && (now - lastMessageTime[playerID] < MAX_CHAT_SPAM_TIME)) {
            return;
        }
        lastMessageTime[playerID] = now;

        const lobby = lobbies.find(l =>
            l.players.some(p => p && p.id === socket.id)
        );

        let senderColor = "#FFFFFF"; // Default
        if (lobby) {
            const slotIndex = lobby.players.findIndex(p => p && p.id === socket.id);
            if (slotIndex !== -1) {
                senderColor = lobby.playerColors?.[slotIndex] || "#FFFFFF";
            }
        }
        const foundPlayer = players.find(p => p.id === socket.id);
        const senderName = foundPlayer ? foundPlayer.name : "Unknown";
        const senderID = socket.id;
        const timeString = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        const fullDateString = now.toLocaleString('de-DE');

        const chatData = {
            message: message,
            playerName: senderName,
            playerID: senderID,
            color: senderColor,
            time: timeString,
            fullDate: fullDateString
        };

        chatHistory.push(chatData);
        if (chatHistory.length > MAX_HISTORY_LENGTH) chatHistory.shift();

        io.emit("receive-chat-message", chatData.message, chatData.playerName, chatData.playerID, chatData.time, chatData.fullDate, chatData.color);
    });

    socket.on("update-player-name-in-list", async (newName, playerID) => {
		const trimmedName = newName.trim();
        const lower = trimmedName.toLowerCase();

        if (reservedNames.includes(lower)) {
            return socket.emit("auth-error", "This username is not allowed.");
        }
		
        if (socket.rooms.size !== 1) {
            socket.emit("lobby-error", "You can't change your name while in a lobby!");
            return;
        }

        if (trimmedName.length > 25 || trimmedName.length < 3) {
            socket.emit("lobby-error", "Name is too short or too long!");
            return;
        }

        if (!isAlphaNumericWithSpaces(trimmedName)) {
            socket.emit("lobby-error", "Name contains too many illegal characters!");
            return;
        }

        const isReserved = await User.findOne({ username: { $regex: new RegExp("^" + trimmedName + "$", "i") } });
        if (isReserved) {
            return socket.emit("lobby-error", "This name is already registered on the Server!");
        }

		const nameExists = players.some(player => 
			player.name.toLowerCase() === trimmedName.toLowerCase() && player.id !== playerID
		);

		if (nameExists) {
			socket.emit("lobby-error", "This name is already taken!");
			return;
		}

        // Spieler in der Liste finden
        const player = players.find(p => p.id === playerID);
        if (!player) return;

        const oldName = player.name;

        // FALL 1: Registrierter User -> DB Update
        if (!player.isGuest) {
            try {
                await User.findOneAndUpdate({ username: oldName }, { username: trimmedName }, {});
                console.log(`DB Update: ${oldName} renamed to ${trimmedName}`);
            } catch (err) {
                return socket.emit("lobby-error", "Database error during rename.");
            }
        }

        // FALL 2: Für alle (Gast & User) -> Liste im RAM updaten
        player.name = trimmedName;

        emitUniquePlayerList();
    });

    socket.on("make-move", (playerID, col, roomID) => {
        const lobby = lobbies.find(l => l.roomID === roomID);
        if (lobby && !lobby.gameOver && getPlayerCount(lobby) === lobby.maxPlayers) {
            const activePlayer = lobby.players[lobby.currentPlayerIndex];
            if (activePlayer.id !== playerID) {
                socket.emit("lobby-error", "It's not your turn!");
                return;
            }

            for (let row = lobby.board.length - 1; row >= 0; row--) {
                if (lobby.board[row][col] === "") {
                    const currentSymbol = playerSymbols[lobby.currentPlayerIndex];
                    lobby.board[row][col] = currentSymbol;
                    lobby.lastMove = { r: row, c: col };

                    if (checkForWin(lobby, currentSymbol)) {
                        stopTimer(lobby);
                    } else {
                        lobby.currentPlayerIndex = (lobby.currentPlayerIndex + 1) % lobby.maxPlayers;

                        const nextPlayer = lobby.players[lobby.currentPlayerIndex];
                        if (nextPlayer && nextPlayer.isBot) {
                            stopTimer(lobby);
                            setTimeout(() => executeBotMove(lobby), 1000);
                        } else {
                            startTimer(lobby);
                        }
                    }

                    io.in(roomID).emit("update-lobby-game-state", lobby);
                    break;
                }
            }
        }
    });

    socket.on("create-lobby", (maxPlayersInput, playerID, fillWithBots, botCount) => {
        const player = players.find(p => p.id === playerID);
        if (!player) return;

        const alreadyInLobby = lobbies.find(l => l.players.some(p => p && p.sessionId === player.sessionId && !p.isBot));
        if (alreadyInLobby) {
            socket.emit("lobby-error", "You are already active in another lobby!");
            return;
        }

        const maxPlayers = parseInt(maxPlayersInput);
        let rows = 6; let cols = 7;
        if (maxPlayers === 3) { rows = 7; cols = 9; }
        if (maxPlayers === 4) { rows = 8; cols = 10; }

        const sId = player ? player.sessionId : null;
        const lobbyColors = getUniqueColors(maxPlayers);
        const roomID = "room-" + crypto.randomUUID();

        const slots = new Array(maxPlayers).fill(null);
        slots[0] = { name: player.name, id: playerID, sessionId: sId, isBot: false };

        let botsToAdd;
        if (fillWithBots) {
            botsToAdd = maxPlayers - 1;
        } else {
            botsToAdd = Math.min(botCount, maxPlayers - 1);
        }

        for (let i = 1; i <= botsToAdd; i++) {
            slots[i] = {
                name: "Bot",
                id: "bot-" + Date.now() + "-" + i,
                sessionId: "bot-session-" + i,
                isBot: true
            };
        }

        const newLobby = {
            players: slots,
            roomID: roomID,
            lobbyName: `Lobby of ${player.name}`,
            maxPlayers: maxPlayers,
            board: Array.from({length: rows}, () => Array(cols).fill("")),
            hostID: playerID,
            hostID_Session: sId,
            currentPlayerIndex: 0,
            gameOver: false,
            timeLeft: 30,
            playerColors: lobbyColors,
            lastMove: null,
            winningLine: []
        };

        lobbies.push(newLobby);
        socket.join(roomID);
        socket.emit("show-lobby", roomID, false, newLobby.maxPlayers);

        if (getPlayerCount(newLobby) === newLobby.maxPlayers) {
            newLobby.currentPlayerIndex = Math.floor(Math.random() * newLobby.maxPlayers);

            const firstPlayer = newLobby.players[newLobby.currentPlayerIndex];
            if (firstPlayer && firstPlayer.isBot) {
                setTimeout(() => executeBotMove(newLobby), 1500);
            } else {
                startTimer(newLobby);
            }
        }

        io.emit("update-lobby-list", lobbies);
        io.in(roomID).emit("update-lobby-game-state", newLobby);
    });

    socket.on("join-lobby", (playerName, playerID, roomID) => {
        const lobby = lobbies.find(l => l.roomID === roomID);
        if (!lobby) return;

        const player = players.find(p => p.id === playerID);
        const sId = player.sessionId;
        const existingPlayerIndex = lobby.players.findIndex(p => p && p.sessionId === sId);

        if (existingPlayerIndex !== -1) {
            lobby.players[existingPlayerIndex].isBot = false;
            lobby.players[existingPlayerIndex].id = playerID;
            lobby.players[existingPlayerIndex].name = player.name;

            socket.join(roomID);
            socket.emit("show-lobby", roomID, false, lobby.maxPlayers);

            io.to(roomID).emit("update-lobby-game-state", lobby);

            if (getPlayerCount(lobby) === lobby.maxPlayers && !lobby.gameOver) {
                if (lobby.currentPlayerIndex === existingPlayerIndex) {
                    startTimer(lobby);
                }
            }
            return;
        }

        if (lobby.players.some(p => p && p.sessionId === sId && !p.isBot)) {
            socket.emit("lobby-error", "You are already in this lobby!");
            return;
        }

        if (getPlayerCount(lobby) < lobby.maxPlayers) {
            const freeSlotIndex = lobby.players.findIndex(slot => slot === null);
            if (freeSlotIndex !== -1) {
                lobby.players[freeSlotIndex] = {
                    name: player.name,
                    id: playerID,
                    sessionId: sId
                };
            }

            socket.join(roomID);
            socket.emit("show-lobby", roomID, false, lobby.maxPlayers);

            if (getPlayerCount(lobby) === lobby.maxPlayers) {
                lobby.currentPlayerIndex = Math.floor(Math.random() * lobby.maxPlayers);

                const activePlayer = lobby.players[lobby.currentPlayerIndex];
                if (activePlayer && activePlayer.isBot) {
                    setTimeout(() => executeBotMove(lobby), 1000);
                } else {
                    startTimer(lobby);
                }
            }
        } else {
            socket.join(roomID);
            socket.emit("show-lobby", roomID, true, lobby.maxPlayers);
        }

        io.emit("update-lobby-list", lobbies);
        io.to(roomID).emit("update-lobby-game-state", lobby);
    });

	socket.on("leave-lobby", () => {
		const player = players.find(p => p.id === socket.id);
		if (player) {
			handlePlayerExit(socket, player.sessionId);
		}
	});

    socket.on("restart-game", (roomID) => {
        const lobby = lobbies.find(l => l.roomID === roomID);
        if (!lobby) return;

        const currentRows = lobby.board.length;
        const currentCols = lobby.board[0].length;

        if (lobby.gameOver && socket.id === lobby.hostID) {
            lobby.board = Array.from({length: currentRows}, () => Array(currentCols).fill(""));
            lobby.gameOver = false;
            lobby.lastMove = null;
            lobby.winningLine = [];
            lobby.timeLeft = 30;
            lobby.currentPlayerIndex = Math.floor(Math.random() * lobby.maxPlayers);

            io.to(roomID).emit("update-lobby-game-state", lobby);

            const activePlayer = lobby.players[lobby.currentPlayerIndex];
            if (activePlayer && activePlayer.isBot) {
                stopTimer(lobby);
                setTimeout(() => executeBotMove(lobby), 1500);
            } else {
                startTimer(lobby);
            }

            io.emit("update-lobby-list", lobbies);
        } else if (socket.id !== lobby.hostID) {
            socket.emit("lobby-error", "Only the host can restart the game!");
        }
    });
});

function isAlphaNumericWithSpaces(str) {
	return /^[a-zA-Z0-9äöüÄÖÜß]+(?:[ _][a-zA-Z0-9äöüÄÖÜß]+)*$/.test(str);
}

function checkForWin(lobby, player) {
    const numRows = lobby.board.length;
    const numCols = lobby.board[0].length;

    const win = (coords) => {
        lobby.winningLine = coords;
        lobby.gameOver = true;
        updatePlayerStats(lobby).catch(err => console.error("Stats Update Error:", err));
        return true;
    };

    // Checks
    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r][c+1] === player && lobby.board[r][c+2] === player && lobby.board[r][c+3] === player)
                return win([{r,c}, {r,c:c+1}, {r,c:c+2}, {r,c:c+3}]);
        }
    }
    for (let c = 0; c < numCols; c++) {
        for (let r = 0; r <= numRows - 4; r++) {
            if (lobby.board[r][c] === player && lobby.board[r+1][c] === player && lobby.board[r+2][c] === player && lobby.board[r+3][c] === player)
                return win([{r,c}, {r:r+1,c}, {r:r+2,c}, {r:r+3,c}]);
        }
    }
    for (let r = 0; r <= numRows - 4; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r+1][c+1] === player && lobby.board[r+2][c+2] === player && lobby.board[r+3][c+3] === player)
                return win([{r,c}, {r:r+1,c:c+1}, {r:r+2,c:c+2}, {r:r+3,c:c+3}]);
        }
    }
    for (let r = 3; r < numRows; r++) {
        for (let c = 0; c <= numCols - 4; c++) {
            if (lobby.board[r][c] === player && lobby.board[r-1][c+1] === player && lobby.board[r-2][c+2] === player && lobby.board[r-3][c+3] === player)
                return win([{r,c}, {r:r-1,c:c+1}, {r:r-2,c:c+2}, {r:r-3,c:c+3}]);
        }
    }

    // Tie Check
    const isDraw = lobby.board[0].every(cell => cell !== "");
    if (isDraw) {
        lobby.gameOver = true;
        lobby.currentPlayerIndex = -1;
        lobby.winningLine = [];
        updatePlayerStats(lobby).catch(err => console.error("Stats Update Error:", err));
        return true;
    }

    return false;
}

async function cleanInactiveAccounts() {
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const cutoffDate = new Date(Date.now() - SEVEN_DAYS);

    try {
        const result = await User.deleteMany({
            "stats.total.games": 0,
            createdAt: { $lt: cutoffDate }
        });

        console.log(`Deleted ${result.deletedCount} inactive accounts.`);
    } catch (err) {
        console.error("Cleanup error:", err);
    }
}