// register.js - handles registration form submission using Parse

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const message = document.getElementById("message");

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // gather values
    const email = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const name = document.getElementById("name").value.trim();
    const role = document.getElementById("role").value;

    // simple validation
    if (!email || !password || !confirmPassword || !name || !role) {
      showMessage("Preencha todos os campos.", true);
      return;
    }

    if (password !== confirmPassword) {
      showMessage("As senhas não coincidem.", true);
      return;
    }

    if (typeof Parse === 'undefined') {
      showMessage("Erro interno: Parse não foi carregado.", true);
      return;
    }

    // create user via Parse REST API to have explicit control over headers
    try {
      const cfg = window.PARSE_CONFIG;
      if (!cfg) throw new Error("Configuração do Parse não encontrada.");

      const url = `${cfg.serverURL}/users`;

      // Back4App expects X-Parse-Application-Id and X-Parse-REST-API-Key for REST calls.
      // We only have the JS key available here; if your Back4App dashboard provides a REST API key,
      // replace cfg.jsKey below with that REST key. Using JS key may be rejected by the server.
      // validate header names and values before appending
      const toAppend = [
        ["X-Parse-Application-Id", cfg.appId],
        ["X-Parse-JavaScript-Key", cfg.jsKey],
        ["Content-Type", "application/json"],
      ];

      for (const [name, val] of toAppend) {
        if (typeof name !== 'string' || name.trim() === '') {
          console.error('Invalid header name detected before append:', name, 'type:', typeof name);
          throw new Error('Invalid header name: ' + String(name));
        }
        if (typeof val !== 'string') {
          console.warn('Header value is not a string; converting to string for header', name, val);
        }
      }

      const headers = new Headers();
      for (const [name, val] of toAppend) headers.append(name, String(val));

      const body = {
        username: email,
        password: password,
        email: email,
        name: name,
        role: role,
      };

      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        // Parse returns error in { code, error }
        const msg = data && data.error ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // save session info if available
      const session = { id: data.objectId, name: data.name || name, role: data.role || role };
      if (data.sessionToken) session.sessionToken = data.sessionToken;
      localStorage.setItem('user', JSON.stringify(session));

      showMessage("Perfil salvo com sucesso! Redirecionando ao dashboard...", false);
      setTimeout(() => {
        // redirect according to role
        switch ((session.role || role || '').toLowerCase()) {
          case 'cliente':
            window.location.href = 'login.html';  // after registration, client goes to login to re-authenticate
            break;
          case 'profissional':
            window.location.href = 'login.html';  // after registration, professional goes to login to re-authenticate
            break;
          case 'estabelecimento':
            window.location.href = 'login.html';  // after registration, establishment goes to login to re-authenticate
            break;
          default:
            window.location.href = 'login.html';  // fallback
        }
      }, 1200);
    } catch (err) {
      console.error("SignUp error:", err);
      const errMsg = err && err.message ? err.message : String(err);
      showMessage("Erro ao salvar perfil: " + errMsg, true);
    }
  });

  function showMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.style.color = isError ? "red" : "green";
  }
});
