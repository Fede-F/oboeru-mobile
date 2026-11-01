<script lang="ts">
  import { syncManager } from '../lib/sync/SyncManager';
  import {
    hapticImpactLight,
    hapticImpactMedium,
    hapticSelection,
    hapticSuccess,
    hapticWarning
  } from '../lib/haptics.js';
  import VersionBadge from './VersionBadge.svelte';

  interface Props {
    onAuthenticated: () => Promise<void>;
  }

  let { onAuthenticated }: Props = $props();

  let mode = $state<'login' | 'register'>('login');
  let fullName = $state('');
  let email = $state('');
  let password = $state('');
  let confirmPassword = $state('');
  let showPassword = $state(false);
  let isSubmitting = $state(false);
  let errorMessage = $state<string | null>(null);

  // Validaciones reactivas en tiempo real
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let fullNameValid = $derived(fullName.trim().length >= 2);
  let emailValid = $derived(emailRegex.test(email.trim()));
  let passwordValid = $derived(password.length >= 8);
  let confirmValid = $derived(mode === 'login' || (confirmPassword.length >= 8 && confirmPassword === password));

  async function switchMode(nextMode: 'login' | 'register') {
    if (mode === nextMode || isSubmitting) return;
    await hapticSelection();
    mode = nextMode;
    errorMessage = null;
  }

  function validateForm(): string | null {
    if (mode === 'register' && !fullNameValid) {
      return 'Por favor ingresá tu nombre (mínimo 2 caracteres).';
    }
    if (!emailValid) {
      return 'Ingresá un correo electrónico válido (ej. nombre@correo.com).';
    }
    if (!passwordValid) {
      return 'La contraseña debe tener al menos 8 caracteres.';
    }
    if (mode === 'register' && password !== confirmPassword) {
      return 'Las contraseñas ingresadas no coinciden.';
    }
    return null;
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    errorMessage = null;

    const validationError = validateForm();
    if (validationError) {
      await hapticWarning();
      errorMessage = validationError;
      return;
    }

    isSubmitting = true;
    await hapticImpactMedium();

    try {
      await syncManager.authenticate(mode, email, password, fullName);
      await hapticSuccess();
      await onAuthenticated();
    } catch (err) {
      await hapticWarning();
      errorMessage =
        err instanceof Error
          ? err.message
          : 'No se pudo conectar con el servidor. Verificá tu conexión.';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between px-5 pt-safe pb-safe select-none">
  <!-- Barra Superior con Identidad de Oboeru y Chip de Versión -->
  <header class="pt-4 pb-2 flex items-center justify-between max-w-md w-full mx-auto">
    <div class="flex items-center gap-2.5">
      <div class="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#43534a] to-[#1a231f] border border-[#a7f3d0]/35 flex items-center justify-center shadow-lg">
        <span class="text-lg font-bold text-[#a7f3d0]">覚</span>
      </div>
      <div>
        <span class="text-base font-extrabold text-white tracking-tight block leading-none">
          Oboeru
        </span>
        <span class="text-[11px] text-[#a7f3d0] font-medium">
          覚える • Japonés Diario
        </span>
      </div>
    </div>

    <VersionBadge variant="chip" />
  </header>

  <!-- Tarjeta Central de Login / Registro -->
  <main class="my-auto py-4 max-w-md w-full mx-auto space-y-5">
    <div class="text-center space-y-1.5">
      <h1 class="text-2xl font-extrabold text-white tracking-tight">
        {mode === 'login' ? 'Bienvenido de nuevo' : 'Creá tu cuenta'}
      </h1>
      <p class="text-xs text-slate-400 leading-relaxed">
        {mode === 'login'
          ? 'Ingresá tus datos para continuar con tus mazos y tu progreso guardado.'
          : 'Registrate para guardar tus mazos y tu progreso en la base de datos.'}
      </p>
    </div>

    <!-- Selector de Modo (Iniciar Sesión / Crear Cuenta) -->
    <div class="grid grid-cols-2 p-1.5 rounded-2xl bg-[#121820] border border-white/10">
      <button
        type="button"
        disabled={isSubmitting}
        onclick={() => switchMode('login')}
        class="touch-target py-2.5 rounded-xl text-xs font-bold transition-all active-press {mode === 'login'
          ? 'bg-[#a7f3d0] text-slate-950 shadow-md'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        Iniciar sesión
      </button>
      <button
        type="button"
        disabled={isSubmitting}
        onclick={() => switchMode('register')}
        class="touch-target py-2.5 rounded-xl text-xs font-bold transition-all active-press {mode === 'register'
          ? 'bg-[#a7f3d0] text-slate-950 shadow-md'
          : 'text-slate-400 hover:text-slate-200'}"
      >
        Crear cuenta
      </button>
    </div>

    <!-- Formulario con Validaciones -->
    <form onsubmit={handleSubmit} class="rounded-3xl bg-[#121820] border border-white/10 p-5 space-y-4 shadow-2xl" novalidate>
      <!-- Campo 1: Nombre (solo en Crear cuenta) -->
      {#if mode === 'register'}
        <div>
          <label for="auth-fullname" class="block text-xs font-bold text-slate-200 mb-1.5">
            Nombre
          </label>
          <input
            id="auth-fullname"
            type="text"
            bind:value={fullName}
            disabled={isSubmitting}
            autocomplete="name"
            enterkeyhint="next"
            maxlength="120"
            placeholder="Ej: Federico Águila"
            class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors {fullName.length > 0 && !fullNameValid
              ? 'border-rose-500/60 focus:border-rose-400'
              : 'border-white/10 focus:border-[#a7f3d0]'}"
          />
          {#if fullName.length > 0 && !fullNameValid}
            <p class="text-[11px] text-rose-400 mt-1">
              Ingresá al menos 2 caracteres para tu nombre.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Campo 2: Correo Electrónico -->
      <div>
        <label for="auth-email" class="block text-xs font-bold text-slate-200 mb-1.5">
          Correo electrónico
        </label>
        <input
          id="auth-email"
          type="email"
          bind:value={email}
          disabled={isSubmitting}
          autocomplete="email"
          inputmode="email"
          enterkeyhint="next"
          placeholder="tu@correo.com"
          class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors {email.length > 0 && !emailValid
            ? 'border-rose-500/60 focus:border-rose-400'
            : 'border-white/10 focus:border-[#a7f3d0]'}"
        />
        {#if email.length > 0 && !emailValid}
          <p class="text-[11px] text-rose-400 mt-1">
            El formato del correo electrónico no es válido.
          </p>
        {/if}
      </div>

      <!-- Campo 3: Contraseña -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label for="auth-password" class="block text-xs font-bold text-slate-200">
            Contraseña
          </label>
          <span class="text-[10px] text-slate-400">Mínimo 8 caracteres</span>
        </div>

        <div class="relative">
          <input
            id="auth-password"
            type={showPassword ? 'text' : 'password'}
            bind:value={password}
            disabled={isSubmitting}
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            enterkeyhint={mode === 'login' ? 'done' : 'next'}
            placeholder="••••••••"
            class="w-full h-12 pl-4 pr-14 rounded-2xl bg-[#0b0f15] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors {password.length > 0 && !passwordValid
              ? 'border-rose-500/60 focus:border-rose-400'
              : 'border-white/10 focus:border-[#a7f3d0]'}"
          />
          <button
            type="button"
            onclick={async () => {
              await hapticImpactLight();
              showPassword = !showPassword;
            }}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
            class="touch-target absolute right-1.5 top-0 h-12 px-3 text-[11px] font-semibold text-slate-400 hover:text-[#a7f3d0]"
          >
            {showPassword ? 'Ocultar' : 'Ver'}
          </button>
        </div>

        {#if password.length > 0 && !passwordValid}
          <p class="text-[11px] text-rose-400 mt-1">
            Faltan {8 - password.length} caracteres para el mínimo de 8.
          </p>
        {/if}
      </div>

      <!-- Campo 4: Confirmar Contraseña (solo en Registro) -->
      {#if mode === 'register'}
        <div>
          <label for="auth-confirm-password" class="block text-xs font-bold text-slate-200 mb-1.5">
            Confirmar contraseña
          </label>
          <input
            id="auth-confirm-password"
            type={showPassword ? 'text' : 'password'}
            bind:value={confirmPassword}
            disabled={isSubmitting}
            autocomplete="new-password"
            enterkeyhint="done"
            placeholder="Repetí tu contraseña"
            class="w-full h-12 px-4 rounded-2xl bg-[#0b0f15] border text-sm text-white placeholder:text-slate-500 focus:outline-none transition-colors {confirmPassword.length > 0 && !confirmValid
              ? 'border-rose-500/60 focus:border-rose-400'
              : 'border-white/10 focus:border-[#a7f3d0]'}"
          />
          {#if confirmPassword.length > 0 && !confirmValid}
            <p class="text-[11px] text-rose-400 mt-1">
              Las contraseñas no coinciden.
            </p>
          {/if}
        </div>
      {/if}

      <!-- Mensaje de Error de Validación o Servidor (ej. Correo duplicado) -->
      {#if errorMessage}
        <div class="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-200 font-medium leading-relaxed">
          {errorMessage}
        </div>
      {/if}

      <!-- Botón de Envío con Indicador de Guardando -->
      <button
        type="submit"
        disabled={isSubmitting}
        class="w-full touch-target py-3.5 rounded-full bg-[#a7f3d0] hover:bg-emerald-200 disabled:opacity-60 text-slate-950 font-extrabold text-sm active-press shadow-xl flex items-center justify-center gap-2.5"
      >
        {#if isSubmitting}
          <svg class="w-4 h-4 animate-spin text-slate-950" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          <span>
            {mode === 'register' ? 'Guardando cuenta...' : 'Iniciando sesión...'}
          </span>
        {:else}
          <span>
            {mode === 'register' ? 'Crear cuenta y entrar' : 'Iniciar sesión'}
          </span>
        {/if}
      </button>
    </form>
  </main>

  <!-- Pie con versión -->
  <footer class="pb-2">
    <VersionBadge variant="footer" />
  </footer>
</div>

