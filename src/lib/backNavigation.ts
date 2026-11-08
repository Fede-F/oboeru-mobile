type BackInterceptor = () => boolean | Promise<boolean>;

const interceptors = new Set<BackInterceptor>();

/**
 * Registra un interceptor para el botón o gesto "Atrás" de Android/iOS.
 * Si el interceptor devuelve `true`, indica que consumió la acción (por ejemplo, cerrando un modal)
 * y detiene la navegación hacia atrás por defecto.
 */
export function registerBackInterceptor(fn: BackInterceptor): () => void {
  interceptors.add(fn);
  return () => {
    interceptors.delete(fn);
  };
}

/**
 * Ejecuta los interceptores activos en orden LIFO (el último componente montado/abierto responde primero).
 */
export async function runBackInterceptors(): Promise<boolean> {
  const list = Array.from(interceptors).reverse();
  for (const fn of list) {
    try {
      const handled = await fn();
      if (handled) return true;
    } catch (e) {
      console.warn('[BackNavigation] Error en interceptor:', e);
    }
  }
  return false;
}
