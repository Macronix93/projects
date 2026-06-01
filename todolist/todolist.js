let editErrorMsg = "";
const ICON_PATH = "icons/";

window.addEventListener("load", (_) => {
    let todos = [];

    for (let i = 0; i < localStorage.length; i++) {
        let key = localStorage.key(i);

        if (key.startsWith("item_") && !key.includes("_done")) {
            todos.push({
                id: key,
                text: localStorage.getItem(key)
            });
        }
    }

    todos.sort((a, b) => {
        return a.id.localeCompare(b.id);
    });

    todos.forEach(todo => {
        addToDo(todo.id, todo.text);
    });

    const inputField = document.getElementById("inputtext");

    inputField.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addToDo();
        }
    });
});

function addToDo(lsUnique, lsItemText) {
    const errorMsg = document.getElementById("errormsg");
    errorMsg.innerHTML = "";
    errorMsg.style.display = "block";
    const inputField = document.getElementById("inputtext");
    let inputText = inputField.value;

    if (lsItemText) {
        inputText = lsItemText;
    }

    if (!inputText) {
        errorMsg.innerHTML = "Error: Input text is empty!";
    } else if (!inputText.replace(/\s/g, '').length) {
        errorMsg.innerHTML = "Error: Input text only contains whitespaces!";
    } else if (inputText.length < 1 || inputText.length > 64) {
        errorMsg.innerHTML = "Error: Input text must be between 1 and 64 characters long!";
    } else {
        errorMsg.style.display = "none";

        const newItem = document.createElement("div");
        const itemText = document.createElement("div");
        const separator = document.createElement("div");
        const itemOptions = document.createElement("div");
        const doneButton = document.createElement("button");
        const editButton = document.createElement("button");
        const removeButton = document.createElement("button");
        let unique = "item_";

        if (!lsUnique) {
            unique += getUniqueId();
            localStorage.setItem(unique + "_done", "false");
            localStorage.setItem(unique, inputText);
        } else {
            unique = lsUnique;
        }

        const isDone = localStorage.getItem(unique + "_done");
        if (isDone && isDone.includes("true")) {
            itemText.style.textDecoration = "line-through";
            itemText.style.color = "rgb(170, 170, 170)"
            newItem.style.backgroundColor = "rgb(53, 104, 45)";
        }

        newItem.setAttribute("class", "item");
        newItem.setAttribute("id", unique)
        itemText.setAttribute("class", "itemtext");
        separator.setAttribute("class", "vline");
        itemOptions.setAttribute("class", "itemoptions");

        let doneIcon = document.createElement("img");
        doneIcon.src = ICON_PATH + "icon_done.png";
        doneButton.appendChild(doneIcon);
        doneButton.addEventListener("click", () => {
            setDoneToDo(itemText, newItem, unique);
        });
        doneButton.setAttribute("class", "center-icons");

        let editIcon = document.createElement("img");
        editIcon.src = ICON_PATH + "icon_edit.png";
        editButton.appendChild(editIcon);
        editButton.addEventListener("click", () => {
            editToDo(itemText, newItem, unique, editErrorMsg);
        });
        editButton.setAttribute("class", "center-icons");

        let deleteIcon = document.createElement("img");
        deleteIcon.src = ICON_PATH + "icon_delete.png";
        removeButton.appendChild(deleteIcon);
        removeButton.addEventListener("click", () => {
            removeToDo(newItem, unique);
        });
        removeButton.setAttribute("class", "center-icons");

        if (!lsItemText) {
            itemText.innerText = inputText;
        } else {
            itemText.innerText = lsItemText;
        }

        itemOptions.append(separator, doneButton, editButton, removeButton);
        newItem.append(itemText, itemOptions);

        document.getElementById("itemcontainer").append(newItem);
        inputField.value = "";
    }
}

function removeToDo(id, unique) {
    document.getElementById("itemcontainer").removeChild(id);
    localStorage.removeItem(unique + "_done");
    localStorage.removeItem(unique);
}

function editToDo(id, item, unique, errorMsg) {
    editErrorMsg = "";
    const newText = prompt(errorMsg + "Choose a new text for the ToDo element:\n", id.innerText);

    if (newText === null) {
        return;
    }

    if (!newText) {
        editErrorMsg = "Error: Input text is empty!\n\n";
    } else if (!newText.replace(/\s/g, '').length) {
        editErrorMsg = "Error: Input text only contains whitespaces!\n\n";
    } else if (newText.length < 1 || newText.length > 64) {
        editErrorMsg = "Error: Input text must be between 1 and 64 characters long!\n\n";
    }

    if (editErrorMsg) {
        editToDo(id, item, unique, editErrorMsg);
    } else {
        item.style = "";
        id.style = "";
        id.innerText = newText;

        // Update local storage value
        localStorage.setItem(unique + "_done", "false");
        localStorage.setItem(unique, newText);
    }
}

function setDoneToDo(id, item, unique) {
    id.style.textDecoration = "line-through";
    id.style.color = "rgb(170, 170, 170)"
    item.style.backgroundColor = "rgb(53, 104, 45)";

    // Save style for done items
    localStorage.setItem(unique + "_done", "true");
}

function getUniqueId() {
    return Date.now() + "_" + Math.random().toString(16).slice(2, 7);
}