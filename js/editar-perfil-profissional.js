document.addEventListener("DOMContentLoaded", async () => {
  const user = await ensureSession();
  if (!user) return;

  if (user.get("role") !== "profissional") {
    alert("Acesso negado. Apenas profissionais podem editar este perfil.");
    window.location.href = "login.html";
    return;
  }

  const ProfessionalProfile = Parse.Object.extend("ProfessionalProfile");
  const query = new Parse.Query(ProfessionalProfile);
  query.equalTo("user", user);
  let perfil = await query.first();

  // Ensure there is at most one profile per user: re-check before creating
  let primeiraVez = !perfil;
  if (primeiraVez) {
    // run a fresh query to avoid race conditions
    const existing = await query.first();
    if (existing) {
      perfil = existing;
      primeiraVez = false;
    } else {
      perfil = new ProfessionalProfile();
    }
  }

  const campos = {
    nome: document.getElementById("nome"),
    descricao: document.getElementById("descricao"),
    tipo: document.getElementById("tipo"),
    email: document.getElementById("email"),
    telefone: document.getElementById("telefone"),
    conselho: document.getElementById("conselho"),
    endereco: document.getElementById("endereco"),
    online: document.getElementById("online"),
    presencial: document.getElementById("presencial"),
    preco: document.getElementById("preco"),
    foto: document.getElementById("foto"),
    preview: document.getElementById("previewFoto"),
    removerFotoBtn: document.getElementById("removerFoto"),
    mensagem: document.getElementById("mensagem"),
  };

  if (!primeiraVez) {
    campos.nome.value = perfil.get("name") || "";
    campos.descricao.value = perfil.get("description") || "";
    campos.tipo.value = perfil.get("type") || "";
    campos.email.value = perfil.get("contactEmail") || "";
    campos.telefone.value = perfil.get("phone") || "";
    campos.conselho.value = perfil.get("councilNumber") || "";
    campos.endereco.value = perfil.get("address") || "";
    campos.online.value = perfil.get("attendsOnline") ? "true" : "false";
    campos.presencial.value = perfil.get("attendsInPerson") ? "true" : "false";
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

    try {
      perfil.set("user", user);
      perfil.set("name", campos.nome.value.trim());
      perfil.set("description", campos.descricao.value.trim());
      perfil.set("type", campos.tipo.value.trim() || null);
      perfil.set("contactEmail", campos.email.value.trim() || null);
      perfil.set("phone", campos.telefone.value.trim() || null);
      perfil.set("councilNumber", campos.conselho.value.trim());
      perfil.set("address", campos.endereco.value.trim());
      perfil.set("attendsOnline", campos.online.value === "true");
      perfil.set("attendsInPerson", campos.presencial.value === "true");
      perfil.set("price", parseFloat(campos.preco.value) || 0);

      const file = campos.foto.files[0];
      if (file) {
        const parseFile = new Parse.File(file.name, file);
        await parseFile.save();
        perfil.set("photo", parseFile);
      }

      await perfil.save();

      campos.mensagem.textContent = primeiraVez
        ? "✅ Perfil criado com sucesso!"
        : "✅ Perfil atualizado com sucesso!";
      campos.mensagem.style.color = "green";
    } catch (err) {
      console.error("Erro ao salvar perfil:", err);
      campos.mensagem.textContent = "Erro ao salvar perfil.";
      campos.mensagem.style.color = "red";
    }
  });

  document.getElementById("voltarDashboard").addEventListener("click", () => {
    window.location.href = "profissional-dashboard.html";
  });
});
