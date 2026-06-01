/* global io */
/** @type {import('socket.io-client').Socket} */
const socket = io("https://sylvan-giese.de:8000");

const form = document.getElementById("form");
const playerContainer = document.getElementById("player-container");
const playerSection = document.getElementById("player-section")
const lobbyContainer = document.getElementById("lobby-container");
const lobbySection = document.getElementById("lobby-section");
const nameSection = document.querySelector(".name-section");
const nameInput = document.getElementById("name-input");
const profileHeading = document.getElementById("profile-heading");
const setNameButton = document.getElementById("set-name");
setNameButton.disabled = true;
const createLobbyButton = document.getElementById("create-lobby");
const leaveLobbyButton = document.getElementById("leave-lobby");
const chatMessageContainer = document.getElementById("chat-container");
const chatMessageButton = document.getElementById("send-message");
const messageInput = document.getElementById("chat-message-input");
messageInput.setAttribute("autocomplete", "off");
messageInput.setAttribute("autocorrect", "off");
messageInput.setAttribute("autocapitalize", "off");
messageInput.setAttribute("spellcheck", "false");
const chatForm = document.getElementById("chat-form");
const restartButton = document.createElement("button");
restartButton.innerText = "Next Round";
restartButton.id = "restart-game";
restartButton.type = "button";
const timerDisplay = document.createElement("p");
timerDisplay.id = "timer-display";
timerDisplay.innerHTML = "Time left: 30s";
const flexItem = document.getElementById("flex-item");
const gameBoard = document.createElement("div");
const table = document.createElement("table");
const playerOne = document.createElement("p");
const playerTwo = document.createElement("p");
playerOne.classList.add("player-display-text");
playerTwo.classList.add("player-display-text");
const playerInfoWrapper = document.createElement("div");
playerInfoWrapper.id = "player-info-wrapper";
playerInfoWrapper.append(playerOne, playerTwo);
const currentTurn = document.createElement("p");
currentTurn.id = "current-turn-display";
const lobbyDialog = document.getElementById("lobby-dialog");
const closeDialog = document.getElementById("close-dialog");
const openAuthBtn = document.getElementById("open-auth-btn");
const authSubmitBtn = document.getElementById("auth-submit-btn");
const authSwitchBtn = document.getElementById("auth-switch-btn");
const authUsernameInput = document.getElementById("auth-username");
const authPasswordInput = document.getElementById("auth-password");
const closeAuth = document.getElementById("close-auth");

let titleInterval = null;
let originalTitle = document.title;
let isLoggedIn = false;
let isLoginMode = true;
const MAX_VISIBLE_MESSAGES = 30;
let clickHandlers = [];
let currentName = "";
let board = [];
let popupFader;
let lastLobbyState = null;
let currentRoomID = null;
let isSpectator = false;
let sessionId = localStorage.getItem("clientSessionId");
if (!sessionId) {
    sessionId = "sess-" + self.crypto.randomUUID();
    localStorage.setItem("clientSessionId", sessionId);

    console.log(sessionId)
}
let popupCooldown = false;

table.setAttribute("id", "play-field");

gameBoard.append(playerInfoWrapper, timerDisplay, currentTurn, table);
gameBoard.setAttribute("id", "game-board");
leaveLobbyButton.style.display = "none";
leaveLobbyButton.parentNode.insertBefore(restartButton, leaveLobbyButton);

let selectedSize = 2;
let selectedBots = 0;

function setupSegmentedControl(containerId, callback) {
    const container = document.getElementById(containerId);
    const buttons = container.querySelectorAll('.segment-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            callback(btn.dataset.value || btn.dataset.bot);
            validateBotSelection();
        });
    });
}

function validateBotSelection() {
    const botButtons = document.querySelectorAll('#bot-selector .segment-btn');
    botButtons.forEach(btn => {
        const botCount = parseInt(btn.dataset.bot);
        if (botCount >= selectedSize) {
            btn.disabled = true;
            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                botButtons[0].classList.add('active');
                selectedBots = 0;
            }
        } else {
            btn.disabled = false;
        }
    });
}

setupSegmentedControl('size-selector', (val) => selectedSize = parseInt(val));
setupSegmentedControl('bot-selector', (val) => selectedBots = parseInt(val));

