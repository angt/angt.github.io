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

for (let i = 1; i <= 3; i++) {
    const kid = `kid${i}`;
    updateStars(kid, 0);
    updateName(kid);
}
