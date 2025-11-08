document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado para acessar o dashboard.");
    window.location.href = "login.html";
    return;
  }
  if (user.get("role") !== "cliente") {
    alert("Acesso negado. Apenas clientes podem acessar este painel.");
    window.location.href = "login.html";
    return;
  }

  const listaNotificacoes = document.getElementById("notifications-list");
  const noNotifications = document.getElementById("no-notifications");
  const mensagem = document.getElementById("mensagem") || document.getElementById("message");
  const btnMarkAll = document.getElementById("mark-all-read");
  const btnRefresh = document.getElementById("refresh-notifications");
  const btnRemoveRead = document.getElementById("remove-read");

  // Recupera o perfil do cliente
  const ClientProfile = Parse.Object.extend("ClientProfile");
  const cpQuery = new Parse.Query(ClientProfile);
  // Prefer SDK lookup; if user is a REST-backed object this may return null — then try REST fallback
  cpQuery.equalTo("user", user);
  let clientProfile = await cpQuery.first();

  if (!clientProfile) {
    // REST fallback: try to find ClientProfile by user id via REST API when we have a session token
    try {
      const cfg = window.PARSE_CONFIG;
      if (cfg && user && (user.__sessionToken || (user.get && user.get('sessionToken')) || user.sessionToken)) {
        const userId = user.id || (user.objectId) || (user.get && user.get('objectId')) || (user.get && user.get('id'));
        if (userId) {
          const where = encodeURIComponent(JSON.stringify({ user: { __type: 'Pointer', className: '_User', objectId: userId } }));
          const res = await fetch(`${cfg.serverURL}/classes/ClientProfile?where=${where}&limit=1`, {
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken }
          });
          if (res.ok) {
            const d = await res.json();
            if (d.results && d.results.length) clientProfile = d.results[0];
          }
        }
      }
    } catch (e) {
      console.warn('REST fallback to fetch ClientProfile failed:', e);
    }
  }

  if (!clientProfile) {
    mensagem.textContent = "Você ainda não completou seu perfil. Vá em 'Editar Perfil'.";
    return;
  }

  // Renderiza o calendário (igual antes)
    // Não renderizamos a agenda na área principal; mantemos apenas notificações e propaganda.
    if (document.getElementById("calendar")) {
      await inicializarAgenda(clientProfile);
    }

  // Carrega notificações
  await carregarNotificacoes();

  // Ações em massa
  if (btnMarkAll) btnMarkAll.addEventListener("click", async () => {
    try {
      const notifs = await buscarTodas();
      const pendentes = notifs.filter(n => n.get("status") !== "lida");
      // Handle SDK objects and REST wrappers
      for (const n of pendentes) {
        if (typeof n.set === 'function' && typeof n.save === 'function') {
          n.set('status', 'lida');
          await n.save();
        } else if (n.id) {
          // REST wrapper
          n._raw = n._raw || {};
          n._raw.status = 'lida';
          const cfg = window.PARSE_CONFIG;
          await fetch(`${cfg.serverURL}/classes/Notificacao/${n.id}`, {
            method: 'PUT',
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken), 'Content-Type': 'application/json' },
            body: JSON.stringify(n._raw)
          });
        }
      }
      await carregarNotificacoes();
    } catch (e) {
      console.error(e);
      alert("Erro ao marcar todas como lidas.");
    }
  });

  if (btnRefresh) btnRefresh.addEventListener('click', async () => { await carregarNotificacoes(); });

  if (btnRemoveRead) btnRemoveRead.addEventListener('click', async () => {
    try {
      const notifs = await buscarTodas();
      const lidas = notifs.filter(n => n.get("status") === "lida");
      for (const n of lidas) {
        if (typeof n.destroy === 'function') {
          await n.destroy();
        } else if (n.id) {
          const cfg = window.PARSE_CONFIG;
          await fetch(`${cfg.serverURL}/classes/Notificacao/${n.id}`, { method: 'DELETE', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken) } });
        }
      }
      await carregarNotificacoes();
    } catch (e) { console.error('Erro removendo lidas:', e); alert('Erro ao remover notificações lidas.'); }
  });

  // ---------- Funções ----------
  async function inicializarAgenda(clientProfile) {
    const calendarEl = document.getElementById("calendar");



      if (!calendarEl) {
        console.debug('inicializarAgenda: elemento #calendar não encontrado — pulando renderização.');
        return;
      }
      // Se em outra página o calendário for necessário, a lógica pode ser implementada aqui.
  }

  async function buscarTodas() {
    // If clientProfile is a Parse.Object (has get), use SDK; otherwise use REST
    if (clientProfile && typeof clientProfile.get === 'function') {
      console.log('buscarTodas: using SDK to fetch Notificacao for clientProfile', clientProfile.id || clientProfile.objectId);
      const Notificacao = Parse.Object.extend("Notificacao");
      const q = new Parse.Query(Notificacao);
      q.equalTo("client", clientProfile);
      q.include("professional");
      q.descending("createdAt");
      q.limit(100); // ajuste se precisar de paginação
      const results = await q.find();
      if (results && results.length) return results;

      // Fallback: sometimes notifications were stored pointing directly to _User instead of ClientProfile.
      // Try a REST query that searches for client pointer as either ClientProfile or _User.
      try {
        const cfg = window.PARSE_CONFIG;
        const whereObj = { "$or": [ { client: { __type: 'Pointer', className: 'ClientProfile', objectId: clientProfile.id || clientProfile.objectId } }, { client: { __type: 'Pointer', className: '_User', objectId: user.id || user.objectId } } ] };
        const where = encodeURIComponent(JSON.stringify(whereObj));
        const url = `${cfg.serverURL}/classes/Notificacao?where=${where}&include=professional&order=-createdAt&limit=100`;
        const res = await fetch(url, { headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken || (user && user.__sessionToken) } });
        if (res.ok) {
          const data = await res.json();
          return data.results.map(r => ({
            id: r.objectId,
            createdAt: new Date(r.createdAt),
            _raw: r,
            get: (k) => { if (k === 'professional') return r.professional; return r[k]; },
            set: (k, v) => { r[k] = v; },
            save: async function() { const cfg = window.PARSE_CONFIG; const res = await fetch(`${cfg.serverURL}/classes/Notificacao/${this.id}`, { method: 'PUT', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken || (clientProfile && clientProfile.__sessionToken), 'Content-Type': 'application/json' }, body: JSON.stringify(this._raw) }); if (!res.ok) throw new Error('Failed to save notification'); const d = await res.json(); Object.assign(this._raw, d); },
            destroy: async function() { const cfg = window.PARSE_CONFIG; const res = await fetch(`${cfg.serverURL}/classes/Notificacao/${this.id}`, { method: 'DELETE', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken || (clientProfile && clientProfile.__sessionToken) } }); if (!res.ok) throw new Error('Failed to delete notification'); }
          }));
        }
      } catch (e) { console.warn('Fallback REST buscarTodas for user-pointer failed:', e); }

      return results; // empty
    }

    // REST path: clientProfile is a plain object (from REST). Fetch notifications via REST and return thin wrappers
    try {
      const cfg = window.PARSE_CONFIG;
      const where = encodeURIComponent(JSON.stringify({ client: { __type: 'Pointer', className: 'ClientProfile', objectId: clientProfile.objectId || clientProfile.id } }));
      const url = `${cfg.serverURL}/classes/Notificacao?where=${where}&include=professional&order=-createdAt&limit=100`;
      console.log('buscarTodas: REST fetching Notificacao URL=', url);
      const res = await fetch(url, { headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken) } });
      if (!res.ok) {
        const text = await res.text().catch(()=>null);
        console.error('buscarTodas: REST fetch returned', res.status, text);
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      console.log('buscarTodas: REST returned', (data.results && data.results.length) || 0, 'notifications');
      // Map REST results to a simple wrapper that exposes get(), id, createdAt and helper save/destroy using REST
      return data.results.map(r => {
        const wrapper = {
          id: r.objectId,
          createdAt: new Date(r.createdAt),
          _raw: r,
          get: (k) => {
            if (k === 'professional') return r.professional; // REST object
            return r[k];
          },
          set: (k, v) => { r[k] = v; },
          save: async function() {
            const cfg = window.PARSE_CONFIG;
            const res = await fetch(`${cfg.serverURL}/classes/Notificacao/${this.id}`, {
              method: 'PUT',
              headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken), 'Content-Type': 'application/json' },
              body: JSON.stringify(this._raw)
            });
            if (!res.ok) throw new Error(`Failed to save notification: ${res.status}`);
            const d = await res.json();
            Object.assign(this._raw, d);
          },
          destroy: async function() {
            const cfg = window.PARSE_CONFIG;
            const res = await fetch(`${cfg.serverURL}/classes/Notificacao/${this.id}`, {
              method: 'DELETE',
              headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken) }
            });
            if (!res.ok) throw new Error(`Failed to delete notification: ${res.status}`);
          }
        };
        return wrapper;
      });
    } catch (e) {
      console.error('Erro REST ao buscar notificacoes:', e);
      return [];
    }
  }

  async function carregarNotificacoes() {
    try {
      mensagem.textContent = "Carregando notificações...";
      listaNotificacoes.innerHTML = "";
      const badgeEl = document.getElementById('notif-badge');

      const results = await buscarTodas();

      if (results.length === 0) {
        mensagem.textContent = "Nenhuma notificação.";
        if (badgeEl) badgeEl.textContent = '0';
        return;
      }
      mensagem.textContent = "";
      if (badgeEl) badgeEl.textContent = String(results.length);

      for (const notif of results) {
        const prof = notif.get("professional");
        const nomeProf = prof ? prof.get("name") : "Profissional";
        const msg = notif.get("message");
        const tipo = notif.get("type");
        const data = notif.createdAt.toLocaleString("pt-BR");
        const lida = notif.get("status") === "lida";

        const div = document.createElement("div");
        div.className = "notificacao" + (lida ? " lida" : "");
        div.dataset.id = notif.id;
        div.innerHTML = `
          <h4>${tipo === "aceito" ? "✅ Aceito" : "🚫 Recusado"} - ${nomeProf}</h4>
          <p>${msg}</p>
          <small>${data}</small>
            <div class="notif-actions">
              <button class="btn-secondary btn-marcar">${lida ? "Marcar como não lida" : "Marcar como lida"}</button>
              <button class="btn-danger btn-remover">Remover</button>
            </div>
        `;

        // Ações individuais
        div.querySelector(".btn-marcar").addEventListener("click", async () => {
          try {
            // Support both SDK and REST wrapper
            if (typeof notif.set === 'function' && typeof notif.save === 'function') {
              notif.set("status", lida ? "nova" : "lida");
              await notif.save();
            } else if (notif.id) {
              // REST wrapper: update via REST
              const cfg = window.PARSE_CONFIG;
              notif._raw = notif._raw || {};
              notif._raw.status = (lida ? "nova" : "lida");
              await fetch(`${cfg.serverURL}/classes/Notificacao/${notif.id}`, {
                method: 'PUT',
                headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken), 'Content-Type': 'application/json' },
                body: JSON.stringify(notif._raw)
              });
            }
            await carregarNotificacoes(); // re-render para refletir estado
          } catch (e) {
            console.error(e);
            alert("Erro ao atualizar status da notificação.");
          }
        });

        div.querySelector(".btn-remover").addEventListener("click", async () => {
          try {
            if (typeof notif.destroy === 'function') {
              await notif.destroy();
            } else if (notif.id) {
              const cfg = window.PARSE_CONFIG;
              await fetch(`${cfg.serverURL}/classes/Notificacao/${notif.id}`, { method: 'DELETE', headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': clientProfile.__sessionToken || (user && user.__sessionToken) } });
            }
            div.remove();
            if (!listaNotificacoes.children.length) mensagem.textContent = "Nenhuma notificação.";
          } catch (e) {
            console.error(e);
            alert("Erro ao remover notificação.");
          }
        });

        listaNotificacoes.appendChild(div);
      }
    } catch (e) {
      console.error("Erro ao carregar notificações:", e);
      mensagem.textContent = "Erro ao carregar notificações.";
    }
  }
});