socket.on("logout-confirmed", (newGuestName) => {
    isLoggedIn = false;
    currentName = newGuestName;
    nameInput.value = newGuestName;

    openAuthBtn.innerText = "Login";
    openAuthBtn.classList.remove("logout-active");
    openAuthBtn.style.display = "block";

    hideGameBoard();
    showPopup("Logged out successfully!");
});

socket.on("connect", () => {
    const savedToken = localStorage.getItem("connect4_auth_token");
    const savedName = localStorage.getItem("savedPlayerName");

    if (savedToken) {
        socket.emit("auto-login", savedToken, sessionId);
    } else {
        let guestName = savedName || ("Guest" + Math.floor(1000 + Math.random() * 9000));
        nameInput.value = guestName;
        sendAddPlayerEvent(guestName, socket.id, sessionId);
    }
});

socket.on("auth-success", (data) => {
    isLoggedIn = true;
    if (data.message) {
        showPopup(data.message);
    }

    nameInput.value = data.username;
    currentName = data.username;

    localStorage.setItem("savedPlayerName", data.username);
    if (data.token) {
        localStorage.setItem("connect4_auth_token", data.token);
    }

    openAuthBtn.innerText = "Logout";
    openAuthBtn.style.display = "block";
    openAuthBtn.classList.add("logout-active");
    document.getElementById("auth-dialog").classList.remove("active");
    document.getElementById("modal-overlay").classList.remove("active");
});

socket.on("auth-error", (msg) => {
    showPopup(msg);

    if (msg === "Session expired." || msg === "Auto-Login failed.") {
        localStorage.removeItem("connect4_auth_token");

        let savedName = localStorage.getItem("savedPlayerName");
        let guestName = savedName || ("Guest" + Math.floor(1000 + Math.random() * 9000));

        nameInput.value = guestName;
        sendAddPlayerEvent(guestName, socket.id, sessionId);
    }
});

socket.on("update-player-list", updatedPlayers => {
    playerContainer.innerHTML = "";

    updatedPlayers.forEach(player => {
        updatePlayerList(player);

        if (socket.id === player.id) {
            currentName = player.name;
            if (document.activeElement !== nameInput) {
                nameInput.value = player.name;
            }
            setNameButton.disabled = true;

            if (isLoggedIn) {
                localStorage.setItem("savedPlayerName", player.name);
            }
        }
    });
});

socket.on("update-lobby-list", updatedLobbies => {
    if (updatedLobbies.length === 0) {
        lobbyContainer.innerHTML = '<p style="color: #64748b; text-align: center; font-style: italic;">There are currently no open lobbies...</p>';
    } else {
        lobbyContainer.innerHTML = "";
        updatedLobbies.forEach(lobby => {
            updateLobbyList(
                lobby.lobbyName,
                lobby.roomID,
                lobby.players.filter(p => p !== null).length,
                lobby.maxPlayers
            );
        });
    }
})

socket.on("lobby-error", (error) => {
    showPopup(error);
})

socket.on("lobby-closed", (message) => {
	if(isSpectator) {
		showPopup(message);
	}
	
    hideGameBoard();
});

socket.on("show-lobby", (roomID, spectatorMode, maxPlayersInput) => {
    isSpectator = spectatorMode;

    const maxPlayers = Number(maxPlayersInput);
    let r = 6, c = 7;
    if (maxPlayers === 3) { r = 7; c = 9; }
    if (maxPlayers === 4) { r = 8; c = 10; }

    generateTable(r, c, maxPlayers);
    showGameBoard(roomID, maxPlayers);
})

socket.on("timer-update", (timeLeft, activePlayerIndex) => {
    if (!lastLobbyState || !lastLobbyState.players[activePlayerIndex]) return;

    const isFull = (lastLobbyState.players.filter(p => p !== null).length === lastLobbyState.maxPlayers);
    const activePlayer = lastLobbyState.players[activePlayerIndex];
    const isMyTurn = (activePlayer && activePlayer.id === socket.id);

    if (isFull && !lastLobbyState.gameOver && (isMyTurn || isSpectator)) {
        timerDisplay.style.display = "block";
        timerDisplay.innerHTML = `Time left: <span style="color: ${timeLeft <= 5 ? 'var(--player1-color)' : 'white'}">${timeLeft}s</span>`;
    } else {
        timerDisplay.style.display = "none";
    }
});

