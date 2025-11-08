document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const message = document.getElementById('message');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      showMessage('Preencha usuário e senha.', true);
      return;
    }

    try {
      // Tenta login via Parse SDK primeiro (garante sessionToken)
      const user = await Parse.User.logIn(username, password);
      const role = user.get('role') || null;
      const name = user.get('name') || username;
      const sessionToken = user.getSessionToken();

      // Salva no localStorage
      const session = {
        id: user.id,
        name,
        role,
        sessionToken
      };
      localStorage.setItem('user', JSON.stringify(session));

      showMessage(`Bem-vindo, ${name}!`, false);

      // Redirecionar com base no papel (role)
      setTimeout(() => {
        switch (role) {
          case 'cliente':
            window.location.href = 'cliente-dashboard.html';
            break;
          case 'profissional':
            window.location.href = 'profissional-dashboard.html';
            break;
          case 'estabelecimento':
            window.location.href = 'estabelecimento-dashboard.html';
            break;
          default:
            window.location.href = 'cliente-dashboard.html';
        }
      }, 600);

    } catch (sdkError) {
      console.warn("Falha no login via SDK, tentando REST...", sdkError);
      try {
        // fallback REST se o SDK falhar (ex: ambiente local com bug de headers)
        const cfg = window.PARSE_CONFIG;
        const url = `${cfg.serverURL}/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

        const headers = new Headers({
          'X-Parse-Application-Id': cfg.appId,
          'X-Parse-JavaScript-Key': cfg.jsKey,
          'Content-Type': 'application/json'
        });

        const res = await fetch(url, { method: 'GET', headers });
        const data = await res.json();

        if (!res.ok) {
          if (data.code === 101) throw new Error("Usuário ou senha incorretos.");
          throw new Error(data.error || `Erro HTTP ${res.status}`);
        }

        const session = {
          id: data.objectId,
          name: data.name || username,
          role: data.role || null,
          sessionToken: data.sessionToken || null
        };

        if (!session.sessionToken) {
          console.warn("⚠️ Nenhum sessionToken retornado pelo REST login.");
        }

        localStorage.setItem('user', JSON.stringify(session));
        showMessage(`Bem-vindo, ${session.name}!`, false);

        setTimeout(() => {
          switch (session.role) {
            case 'cliente':
              window.location.href = 'cliente-dashboard.html';
              break;
            case 'profissional':
              window.location.href = 'profissional-dashboard.html';
              break;
            case 'estabelecimento':
              window.location.href = 'estabelecimento-dashboard.html';
              break;
            default:
              window.location.href = 'cliente-dashboard.html';
          }
        }, 600);

      } catch (restError) {
        console.error("Erro no login REST:", restError);
        showMessage(restError.message || 'Erro ao fazer login.', true);
      }
    }
  });

  function showMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.style.color = isError ? 'red' : 'green';
  }
});
