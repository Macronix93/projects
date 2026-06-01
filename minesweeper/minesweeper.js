let ROWS = 8;
let COLUMNS = 8;
let NUMBER_OF_CELLS = ROWS * COLUMNS;
let NUMBER_OF_BOMBS = 10;
let setting = "beginner";
let gameOverMessage = document.getElementById("gameovermessage");
let fields = [];
let bombCount = 0;
let gameOver = false;
const bombEmoji = "\ud83d\udca3";
const flagEmoji = "\u{1F6A9}";
const smileyHappy = "\u{1F642}";
const smileySad = "\u{1F635}";
const smileyWin = "\u{1F601}";
const smileyShocked = "\u{1F62E}";
let firstClick = false;
let seconds = 0;
let timer;
let bombArray = [];
let table;
let tbody;

// Detect if on iPhone etc. and disable context menu
let ua = window.navigator.userAgent;
let iOS = ua.match(/iPad/i) || ua.match(/iPhone/i);
let webkit = ua.match(/WebKit/i);
let iOSSafari = iOS && webkit && !ua.match(/CriOS/i);

document.getElementById("container").addEventListener("contextmenu", function (event) {
    event.preventDefault();
});

// Get field setting by radio button clicked
document.getElementById("size-box").addEventListener("click", function (event) {
    if (event.target && event.target.matches("input[type='radio']")) {
        if (setting !== event.target.value) {
            setting = event.target.value;
            resetGame();
            createGame();
        }
    }
});

// Reset game on Reset button click and show shocked smiley on hover
document.getElementById("reset").addEventListener("mouseover", function (event) {
    if (!gameOver) {
        event.target.innerHTML = smileyShocked;
    }
});

document.getElementById("reset").addEventListener("mouseout", function (event) {
    if (!gameOver) {
        event.target.innerHTML = smileyHappy;
    }
});

document.getElementById("reset").addEventListener("click", function () {
    resetGame();
    createGame();
});


// Reset radio button to "beginner" setting on loading and change smiley
window.onload = function () {
    document.getElementById("beginner").checked = true;
    document.getElementById("reset").innerHTML = smileyHappy;
}

// Create the initial game
createGame();

/******************** Functions Section ********************/

function countBombs(row, col) {
    let count = 0;

    for (let i = row - 1; i <= row + 1; i++) {
        for (let j = col - 1; j <= col + 1; j++) {
            if (i >= 0 && i < ROWS && j >= 0 && j < COLUMNS) {
                if (fields[i][j] === "B") {
                    count++;
                }
            }
        }
    }

    return count;
}

function showAllBombs() {
    document.querySelectorAll("td").forEach(function (cell) {
        let row = Math.floor(cell.id / COLUMNS);
        let col = cell.id % COLUMNS;

        if (fields[row][col] === "B") {
            cell.innerHTML = bombEmoji;
        }
    });
}

function showAllEmptyFieldsNearby(row, col) {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLUMNS || fields[row][col] >= 1 || fields[row][col] === "B" || fields[row][col] === "" || fields[row][col] === -2) {
        return;
    }

    let id = row * COLUMNS + col;
    let cellid = document.getElementById(id);

    if (cellid.innerHTML === flagEmoji) {
        setMinesLeft(getMinesLeft() + 1);
    }

    cellid.classList.add("revealed");
    cellid.innerHTML = "";
    fields[row][col] = -2;

    showAllEmptyFieldsNearby(row - 1, col);
    showAllEmptyFieldsNearby(row + 1, col);
    showAllEmptyFieldsNearby(row, col - 1);
    showAllEmptyFieldsNearby(row, col + 1);
}

function getFontColor(number) {
    let coloredNumber;

    switch (number) {
        case 1:
            coloredNumber = "rgb(0, 0, 255)";
            break;
        case 2:
            coloredNumber = "rgb(0, 130, 0)";
            break;
        case 3:
            coloredNumber = "rgb(254, 0, 0)";
            break;
        case 4:
            coloredNumber = "rgb(0, 0, 132)";
            break;
        case 5:
            coloredNumber = "rgb(132, 0, 0)";
            break;
        case 6:
            coloredNumber = "rgb(0, 130, 132)";
            break;
        case 7:
            coloredNumber = "rgb(0, 0, 0)";
            break;
        case 8:
            coloredNumber = "rgb(117, 117, 117)";
            break;
    }

    return coloredNumber;
}