socket.on("receive-chat-message", (message, playerName, playerID, timestamp, fullDate, color) => {
    if (socket.id === playerID) {
        messageInput.value = "";
    }

    appendMessage(message, playerName, playerID, timestamp, fullDate, color);
});

socket.on("load-chat-history", (history) => {
    if (history.length === 0) {
        chatMessageContainer.innerHTML = '<p id="chat-empty-msg" style="color: #64748b; text-align: center; font-style: italic;">There are currently no chat messages...</p>';
    } else {
        chatMessageContainer.innerHTML = "";
        history.forEach(data => {
            appendMessage(data.message, data.playerName, data.playerID, data.time, data.fullDate, data.color);
        });
    }
});

socket.on("update-lobby-game-state", (lobby) => {
    if (currentRoomID && lobby.roomID !== currentRoomID) return;

    if (lastLobbyState && lastLobbyState.gameOver && !lobby.gameOver) {
        showPopup(isSpectator ? "A new round started!" : "A new round has started! Good luck!");
    }

    const gameJustEnded = lobby.gameOver && (!lastLobbyState || !lastLobbyState.gameOver);
    const gameJustStarted =
        !lobby.gameOver &&
        lastLobbyState &&
        lastLobbyState.gameOver === true;

    if (gameJustStarted) {
        startTitleNotification();
    }

    if (lobby.gameOver) {
        stopTitleNotification();
    }
    lastLobbyState = lobby;

    const isFull = (lastLobbyState.players.filter(p => p !== null).length === lastLobbyState.maxPlayers);
    const activePlayer = lobby.players[lobby.currentPlayerIndex];
    const isMyTurn = (!lobby.gameOver && isFull && activePlayer && activePlayer.id === socket.id);

    playerInfoWrapper.innerHTML = "";
    for (let i = 0; i < lobby.maxPlayers; i++) {
        const p = lobby.players[i];
        const pDiv = document.createElement("p");
        pDiv.className = "player-display-text";

        if (p) {
            const isFull = lobby.players.filter(p => p !== null).length === lobby.maxPlayers;
            const isCurrent = (lobby.currentPlayerIndex === i && isFull && !lobby.gameOver);
            const color = lobby.playerColors[i];
            const hostCrown = p.id === lobby.hostID ? '<span class="host-crown" data-tooltip="Host">👑</span>' : '';
            const botIcon = p.isBot ? '<span class="bot-icon" data-tooltip="Bot">🤖</span>' : '';

            pDiv.innerHTML = `
                <span class="player-dot" style="background: radial-gradient(circle at 30% 30%, ${color}, #000); ${isCurrent ? 'border: 2px solid white;' : ''}"></span>
                <span class="name-label">${p.name}</span>
                ${hostCrown}
                ${botIcon}
            `;
        } else {
            pDiv.innerHTML = `
                <span class="player-dot" style="background: #334155; opacity: 0.3; border: 1px dashed #64748b;"></span>
                <span class="name-label empty-slot" style="color: rgba(255, 255, 255, 0.4); font-style: italic;">(empty)</span>
            `;
        }
        playerInfoWrapper.appendChild(pDiv);
    }

    for (let row = 0; row < lobby.board.length; row++) {
        for (let col = 0; col < lobby.board[0].length; col++) {
            const cell = board[row][col];
            const symbol = lobby.board[row][col];
            cell.classList.remove("last-move", "winner-token");

            if (symbol !== "" && cell.children.length === 0) {
                const token = document.createElement("div");
                token.classList.add("token", "animate-drop");
                token.style.setProperty('--row', String(row));

                const symbolIndex = ["●", "○", "▲", "■"].indexOf(symbol);
                const color = lobby.playerColors[symbolIndex] || "#ffffff";
                token.style.background = `radial-gradient(circle at 30% 30%, ${color}, #000)`;
                cell.appendChild(token);
            } else if (symbol === "" && cell.children.length > 0) {
                cell.innerHTML = "";
            }

            if (lobby.lastMove && lobby.lastMove.r === row && lobby.lastMove.c === col) cell.classList.add("last-move");
            if (lobby.winningLine) {
                lobby.winningLine.forEach(coord => {
                    if (coord.r === row && coord.c === col) cell.classList.add("winner-token");
                });
            }
        }
    }

    if (!lobby.gameOver && isFull && (isMyTurn || isSpectator)) {
        timerDisplay.style.display = "block";
    } else {
        timerDisplay.style.display = "none";
    }

    if (lobby.gameOver) {
        if (lobby.currentPlayerIndex === -1) {
            currentTurn.innerHTML = "<b>Tied!</b>";
            showPopup("Draw!");
        } else {
            const winner = lobby.players[lobby.currentPlayerIndex];
            const color = lobby.playerColors[lobby.currentPlayerIndex];
            currentTurn.innerHTML = `Winner: <span style="color:${color}">${winner.name}</span>`;

            if (gameJustEnded) {
                showPopup(winner.id === socket.id ? "YOU WON!" : winner.name + " won!");
            }
        }
        restartButton.style.display = (socket.id === lobby.hostID) ? "block" : "none";
    } else {
        restartButton.style.display = "none";

        if (isFull) {
            const activePlayer = lobby.players[lobby.currentPlayerIndex];
            const color = lobby.playerColors[lobby.currentPlayerIndex];
            if (activePlayer.id === socket.id) {
                currentTurn.innerHTML = `<span style="display: inline-block; 
                    max-width: 150px; 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis; 
                    vertical-align: bottom; 
                    color: ${color}"><b>It's YOUR turn!</b></span>`;
            } else {
                currentTurn.innerHTML = `Waiting for 
                <span style="
                    display: inline-block; 
                    max-width: 150px; 
                    white-space: nowrap; 
                    overflow: hidden; 
                    text-overflow: ellipsis; 
                    vertical-align: bottom; 
                    color: ${color};
                ">${activePlayer.name}</span>`;
            }
        } else {
            currentTurn.innerHTML = `<i>Waiting for players (${lobby.players.filter(p => p !== null).length}/${lobby.maxPlayers})...</i>`;
        }
    }
});

