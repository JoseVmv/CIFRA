import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { TransactionDialog } from '../components/transactions/TransactionDialog';
import type { Transaction, TransactionType } from '../types/api';

interface TransactionDialogContextValue {
  openNew: (type?: TransactionType) => void;
  openEdit: (transaction: Transaction) => void;
}

const TransactionDialogContext = createContext<TransactionDialogContextValue | null>(null);

interface DialogState {
  open: boolean;
  transaction: Transaction | null;
  defaultType: TransactionType;
}

const CLOSED: DialogState = { open: false, transaction: null, defaultType: 'expense' };

/**
 * Mantém um único diálogo de transação para o app inteiro — qualquer tela pode
 * abri-lo (botão do menu, ação flutuante, estado vazio, item do histórico).
 */
export function TransactionDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState>(CLOSED);

  const openNew = useCallback((type: TransactionType = 'expense') => {
    setState({ open: true, transaction: null, defaultType: type });
  }, []);

  const openEdit = useCallback((transaction: Transaction) => {
    setState({ open: true, transaction, defaultType: transaction.type });
  }, []);

  const close = useCallback(() => setState((current) => ({ ...current, open: false })), []);

  const value = useMemo(() => ({ openNew, openEdit }), [openNew, openEdit]);

  return (
    <TransactionDialogContext.Provider value={value}>
      {children}
      <TransactionDialog
        open={state.open}
        onClose={close}
        transaction={state.transaction}
        defaultType={state.defaultType}
      />
    </TransactionDialogContext.Provider>
  );
}

export function useTransactionDialog(): TransactionDialogContextValue {
  const context = useContext(TransactionDialogContext);
  if (!context) {
    throw new Error('useTransactionDialog precisa estar dentro de <TransactionDialogProvider>.');
  }
  return context;
}
