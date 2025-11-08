document.addEventListener("DOMContentLoaded", async () => {
  // Helper for REST-backed user wrapper
  function createRestUser(data, cfg, sessionToken) {
    const u = { __isRestUser: true };
    u.id = data.objectId || data.objectID || data.id;
    u.__sessionToken = sessionToken;
    u.get = (k) => data[k] || data[camelToKey(k)];
    u.set = (k, v) => { data[k] = v; };
    u.toJSON = () => data;
    return u;
  }

  function camelToKey(k) { return k; }
  // ensureSession tries SDK restore, then REST validation
  async function ensureSession() {
    try {
      let current = Parse.User.current();
      if (current) return current;

      const stored = localStorage.getItem('user');
      if (!stored) return null;
      const session = JSON.parse(stored);
      if (session && session.sessionToken) {
        try {
          const user = await Parse.User.become(session.sessionToken);
          return user;
        } catch (e) {
          console.warn('Could not restore session in editar-perfil-cliente via SDK:', e);
          // REST fallback: validate session and return a restUser wrapper
          try {
            const cfg = window.PARSE_CONFIG;
            if (!cfg) return null;
            const url = `${cfg.serverURL}/users/${session.id}`;
            const headers = new Headers();
            headers.append('X-Parse-Application-Id', cfg.appId);
            headers.append('X-Parse-JavaScript-Key', cfg.jsKey);
            headers.append('X-Parse-Session-Token', session.sessionToken);
            const r = await fetch(url, { method: 'GET', headers });
            if (!r.ok) return null;
            const data = await r.json();
            const restUser = createRestUser(data, cfg, session.sessionToken);
            return restUser;
          } catch (e2) {
            console.warn('REST fallback failed in editar-perfil-cliente:', e2);
            return null;
          }
        }
      }
      return null;
    } catch (e) {
      console.error('ensureSession error (cliente):', e);
      return null;
    }
  }

  const user = await ensureSession();
  if (!user) {
    alert('Você precisa estar logado para editar o perfil.');
    window.location.href = 'login.html';
    return;
  }

  if ((typeof user.get === 'function' && user.get('role') !== 'cliente') || (user.__isRestUser && user.get('role') !== 'cliente' && user.role !== 'cliente')) {
    alert("Acesso negado. Apenas clientes podem editar este perfil.");
    window.location.href = "login.html";
    return;
  }

  const ClientProfile = Parse.Object.extend("ClientProfile");
  let perfil = null;
  const isRestUser = user && user.__isRestUser === true;
  if (isRestUser) {
    try {
      const cfg = window.PARSE_CONFIG;
      const where = encodeURIComponent(JSON.stringify({ user: { __type: 'Pointer', className: '_User', objectId: user.id } }));
      const res = await fetch(`${cfg.serverURL}/classes/ClientProfile?where=${where}`, {
        headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken }
      });
      if (res.ok) {
        const d = await res.json();
        if (d.results && d.results.length) perfil = d.results[0];
      }
    } catch (e) {
      console.warn('REST query for ClientProfile failed:', e);
    }
  } else {
    const query = new Parse.Query(ClientProfile);
    query.equalTo("user", user);
    perfil = await query.first();
  }

  const nome = document.getElementById("nome");
  const telefone = document.getElementById("telefone");
  const emailInput = document.getElementById("email");
  const nascimento = document.getElementById("nascimento");
  const idadeSpan = document.getElementById("idade");
  const fotoInput = document.getElementById("foto");
  const preview = document.getElementById("previewFoto");
  const removerFotoBtn = document.getElementById("removerFoto");
  const mensagem = document.getElementById("mensagem");

  let primeiraVez = !perfil;
  if (primeiraVez) {
    if (!isRestUser) {
      // re-check on SDK side
      const q2 = new Parse.Query(ClientProfile);
      q2.equalTo('user', user);
      const existing = await q2.first();
      if (existing) {
        perfil = existing;
        primeiraVez = false;
      } else {
        perfil = new ClientProfile();
      }
    } else {
      // REST: nothing to do, primeiraVez remains true if perfil not found
    }
  }

  if (!primeiraVez) {
    if (isRestUser) {
      nome.value = perfil.name || "";
      telefone.value = perfil.phone || "";
      emailInput.value = perfil.contactEmail || perfil.email || "";
      if (perfil.birthDate) {
        const d = new Date(perfil.birthDate);
        nascimento.value = d.toISOString().split("T")[0];
        atualizarIdade(d);
      }
      if (perfil.photo && perfil.photo.url) {
        preview.src = perfil.photo.url;
        preview.style.display = "block";
        removerFotoBtn.style.display = "inline-block";
      }
    } else {
      nome.value = perfil.get("name") || "";
      telefone.value = perfil.get("phone") || "";
  emailInput.value = perfil.get("contactEmail") || "";
      if (perfil.get("birthDate")) {
        const d = new Date(perfil.get("birthDate"));
        nascimento.value = d.toISOString().split("T")[0];
        atualizarIdade(d);
      }
      if (perfil.get("photo")) {
        preview.src = perfil.get("photo").url();
        preview.style.display = "block";
        removerFotoBtn.style.display = "inline-block";
      }
    }
  }

  nascimento.addEventListener("change", (e) => atualizarIdade(new Date(e.target.value)));

  fotoInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = "block";
      removerFotoBtn.style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  });

  removerFotoBtn.addEventListener("click", async () => {
    try {
      if (isRestUser) {
        const cfg = window.PARSE_CONFIG;
        if (perfil && perfil.objectId) {
          const res = await fetch(`${cfg.serverURL}/classes/ClientProfile/${perfil.objectId}`, {
            method: 'PUT',
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ photo: null })
          });
          if (!res.ok) throw new Error('Falha ao remover foto (REST)');
        }
        preview.src = "";
        preview.style.display = "none";
        removerFotoBtn.style.display = "none";
        mensagem.textContent = "Foto removida com sucesso!";
        mensagem.style.color = "#e67e22";
      } else {
        perfil.unset("photo");
        await perfil.save();
        preview.src = "";
        preview.style.display = "none";
        removerFotoBtn.style.display = "none";
        mensagem.textContent = "Foto removida com sucesso!";
        mensagem.style.color = "#e67e22";
      }
    } catch (err) {
      mensagem.textContent = "Erro ao remover foto.";
      mensagem.style.color = "red";
    }
  });

  document.getElementById("perfilForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    mensagem.textContent = "Salvando...";
    mensagem.style.color = "#555";

    try {
      const cfg = window.PARSE_CONFIG;
      if (!isRestUser) {
        perfil.set("user", user);
        perfil.set("name", nome.value.trim());
        perfil.set("phone", telefone.value.trim());
  perfil.set("contactEmail", emailInput.value.trim());
        if (nascimento.value) perfil.set("birthDate", new Date(nascimento.value));

        if (nascimento.value) {
          const idade = calcularIdade(new Date(nascimento.value));
          perfil.set("age", idade);
        }

        const file = fotoInput.files[0];
        if (file) {
          const parseFile = new Parse.File(file.name, file);
          await parseFile.save();
          perfil.set("photo", parseFile);
        }

        await perfil.save();
      } else {
        // REST create/update
        const payload = {
          user: { __type: 'Pointer', className: '_User', objectId: user.id },
          name: nome.value.trim(),
          phone: telefone.value.trim(),
          contactEmail: emailInput.value.trim(),
        };
        if (nascimento.value) {
          payload.birthDate = { __type: 'Date', iso: new Date(nascimento.value).toISOString() };
          payload.age = calcularIdade(new Date(nascimento.value));
        }

        if (fotoInput.files[0]) {
          const file = fotoInput.files[0];
          const uploadRes = await fetch(`${cfg.serverURL}/files/${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken },
            body: file
          });
          if (!uploadRes.ok) throw new Error('Falha no upload do arquivo');
          const fileData = await uploadRes.json();
          payload.photo = { name: fileData.name, url: fileData.url };
        }

        if (primeiraVez) {
          const res = await fetch(`${cfg.serverURL}/classes/ClientProfile`, {
            method: 'POST',
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('Falha ao criar ClientProfile (REST)');
          perfil = await res.json();
        } else {
          const res = await fetch(`${cfg.serverURL}/classes/ClientProfile/${perfil.objectId}`, {
            method: 'PUT',
            headers: { 'X-Parse-Application-Id': cfg.appId, 'X-Parse-JavaScript-Key': cfg.jsKey, 'X-Parse-Session-Token': user.__sessionToken, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('Falha ao atualizar ClientProfile (REST)');
          perfil = await res.json();
        }
      }

      mensagem.textContent = primeiraVez
        ? "✅ Perfil criado com sucesso!"
        : "✅ Perfil atualizado com sucesso!";
      mensagem.style.color = "green";
    } catch (err) {
      console.error(err);
      mensagem.textContent = "Erro ao salvar perfil: " + (err.message || JSON.stringify(err));
      mensagem.style.color = "red";
    }
  });

  document.getElementById("voltarDashboard").addEventListener("click", () => {
    window.location.href = "cliente-dashboard.html";
  });

  function atualizarIdade(data) {
    idadeSpan.textContent = calcularIdade(data);
  }

  function calcularIdade(data) {
    const hoje = new Date();
    let idade = hoje.getFullYear() - data.getFullYear();
    const m = hoje.getMonth() - data.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < data.getDate())) idade--;
    return idade;
  }
});