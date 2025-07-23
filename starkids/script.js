if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persisted => {
        console.log(persisted ? "Persistent storage granted." : "Fallback to default storage behavior.");
    });
}

function updateStars(kid, change) {
    const starElement = document.querySelector(`#${kid} .stars`);
    const stars = change + parseInt(localStorage.getItem(`${kid}_stars`) || 0);
    localStorage.setItem(`${kid}_stars`, stars);
    let text = ""
    const count = Math.abs(stars);
    if (count > 1) text += count;
    if (stars > 0) text += " ⭐";
    if (stars < 0) text += " ☠️";
    starElement.textContent = text;
}

function updateName(kid) {
    const nameInput = document.querySelector(`#${kid} .name-input`);
    const name = nameInput.value.trim() || localStorage.getItem(`${kid}_name`) || "";
    localStorage.setItem(`${kid}_name`, name);
    nameInput.value = name;
}

function createKid(id) {
    const kidId = `kid${id}`;
    const kidElement = document.createElement('div');
    kidElement.className = 'kid';
    kidElement.id = kidId;

    kidElement.innerHTML = `
        <input class="name-input" type="text" placeholder="Child ${id}" onchange="updateName('${kidId}')">
        <div class="controls">
            <button onclick="updateStars('${kidId}', -1)">☠️</button>
            <span class="stars">0</span>
            <button onclick="updateStars('${kidId}', 1)">⭐</button>
        </div>
    `;

    document.querySelector('.kids').appendChild(kidElement);
    updateName(kidId);
    updateStars(kidId, 0);
}

let kidCount = parseInt(localStorage.getItem('kid_count')) || 0;

function add() {
    createKid(++kidCount);
    localStorage.setItem('kid_count', kidCount);
}

for (let i = 1; i <= kidCount; i++) {
    createKid(i);
}

document.getElementById('add').addEventListener('click', add);
