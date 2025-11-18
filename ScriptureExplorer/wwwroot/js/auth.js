const loginTab = document.getElementById('loginTab');
const registerTab = document.getElementById('registerTab');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

loginTab.onclick = () => {
  loginTab.classList.add('active');
  registerTab.classList.remove('active');
  loginForm.classList.add('visible');
  registerForm.classList.remove('visible');
};

registerTab.onclick = () => {
  registerTab.classList.add('active');
  loginTab.classList.remove('active');
  registerForm.classList.add('visible');
  loginForm.classList.remove('visible');
};

const params = new URLSearchParams(window.location.search);
if (params.get('tab') === 'register') {
  registerTab.click();
} else {
  loginTab.click();
}

// LOGIN
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const identifier = document.getElementById('loginIdentifier').value;
  const password = document.getElementById('loginPassword').value;
  const errorBox = document.getElementById('loginError');

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailOrUserName: identifier, password }),
  });

  if (!res.ok) {
    errorBox.textContent = 'Giriş başarısız. Bilgileri kontrol edin.';
    return;
  }

  const data = await res.json();
  localStorage.setItem(
    'authInfo',
    JSON.stringify({ token: data.token, userName: data.userName || '' })
  );
  window.location.href = 'index.html';
});

// ------------------ REGISTER ------------------
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('registerUser').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const errorBox = document.getElementById('registerError');

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: document.getElementById('registerUser').value,
        email: document.getElementById('registerEmail').value,
        password: document.getElementById('registerPassword').value,
        confirmPassword: document.getElementById('registerPassword').value,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      errorBox.textContent =
        (data.errors && data.errors[0]) || 'Kayıt başarısız.';
      return;
    }

    localStorage.setItem(
      'authInfo',
      JSON.stringify({ token: data.token, userName: data.userName || '' })
    );
    window.location.href = 'index.html';

    alert('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
    loginTab.click();
  } catch (err) {
    errorBox.textContent = 'Sunucu hatası.';
  }
});