function checkForWin() {
    let countClickedFields = 0;
    let countFlags = 0;

    // Count clicked fields and flags on bombs
    let cellid;
    for (let rows = 0; rows < ROWS; rows++) {
        for (let cols = 0; cols < COLUMNS; cols++) {
            let id = rows * COLUMNS + cols;
            cellid = document.getElementById(id.toString());

            if (fields[rows][cols] === -2) {
                countClickedFields++;
            } else if (fields[rows][cols] === "B" && cellid.innerHTML === flagEmoji) {
                countFlags++;
            }
        }
    }

    if (countClickedFields === NUMBER_OF_CELLS - NUMBER_OF_BOMBS) {
        gameOver = true;
        clearInterval(timer);

        gameOverMessage.style.display = "block";
        gameOverMessage.innerHTML = "Du hast gewonnen!";

        document.getElementById("reset").innerHTML = smileyWin;
    }
}

function padZeros(num, totalLength) {
    return String(num).padStart(totalLength, "0");
}

function getMinesLeft() {
    return parseInt(document.getElementById("minesleft").innerHTML);
}

function setTime() {
    let displayTime = seconds > 999 ? 999 : seconds;
    document.getElementById("timer").innerHTML = padZeros(displayTime, 3);
    seconds++;
}

function setMinesLeft(number) {
    if (number < 0) {
        document.getElementById("minesleft").innerHTML = "-" + padZeros(Math.abs(number), 2);
    } else {
        document.getElementById("minesleft").innerHTML = padZeros(number, 3);
    }
}

function resetGame() {
    fields = [];
    bombCount = 0;
    gameOver = false;
    firstClick = false;
    seconds = 0;
    clearInterval(timer);
    bombArray = [];

    document.getElementById("table-container").removeChild(table);
    gameOverMessage.innerHTML = "";
    gameOverMessage.style.display = "none";
    document.getElementById(setting).checked = true;
    document.getElementById("reset").innerHTML = smileyHappy;
}

