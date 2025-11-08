document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) return;

  // Allow users of any role to create establishment profile; check if already exists
  const EstablishmentProfile = Parse.Object.extend("EstablishmentProfile");
  const query = new Parse.Query(EstablishmentProfile);
  query.equalTo("user", user);
  let perfil = await query.first();

  let primeiraVez = !perfil;
  if (primeiraVez) perfil = new EstablishmentProfile();

  const campos = {
    nome: document.getElementById("nome"),
    descricao: document.getElementById("descricao"),
    endereco: document.getElementById("endereco"),
    telefone: document.getElementById("telefone"),
    email: document.getElementById("email"),
    cnpj: document.getElementById("cnpj"),
    online: document.getElementById("online"),
    preco: document.getElementById("preco"),
    foto: document.getElementById("foto"),
    preview: document.getElementById("previewFoto"),
    removerFotoBtn: document.getElementById("removerFoto"),
    mensagem: document.getElementById("mensagem"),
  };

  if (!primeiraVez) {
    campos.nome.value = perfil.get("name") || "";
    campos.descricao.value = perfil.get("description") || "";
    campos.endereco.value = perfil.get("address") || "";
    campos.telefone.value = perfil.get("phone") || "";
    campos.email.value = perfil.get("contactEmail") || "";
    campos.online.value = perfil.get("attendsOnline") ? "true" : "false";
    campos.preco.value = perfil.get("price") || "";
    if (perfil.get("photo")) {
      campos.preview.src = perfil.get("photo").url();
      campos.preview.style.display = "block";
      campos.removerFotoBtn.style.display = "inline-block";
    }
  }

  campos.foto.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      campos.preview.src = ev.target.result;
      campos.preview.style.display = "block";
      campos.removerFotoBtn.style.display = "inline-block";
    };
    reader.readAsDataURL(file);
  });

  campos.removerFotoBtn.addEventListener("click", async () => {
    try {
      perfil.unset("photo");
      await perfil.save();
      campos.preview.style.display = "none";
      campos.removerFotoBtn.style.display = "none";
      campos.mensagem.textContent = "Foto removida com sucesso!";
      campos.mensagem.style.color = "#e67e22";
    } catch (err) {
      campos.mensagem.textContent = "Erro ao remover foto.";
      campos.mensagem.style.color = "red";
    }
  });

  document.getElementById("perfilForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    campos.mensagem.textContent = "Salvando...";
    campos.mensagem.style.color = "#555";

    // Endereço obrigatório para estabelecimentos
    if (!campos.endereco.value.trim()) {
      campos.mensagem.textContent = "Endereço é obrigatório para estabelecimentos.";
      campos.mensagem.style.color = "red";
      return;
    }

    try {
      perfil.set("user", user);
      perfil.set("name", campos.nome.value.trim());
      perfil.set("description", campos.descricao.value.trim());
      perfil.set("address", campos.endereco.value.trim());
  perfil.set("phone", campos.telefone.value.trim() || null);
  perfil.set("contactEmail", campos.email.value.trim() || null);
      perfil.set("cnpj", campos.cnpj.value.trim() || null);
      perfil.set("attendsOnline", campos.online.value === "true");
      perfil.set("price", parseFloat(campos.preco.value) || 0);

      const file = campos.foto.files[0];
      if (file) {
        const parseFile = new Parse.File(file.name, file);
        await parseFile.save();
        perfil.set("photo", parseFile);
      }

      await perfil.save();

      campos.mensagem.textContent = primeiraVez ? "✔ Perfil criado com sucesso!" : "✔ Perfil atualizado com sucesso!";
      campos.mensagem.style.color = "green";
    } catch (err) {
      console.error("Erro ao salvar perfil de estabelecimento:", err);
      campos.mensagem.textContent = "Erro ao salvar perfil.";
      campos.mensagem.style.color = "red";
    }
  });

  document.getElementById("voltarDashboard").addEventListener("click", () => {
    window.location.href = "estabelecimento-dashboard.html";
  });
});
