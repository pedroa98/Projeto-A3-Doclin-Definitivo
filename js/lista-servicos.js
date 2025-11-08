document.addEventListener("DOMContentLoaded", async () => {
  console.log("🔍 Carregando profissionais e estabelecimentos...");
  // Support old IDs and new design (busca, lista)
  const buscaNome = document.getElementById("buscaNome") || document.getElementById("busca");
  const buscaEspecialidade = document.getElementById("buscaEspecialidade");
  const filtroTipo = document.getElementById("filtroTipo");
  const btnBuscar = document.getElementById("btnBuscar");
  const lista = document.getElementById("listaProfissionais") || document.getElementById("lista");
  let mensagem = document.getElementById("mensagem");
  if (!mensagem) {
    mensagem = document.createElement('div');
    mensagem.id = 'mensagem';
    mensagem.style.margin = '8px 0 16px';
    if (lista && lista.parentNode) lista.parentNode.insertBefore(mensagem, lista);
  }

  if (btnBuscar) btnBuscar.addEventListener("click", carregarProfissionais);
  await carregarProfissionais();

  async function carregarProfissionais() {
  mensagem.textContent = "Carregando profissionais...";
  if (lista) lista.innerHTML = "";

    const ProfessionalProfile = Parse.Object.extend("ProfessionalProfile");
    const profQuery = new Parse.Query(ProfessionalProfile);
    const EstablishmentProfile = Parse.Object.extend("EstablishmentProfile");
    const estQuery = new Parse.Query(EstablishmentProfile);

  const nome = (buscaNome && buscaNome.value) ? buscaNome.value.trim() : '';
  const especialidade = (buscaEspecialidade && buscaEspecialidade.value) ? buscaEspecialidade.value.trim() : '';
  const tipo = filtroTipo ? filtroTipo.value : '';

    if (nome) { profQuery.matches("name", nome, "i"); estQuery.matches("name", nome, "i"); }
    if (especialidade) { profQuery.matches("description", especialidade, "i"); estQuery.matches("description", especialidade, "i"); }

    if (tipo === "online") { profQuery.equalTo("attendsOnline", true); estQuery.equalTo("attendsOnline", true); }
    if (tipo === "presencial") { profQuery.equalTo("attendsInPerson", true); estQuery.equalTo("attendsInPerson", true); }

    profQuery.descending("createdAt");
    profQuery.limit(50);
    estQuery.descending("createdAt");
    estQuery.limit(50);

    try {
      const [profResults, estResults] = await Promise.all([profQuery.find(), estQuery.find()]);
      const combined = [
        ...profResults.map(r => ({ type: 'professional', obj: r })),
        ...estResults.map(r => ({ type: 'establishment', obj: r })),
      ];

      if (combined.length === 0) {
        mensagem.textContent = "Nenhum serviço encontrado.";
        return;
      }

      mensagem.textContent = "";
      if (lista) {
        lista.innerHTML = combined.map(item => item.type === 'professional' ? renderProfissional(item.obj) : renderEstabelecimento(item.obj)).join("");
      } else {
        console.warn('lista element not found; cannot render services.');
      }
      console.log('carregarProfissionais: found', profResults.length, 'professionals and', estResults.length, 'establishments');
    } catch (err) {
      console.error("Erro ao carregar profissionais:", err);
      mensagem.textContent = "Erro ao buscar profissionais.";
    }
  }

  function renderProfissional(p) {
    const nome = p.get("name") || "Profissional";
    const desc = p.get("description") || "Sem descrição.";
    const preco = p.get("price") ? `R$ ${p.get("price").toFixed(2)}` : "Preço não informado";
    const online = p.get("attendsOnline") ? "💻 Online" : "";
    const presencial = p.get("attendsInPerson") ? "🏥 Presencial" : "";
    const foto = p.get("photo") ? p.get("photo").url() : "https://via.placeholder.com/350x200?text=Sem+Foto";

    return `
      <div class="card" onclick="abrirPerfil('${p.id}')">
        <img src="${foto}" alt="Foto de ${nome}">
        <div class="card-content">
          <h3>${nome}</h3>
          <p class="descricao">${desc}</p>
          <p class="preco">${preco}</p>
          <p class="tipos">${[online, presencial].filter(Boolean).join(" • ")}</p>
        </div>
      </div>
    `;
  }
  window.abrirPerfil = function (id) {
    window.location.href = `profissional.html?id=${id}`;
  };

  function renderEstabelecimento(e) {
    const nome = e.get("name") || "Estabelecimento";
    const desc = e.get("description") || "Sem descrição.";
    const preco = e.get("price") ? `R$ ${e.get("price").toFixed(2)}` : "Preço não informado";
    const online = e.get("attendsOnline") ? "💻 Online" : "";
    const presencial = e.get("attendsInPerson") ? "🏬 Presencial" : "";
    const foto = e.get("photo") ? e.get("photo").url() : "https://via.placeholder.com/350x200?text=Sem+Foto";

    return `
      <div class="card" onclick="abrirEstabelecimento('${e.id}')">
        <span class="badge">ESTAB</span>
        <img src="${foto}" alt="Foto de ${nome}">
        <div class="card-content">
          <h3>${nome} <small style="font-size:12px;color:#666">(Estabelecimento)</small></h3>
          <p class="descricao">${desc}</p>
          <p class="preco">${preco}</p>
          <p class="tipos">${[online, presencial].filter(Boolean).join(" • ")}</p>
        </div>
      </div>
    `;
  }

  window.abrirEstabelecimento = function (id) {
    window.location.href = `estabelecimento.html?id=${id}`;
  };
});