function createGame() {
    switch (setting) {
        case "beginner":
            ROWS = 8;
            COLUMNS = 8;
            NUMBER_OF_BOMBS = 10;
            break;
        case "intermediate":
            ROWS = 16;
            COLUMNS = 16;
            NUMBER_OF_BOMBS = 40;
            break;
        case "expert":
            ROWS = 16;
            COLUMNS = 30;
            NUMBER_OF_BOMBS = 99;
            break;
    }
    NUMBER_OF_CELLS = ROWS * COLUMNS;

    // Create bomb array
    while (bombArray.length < NUMBER_OF_BOMBS) {
        let r = Math.floor(Math.random() * NUMBER_OF_CELLS - 1) + 1;

        if (bombArray.indexOf(r) === -1) {
            bombArray.push(r);
        }
    }

    // Set initial things like mines left and timer
    setMinesLeft(bombArray.length);
    setTime();

    // Fill fields array with bomb fields
    let count = 0;
    for (let rows = 0; rows < ROWS; rows++) {
        fields[rows] = [];
        for (let cols = 0; cols < COLUMNS; cols++) {
            fields[rows][cols] = count;

            if (bombArray.includes(count)) {
                fields[rows][cols] = "B";
            }

            count++;
        }
    }

    // Check if a cell is not a bomb field and has bombs nearby - if yes, set the field to the number of bombs nearby
    for (let rows = 0; rows < ROWS; rows++) {
        for (let cols = 0; cols < COLUMNS; cols++) {
            if (fields[rows][cols] !== "B") {
                bombCount = countBombs(rows, cols);

                if (bombCount === 0) {
                    fields[rows][cols] = 0;
                } else {
                    fields[rows][cols] = bombCount;
                }
            }
        }
    }

    // Create table and cells
    table = document.createElement("table");
    tbody = document.createElement("tbody");

    count = 0;
    for (let rows = 0; rows < ROWS; rows++) {
        let row = document.createElement("tr");

        for (let cols = 0; cols < COLUMNS; cols++) {
            let cell = document.createElement("td");
            cell.id = count.toString();
            cell.innerHTML = "";

            // Check for right click on table cells
            if (iOSSafari) {
                let timerLongTouch;
                let longTouch = false;
                let startX, startY;
                let isSwipe = false; // Flag to track if it's a swipe

                cell.addEventListener("touchstart", function (event) {
                    if (event.cancelable) event.preventDefault();

                    startX = event.touches[0].clientX;
                    startY = event.touches[0].clientY;
                    isSwipe = false;
                    longTouch = false;

                    timerLongTouch = setTimeout(function () {
                        longTouch = true;
                        setFlag(cell, rows, cols);
                        // Optional: Kurze Vibration für Feedback
                        if (navigator.vibrate) navigator.vibrate(50);
                    }, 500);
                }, { passive: false });

                cell.addEventListener("touchmove", function (event) {
                    let currentX = event.touches[0].clientX;
                    let currentY = event.touches[0].clientY;
                    let deltaX = startX - currentX;
                    let deltaY = startY - currentY;

                    if (Math.abs(deltaX) > 30 || Math.abs(deltaY) > 30) {
                        isSwipe = true;
                        clearTimeout(timerLongTouch);
                    }
                }, { passive: false });

                cell.addEventListener("touchend", function (_) {
                    clearTimeout(timerLongTouch);

                    if (!longTouch && !isSwipe) {
                        revealField(cell, rows, cols);
                    }
                }, { passive: false });
            } else {
                // Check for left click on table cells
                cell.addEventListener("click", function () {
                    revealField(cell, rows, cols);
                });

                cell.addEventListener("contextmenu", function () {
                    setFlag(cell, rows, cols);
                    return false;
                });
            }

            row.appendChild(cell);

            count++;
        }

        tbody.appendChild(row);
    }

    table.appendChild(tbody);
    document.getElementById("table-container").appendChild(table);
}

function setFlag(cell, rows, cols) {
    if (!firstClick) {
        firstClick = true;
        timer = setInterval(setTime, 1000);
    }

    if (!gameOver) {
        if (fields[rows][cols] !== -2) {
            if (cell.innerHTML === flagEmoji) { // Check if flag is set
                // Remove flag
                cell.innerHTML = "";
                setMinesLeft(getMinesLeft() + 1);
            } else {
                // Set flag
                cell.innerHTML = flagEmoji;
                setMinesLeft(getMinesLeft() - 1);
            }
        }
    }
}

function revealField(cell, rows, cols) {
    if (!firstClick) {
        firstClick = true;
        timer = setInterval(setTime, 1000);
    }

    if (!gameOver) {
        switch (fields[rows][cols]) {
            case "B":
                // Clicked on a bomb - show all remaining bombs and end game
                gameOver = true;
                clearInterval(timer);
                showAllBombs();

                cell.classList.add("revealed"); // NEU
                cell.style.backgroundColor = "rgb(200, 0, 0)";

                document.getElementById("reset").innerHTML = smileySad;
                break;
            case 0:
                // Clicked on an empty field - show all empty fields nearby (recursion)
                let row = Math.floor(cell.id / COLUMNS);
                let col = cell.id % COLUMNS;

                showAllEmptyFieldsNearby(row, col);
                break;
            case -2:
                break;
            default:
                // Clicked on a number field
                if (cell.innerHTML === flagEmoji) {
                    setMinesLeft(getMinesLeft() + 1);
                }

                cell.classList.add("revealed"); // NEU
                cell.style.color = getFontColor(fields[rows][cols]);
                cell.innerHTML = fields[rows][cols];
                break;
        }
        fields[rows][cols] = -2;
        checkForWin();
    }
}