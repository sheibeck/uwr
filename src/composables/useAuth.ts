import { computed, ref, watch, type Ref } from 'vue';
import { reducers, type PlayerRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';

type UseAuthArgs = {
  connActive: Ref<boolean>;
  player: Ref<PlayerRow | null>;
};

export const useAuth = ({ connActive, player }: UseAuthArgs) => {
  const loginEmailReducer = useReducer(reducers.loginEmail);
  const logoutReducer = useReducer(reducers.logout);

  const email = ref('');
  const isLoggedIn = computed(() => player.value?.userId != null);
  const authMessage = ref('');
  const authError = ref('');

  const login = () => {
    if (!connActive.value || !email.value.trim()) return;
    authError.value = '';
    authMessage.value = 'Logging in...';
    try {
      loginEmailReducer({ email: email.value.trim() });
    } catch (err) {
      authMessage.value = '';
      authError.value = err instanceof Error ? err.message : 'Login failed';
    }
  };

  const logout = () => {
    if (!connActive.value) return;
    authError.value = '';
    try {
      logoutReducer();
    } catch (err) {
      authMessage.value = '';
      authError.value = err instanceof Error ? err.message : 'Logout failed';
    }
  };

  watch(isLoggedIn, (next) => {
    if (next) {
      authMessage.value = '';
    }
  });

  return { email, isLoggedIn, login, logout, authMessage, authError };
};
