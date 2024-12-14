if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persisted => {
        console.log(persisted ? "Persistent storage granted." : "Fallback to default storage behavior.");
    });
}

const kids = ['kid1', 'kid2', 'kid3'];

kids.forEach(kid => {
    const stars = localStorage.getItem(`${kid}_stars`) || 0;
    const name = localStorage.getItem(`${kid}_name`) || kid;
    const kidElement = document.querySelector(`#${kid}`);
    kidElement.querySelector('.stars').textContent = stars;
    kidElement.querySelector('.name-input').value = name;
});

function updateStars(kidId, change) {
    const starElement = document.querySelector(`#${kidId} .stars`);
    let currentStars = parseInt(starElement.textContent, 10) + change;
    starElement.textContent = currentStars;
    localStorage.setItem(`${kidId}_stars`, currentStars);
}

function updateName(kidId) {
    const nameInput = document.querySelector(`#${kidId} .name-input`);
    const name = nameInput.value.trim();
    localStorage.setItem(`${kidId}_name`, name);
}
