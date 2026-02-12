import { computed, ref, watch, type Ref } from 'vue';
import { reducers, type PlayerRow } from '../module_bindings';
import { useReducer } from 'spacetimedb/vue';
import {
  beginSpacetimeAuthLogin,
  clearAuthSession,
  getStoredEmail,
  getStoredIdToken,
} from '../auth/spacetimeAuth';

type UseAuthArgs = {
  connActive: Ref<boolean>;
  player: Ref<PlayerRow | null>;
};

export const useAuth = ({ connActive, player }: UseAuthArgs) => {
  const loginEmailReducer = useReducer(reducers.loginEmail);
  const logoutReducer = useReducer(reducers.logout);

  const authEmail = ref(getStoredEmail() ?? '');
  const tokenCleared = ref(false);
  const isPendingLogin = ref(Boolean(getStoredIdToken()) && player.value?.userId == null);
  const isLoggedIn = computed(() => !tokenCleared.value && Boolean(getStoredIdToken()) && player.value?.userId != null);
  const authMessage = ref('');
  const authError = ref('');

  const login = () => {
    if (!connActive.value) return;
    authError.value = '';
    try {
      authMessage.value = 'Redirecting to SpacetimeAuth...';
      void beginSpacetimeAuthLogin();
    } catch (err) {
      authMessage.value = '';
      authError.value = err instanceof Error ? err.message : 'Login failed';
    }
  };

  const logout = () => {
    authError.value = '';
    try {
      if (connActive.value) logoutReducer();
      clearAuthSession();
      tokenCleared.value = true;
      authMessage.value = '';
    } catch (err) {
      authMessage.value = '';
      authError.value = err instanceof Error ? err.message : 'Logout failed';
    }
  };

  watch(
    [() => connActive.value, () => player.value?.userId, () => authEmail.value],
    ([active, userId, email]) => {
      if (!active) return;
      if (userId != null) {
        isPendingLogin.value = false;
        authMessage.value = '';
        return;
      }
      if (email) {
        authMessage.value = 'Logging in...';
        try {
          loginEmailReducer({ email });
        } catch (err) {
          authMessage.value = '';
          authError.value = err instanceof Error ? err.message : 'Login failed';
        }
      }
    },
    { immediate: true }
  );

  return { email: authEmail, isLoggedIn, isPendingLogin, login, logout, authMessage, authError };
};
