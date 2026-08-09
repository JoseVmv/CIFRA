import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals: true` a limpeza automática do Testing Library não é registrada,
// e o DOM de um teste vazaria para o seguinte.
afterEach(cleanup);
