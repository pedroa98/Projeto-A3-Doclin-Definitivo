document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) {
    alert("Você precisa estar logado.");
    window.location.href = "login.html";
    return;
  }

  const lista = document.getElementById("listaProfissionais");
  const mensagem = document.getElementById("mensagem");

  try {
    mensagem.textContent = "Carregando profissionais...";

    // Buscar perfil do cliente logado
    const clientQuery = new Parse.Query("ClientProfile");
    clientQuery.equalTo("user", user);
    const clientProfile = await clientQuery.first();

    if (!clientProfile) {
      mensagem.textContent = "Você precisa cadastrar seu perfil antes.";
      const btn = document.createElement("button");
      btn.textContent = "Cadastrar Perfil";
      btn.className = "btn-back";
      btn.onclick = () => window.location.href = "editar-perfil-cliente.html";
      mensagem.appendChild(document.createElement("br"));
      mensagem.appendChild(btn);
      return;
    }

    // Buscar relações ativas com profissionais
    const Relation = Parse.Object.extend("ProfessionalClientRelation");
    const relQuery = new Parse.Query(Relation);
    relQuery.equalTo("client", clientProfile);
    relQuery.equalTo("status", "ativo");
    relQuery.include("professional");
    const relations = await relQuery.find();

    if (relations.length === 0) {
      mensagem.textContent = "Você ainda não possui profissionais vinculados.";
      return;
    }

    mensagem.textContent = "";
    lista.innerHTML = "";

    for (const rel of relations) {
      const prof = rel.get("professional");
      if (!prof) continue;

      // `prof` may be a Parse.Object (with get()) or a plain REST object.
      const getField = (o, field) => (o && typeof o.get === 'function') ? o.get(field) : (o ? o[field] : undefined);
      const nome = getField(prof, 'name') || 'Profissional';
      const especialidade = getField(prof, 'specialty') || 'Especialidade não informada';
      const local = getField(prof, 'address') || 'Local não informado';

      // Resolve photo: support Parse.File stored in `photo`, a string `photoUrl`, or nested REST file object.
      let foto = null;
      const photoField = getField(prof, 'photo');
      const photoUrlField = getField(prof, 'photoUrl');
      if (photoUrlField) {
        foto = photoUrlField;
      } else if (photoField) {
          // If Parse.File-like object
          if (typeof photoField === 'string') {
            foto = photoField;
          } else if (typeof photoField.url === 'function') {
            // Parse.File.url() is a function in some SDK versions
            try { foto = photoField.url(); } catch (e) { /* ignore */ }
          } else if (typeof photoField.url === 'string') {
            foto = photoField.url;
          } else if (typeof photoField._url === 'string') {
            foto = photoField._url;
          } else if (typeof photoField._name === 'string') {
          // fallback: construct file url from parse server base if PARSE_CONFIG exists
          if (window.PARSE_CONFIG && window.PARSE_CONFIG.serverURL) {
            const base = window.PARSE_CONFIG.serverURL.replace(/\/$/, '');
            foto = `${base}/files/${photoField._name}`;
          }
        }
      }
      if (!foto) foto = 'https://via.placeholder.com/100';

      const pagas = rel.get("sessionsPaid") || 0;
      const usadas = rel.get("sessionsUsed") || 0;
      const saldo = Math.max(0, pagas - usadas);

      const card = document.createElement("div");
      card.className = "prof-card";
      card.innerHTML = `
        <img src="${foto}" alt="${nome}">
        <h3>${nome}</h3>
        <p>🩺 ${especialidade}</p>
        <p>📍 ${local}</p>
        <p class="saldo">💰 Sessões disponíveis: ${saldo}</p>
        <p>(${usadas}/${pagas} utilizadas)</p>
        <button class="btn">Ver Agenda</button>
      `;

      // Ao clicar no botão ou card, abre a página do profissional
      card.querySelector(".btn").addEventListener("click", () => {
        window.location.href = `profissional.html?id=${prof.id}`;
      });

      lista.appendChild(card);
    }

  } catch (err) {
    console.error(err);
    mensagem.textContent = "Erro ao carregar a lista de profissionais.";
  }
});