openAuthBtn.addEventListener("click", () => {
    if (isLoggedIn) {
        localStorage.removeItem("connect4_auth_token");
        localStorage.removeItem("savedPlayerName");
        isLoggedIn = false;

        socket.emit("logout");
    } else {
        document.getElementById("auth-dialog").classList.add("active");
        document.getElementById("modal-overlay").classList.add("active");
    }
});

closeAuth.addEventListener("click", () => {
    document.getElementById("auth-dialog").classList.remove("active");
    document.getElementById("modal-overlay").classList.remove("active");
});

authSwitchBtn.addEventListener("click", () => {
    isLoginMode = !isLoginMode;
    document.getElementById("auth-title").innerText = isLoginMode ? "Login" : "Register";
    authSubmitBtn.innerText = isLoginMode ? "Login" : "Register";
    authSwitchBtn.innerText = isLoginMode ? "Switch to Register" : "Switch to Login";
});

authSubmitBtn.addEventListener("click", submitAuth);

authUsernameInput.addEventListener("keydown", handleEnter);
authPasswordInput.addEventListener("keydown", handleEnter);

form.addEventListener("submit", e => {
    e.preventDefault();
    sendUpdatePlayerNameEvent(nameInput.value, socket.id);
})

setNameButton.addEventListener("click", e => {
    e.preventDefault();
    const newName = nameInput.value.trim();

    sendUpdatePlayerNameEvent(newName, socket.id);

    if (!isLoggedIn) {
        localStorage.setItem("savedPlayerName", newName);
    }
})

createLobbyButton.addEventListener("click", () => {
    validateBotSelection();
    document.getElementById("lobby-dialog").classList.add("active");
    document.getElementById("modal-overlay").classList.add("active");
});

lobbyDialog.querySelectorAll(".choice-btn").forEach(button => {
    button.addEventListener("click", () => {
        const choice = button.getAttribute("data-value");
        const fillWithBots = document.getElementById("fill-with-bots").checked;
        const botCount = parseInt(document.getElementById("bot-count").value) || 0;

        socket.emit("create-lobby", choice, socket.id, fillWithBots, botCount);
        lobbyDialog.classList.remove("active");
        document.getElementById("modal-overlay").classList.remove("active");
    });
});

