const app = document.getElementById('app');

function getToken() {
    return localStorage.getItem('sentinel_token');
}

function saveToken(token) {
    localStorage.setItem('sentinel_token', token);
}

function clearToken() {
    localStorage.removeItem('sentinel_token');
}

function navigate(path) {
    window.history.pushState({}, '', path);
    render();
}

async function apiFetch(path, options = {}) {
    const token = getToken();

    const headers = {
        ...(options.headers || {}),
    };

    if (options.body) {
        headers['Content-Type'] = 'application/json';
    }

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(path, {
        ...options,
        headers,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
        const message = Array.isArray(data?.message)
            ? data.message.join(', ')
            : data?.message || 'Request failed';

        throw new Error(message);
    }

    return data;
}

function renderLogin() {
    app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <h1>Sentinel Gateway</h1>
        <p class="subtitle">Login to your dashboard</p>

        <form id="login-form">
          <label>
            Email
            <input id="email" type="email" placeholder="admin@example.com" required />
          </label>

          <label>
            Password
            <input id="password" type="password" placeholder="Password" required />
          </label>

          <p id="error" class="error" style="display: none;"></p>

          <button type="submit">Login</button>
        </form>

        <button class="link-button" id="go-register">
          Need an account? Register
        </button>
      </section>
    </main>
  `;

    document.getElementById('go-register').addEventListener('click', () => {
        navigate('/register');
    });

    document.getElementById('login-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const errorElement = document.getElementById('error');
        errorElement.style.display = 'none';

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const result = await apiFetch('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    password,
                }),
            });

            saveToken(result.accessToken);
            navigate('/dashboard');
        } catch (error) {
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
        }
    });
}

function renderRegister() {
    app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <h1>Sentinel Gateway</h1>
        <p class="subtitle">Create an admin account</p>

        <form id="register-form">
          <label>
            Full name
            <input id="fullName" type="text" placeholder="Admin name" required />
          </label>

          <label>
            Email
            <input id="email" type="email" placeholder="admin@example.com" required />
          </label>

          <label>
            Password
            <input id="password" type="password" placeholder="Minimum 6 characters" required minlength="6" />
          </label>

          <label>
            CEO secret
            <input id="ceoSecret" type="password" placeholder="CEO secret required" required />
          </label>

          <p id="error" class="error" style="display: none;"></p>

          <button type="submit">Register</button>
        </form>

        <button class="link-button" id="go-login">
          Already have an account? Login
        </button>
      </section>
    </main>
  `;

    document.getElementById('go-login').addEventListener('click', () => {
        navigate('/login');
    });

    document.getElementById('register-form').addEventListener('submit', async (event) => {
        event.preventDefault();

        const errorElement = document.getElementById('error');
        errorElement.style.display = 'none';

        const fullName = document.getElementById('fullName').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const ceoSecret = document.getElementById('ceoSecret').value;

        try {
            const result = await apiFetch('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    fullName,
                    email,
                    password,
                    ceoSecret,
                }),
            });

            saveToken(result.accessToken);
            navigate('/dashboard');
        } catch (error) {
            errorElement.textContent = error.message;
            errorElement.style.display = 'block';
        }
    });
}

async function renderDashboard() {
    if (!getToken()) {
        navigate('/login');
        return;
    }

    app.innerHTML = `
    <main class="dashboard-page">
      <header class="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p id="me-text">Loading current user...</p>
        </div>

        <div class="header-actions">
          <button id="whoami-button">Who am I?</button>
          <button class="danger-light" id="logout-button">Logout</button>
        </div>
      </header>

      <p id="error" class="error" style="display: none;"></p>

      <section class="panel">
        <div class="panel-header">
          <h2>Users in database</h2>
          <button id="refresh-button">Refresh</button>
        </div>

        <div class="table-wrapper" id="users-container">
          Loading users...
        </div>
      </section>
    </main>
  `;

    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            await apiFetch('/auth/logout', {
                method: 'POST',
            });
        } catch {
            // Token is stateless, so we clear it even if logout request fails.
        }

        clearToken();
        navigate('/login');
    });

    document.getElementById('whoami-button').addEventListener('click', async () => {
        try {
            const me = await apiFetch('/auth/me');
            alert(`You are:\n\nName: ${me.fullName}\nEmail: ${me.email}\nRole: ${me.role}`);
        } catch (error) {
            showDashboardError(error.message);
        }
    });

    document.getElementById('refresh-button').addEventListener('click', loadDashboardData);

    await loadDashboardData();
}

function showDashboardError(message) {
    const errorElement = document.getElementById('error');
    errorElement.textContent = message;
    errorElement.style.display = 'block';
}

async function loadDashboardData() {
    try {
        const me = await apiFetch('/auth/me');
        const users = await apiFetch('/dashboard/users');

        document.getElementById('me-text').innerHTML = `
      Logged in as <strong>${escapeHtml(me.fullName)} (${escapeHtml(me.email)})</strong>
    `;

        renderUsersTable(users, me);
    } catch (error) {
        if (error.message.includes('Unauthorized')) {
            clearToken();
            navigate('/login');
            return;
        }

        showDashboardError(error.message);
    }
}

function renderUsersTable(users, me) {
    const container = document.getElementById('users-container');

    if (!users.length) {
        container.innerHTML = '<p>No users found.</p>';
        return;
    }

    container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Full name</th>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
          <th>Created</th>
          <th>Action</th>
        </tr>
      </thead>

      <tbody>
        ${users
            .map((user) => {
                const isMe = user.id === me.id;
                const isActive = user.status === 'ACTIVE';

                return `
              <tr>
                <td>${escapeHtml(user.fullName)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>
                  <span class="badge ${String(user.status).toLowerCase()}">
                    ${escapeHtml(user.status)}
                  </span>
                </td>
                <td>${user.createdAt ? new Date(user.createdAt).toLocaleString() : '-'}</td>
                <td>
                  <button
                    class="danger delete-button"
                    data-id="${user.id}"
                    data-name="${escapeHtml(user.fullName)}"
                    ${isMe || !isActive ? 'disabled' : ''}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            `;
            })
            .join('')}
      </tbody>
    </table>
  `;

    document.querySelectorAll('.delete-button').forEach((button) => {
        button.addEventListener('click', async () => {
            const userId = button.dataset.id;
            const fullName = button.dataset.name;

            const ceoSecret = prompt(`Enter CEO secret to delete ${fullName}:`);

            if (!ceoSecret) {
                return;
            }

            const confirmed = confirm(`Are you sure you want to delete ${fullName}?`);

            if (!confirmed) {
                return;
            }

            try {
                await apiFetch(`/dashboard/users/${userId}`, {
                    method: 'DELETE',
                    body: JSON.stringify({
                        ceoSecret,
                    }),
                });

                await loadDashboardData();
            } catch (error) {
                alert(error.message);
            }
        });
    });
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function render() {
    const path = window.location.pathname;

    if (path === '/' || path === '/login') {
        renderLogin();
        return;
    }

    if (path === '/register') {
        renderRegister();
        return;
    }

    if (path === '/dashboard') {
        renderDashboard();
        return;
    }

    navigate('/login');
}

window.addEventListener('popstate', render);

render();