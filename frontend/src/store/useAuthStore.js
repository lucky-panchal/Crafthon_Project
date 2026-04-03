import { create } from "zustand";

const TOKEN_KEY = "defcomm_token";
const USER_KEY  = "defcomm_user";

function loadFromStorage() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const user  = JSON.parse(localStorage.getItem(USER_KEY) || "null");
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
}

const useAuthStore = create((set, get) => ({
  ...loadFromStorage(),

  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },

  isLoggedIn: () => !!get().token,
}));

export default useAuthStore;