// Confirm Button
document.getElementById('confirm-create').addEventListener('click', () => {
    socket.emit("create-lobby", selectedSize, socket.id, false, selectedBots);
    lobbyDialog.classList.remove("active");
    document.getElementById("modal-overlay").classList.remove("active");
});

closeDialog.addEventListener("click", () => {
    lobbyDialog.classList.remove("active");
    document.getElementById("modal-overlay").classList.remove("active");
});

lobbyDialog.addEventListener("click", (e) => {
    if (e.target === lobbyDialog) {
        lobbyDialog.classList.remove("active");
        document.getElementById("modal-overlay").classList.remove("active");
    }
});

leaveLobbyButton.addEventListener("click", () => {
    sendLeaveLobbyEvent(currentName, socket.id);
})

chatForm.addEventListener("submit", e => {
    e.preventDefault();
    sendChatMessageEvent(messageInput.value);
})

chatMessageButton.addEventListener("click", () => {
    sendChatMessageEvent(messageInput.value);
})

restartButton.addEventListener("click", () => {
    if (currentRoomID) {
        socket.emit("restart-game", currentRoomID);
    }
});

nameInput.addEventListener("input", () => {
    setNameButton.disabled = nameInput.value === currentName;
})

function sendChatMessageEvent(message) {
    socket.emit("send-chat-message", message);
}

function sendAddPlayerEvent(playerName, playerID, sessionId) {
    socket.emit("add-player-to-list", playerName, playerID, sessionId);
}

function updatePlayerList(player) {
    const entry = document.createElement("div");
    entry.classList.add("player-entry");
    entry.innerHTML = `<span class="player-name-text">${player.name}</span>`;
    entry.onmouseenter = () => triggerStatsPopup(player, entry, true);
    entry.onmouseleave = () => triggerStatsPopup(player, entry, false);
    entry.onclick = (e) => {
        e.stopPropagation();
        triggerStatsPopup(player, entry, true);
    };

    playerContainer.appendChild(entry);
}

document.addEventListener("click", () => {
    document.querySelectorAll('.player-entry').forEach(el => el.classList.remove('show-stats'));
});

function sendUpdatePlayerNameEvent(newName, playerID) {
    socket.emit("update-player-name-in-list", newName, playerID);
}

function triggerStatsPopup(player, element, show) {
    const popup = document.getElementById("stats-popup");

    if (!show || !player) {
        popup.classList.remove("show");
        return;
    }

    const s = player.stats || {};
    const stats = {
        total: s.total || { wins: 0, loses: 0, ties: 0, games: 0 },
        m2: s.mode2p || { wins: 0, loses: 0, ties: 0, games: 0 },
        m3: s.mode3p || { wins: 0, loses: 0, ties: 0, games: 0 },
        m4: s.mode4p || { wins: 0, loses: 0, ties: 0, games: 0 }
    };

    popup.innerHTML = `
        <div class="stats-title-text">${player.name}</div>
        <table class="stats-table">
            <thead>
                <tr>
                    <th>Mode</th>
                    <th>#</th>
                    <th style="color:#16a34a">W</th>
                    <th style="color:#ef4444">L</th>
                    <th style="color:#94a3b8">T</th>
                </tr>
            </thead>
            <tbody>
                <tr class="total-row">
                    <td>Total</td>
                    <td>${stats.total.games}</td>
                    <td>${stats.total.wins}</td>
                    <td>${stats.total.loses}</td>
                    <td>${stats.total.ties}</td>
                </tr>
                <tr><td>2 Players</td><td>${stats.m2.games}</td><td>${stats.m2.wins}</td><td>${stats.m2.loses}</td><td>${stats.m2.ties}</td></tr>
                <tr><td>3 Players</td><td>${stats.m3.games}</td><td>${stats.m3.wins}</td><td>${stats.m3.loses}</td><td>${stats.m3.ties}</td></tr>
                <tr><td>4 Players</td><td>${stats.m4.games}</td><td>${stats.m4.wins}</td><td>${stats.m4.loses}</td><td>${stats.m4.ties}</td></tr>
            </tbody>
        </table>
        <div class="account-type-tag" style="margin-top:10px; font-size:0.7rem; text-align:center; color:#64748b; font-style:italic;">
            ${player.isGuest ? '(Guest Account)' : '<span style="color:#38bdf8">(Registered Player)</span>'}
        </div>
    `;

    const rect = element.getBoundingClientRect();
    const popupWidth = 280;
    let leftPos = rect.left + (rect.width / 2);

    const padding = 10;
    if (leftPos - (popupWidth / 2) < padding) leftPos = (popupWidth / 2) + padding;
    if (leftPos + (popupWidth / 2) > window.innerWidth - padding) leftPos = window.innerWidth - (popupWidth / 2) - padding;

    popup.style.left = leftPos + "px";
    popup.style.top = (rect.top - 15) + "px"; // 15px Abstand nach oben
    popup.style.transform = "translate(-50%, -100%)";

    popup.classList.add("show");
}

