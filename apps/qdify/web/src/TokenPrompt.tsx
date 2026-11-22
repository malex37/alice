import { useState } from 'react';
import { control, fields, page } from './ui.js';

export function TokenPrompt({ onSubmit }: { onSubmit(token: string): void }) {
  const [token, setToken] = useState('');

  return (
    <main className={page}>
      <h1>qdify</h1>
      <p>This server needs an API token.</p>
      <form
        className={fields}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(token.trim());
        }}
      >
        <input
          className={control}
          aria-label="API token"
          type="password"
          required
          value={token}
          onChange={(event) => setToken(event.target.value)}
        />
        <button className={control}>Continue</button>
      </form>
    </main>
  );
}
