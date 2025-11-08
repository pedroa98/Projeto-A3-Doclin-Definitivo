const PARSE_APP_ID = "EKYCpGZtjjnggKTy0lsjlm4ZaWL1cX0n5z2hDoD9";
const PARSE_JS_KEY = "AFPah4jtHCIA2MrmEdT3jw5lzaX4tvbiLTUvywdx";
const PARSE_SERVER_URL = "https://parseapi.back4app.com"; // sem barra!

console.log("🔹 Inicializando Parse SDK...");
Parse.initialize(PARSE_APP_ID, PARSE_JS_KEY);
Parse.serverURL = PARSE_SERVER_URL;
console.log("✅ Parse SDK iniciado:", PARSE_SERVER_URL);

window.PARSE_CONFIG = {
  appId: PARSE_APP_ID,
  jsKey: PARSE_JS_KEY,
  serverURL: PARSE_SERVER_URL,
};

// Debug extra — detectar falhas de CORS ou rede
Parse.onError = (err) => console.error("❌ Parse SDK Error:", err);

// Make Headers.has tolerant to invalid names (return false instead of throwing).
// This avoids the SDK crashing in environments where a header name becomes an empty string.
(function(){
  if (typeof Headers === 'undefined' || !Headers.prototype) return;
  try {
    const originalHas = Headers.prototype.has;
    Headers.prototype.has = function(name) {
      try {
        return originalHas.call(this, name);
      } catch (err) {
        // Log the problematic name for debugging, but do not rethrow to avoid breaking flows
        try { console.warn('Headers.has received invalid name (tolerated):', name, 'typeof:', typeof name); } catch(e){}
        return false;
      }
    };
  } catch (e) {
    console.warn('Could not wrap Headers.prototype.has (tolerant):', e);
  }
})();

// Shared ensureSession utility used by multiple pages. Tries SDK restore first
// (Parse.User.become) then falls back to REST validation using stored session.
// Accepts optional `requiredRole` string to enforce role-based access.
window.ensureSession = async function(requiredRole) {
  // helper to create a lightweight REST-backed user object compatible with code using user.get()
  function createRestUser(data, sessionToken) {
    const u = { __isRestUser: true };
    u.id = data.objectId || data.objectID || data.id;
    u.__sessionToken = sessionToken;
    u.toJSON = () => data;
    u.get = (k) => {
      // Try direct key, then camelCase fallback
      if (data.hasOwnProperty(k)) return data[k];
      return data[k];
    };
    u.set = (k, v) => { data[k] = v; };
    return u;
  }

  try {
    // SDK current user
    try {
      const current = Parse.User.current();
      if (current) {
        if (requiredRole && current.get && current.get('role') !== requiredRole) return null;
        return current;
      }
    } catch(e) {
      // ignore
    }

    const stored = localStorage.getItem('user');
    if (!stored) return null;
    const session = JSON.parse(stored);
    if (!session || !session.sessionToken) return null;

    // Try to restore in SDK
    try {
      const sdkUser = await Parse.User.become(session.sessionToken);
      if (requiredRole && sdkUser.get && sdkUser.get('role') !== requiredRole) return null;
      return sdkUser;
    } catch (e) {
      console.warn('Could not restore session via SDK:', e);
      // Continue to REST fallback
    }

    // REST fallback: validate session and return a rest-like user
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
      const restUser = createRestUser(data, session.sessionToken);
      if (requiredRole && restUser.get && restUser.get('role') !== requiredRole) return null;
      return restUser;
    } catch (e2) {
      console.warn('REST session validation failed:', e2);
      return null;
    }
  } catch (e) {
    console.error('ensureSession unexpected error:', e);
    return null;
  }
};