function appendMessage(message, playerName, playerID, timestamp, fullDate, color = "#FFFFFF") {
    const messageBubble = document.createElement("div");
    const isMe = (socket.id === playerID) || (playerName === currentName);
    const nameStyle = `
        display: inline-block;
        max-width: 160px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        vertical-align: bottom;
        font-weight: bold;
        color: ${color};
    `;

    const nameSpan = `<span style="${nameStyle}">${playerName}</span>:`;
    const highlightName = isMe ? `<b>${nameSpan}</b>` : nameSpan;

    const timeSpan = timestamp ? `<span class="chat-timestamp" data-tooltip="${fullDate}">${timestamp}</span>` : "";
    const emptyMsg = document.getElementById("chat-empty-msg");
    if (emptyMsg) {
        chatMessageContainer.innerHTML = "";
    }

    messageBubble.classList.add("chat-bubble");
    messageBubble.innerHTML = `
        <div class="chat-meta">
            ${timeSpan}
            <span class="chat-name">${highlightName}</span>
        </div>
        <div class="chat-text">${message}</div>
    `;

    chatMessageContainer.appendChild(messageBubble);

    while (chatMessageContainer.children.length > MAX_VISIBLE_MESSAGES) {
        chatMessageContainer.removeChild(chatMessageContainer.firstChild);
    }

    scrollToBottom();
}

function scrollToBottom() {
    chatMessageContainer.scrollTop = chatMessageContainer.scrollHeight;
}

function generateTable(rows, cols, maxPlayers) {
    table.innerHTML = "";
    board = [];

    let tileSize;
    if (window.innerWidth < 900) {
        // MOBILE LOGIK
        if (maxPlayers === 2) {
            tileSize = 40;
        } else if (maxPlayers === 3) {
            tileSize = 35;
        } else {
            tileSize = 30;
        }
    } else {
        tileSize = 50;
        if (maxPlayers >= 3) {
            tileSize = 45;
        }
    }

    document.documentElement.style.setProperty('--field-size', tileSize + 'px');
    const fragment = document.createDocumentFragment();

    for (let r = 0; r < rows; r++) {
        const currentRow = document.createElement("tr");
        board[r] = [];
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement("td");
            cell.id = `field-${r}-${c}`;
            currentRow.appendChild(cell);
            board[r][c] = cell;

            cell.addEventListener("click", () => {
                if (!isSpectator) {
                    socket.emit("make-move", socket.id, c, currentRoomID);
                }
            });
        }
        fragment.appendChild(currentRow);
    }
    table.appendChild(fragment);
}

function showGameBoard(roomID, maxPlayers) {
    document.body.classList.add("game-active");
    currentRoomID = roomID;

    gameBoard.dataset.players = maxPlayers;
    lobbySection.style.display = "none";
    playerSection.style.display = "none";
    createLobbyButton.style.display = "none";
    nameSection.style.display = "none";
    profileHeading.style.display = "none";
    timerDisplay.style.display = "none";
    timerDisplay.innerHTML = "Time left: <span>30s</span>";

    flexItem.prepend(gameBoard);
    leaveLobbyButton.style.display = "block";

    if (isSpectator) {
        currentTurn.innerHTML = "<i>You are spectating this match!</i>";
    }

    setTimeout(scrollToBottom, 50);
}

