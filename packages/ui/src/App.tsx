import { useEffect, useState } from 'react';

type TauriInvoke = <T>(command: string) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: TauriInvoke;
      };
    };
  }
}

export function App() {
  const [status, setStatus] = useState('Conectando ao shell Tauri...');

  useEffect(() => {
    const invoke = window.__TAURI__?.core?.invoke;

    if (!invoke) {
      setStatus('Frontend pronto. Execute pelo shell Tauri para testar o ping.');
      return;
    }

    void invoke<string>('ping')
      .then((response) => setStatus(`Shell Tauri respondeu: ${response}`))
      .catch(() => setStatus('Não foi possível chamar o comando ping.'));
  }, []);

  return (
    <main>
      <p className="eyebrow">Sequelei QueryPilot</p>
      <h1>Shell Tauri conectado</h1>
      <p>{status}</p>
    </main>
  );
}
