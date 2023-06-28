fetch('/api/user')
	.then((response) => response.json())
	.then((json) => {
		if (json.error) {
			showSignInButton();
		} else if (json.user.canvas) {
			showUser(json.user);
			showJoinCanvasButton(json.user.canvas);
		} else {
			showUser(json.user);
			showCreateCanvasForm();
		}
	});

document.querySelector('form').addEventListener('submit', (e) => {
	e.preventDefault();
	const submitButton = document.querySelector('form button');
	submitButton.disabled = true;
	fetch('/create', {
		method: 'POST',
		body: new URLSearchParams({
			name: e.target.elements.name.value,
		}),
	})
		.then((resp) => resp.json())
		.then((json) => {
			if (json.error) {
				document.querySelector('.error-info').textContent = '*' + json.error;
				submitButton.disabled = false;
			} else if (json.canvas) {
				window.location.href = '/canvas/' + json.canvas;
			}
		});
});

function showSignInButton() {
	document.querySelector('.login').classList.remove('hidden');
}

function showUser(user) {
	document.querySelector('.user').classList.remove('hidden');
	document.querySelector(
		'.user-icon'
	).style.backgroundImage = `url(https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png)`;
	document.querySelector('.user-name').textContent = `Welcome ${user.name}!`;
}

function showCreateCanvasForm() {
	document.querySelector('form').classList.remove('hidden');
}

function showJoinCanvasButton(name) {
	document.querySelector('.join').classList.remove('hidden');
	document.querySelector('.join').firstChild.href = `/canvas/${name}`;
}