function hideGameBoard() {
    document.body.classList.remove("game-active");

    if (flexItem.contains(gameBoard)) {
        clickHandlers.forEach(item => {
            // Remove the click handler from the cell element
            item.cell.removeEventListener("click", item.handler);

            // Clear the text content of the cell element
            item.cell.innerHTML = ""; 
        });

        clickHandlers.length = 0;
        currentTurn.innerText = "";
		lastLobbyState = null;
		currentRoomID = null;
		isSpectator = false;

        flexItem.removeChild(gameBoard);
        restartButton.style.display = "none";
        leaveLobbyButton.style.display = "none";
		
		lobbySection.style.display = "flex";
		playerSection.style.display = "flex";
        createLobbyButton.style.display = "block";
        nameSection.style.display = "flex";
		profileHeading.style.display = "block";

        setTimeout(scrollToBottom, 50);
    }
}

function sendLeaveLobbyEvent(playerName, playerID) {
    // Remove game field for player
    hideGameBoard();

    socket.emit("leave-lobby", nameInput.value, playerID);
}

function updateLobbyList(displayName, roomID, playerCount, maxPlayers) {
    const button = document.createElement("button");
    button.classList.add("lobby-entry");

    const nameSpan = document.createElement("span");
    nameSpan.innerText = displayName;
    nameSpan.style.fontWeight = "bold";
    nameSpan.classList.add("lobby-name-text");

    const countSpan = document.createElement("span");
    countSpan.classList.add("lobby-count-badge");

    const max = maxPlayers || 2;
    countSpan.innerText = `${playerCount} / ${max}`;

    if (playerCount >= max) {
        countSpan.style.color = "var(--player1-color)";
        button.classList.add("lobby-full");
        nameSpan.innerText = displayName + " (Watch)";
    }

    button.appendChild(nameSpan);
    button.appendChild(countSpan);

    button.addEventListener("click", () => {
        socket.emit("join-lobby", nameInput.value, socket.id, roomID);
    });

    lobbyContainer.appendChild(button);
}

function getTransitionDuration(element) {
    const style = window.getComputedStyle(element);
    const duration = style.transitionDuration;

    if (duration.includes('ms')) {
        return parseFloat(duration);
    } else {
        return parseFloat(duration) * 1000;
    }
}

function showPopup(message) {
    const popup = document.getElementById("popup");
    const popupContent = document.getElementById("popup-content");

    if (popup.classList.contains("show") && popupContent.innerText === message) {
        return;
    }

    if (popupFader) clearTimeout(popupFader);

    popupContent.innerText = message;

    popupCooldown = true;

    setTimeout(() => {
        popup.classList.add("show");
    }, 10);

    popupFader = setTimeout(() => {
        hidePopup();
    }, 3000);
}

function hidePopup() {
    const popup = document.getElementById("popup");
    if (!popup.classList.contains("show")) return;

    if (popupFader) clearTimeout(popupFader);
    popup.classList.remove("show");

    setTimeout(() => {
        popupCooldown = false;
    }, getTransitionDuration(popup));
}

document.addEventListener("click", (event) => {
    const popup = document.getElementById("popup");

    if (!popup.classList.contains("show")) return;

    const isButtonClick = event.target.tagName === "BUTTON";
    const isInsidePopup = popup.contains(event.target);

    if (!isButtonClick && !isInsidePopup) {
        hidePopup();
    }
});

window.addEventListener("pagehide", () => {
    if (socket.connected) {
        socket.emit("leave-lobby");
    }
});

function submitAuth() {
    const data = {
        username: authUsernameInput.value,
        password: authPasswordInput.value
    };

    if (isLoginMode) {
        socket.emit("login", data);
    } else {
        socket.emit("register", data);
    }
}

function handleEnter(e) {
    if (e.key === "Enter") {
        submitAuth();
    }
}

function startTitleNotification() {
    if (!document.hidden) return;

    stopTitleNotification();

    let toggle = false;

    titleInterval = setInterval(() => {
        document.title = toggle
            ? "🎮 GAME HAS STARTED!"
            : "Four Connect - Multiplayer";

        toggle = !toggle;
    }, 2000);
}

function stopTitleNotification() {
    if (titleInterval) {
        clearInterval(titleInterval);
        titleInterval = null;
    }
    document.title = originalTitle;
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
        stopTitleNotification();
    }
});