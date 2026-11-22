import { useState } from 'react';

export function TokenPrompt({ onSubmit }: { onSubmit(token: string): void }) {
  const [token, setToken] = useState('');

  return (
    <main>
      <h1>qdify</h1>
      <p>This server needs an API token.</p>
      <form
        className="fields"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(token.trim());
        }}
      >
        <input
          aria-label="API token"
          type="password"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button>Continue</button>
      </form>
    </main>
  );
}
