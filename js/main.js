/*
  main.js — Cloud Code do AutoCuidado App
  Autor: você 🧠
  Recursos:
   1️⃣ deletePhoto() – Deleta fotos do servidor (Back4App Files)
   2️⃣ logUserAction() – Registra logs de ações de usuários
   3️⃣ autoCleanOldFiles() – Limpa arquivos órfãos
*/

Parse.Cloud.define("deletePhoto", async (request) => {
  const url = request.params.url;
  if (!url) throw "URL da foto não fornecida.";

  const parts = url.split("/");
  const fileName = parts[parts.length - 1];

  console.log("Tentando deletar arquivo:", fileName);

  try {
    const appId = process.env.APP_ID || "EKYCpGZtjjnggKTy0lsjlm4ZaWL1cX0n5z2hDoD9";
    const masterKey = process.env.MASTER_KEY;
    const serverUrl = "https://parseapi.back4app.com";

    const response = await Parse.Cloud.httpRequest({
      method: "DELETE",
      url: `${serverUrl}/files/${fileName}`,
      headers: {
        "X-Parse-Application-Id": appId,
        "X-Parse-Master-Key": masterKey,
      },
    });

    console.log("Arquivo deletado com sucesso:", response.text || "OK");

    // 🔹 Log opcional da ação
    await Parse.Cloud.run("logUserAction", {
      userId: request.user?.id,
      action: "deletePhoto",
      detail: fileName,
    });

    return "Arquivo deletado com sucesso.";
  } catch (err) {
    console.error("Erro ao deletar arquivo:", err);
    throw "Erro ao deletar arquivo: " + (err.message || err);
  }
});

/* ---------------------------------------------------------------------- */
/* 🧾 2️⃣ Função de Log: registra ações de usuários (auditoria interna)   */
/* ---------------------------------------------------------------------- */
Parse.Cloud.define("logUserAction", async (request) => {
  const { userId, action, detail } = request.params;
  if (!action) throw "Ação não especificada para log.";

  const Log = Parse.Object.extend("UserActionLog");
  const log = new Log();

  log.set("action", action);
  log.set("detail", detail || "");
  if (userId) log.set("userId", userId);
  if (request.user) log.set("actor", request.user);

  await log.save(null, { useMasterKey: true });
  console.log("Ação registrada:", action);
  return "Log registrado.";
});

/* ---------------------------------------------------------------------- */
/* 🧹 3️⃣ Limpeza Automática de Arquivos Órfãos                           */
/* ---------------------------------------------------------------------- */
Parse.Cloud.job("autoCleanOldFiles", async (request) => {
  const serverUrl = "https://parseapi.back4app.com";
  const appId = process.env.APP_ID || "EKYCpGZtjjnggKTy0lsjlm4ZaWL1cX0n5z2hDoD9";
  const masterKey = process.env.MASTER_KEY;

  console.log("🧹 Iniciando limpeza de arquivos órfãos...");

  // Busca todos os usuários com fotos
  const User = Parse.Object.extend("_User");
  const query = new Parse.Query(User);
  query.exists("photoUrl");
  const users = await query.find({ useMasterKey: true });
  const urlsEmUso = users.map((u) => u.get("photoUrl"));

  // Busca lista de arquivos
  const response = await Parse.Cloud.httpRequest({
    method: "GET",
    url: `${serverUrl}/files`,
    headers: {
      "X-Parse-Application-Id": appId,
      "X-Parse-Master-Key": masterKey,
    },
  });

  const allFiles = JSON.parse(response.text).results || [];
  let deletados = 0;

  for (const file of allFiles) {
    const fileUrl = file.url;
    if (!urlsEmUso.includes(fileUrl)) {
      try {
        await Parse.Cloud.httpRequest({
          method: "DELETE",
          url: `${serverUrl}/files/${file.name}`,
          headers: {
            "X-Parse-Application-Id": appId,
            "X-Parse-Master-Key": masterKey,
          },
        });
        deletados++;
        console.log("🗑️ Removido:", file.name);
      } catch (err) {
        console.error("Erro ao deletar arquivo órfão:", err);
      }
    }
  }

  console.log(`✅ Limpeza concluída. ${deletados} arquivos removidos.`);
  return `${deletados} arquivos órfãos deletados.`;
});
