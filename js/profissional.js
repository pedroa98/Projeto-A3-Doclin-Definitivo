document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const profId = params.get("id");

  const container = document.getElementById("perfilProfissional");
  const msg = document.getElementById("mensagem");

  if (!profId) {
    container.innerHTML = "<p>Nenhum profissional selecionado.</p>";
    return;
  }

  try {
    const profQuery = new Parse.Query("ProfessionalProfile");
    const prof = await profQuery.get(profId);
    if (!prof) {
      container.innerHTML = "<p>Profissional não encontrado.</p>";
      return;
    }

    function photoUrlFor(obj) {
      try {
        // Parse.Object
        if (obj && typeof obj.get === 'function') {
          const pu = obj.get('photoUrl');
          if (pu) return pu;
          const pf = obj.get('photo');
          if (pf && typeof pf.url === 'function') return pf.url();
          if (pf && pf.url) return pf.url;
        }
        // Plain REST object
        if (obj && obj.photoUrl) return obj.photoUrl;
        if (obj && obj.photo && obj.photo.url) return obj.photo.url;
      } catch (e) { /* ignore */ }
      return null;
    }

    const clientQuery = new Parse.Query("ClientProfile");
    clientQuery.equalTo("user", user);
    const clientProfile = await clientQuery.first();

    // Cliente sem perfil
    if (!clientProfile) {
      container.innerHTML = `
        <img src="${photoUrlFor(prof) || "https://via.placeholder.com/150"}" alt="Foto">
        <h2>${prof.get("name")}</h2>
        <p>${prof.get("description") || ""}</p>
        <p>💰 ${prof.get("price") ? "R$ " + prof.get("price").toFixed(2) : "Preço não informado"}</p>
        <p>📍 ${prof.get("address") || "Endereço não informado"}</p>
        <p>${prof.get("attendsOnline") ? "💻 Atende Online" : ""} ${prof.get("attendsInPerson") ? "🏢 Atende Presencial" : ""}</p>
        <p>⚠️ Você precisa cadastrar seu perfil antes de se vincular a um profissional.</p>
        <button class="btn btn-cadastro" onclick="window.location.href='editar-perfil-cliente.html'">Cadastrar Perfil</button>
      `;
      return;
    }

    // Verifica se já há relação ativa
    const Relation = Parse.Object.extend("ProfessionalClientRelation");
    const relQuery = new Parse.Query(Relation);
    relQuery.equalTo("professional", prof);
    relQuery.equalTo("client", clientProfile);
    const relation = await relQuery.first();

    container.innerHTML = `
      <img src="${photoUrlFor(prof) || "https://via.placeholder.com/150"}" alt="Foto">
      <h2>${prof.get("name")}</h2>
      <p>${prof.get("description") || ""}</p>
      <p>💳 Conselho: ${prof.get("councilNumber") || "Não informado"}</p>
      <p>💰 ${prof.get("price") ? "R$ " + prof.get("price").toFixed(2) : "Preço não informado"}</p>
      <p>📍 ${prof.get("address") || "Endereço não informado"}</p>
      <p>${prof.get("attendsOnline") ? "💻 Atende Online" : ""} ${prof.get("attendsInPerson") ? "🏢 Atende Presencial" : ""}</p>
    `;

    if (relation) {
      container.innerHTML += `
        <button class="btn btn-green" onclick="window.location.href='agenda-profissional.html?id=${prof.id}'">Ver Agenda</button>
      `;
    } else {
      container.innerHTML += `
        <textarea id="mensagemInteresse" placeholder="Envie uma mensagem para o profissional"></textarea>
        <button class="btn btn-blue" id="btnInteresse">Solicitar Vínculo</button>
      `;

      document.getElementById("btnInteresse").addEventListener("click", async () => {
        const texto = document.getElementById("mensagemInteresse").value.trim();
        if (!texto) {
          alert("Digite uma mensagem antes de enviar.");
          return;
        }

        const Interesse = Parse.Object.extend("Interesse");
        const i = new Interesse();
        i.set("client", clientProfile);
        i.set("professional", prof);
        i.set("message", texto);
        await i.save();

        msg.textContent = "Mensagem enviada! Aguarde o retorno do profissional.";
        msg.style.color = "green";
      });
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "Erro ao carregar o perfil do profissional.";
    msg.style.color = "red";
  }
});