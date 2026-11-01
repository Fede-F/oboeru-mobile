# 🧪 Credenciales de Usuario de Prueba para IA y Desarrollo (`TEST_USER.md`)

Este archivo contiene las credenciales estandarizadas y persistidas del **Usuario de Prueba Oficial** de **Oboeru** para que cualquier Agente de IA (Antigravity, Cursor, Claude, Copilot) o desarrollador pueda autenticar pruebas automatizadas, validar flujos de sincronización y crear mazos sin generar cuentas basura.

---

## 👤 Datos de la Cuenta de Prueba

| Campo | Valor Exacto |
| :--- | :--- |
| **ID (UUID en PostgreSQL)** | `00000000-0000-4000-8000-000000000099` |
| **Nombre y apellido (`fullName`)** | `Usuario de Prueba` |
| **Correo electrónico (`email`)** | `test@oboeru.app` |
| **Contraseña (`password`)** | `OboeruTest2026!` |
| **Servidor API Base** | `https://oboeru-api.planner.ar` |

---

## 🤖 Bloque JSON Estructurado para Lectura Rápida de Agentes IA

```json
{
  "testUser": {
    "id": "00000000-0000-4000-8000-000000000099",
    "fullName": "Usuario de Prueba",
    "email": "test@oboeru.app",
    "password": "OboeruTest2026!",
    "apiBaseUrl": "https://oboeru-api.planner.ar",
    "endpoints": {
      "login": "POST /api/v1/auth/login",
      "register": "POST /api/v1/auth/register",
      "syncReviews": "GET|POST /api/v1/sync/reviews",
      "syncDecks": "GET|POST /api/v1/sync/decks"
    }
  }
}
```

---

## 🔄 Persistencia de Sesión en el Cliente Móvil (`oboeru-mobile`)

Cuando un usuario o agente inicia sesión con esta cuenta en la aplicación:
1. El token JWT se guarda en `localStorage` bajo la clave `oboeru_jwt_token`.
2. El perfil (`{ id, fullName, email, createdAt }`) se guarda en `localStorage` bajo `oboeru_user_profile`.
3. Adicionalmente, la sesión se respalda en la tabla `user_session` de **IndexedDB** (`oboeru_offline_db`, versión `4`) mediante `savePersistedSession()` y se restaura al iniciar con `ensureSessionHydrated()`.
4. Gracias a esta doble persistencia, **si el usuario cierra la aplicación y la vuelve a abrir, la sesión permanece activa** y entra directamente al menú de Mazos sin volver a pedir login.

