const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5001').replace(/\/$/, '');
const TOKEN_KEY = 'bloom_token';
const USER_KEY = 'bloom_user';
const listeners = new Set();

function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setStoredSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuth();
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  notifyAuth();
}

function getSessionObject() {
  const token = getStoredToken();
  const user = getStoredUser();
  if (!token || !user) return null;
  return { access_token: token, user };
}

function notifyAuth() {
  const session = getSessionObject();
  for (const cb of listeners) cb('SIGNED_IN', session);
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }

  if (!res.ok) {
    const msg = data?.error || data?.message || `request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: getSessionObject() } };
    },
    onAuthStateChange(callback) {
      listeners.add(callback);
      return {
        data: {
          subscription: {
            unsubscribe() { listeners.delete(callback); },
          },
        },
      };
    },
    async signInWithPassword({ email, password }) {
      try {
        const data = await apiFetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        setStoredSession(data.token, data.user);
        return { data: { session: getSessionObject(), user: data.user }, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async signUp({ email, password, options }) {
      try {
        const data = await apiFetch('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password, username: options?.data?.username }),
        });
        setStoredSession(data.token, data.user);
        return { data: { session: getSessionObject(), user: data.user }, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },
    async signOut() {
      try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch {}
      clearStoredSession();
      return { error: null };
    },
  },
  channel() {
    return {
      on() { return this; },
      subscribe() { return this; },
    };
  },
  removeChannel() {},
};

export const games = {
  sproutExpressFinish: (deliveries) =>
    apiFetch('/api/games/sprout-express/finish', {
      method: 'POST',
      body: JSON.stringify({ deliveries }),
    }),
};

export async function loadGameState() {
  return apiFetch('/api/state');
}

export async function updatePlant(plantId, payload) {
  return apiFetch(`/api/plants/${plantId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function waterPlantRequest(plantId) {
  return apiFetch(`/api/plants/${plantId}/water`, { method: 'POST' });
}

export async function fertilizePlantRequest(plantId) {
  return apiFetch(`/api/plants/${plantId}/fertilize`, { method: 'POST' });
}

export async function purchaseItemRequest(category, item, payload = {}) {
  return apiFetch('/api/shop/purchase', {
    method: 'POST',
    body: JSON.stringify({ category, item_id: item.id, price: item.price, payload }),
  });
}

export async function claimQuestRequest(questId) {
  return apiFetch(`/api/quests/${questId}/claim`, { method: 'POST' });
}

export async function bumpQuestRequest(track, amount = 1) {
  return apiFetch('/api/quests/bump', {
    method: 'POST',
    body: JSON.stringify({ track, amount }),
  });
}

export async function leaderboardRequest() {
  return apiFetch('/api/leaderboard');
}

export async function searchUsersRequest(q) {
  const qs = new URLSearchParams({ q });
  return apiFetch(`/api/users/search?${qs.toString()}`);
}

export async function getGardenRequest(userId) {
  return apiFetch(`/api/users/${userId}/garden`);
}

export async function likeGardenRequest(userId) {
  return apiFetch(`/api/users/${userId}/like`, { method: 'POST' });
}

export async function unlikeGardenRequest(userId) {
  return apiFetch(`/api/users/${userId}/like`, { method: 'DELETE' });
}

export async function sendGiftRequest(userId, itemId) {
  return apiFetch(`/api/users/${userId}/gift`, {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId }),
  });
}

export { API_URL };
